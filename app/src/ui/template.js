/**
 * Static HTML scaffold for the SPA. Rendered once into `#app`; interactive
 * behaviour is wired up by the panel modules in ./chatPanel.js and
 * ./databasePanel.js.
 */
export const APP_TEMPLATE = `
  <div class="split-layout">
    <div class="chat-panel">
      <h1>AI Chat</h1>
      <div id="messages" class="messages" aria-live="polite"></div>
      <form id="chat-form" class="chat-form" autocomplete="off">
        <input
          id="chat-input"
          type="text"
          name="message"
          placeholder="Log food, ask for a summary, or ask for help..."
          required
          aria-label="Message"
        />
        <button id="chat-send" type="submit" class="btn btn-primary">Send</button>
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

      <h1>User Settings</h1>
      <div class="table-container">
        <table id="settings-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Height (cm)</th>
              <th>Weight (kg)</th>
              <th>Job</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody id="settings-tbody">
          </tbody>
        </table>
      </div>
    </div>
  </div>
`;
