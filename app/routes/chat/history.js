export const MAX_HISTORY_MESSAGES = 20;

/**
 * Trim a chat history down to a clean, alternating window suitable for the
 * Gemini chat API:
 *   - keeps only the most recent `max` well-formed user/model turns,
 *   - drops leading model turns so the window starts with a user message,
 *   - collapses consecutive same-role turns to preserve strict alternation.
 *
 * @param {Array} history Raw history from the client.
 * @param {number} [max] Maximum number of turns to retain.
 * @returns {Array} A sanitized, alternating history window.
 */
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
