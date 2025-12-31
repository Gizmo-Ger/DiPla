// ==========================================================
// settings-logic.js – FINAL
// Regel-Engine UI (aktivieren/deaktivieren + Parameter)
// Persistiert direkt nach settings.json
// ==========================================================

import { state } from '/js/core/state.js';
import { D } from '/js/core/diagnostics.js';
import { persistSettings } from '/js/core/persist.js';
import { getAllRules } from '/js/logic/rules/index.js';

// ==========================================================
// INITIALISIERUNG / MIGRATION
// ==========================================================

function ensureLogicRoot() {
  if (!state.settings.logic || typeof state.settings.logic !== 'object') {
    state.settings.logic = { rules: {} };
    return;
  }

  // 🔥 KRITISCH: Migration Array → Object
  if (Array.isArray(state.settings.logic.rules)) {
    state.settings.logic.rules = {};
  }

  if (
    !state.settings.logic.rules ||
    typeof state.settings.logic.rules !== 'object'
  ) {
    state.settings.logic.rules = {};
  }
}

function syncRulesFromEngine() {
  ensureLogicRoot();

  const rulesState = state.settings.logic.rules;
  const rules = getAllRules();

  for (const r of rules) {
    const meta = r.meta;
    const id = meta.id;

    if (!rulesState[id]) {
      rulesState[id] = {
        active: meta.mandatory || meta.defaultActive === true,
        params: {},
      };
    }

    if (meta.params) {
      for (const [key, def] of Object.entries(meta.params)) {
        if (rulesState[id].params[key] === undefined) {
          rulesState[id].params[key] = def.default;
        }
      }
    }
  }
}

// ==========================================================
// SETTINGS PLUGIN
// ==========================================================

export const SettingsPlugin = {
  id: 'logic',
  title: 'Logik',
  order: 50,

  render() {
    syncRulesFromEngine();

    const rules = getAllRules();
    const rulesState = state.settings.logic.rules;

    return `
      <div class="settings-section">
        <h3>Planlogik</h3>
        <p>Aktivierte Regeln werden bei der Planprüfung berücksichtigt.</p>

        <div class="logic-list">
          ${rules.map((r) => renderRule(r, rulesState[r.meta.id])).join('')}
        </div>
      </div>
    `;
  },

  bind() {
    const rulesState = state.settings.logic.rules;

    document.querySelectorAll('.logic-item').forEach((el) => {
      const ruleId = el.dataset.id;
      const ruleState = rulesState[ruleId];
      if (!ruleState) return;

      // ----------------------------------------------
      // Aktivieren / Deaktivieren
      // ----------------------------------------------
      const chk = el.querySelector('.logic-enable-input');
      if (chk) {
        chk.addEventListener('change', () => {
          ruleState.active = chk.checked;
          persistSettings(state.settings);
          D.info('settings-logic', 'Rule toggled', {
            ruleId,
            active: chk.checked,
          });
        });
      }

      // ----------------------------------------------
      // Parameter
      // ----------------------------------------------
      el.querySelectorAll('[data-param]').forEach((input) => {
        const key = input.dataset.param;

        input.addEventListener('input', () => {
          let value;

          if (input.type === 'number') {
            value = Number(input.value);
            if (Number.isNaN(value)) return;
          } else {
            value = input.value;
          }

          ruleState.params[key] = value;
          persistSettings(state.settings);
        });
      });
    });

    D.info('settings-logic', 'Logic-Settings gebunden');
  },
};

// ==========================================================
// RENDERER
// ==========================================================

function renderRule(rule, ruleState) {
  const meta = rule.meta;

  const checked = ruleState.active ? 'checked' : '';
  const disabled = meta.mandatory ? 'disabled' : '';

  const tooltip = [
    `ID: ${meta.id}`,
    meta.scopeType ? `Scope: ${meta.scopeType}` : '',
    meta.mandatory ? 'Pflichtregel' : 'Optional',
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <div class="logic-item" data-id="${meta.id}">
      <div class="logic-item-header">
        <label class="logic-title" data-tooltip="${tooltip}">
          <input type="checkbox"
                 class="logic-enable-input"
                 ${checked}
                 ${disabled}>
          <span>${meta.name}</span>
        </label>

        ${meta.mandatory ? `<span class="logic-mandatory">Pflicht</span>` : ''}
      </div>

      ${renderParams(meta, ruleState)}
    </div>
  `;
}

function renderParams(meta, ruleState) {
  if (!meta.params || Object.keys(meta.params).length === 0) {
    return `<div class="logic-params"></div>`;
  }

  return `
    <div class="logic-params">
      ${Object.entries(meta.params)
        .map(([key, def]) => renderParam(key, def, ruleState.params[key]))
        .join('')}
    </div>
  `;
}

function renderParam(key, def, value) {
  const label = def.label || key;

  // Zahl
  if (typeof def.default === 'number') {
    return `
      <div class="logic-param">
        <label>${label}</label>
        <input type="number"
               value="${value}"
               data-param="${key}">
      </div>
    `;
  }

  // Text
  return `
    <div class="logic-param">
      <label>${label}</label>
      <input type="text"
             value="${value}"
             data-param="${key}">
    </div>
  `;
}
