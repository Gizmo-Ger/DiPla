// ==========================================================
// settings-meta.js – Praxisinformationen / Branding
// ==========================================================

import { state } from '/js/core/state.js';
import { D } from '/js/core/diagnostics.js';

export const SettingsPlugin = {
  id: 'meta',
  title: 'Meta',
  order: 40,

  render(settings) {
    const meta = settings.meta || {};

    return `
      <div class="settings-section meta-section">
        <h3>Praxisinformationen</h3>

        <div class="meta-block">
          <label>Praxisname</label>
          <input id="meta-practice-name"
                 type="text"
                 value="${meta.practiceName || ''}"
                 placeholder="Praxis Launhardt" />
        </div>

        <div class="meta-block">
          <label>Standort</label>
          <input id="meta-location"
                 type="text"
                 value="${meta.location || ''}"
                 placeholder="Ort (optional)" />
        </div>

        <div class="meta-block">
          <label>App Titel im Header</label>
          <input id="meta-app-title"
                 type="text"
                 value="${meta.appTitle || 'DiPLAunhardt'}"
                 placeholder="Titel in der Kopfzeile" />
        </div>

        <div class="meta-block">
          <label>Theme</label>
          <select id="meta-theme">
            <option value="light" ${meta.theme === 'light' ? 'selected' : ''}>Hell</option>
            <option value="dark"  ${meta.theme === 'dark' ? 'selected' : ''}>Dunkel</option>
            <option value="auto"  ${meta.theme === 'auto' ? 'selected' : ''}>Automatisch</option>
          </select>
        </div>

        <hr>

        <h4>Zukünftige Optionen</h4>
        <p class="meta-info">
          Logo-Upload, Corporate Colors, Zugangslinks, iCal-Branding – später.
        </p>
      </div>
    `;
  },

  bind() {
    const meta = state.settings.meta || (state.settings.meta = {});

    document
      .getElementById('meta-practice-name')
      ?.addEventListener('input', (e) => {
        meta.practiceName = e.target.value.trim();
      });

    document.getElementById('meta-location')?.addEventListener('input', (e) => {
      meta.location = e.target.value.trim();
    });

    document
      .getElementById('meta-app-title')
      ?.addEventListener('input', (e) => {
        meta.appTitle = e.target.value.trim();
        const headerTitle = document.querySelector('.app-title');
        if (headerTitle)
          headerTitle.textContent = meta.appTitle || 'DiPLAunhardt';
      });

    document.getElementById('meta-theme')?.addEventListener('change', (e) => {
      meta.theme = e.target.value;
      document.documentElement.dataset.theme = meta.theme;
    });

    D.info('settings-meta', 'Events gebunden');
  },
};
