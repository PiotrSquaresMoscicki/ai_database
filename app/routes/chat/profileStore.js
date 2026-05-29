/**
 * In-memory user-settings (profile) ledger. Like the nutrition store this is
 * intentionally process-local state (no persistence layer) — entries live for
 * the lifetime of the server process.
 *
 * Each entry captures free-form user settings the user wants to keep as context
 * for future AI queries (e.g. height, weight, the kind of job they do). There
 * is no indexing beyond the row id and the entry's date/time, so the user can
 * log their current numbers over time and the AI can summarize how they have
 * changed across weeks or months.
 *
 * The array is exported directly so callers can serialize the full ledger for
 * the model's system note and the SPA's table.
 */
export const profileDatabase = [];

let nextId = 1;

/**
 * Append a user-settings snapshot to the ledger and return its generated id.
 *
 * The caller may supply a `data.time` value to back-date the entry (useful when
 * the user is just starting with the app but wants to seed historical context).
 * The `timestamp` field always records when the entry was actually saved.
 *
 * @param {{ originalMessage: string, data: object }} entry
 * @returns {number} The id assigned to the new entry.
 */
export function addProfileEntry({ originalMessage, data }) {
  const id = nextId++;
  profileDatabase.push({
    id,
    originalMessage,
    timestamp: new Date().toISOString(),
    data,
  });
  return id;
}
