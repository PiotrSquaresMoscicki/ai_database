import { getProfile } from "../api.js";

/**
 * Create the user-settings/profile table controller.
 *
 * @param {HTMLTableSectionElement} tbody The `<tbody>` to render rows into.
 * @returns {{ refresh: () => Promise<Array|null> }} `refresh` re-fetches the
 *   profile ledger, re-renders the table, and returns the data (or `null` on
 *   error).
 */
export function createSettingsPanel(tbody) {
  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (ch) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[ch],
    );
  }

  function renderRows(db) {
    tbody.innerHTML = "";

    if (db.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #888;">No settings yet. Tell the AI your height, weight, or job!</td></tr>`;
      return;
    }

    db.forEach((entry) => {
      const tr = document.createElement("tr");
      const displayTime =
        entry.data.time ||
        new Date(entry.timestamp).toLocaleString([], {
          dateStyle: "short",
          timeStyle: "short",
        });

      tr.innerHTML = `
        <td>${escapeHtml(displayTime)}</td>
        <td>${escapeHtml(entry.data.height_cm ?? "")}</td>
        <td>${escapeHtml(entry.data.weight_kg ?? "")}</td>
        <td>${escapeHtml(entry.data.job ?? "")}</td>
        <td>${escapeHtml(entry.data.notes ?? "")}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async function refresh() {
    try {
      const db = await getProfile();
      renderRows(db);
      return db;
    } catch (error) {
      console.error("Settings sync error:", error);
      return null;
    }
  }

  return { refresh };
}
