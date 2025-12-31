// ======================================================================
// settings-backup.js – Backup-Policy
// ======================================================================

import { state } from '/js/core/state.js';
import { persistSettings } from '/js/core/persist.js';
import popup from '/js/core/popup.js';

export const SettingsPlugin = {
  id: 'backup',
  title: 'Datensicherung',
  order: 80,

  // ------------------------------------------------------------------
  render(settings) {
    const policy = settings.backupPolicy ?? {};
    const sRet = policy.settings?.retention ?? {};
    const mRet = policy.months?.retention ?? {};

    return `
      <div class="sb-root">

        <!-- ========================================================= -->
        <!-- EINSTELLUNGEN -->
        <!-- ========================================================= -->
        <div class="sb-section">
          <h4>Einstellungen</h4>

          <div class="sb-grid">

            <div>
              <label>
                <input type="checkbox" id="sb-settings-enabled"
                  ${policy.settings?.enabled ? 'checked' : ''}>
                Automatische Sicherung aktiv
              </label>
            </div>
            <div></div>
            <div class="sb-hint">täglich nachts</div>

            <div>Kurzfristig</div>
            <div>
              <input type="number" min="0" max="20"
                id="sb-settings-son"
                value="${sRet.son ?? 3}">
            </div>
            <div class="sb-hint">für schnelle Rücksprünge</div>

            <div>Stabile Stände</div>
            <div>
              <input type="number" min="0" max="20"
                id="sb-settings-father"
                value="${sRet.father ?? 5}">
            </div>
            <div class="sb-hint">bewusste Zwischenstände</div>

            <div>Archiv</div>
            <div>unbegrenzt</div>
            <div class="sb-hint">wird nicht automatisch gelöscht</div>

          </div>
        </div>

        <!-- ========================================================= -->
        <!-- ARBEITSPLÄNE -->
        <!-- ========================================================= -->
        <div class="sb-section">
          <h4>Arbeitspläne</h4>

          <div class="sb-grid">

            <div>
              <label>
                <input type="checkbox" id="sb-months-enabled"
                  ${policy.months?.enabled ? 'checked' : ''}>
                Automatische Sicherung aktiv
              </label>
            </div>
            <div></div>
            <div></div>

            <div>Tägliche Sicherungen</div>
            <div>
              <input type="number" min="0" max="20"
                id="sb-months-son"
                value="${mRet.son ?? 5}">
            </div>
            <div class="sb-hint">automatisch jede Nacht</div>

            <div>Monatsabschlüsse</div>
            <div>
              <input type="number" min="0" max="10"
                id="sb-months-father"
                value="${mRet.father ?? 2}">
            </div>
            <div class="sb-hint">bei Monatsabschluss</div>

            <div>Jahresarchive</div>
            <div>
              <input type="number" min="0" max="5"
                id="sb-months-grandfather"
                value="${mRet.grandfather ?? 1}">
            </div>
            <div class="sb-hint">bei Jahresabschluss</div>

          </div>
        </div>

        <!-- ========================================================= -->
        <!-- FOOTER -->
        <!-- ========================================================= -->
        <div class="sb-footer">
          <button class="sm-btn sm-btn-primary" id="sb-save">
            Änderungen speichern
          </button>
        </div>

      </div>
    `;
  },

  // ------------------------------------------------------------------
  async bind(panel) {
    panel.querySelector('#sb-save').addEventListener('click', async () => {
      try {
        state.settings.backupPolicy = buildPolicyFromUI(panel);
        await persistSettings(state.settings);

        await popup.alert(
          'Die Backup-Einstellungen wurden erfolgreich gespeichert.',
          { type: 'info' }
        );
      } catch {
        await popup.alert(
          'Die Backup-Einstellungen konnten nicht gespeichert werden.\n\n' +
          'Bitte überprüfen Sie die eingegebenen Werte.',
          { type: 'error' }
        );
      }
    });
  },
};

// =====================================================================
// POLICY BUILDER (unverändert)
// =====================================================================
function buildPolicyFromUI(panel) {
  const now = new Date().toISOString();

  const policy = {
    schemaVersion: 1,
    enabled: true,
    updatedAt: now,

    settings: {
      enabled: panel.querySelector('#sb-settings-enabled').checked,
      strategy: 'full',
      schedule: { type: 'cron', expression: '0 2 * * *' },
      retention: {
        son: readInt(panel, '#sb-settings-son'),
        father: readInt(panel, '#sb-settings-father'),
        grandfather: -1,
      },
    },

    months: {
      enabled: panel.querySelector('#sb-months-enabled').checked,
      strategy: 'full',
      schedule: {
        son: { type: 'cron', expression: '0 3 * * *' },
        father: { type: 'event', event: 'month_close' },
        grandfather: { type: 'event', event: 'year_close' },
      },
      retention: {
        son: readInt(panel, '#sb-months-son'),
        father: readInt(panel, '#sb-months-father'),
        grandfather: readInt(panel, '#sb-months-grandfather'),
      },
    },
  };

  policy.hash = computePolicyHash(policy);
  return policy;
}

function readInt(panel, sel) {
  const v = Number(panel.querySelector(sel)?.value);
  if (!Number.isInteger(v) || v < 0) throw new Error('invalid');
  return v;
}

function computePolicyHash(policy) {
  const clone = structuredClone(policy);
  delete clone.hash;

  const json = JSON.stringify(clone);
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = ((h << 5) - h + json.charCodeAt(i)) | 0;
  }
  return { algo: 'client-hash', value: String(h) };
}
