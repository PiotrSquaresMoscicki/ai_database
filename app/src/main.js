import "./style.css";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

import { initTelemetry } from "./telemetry.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked to use highlight.js for code blocks
marked.setOptions({
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: "hljs language-",
});

import("vconsole").then((module) => {
  const VConsole = module.default;
  new VConsole();
});

// Wire global error / unhandledrejection handlers to GCP Error Reporting
// before any other code runs so we capture early initialization failures.
initTelemetry();

/**
 * Stateful, stateless-protocol chat UI.
 *
 * The full conversation history is kept in this module's closure and replayed
 * to the backend on every submission. The backend remains stateless and only
 * injects the system instruction + enforces the sliding window.
 *
 * History shape matches the Gemini SDK contract:
 * { role: 'user' | 'model', parts: [{ text: string }] }
 */

const root = document.querySelector("#app");
root.innerHTML = `
  <div class="chat">
    <h1>AI Chat</h1>
    <div id="messages" class="messages" aria-live="polite"></div>
    <form id="chat-form" class="chat-form" autocomplete="off">
      <input
        id="chat-input"
        type="text"
        name="message"
        placeholder="Type a message..."
        required
        aria-label="Message"
      />
      <button id="chat-send" type="submit">Send</button>
    </form>
    <p id="chat-error" class="chat-error" role="alert"></p>
  </div>
`;

const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chat-form");
const inputEl = document.querySelector("#chat-input");
const sendBtn = document.querySelector("#chat-send");
const errorEl = document.querySelector("#chat-error");

/** @type {Array<{role: 'user' | 'model', parts: Array<{text: string}>}>} */
const history = [];

function render() {
  messagesEl.replaceChildren(
    ...history.map((msg) => {
      const div = document.createElement("div");
      div.className = `msg msg-${msg.role}`;

      const rawText = msg.parts.map((p) => p.text ?? "").join("");

      // Parse markdown (with highlight.js) and sanitize HTML to prevent XSS attacks
      const parsedHTML = marked.parse(rawText);
      div.innerHTML = DOMPurify.sanitize(parsedHTML);

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

  // Snapshot the history we send so it matches what the backend processes.
  const sentHistory = history.map((m) => ({
    role: m.role,
    parts: m.parts.map((p) => ({ text: p.text })),
  }));

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: sentHistory, new_message: text }),
    });
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    const data = await res.json();
    const reply = typeof data?.reply === "string" ? data.reply : "";

    // Append both turns only after a successful response so a failed request
    // does not corrupt the local history.
    history.push({ role: "user", parts: [{ text }] });
    history.push({ role: "model", parts: [{ text: reply }] });
    render();
  } catch (err) {
    errorEl.textContent = "Failed to send message. Please try again.";
    // Restore the input so the user can retry without retyping.
    inputEl.value = text;
  } finally {
    inputEl.disabled = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
});

render();
