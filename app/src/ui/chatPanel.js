import { renderMarkdown } from "../markdown.js";
import { postChat } from "../api.js";

/**
 * Create the chat panel controller. Owns the local conversation history,
 * renders messages, and handles form submission.
 *
 * @param {object} opts
 * @param {HTMLFormElement} opts.formEl
 * @param {HTMLInputElement} opts.inputEl
 * @param {HTMLButtonElement} opts.sendBtn
 * @param {HTMLElement} opts.errorEl
 * @param {HTMLElement} opts.messagesEl
 * @param {() => Promise<Array|null>} opts.refreshDatabase Re-fetches the ledger
 *   after a successful LOG and returns the data so the reply can be verified.
 * @param {() => Promise<Array|null>} opts.refreshSettings Re-fetches the
 *   user-settings ledger after a successful LOG_PROFILE.
 * @returns {{ render: () => void }}
 */
export function createChatPanel({
  formEl,
  inputEl,
  sendBtn,
  errorEl,
  messagesEl,
  refreshDatabase,
  refreshSettings,
}) {
  const history = [];

  function render() {
    messagesEl.replaceChildren(
      ...history.map((msg) => {
        const div = document.createElement("div");
        div.className = `msg msg-${msg.role}`;
        const rawText = msg.parts.map((p) => p.text ?? "").join("");
        div.innerHTML = renderMarkdown(rawText);
        return div;
      }),
    );
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();

    const text = inputEl.value.trim();
    if (!text) return;

    errorEl.textContent = "";
    inputEl.value = "";
    inputEl.disabled = true;
    sendBtn.disabled = true;

    const sentHistory = history.map((m) => ({
      role: m.role,
      parts: m.parts.map((p) => ({ text: p.text })),
    }));

    const localTime = new Date().toLocaleString();

    try {
      const data = await postChat({
        history: sentHistory,
        new_message: text,
        localTime,
      });

      let replyText = data.message || "No message returned.";

      // If the AI autonomously decided to LOG, refresh the DB and verify.
      if (data.action === "LOG") {
        const db = await refreshDatabase();
        if (db && data.entryId) {
          const entryExists = db.some((e) => e.id === data.entryId);
          if (entryExists) {
            replyText += `\n\n✅ *(Verified: Saved to Database as Entry #${data.entryId})*`;
          } else {
            replyText += `\n\n❌ **System Warning:** The database failed to save this entry. Please try again.`;
          }
        }
      } else if (data.action === "LOG_PROFILE") {
        // The AI saved user settings/profile data; refresh that table.
        const profile = refreshSettings ? await refreshSettings() : null;
        if (profile && data.entryId) {
          const entryExists = profile.some((e) => e.id === data.entryId);
          if (entryExists) {
            replyText += `\n\n✅ *(Verified: Saved to User Settings as Entry #${data.entryId})*`;
          } else {
            replyText += `\n\n❌ **System Warning:** Failed to save your settings. Please try again.`;
          }
        }
      }

      history.push({ role: "user", parts: [{ text }] });
      history.push({ role: "model", parts: [{ text: replyText }] });
      render();
    } catch (err) {
      errorEl.textContent = "Failed to send message. Please try again.";
      inputEl.value = text;
    } finally {
      inputEl.disabled = false;
      sendBtn.disabled = false;
      inputEl.focus();
    }
  });

  return { render };
}
