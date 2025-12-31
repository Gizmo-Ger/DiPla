// ======================================================================
// settings-roles.js – v2.0
// Kompatibel mit neuer sm-Baseline (sm-* Klassen)
// Rollenverwaltung mit Farbe + Neuer Rolle
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { persistSettings } from '/js/core/persist.js';

// ----------------------------------------------------------
// Tabellenzeile für eine bestehende Rolle
// ----------------------------------------------------------
function roleRowHTML(name, data) {
  return `
    <tr data-role="${name}">
      <td class="sm-role-col-name">${name}</td>

      <td class="sm-role-col-color">
        <div class="sm-color-box" data-role="${name}" style="background:${data.color};"></div>
        <input type="color" class="sm-color-input" data-role="${name}" value="${data.color}">
      </td>

      <td class="sm-role-col-add"></td>
    </tr>
  `;
}

// ----------------------------------------------------------
// SettingsPlugin (Export)
// ----------------------------------------------------------
export const SettingsPlugin = {
  id: 'roles',
  title: 'Rollen',
  order: 10,

  // --------------------------------------------------------
  // RENDER
  // --------------------------------------------------------
  render(settings) {
    const roles = settings.roles || {};
    const functional = Object.entries(roles).filter(([, r]) => r.functional);

    return `
      <div class="sm-roles-root">

        <h3>Rollen</h3>

        <table class="sm-role-table">
          <tbody>
            ${functional.map(([name, data]) => roleRowHTML(name, data)).join('')}
          </tbody>
        </table>

        <table class="sm-role-table" style="margin-top:18px;">
          <tbody>
            <tr>

              <!-- Name -->
              <td class="sm-role-col-name">
                <input 
                  id="sm-new-role-name" 
                  class="sm-input" 
                  placeholder="Neue Rolle"
                  style="max-width:160px;"
                >
              </td>

              <!-- Farbe -->
              <td class="sm-role-col-color">
                <div 
                  id="sm-new-role-colorbox" 
                  class="sm-color-box" 
                  style="background:#888;"
                ></div>
                <input 
                  id="sm-new-role-color" 
                  type="color" 
                  class="sm-color-input" 
                  value="#888888"
                >
              </td>

              <!-- Add -->
              <td class="sm-role-col-add">
                <button id="sm-new-role-add" class="sm-btn-add">+</button>
              </td>

            </tr>
          </tbody>
        </table>

      </div>
    `;
  },

  // --------------------------------------------------------
  // BIND
  // --------------------------------------------------------
  bind() {
    const panel = document.querySelector('.sm-panel');
    const roles = state.settings.roles;

    if (!panel || !roles) {
      D.error('roles', 'Panel oder roles fehlt');
      return;
    }

    // ------------------------------------------------------
    // Vorhandene Rollen – Farbwähler
    // ------------------------------------------------------
    panel.querySelectorAll('.sm-color-box[data-role]').forEach((box) => {
      const role = box.dataset.role;
      const input = panel.querySelector(`.sm-color-input[data-role="${role}"]`);
      if (!input) return;

      box.addEventListener('click', () => input.click());

      input.addEventListener('input', () => {
        const col = input.value;
        box.style.background = col;

        roles[role].color = col;
        persistSettings(state.settings);

        D.info('roles', `Farbe geändert: ${role} → ${col}`);
      });
    });

    // ------------------------------------------------------
    // Neue Rolle
    // ------------------------------------------------------
    const nameInput = panel.querySelector('#sm-new-role-name');
    const colorBox = panel.querySelector('#sm-new-role-colorbox');
    const colorInput = panel.querySelector('#sm-new-role-color');
    const addBtn = panel.querySelector('#sm-new-role-add');

    if (!nameInput || !colorBox || !colorInput || !addBtn) {
      D.error('roles', 'Controls für neue Rolle fehlen');
      return;
    }

    colorBox.addEventListener('click', () => colorInput.click());
    colorInput.addEventListener('input', () => {
      colorBox.style.background = colorInput.value;
    });

    addBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      const color = colorInput.value;

      if (!name) {
        alert('Name erforderlich.');
        return;
      }
      if (roles[name]) {
        alert('Rolle existiert bereits.');
        return;
      }

      roles[name] = {
        color,
        functional: true,
      };

      persistSettings(state.settings);

      // Reload Tab
      document.dispatchEvent(
        new CustomEvent('settings-tab-reload', { detail: { tab: 'roles' } })
      );
    });
  },
};
