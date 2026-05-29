import { Type } from "@google/genai";

/**
 * Structured-output schema the chat model must conform to. The model returns a
 * single JSON object describing the action it chose plus any nutrition data to
 * persist. See ./instructions.js for the matching behavioural contract.
 */
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
