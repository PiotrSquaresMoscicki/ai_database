/**
 * In-memory nutrition ledger. This is intentionally process-local state (no
 * persistence layer) — entries live for the lifetime of the server process.
 *
 * The array is exported directly so callers can serialize the full ledger for
 * the model's system note and the SPA's table.
 */
export const nutritionDatabase = [];

let nextId = 1;

/**
 * Append a logged meal/drink to the ledger and return its generated id.
 *
 * @param {{ originalMessage: string, data: object }} entry
 * @returns {number} The id assigned to the new entry.
 */
export function addEntry({ originalMessage, data }) {
  const id = nextId++;
  nutritionDatabase.push({
    id,
    originalMessage,
    timestamp: new Date().toISOString(),
    data,
  });
  return id;
}
