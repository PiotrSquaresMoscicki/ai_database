import { getDatabase } from "../api.js";

/**
 * Create the nutrition-ledger table controller.
 *
 * @param {HTMLTableSectionElement} tbody The `<tbody>` to render rows into.
 * @returns {{ refresh: () => Promise<Array|null> }} `refresh` re-fetches the
 *   ledger, re-renders the table, and returns the data (or `null` on error).
 */
export function createDatabasePanel(tbody) {
  function renderRows(db) {
    tbody.innerHTML = "";

    if (db.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #888;">No entries yet. Start logging!</td></tr>`;
      return;
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
      tbody.appendChild(tr);
    });
  }

  async function refresh() {
    try {
      const db = await getDatabase();
      renderRows(db);
      return db;
    } catch (error) {
      console.error("Database sync error:", error);
      return null;
    }
  }

  return { refresh };
}
