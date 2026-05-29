import { APP_TEMPLATE } from "./template.js";
import { createChatPanel } from "./chatPanel.js";
import { createDatabasePanel } from "./databasePanel.js";
import { createSettingsPanel } from "./settingsPanel.js";

/**
 * Render the SPA shell into `root` and wire up the chat and database panels.
 *
 * @param {HTMLElement} root The container element (e.g. `#app`).
 */
export function mountApp(root) {
  root.innerHTML = APP_TEMPLATE;

  const dbPanel = createDatabasePanel(root.querySelector("#db-tbody"));
  const settingsPanel = createSettingsPanel(
    root.querySelector("#settings-tbody"),
  );

  const chatPanel = createChatPanel({
    formEl: root.querySelector("#chat-form"),
    inputEl: root.querySelector("#chat-input"),
    sendBtn: root.querySelector("#chat-send"),
    errorEl: root.querySelector("#chat-error"),
    messagesEl: root.querySelector("#messages"),
    refreshDatabase: () => dbPanel.refresh(),
    refreshSettings: () => settingsPanel.refresh(),
  });

  chatPanel.render();
  dbPanel.refresh();
  settingsPanel.refresh();
}
