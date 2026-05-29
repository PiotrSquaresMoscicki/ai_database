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
        "Your determined intent: 'LOG' to save new food data, 'LOG_PROFILE' to save user settings/profile data (e.g. height, weight, job), 'QUERY' to summarize/analyze past data, 'CHAT' for general conversation/help, 'NEEDS_INFO' if logging food but details are ambiguous.",
      enum: ["LOG", "LOG_PROFILE", "QUERY", "CHAT", "NEEDS_INFO"],
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
    profileData: {
      type: Type.OBJECT,
      description:
        "Populate ONLY if action is 'LOG_PROFILE'. A snapshot of the user's settings/profile to save as fitness context. Omit any field the user did not provide.",
      properties: {
        height_cm: {
          type: Type.NUMBER,
          description: "User's height in centimeters",
        },
        weight_kg: {
          type: Type.NUMBER,
          description: "User's body weight in kilograms",
        },
        job: {
          type: Type.STRING,
          description: "The kind of job/work the user does",
        },
        notes: {
          type: Type.STRING,
          description:
            "Any other free-form settings or context the user wants to save",
        },
        time: {
          type: Type.STRING,
          description:
            "Formatted Date and Time for this snapshot (e.g., 'YYYY-MM-DD HH:MM'). Use a past date/time if the user is back-dating historical context, otherwise the provided local time.",
        },
      },
    },
  },
  required: ["action", "message"],
};
