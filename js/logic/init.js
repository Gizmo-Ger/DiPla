// ==========================================================
// File: js/logic/init.js
// Purpose: Initialisiert state.settings.logic aus Rule-Meta
// ==========================================================

import { getAllRules } from './rules/index.js';

/**
 * ensureLogicSettings(state)
 *
 * Baut state.settings.logic.rules aus den vorhandenen Regeln auf.
 * Quelle der Wahrheit ist rule.meta.
 *
 * IDMPOTENT:
 * - ergänzt fehlende Regeln
 * - ergänzt fehlende Params
 * - überschreibt KEINE User-Werte
 */
export function ensureLogicSettings(state) {
  state.settings ??= {};
  state.settings.logic ??= {};
  state.settings.logic.rules ??= {};

  const rules = getAllRules();

  for (const rule of rules) {
    const meta = rule.meta;
    if (!meta?.id) continue;

    // Regel-Eintrag sicherstellen
    const existing = state.settings.logic.rules[meta.id];

    if (!existing) {
      state.settings.logic.rules[meta.id] = {
        active: meta.mandatory ? true : meta.defaultActive !== false,
        params: {},
      };
    }

    const entry = state.settings.logic.rules[meta.id];
    entry.params ??= {};

    // Parameter-Defaults nachziehen (ohne Override)
    if (meta.params) {
      for (const [key, def] of Object.entries(meta.params)) {
        if (entry.params[key] === undefined) {
          entry.params[key] = def.default;
        }
      }
    }
  }
}
