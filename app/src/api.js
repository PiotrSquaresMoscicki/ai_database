/**
 * Thin wrappers around the backend HTTP API consumed by the SPA. Each function
 * throws on a non-2xx response so callers can handle failures explicitly.
 */

/**
 * Fetch the full nutrition ledger.
 * @returns {Promise<Array>} The list of ledger entries.
 */
export async function getDatabase() {
  const res = await fetch("/api/database");
  if (!res.ok) throw new Error("Failed to fetch database");
  return res.json();
}

/**
 * Fetch the full user-settings/profile ledger.
 * @returns {Promise<Array>} The list of profile entries.
 */
export async function getProfile() {
  const res = await fetch("/api/profile");
  if (!res.ok) throw new Error("Failed to fetch profile");
  return res.json();
}

/**
 * Send a chat turn to the backend.
 * @param {{ history: Array, new_message: string, localTime: string }} payload
 * @returns {Promise<object>} The model's structured response.
 */
export async function postChat(payload) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}
