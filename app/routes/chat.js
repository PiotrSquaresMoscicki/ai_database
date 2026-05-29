import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import { Logging } from "@google-cloud/logging";

const GCP_PROJECT =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || "";
const logging = new Logging({ projectId: GCP_PROJECT || undefined });
const log = logging.logSync("app");

export const CHAT_MODEL = "gemini-2.5-flash";
export const MAX_HISTORY_MESSAGES = 20;

export const nutritionDatabase = [];
let nextId = 1;

// The AI now dictates its own action type alongside the message.
export const unifiedSchema = {
  type: Type.OBJECT,
  properties: {
    action: {
      type: Type.STRING,
      description:
        "Your determined intent: 'LOG' to save new food data, 'QUERY' to summarize/analyze past data, 'CHAT' for general conversation/help, 'NEEDS_INFO' if logging food but details are ambiguous.",
      enum: ["LOG", "QUERY", "CHAT", "NEEDS_INFO"],
    },
    message: {
      type: Type.STRING,
      description:
        "Your conversational response to the user, formatted in Markdown.",
    },
    nutritionData: {
      type: Type.OBJECT,
      description: "Populate ONLY if action is 'LOG'.",
      properties: {
        water_ml: {
          type: Type.NUMBER,
          description: "Total estimated water in milliliters",
        },
        carbs_g: {
          type: Type.NUMBER,
          description: "Total estimated carbohydrates in grams",
        },
        proteins_g: {
          type: Type.NUMBER,
          description: "Total estimated proteins in grams",
        },
        fats_g: {
          type: Type.NUMBER,
          description: "Total estimated fats in grams",
        },
        time: {
          type: Type.STRING,
          description: "Formatted Date and Time (e.g., 'YYYY-MM-DD HH:MM')",
        },
      },
    },
  },
  required: ["action", "message"],
};

export const UNIFIED_INSTRUCTION = `
You are an autonomous, expert nutrition and hydration AI assistant. You have three primary modes of operation. 
Analyze the user's input and determine the correct 'action' to take:

1. ACTION: "LOG" (Logging Food/Drink)
- Goal: Automatically infer and calculate nutritional values from the user's input based on your broad knowledge of food/serving sizes.
- Never ask the user for macros; estimate them. Calculate totals for compound meals. If a food item lacks a macro, use 0.
- Determine the time: Use the explicit time they mention, or default to the provided local time.
- If the food is incredibly ambiguous (e.g., "I ate a sandwich" with no context), set action to "NEEDS_INFO" and ask for clarification.

2. ACTION: "QUERY" (Analyzing the Database)
- Goal: Summarize and analyze the user's past data. 
- You will receive a JSON dump of their database in the System Note. Calculate their daily totals (Water, Carbs, Protein, Fats) and estimated Calories (Carbs*4 + Protein*4 + Fats*9).
- Provide time-aware advice. If it's late, suggest sleep-friendly light snacks or hydration. If early, suggest macro goals for the rest of the day.

3. ACTION: "CHAT" (General Help)
- Goal: Answer general questions about nutrition, how to use the app, or casual conversation that does not require logging or querying the database.

Use the 'message' field to speak directly to the user in a helpful, empathetic tone using Markdown formatting.
`;

export function applySlidingWindow(history, max = MAX_HISTORY_MESSAGES) {
  if (!Array.isArray(history)) return [];
  const cleaned = history.filter(
    (m) =>
      m &&
      (m.role === "user" || m.role === "model") &&
      Array.isArray(m.parts) &&
      m.parts.some((p) => p && typeof p.text === "string"),
  );
  let sliced = cleaned.slice(-max);
  const firstUser = sliced.findIndex((m) => m.role === "user");
  if (firstUser === -1) return [];
  sliced = sliced.slice(firstUser);
  const alternating = [];
  for (const msg of sliced) {
    const last = alternating[alternating.length - 1];
    if (last && last.role === msg.role)
      alternating[alternating.length - 1] = msg;
    else alternating.push(msg);
  }
  return alternating;
}

export function defaultClientFactory() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}

export function createChatRouter(opts = {}) {
  const clientFactory = opts.clientFactory ?? defaultClientFactory;
  const model = opts.model ?? CHAT_MODEL;
  const maxHistory = opts.maxHistory ?? MAX_HISTORY_MESSAGES;

  const router = express.Router();

  router.get("/api/database", (req, res) => {
    res.status(200).json(nutritionDatabase);
  });

  router.post("/api/chat", async (req, res) => {
    const { history, new_message: newMessage, localTime } = req.body ?? {};

    if (typeof newMessage !== "string" || newMessage.trim() === "") {
      return res
        .status(400)
        .json({ error: "new_message must be a non-empty string" });
    }

    const trimmedHistory = applySlidingWindow(history ?? [], maxHistory);

    // We ALWAYS inject the context so the AI can route the request intelligently
    const dbDump = JSON.stringify(nutritionDatabase);
    const messageToAI = `[System Note: User's local time is ${localTime}. Current database: ${dbDump}]\n\nUser Input: ${newMessage}`;

    try {
      const ai = clientFactory();

      const chat = ai.chats.create({
        model,
        history: trimmedHistory,
        config: {
          systemInstruction: opts.systemInstruction ?? UNIFIED_INSTRUCTION,
          responseMimeType: "application/json",
          responseSchema: unifiedSchema,
        },
      });

      const response = await chat.sendMessage({ message: messageToAI });
      const textResponse =
        typeof response?.text === "string" ? response.text : "{}";

      let aiResponse;
      try {
        aiResponse = JSON.parse(textResponse);
      } catch (e) {
        aiResponse = {
          action: "CHAT",
          message: "Failed to parse AI response.",
        };
      }

      // If the AI autonomously decided to LOG, handle the database push
      if (aiResponse.action === "LOG") {
        const hasData =
          aiResponse.nutritionData &&
          Object.keys(aiResponse.nutritionData).length > 0;

        if (hasData) {
          const entryId = nextId++;
          nutritionDatabase.push({
            id: entryId,
            originalMessage: newMessage,
            timestamp: new Date().toISOString(),
            data: aiResponse.nutritionData,
          });
          aiResponse.entryId = entryId;
        } else {
          // Intercept hallucination where it wants to log but forgot the data
          aiResponse.action = "NEEDS_INFO";
          aiResponse.message =
            "System Error: I tried to log this meal but failed to attach the numerical data. Could you please submit that again?";
        }
      }

      res.status(200).json(aiResponse);
    } catch (err) {
      const traceCtx = req.traceContext || {};
      const metadata = { severity: "ERROR", ...traceCtx };
      const entry = log.entry(metadata, {
        message: `chat endpoint error: ${err.message || err}`,
        stack: err.stack,
      });
      log.error(entry);
      res.status(502).json({ error: "Upstream chat provider error" });
    }
  });

  return router;
}
