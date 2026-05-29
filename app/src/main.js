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

const root = document.querySelector("#app");
root.innerHTML = `
  <div class="split-layout">
    <div class="chat-panel">
      <h1>AI Chat</h1>
      <div id="messages" class="messages" aria-live="polite"></div>
      <form id="chat-form" class="chat-form" autocomplete="off">
        <input
          id="chat-input"
          type="text"
          name="message"
          placeholder="Type a message (e.g., 'I drank 500ml water')..."
          required
          aria-label="Message"
        />
        <div class="button-group">
          <button id="btn-standard" type="submit" value="standard" class="btn">Standard Chat</button>
          <button id="btn-database" type="submit" value="database" class="btn btn-primary">Log to DB</button>
        </div>
      </form>
      <p id="chat-error" class="chat-error" role="alert"></p>
    </div>

    <div class="db-panel">
      <h1>Nutrition Ledger</h1>
      <div class="table-container">
        <table id="db-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Original Input</th>
              <th>Water (ml)</th>
              <th>Carbs (g)</th>
              <th>Proteins (g)</th>
              <th>Fats (g)</th>
            </tr>
          </thead>
          <tbody id="db-tbody">
            </tbody>
        </table>
      </div>
    </div>
  </div>
`;

const messagesEl = document.querySelector("#messages");
const formEl = document.querySelector("#chat-form");
const inputEl = document.querySelector("#chat-input");
const btnStandard = document.querySelector("#btn-standard");
const btnDatabase = document.querySelector("#btn-database");
const errorEl = document.querySelector("#chat-error");
const dbTbody = document.querySelector("#db-tbody");

/** @type {Array<{role: 'user' | 'model', parts: Array<{text: string}>}>} */
const history = [];

function renderChat() {
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

// Fetches the in-memory array from the backend and renders the table
async function fetchDatabase() {
  try {
    const res = await fetch("/api/database");
    if (!res.ok) throw new Error("Failed to fetch database");

    const db = await res.json();

    dbTbody.innerHTML = ""; // Clear existing rows

    if (db.length === 0) {
      dbTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888;">No entries yet. Start logging!</td></tr>`;
      return;
    }

    db.forEach((entry) => {
      const tr = document.createElement("tr");
      // Use the time parsed by AI, fallback to timestamp if missing
      const displayTime =
        entry.data.time ||
        new Date(entry.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });

      tr.innerHTML = `
        <td>${displayTime}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${entry.originalMessage}">${entry.originalMessage}</td>
        <td>${entry.data.water_ml ?? 0}</td>
        <td>${entry.data.carbs_g ?? 0}</td>
        <td>${entry.data.proteins_g ?? 0}</td>
        <td>${entry.data.fats_g ?? 0}</td>
      `;
      dbTbody.appendChild(tr);
    });
  } catch (error) {
    console.error("Database sync error:", error);
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  // Find out which button triggered the submit
  const submitter = event.submitter;
  const mode = submitter ? submitter.value : "standard";

  const text = inputEl.value.trim();
  if (!text) return;

  errorEl.textContent = "";
  inputEl.value = "";
  inputEl.disabled = true;
  btnStandard.disabled = true;
  btnDatabase.disabled = true;

  // Snapshot the history we send so it matches what the backend processes.
  const sentHistory = history.map((m) => ({
    role: m.role,
    parts: m.parts.map((p) => ({ text: p.text })),
  }));

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: sentHistory, new_message: text, mode }),
    });

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const data = await res.json();

    // Extract the reply text based on the mode the backend processed
    let replyText = "";
    if (mode === "database") {
      replyText = data.message || "No message returned.";

      // If the AI successfully parsed everything, it saved it to the DB!
      if (data.status === "SUCCESS") {
        fetchDatabase(); // Refresh the table UI
      }
    } else {
      replyText = typeof data?.reply === "string" ? data.reply : "";
    }

    // Append both turns only after a successful response
    history.push({ role: "user", parts: [{ text }] });
    history.push({ role: "model", parts: [{ text: replyText }] });
    renderChat();
  } catch (err) {
    errorEl.textContent = "Failed to send message. Please try again.";
    inputEl.value = text; // Restore the input so the user can retry without retyping.
  } finally {
    inputEl.disabled = false;
    btnStandard.disabled = false;
    btnDatabase.disabled = false;
    inputEl.focus();
  }
});

// Initial render and database fetch on page load
renderChat();
fetchDatabase();
