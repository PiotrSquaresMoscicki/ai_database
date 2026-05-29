import { GoogleGenAI } from "@google/genai";

export const CHAT_MODEL = "gemini-2.5-flash";

/**
 * Default factory for the Gemini client. Reads the API key from the
 * environment and fails loudly if it is missing (never silently degrades).
 * Tests inject their own factory instead.
 *
 * @returns {GoogleGenAI}
 */
export function defaultClientFactory() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey });
}
