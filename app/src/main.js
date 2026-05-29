import "./style.css";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.css";

import { initTelemetry } from "./telemetry.js";
import { marked } from "marked";
import DOMPurify from "dompurify";

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
          <button id="btn-query" type="submit" value="query" class="btn">Query DB</button>
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
const btnQuery = document.querySelector("#btn-query");
const btnDatabase = document.querySelector("#btn-database");
const errorEl = document.querySelector("#chat-error");
const dbTbody = document.querySelector("#db-tbody");

const history = [];

function renderChat() {
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
}

async function fetchDatabase() {
  try {
    const res = await fetch("/api/database");
    if (!res.ok) throw new Error("Failed to fetch database");

    const db = await res.json();

    dbTbody.innerHTML = "";

    if (db.length === 0) {
      dbTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888;">No entries yet. Start logging!</td></tr>`;
      return db;
    }

    db.forEach((entry) => {
      const tr = document.createElement("tr");
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

    return db;
  } catch (error) {
    console.error("Database sync error:", error);
    return null;
  }
}

formEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitter = event.submitter;
  const mode = submitter ? submitter.value : "standard";

  const text = inputEl.value.trim();
  if (!text) return;

  errorEl.textContent = "";
  inputEl.value = "";
  inputEl.disabled = true;
  btnQuery.disabled = true;
  btnDatabase.disabled = true;

  const sentHistory = history.map((m) => ({
    role: m.role,
    parts: m.parts.map((p) => ({ text: p.text })),
  }));

  const localTime = new Date().toLocaleString();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        history: sentHistory,
        new_message: text,
        mode,
        localTime,
      }),
    });

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const data = await res.json();

    let replyText = "";
    if (mode === "database") {
      replyText = data.message || "No message returned.";

      if (data.status === "SUCCESS") {
        const db = await fetchDatabase();

        if (db && data.entryId) {
          const entryExists = db.some((e) => e.id === data.entryId);
          if (entryExists) {
            replyText += `\n\n✅ *(Verified: Saved to Database as Entry #${data.entryId})*`;
          } else {
            replyText += `\n\n❌ **System Warning:** The database failed to save this entry. Please try again.`;
          }
        } else {
          replyText += `\n\n❌ **System Warning:** Could not verify database ID.`;
        }
      }
    } else {
      // Handles the "query" mode
      replyText = typeof data?.reply === "string" ? data.reply : "";
    }

    history.push({ role: "user", parts: [{ text }] });
    history.push({ role: "model", parts: [{ text: replyText }] });
    renderChat();
  } catch (err) {
    errorEl.textContent = "Failed to send message. Please try again.";
    inputEl.value = text;
  } finally {
    inputEl.disabled = false;
    btnQuery.disabled = false;
    btnDatabase.disabled = false;
    inputEl.focus();
  }
});

renderChat();
fetchDatabase();
