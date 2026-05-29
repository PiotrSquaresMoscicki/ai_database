import express from "express";
import { log } from "../logger.js";
import { unifiedSchema } from "./chat/schema.js";
import { UNIFIED_INSTRUCTION } from "./chat/instructions.js";
import { MAX_HISTORY_MESSAGES, applySlidingWindow } from "./chat/history.js";
import { nutritionDatabase, addEntry } from "./chat/store.js";
import { profileDatabase, addProfileEntry } from "./chat/profileStore.js";
import { CHAT_MODEL, defaultClientFactory } from "./chat/geminiClient.js";

// Re-export the building blocks so existing importers (and tests) can keep
// using `routes/chat.js` as the single entry point for the chat feature.
export { unifiedSchema } from "./chat/schema.js";
export { UNIFIED_INSTRUCTION } from "./chat/instructions.js";
export { MAX_HISTORY_MESSAGES, applySlidingWindow } from "./chat/history.js";
export { nutritionDatabase } from "./chat/store.js";
export { profileDatabase } from "./chat/profileStore.js";
export { CHAT_MODEL, defaultClientFactory } from "./chat/geminiClient.js";

/**
 * Build the Express router exposing the chat feature:
 *   GET  /api/database — returns the full nutrition ledger.
 *   GET  /api/profile  — returns the full user-settings/profile ledger.
 *   POST /api/chat     — forwards a trimmed history + new message to Gemini,
 *                        persists any logged nutrition or profile data, and
 *                        returns the model's structured response.
 */
export function createChatRouter(opts = {}) {
  const clientFactory = opts.clientFactory ?? defaultClientFactory;
  const model = opts.model ?? CHAT_MODEL;
  const maxHistory = opts.maxHistory ?? MAX_HISTORY_MESSAGES;

  const router = express.Router();

  router.get("/api/database", (req, res) => {
    res.status(200).json(nutritionDatabase);
  });

  router.get("/api/profile", (req, res) => {
    res.status(200).json(profileDatabase);
  });

  router.post("/api/chat", async (req, res) => {
    const { history, new_message: newMessage, localTime } = req.body ?? {};

    if (typeof newMessage !== "string" || newMessage.trim() === "") {
      return res
        .status(400)
        .json({ error: "new_message must be a non-empty string" });
    }

    const trimmedHistory = applySlidingWindow(history ?? [], maxHistory);

    const dbDump = JSON.stringify(nutritionDatabase);
    const profileDump = JSON.stringify(profileDatabase);
    const messageToAI = `[System Note: User's local time is ${localTime}. Current nutrition database: ${dbDump}. Current user settings/profile history: ${profileDump}]\n\nUser Input: ${newMessage}`;

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

      if (aiResponse.action === "LOG") {
        const hasData =
          aiResponse.nutritionData &&
          Object.keys(aiResponse.nutritionData).length > 0;

        if (hasData) {
          aiResponse.entryId = addEntry({
            originalMessage: newMessage,
            data: aiResponse.nutritionData,
          });
        } else {
          aiResponse.action = "NEEDS_INFO";
          // We leave this fallback error in English since it's a backend system error,
          // but you could change it to a generic translated error if you wanted!
          aiResponse.message =
            "System Error: I tried to log this meal but failed to attach the numerical data. Could you please submit that again?";
        }
      } else if (aiResponse.action === "LOG_PROFILE") {
        const hasData =
          aiResponse.profileData &&
          Object.keys(aiResponse.profileData).length > 0;

        if (hasData) {
          aiResponse.entryId = addProfileEntry({
            originalMessage: newMessage,
            data: aiResponse.profileData,
          });
        } else {
          aiResponse.action = "NEEDS_INFO";
          aiResponse.message =
            "System Error: I tried to save your settings but failed to attach any data. Could you please submit that again?";
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
