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
initTelemetry();

const root = document.querySelector("#app");

// Added a .layout wrapper and the .editor panel to the right of the chat
root.innerHTML = `
  <div class="layout">
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

    <div class="editor">
      <h2>History Editor</h2>
      <div class="table-container">
        <table class="history-table">
          <thead>
            <tr>
              <th style="width: 40px;">Idx</th>
              <th style="width: 90px;">Role</th>
              <th>Message Content</th>
              <th style="width: 70px;">Action</th>
            </tr>
          </thead>
          <tbody id="history-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>
`;

const messagesEl = document.querySelector("#messages");
const tableBodyEl = document.querySelector("#history-tbody");
const formEl = document.querySelector("#chat-form");
const inputEl = document.querySelector("#chat-input");
const sendBtn = document.querySelector("#chat-send");
const errorEl = document.querySelector("#chat-error");

/** @type {Array<{role: 'user' | 'model', parts: Array<{text: string}>}>} */
const history = [];

function render() {
  // 1. Render the Chat Interface
  messagesEl.replaceChildren(
    ...history.map((msg) => {
      const div = document.createElement("div");
      div.className = `msg msg-${msg.role}`;

      const rawText = msg.parts.map((p) => p.text ?? "").join("");
      const parsedHTML = marked.parse(rawText);
      div.innerHTML = DOMPurify.sanitize(parsedHTML);

      return div;
    }),
  );
  messagesEl.scrollTop = messagesEl.scrollHeight;

  // 2. Render the History Editor Table
  tableBodyEl.replaceChildren(
    ...history.map((msg, index) => {
      const tr = document.createElement("tr");

      // Index (Read-only)
      const tdIndex = document.createElement("td");
      tdIndex.textContent = index;

      // Role (Editable)
      const tdRole = document.createElement("td");
      const select = document.createElement("select");
      select.innerHTML = `
        <option value="user" ${msg.role === "user" ? "selected" : ""}>user</option>
        <option value="model" ${msg.role === "model" ? "selected" : ""}>model</option>
      `;
      select.addEventListener("change", (e) => {
        history[index].role = e.target.value;
        render(); // Sync both views
      });
      tdRole.appendChild(select);

      // Text (Editable)
      const tdText = document.createElement("td");
      const textarea = document.createElement("textarea");
      textarea.value = msg.parts.map((p) => p.text).join("");
      textarea.rows = textarea.value.split("\n").length > 2 ? 4 : 2;

      // We use 'change' instead of 'input' so the UI doesn't re-render
      // (and strip focus) while the user is actively typing. It fires on blur.
      textarea.addEventListener("change", (e) => {
        history[index].parts = [{ text: e.target.value }];
        render(); // Sync both views
      });
      tdText.appendChild(textarea);

      // Actions (Delete)
      const tdAction = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.textContent = "Drop";
      delBtn.addEventListener("click", () => {
        history.splice(index, 1);
        render();
      });
      tdAction.appendChild(delBtn);

      tr.append(tdIndex, tdRole, tdText, tdAction);
      return tr;
    }),
  );
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

    history.push({ role: "user", parts: [{ text }] });
    history.push({ role: "model", parts: [{ text: reply }] });
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

render();
