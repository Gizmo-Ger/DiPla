// ==========================================================
// Rule: ITN (Kapazitätsregel)
// ID: itn
// Scope: Slot
// ==========================================================

import { parseDate, toIso } from '/js/misc/datetime.js';

// ----------------------------------------------------------
// Konfiguration (fachliche Wahrheit)
// ----------------------------------------------------------
const ITN_MARKER = 'ITN';

const MAX_TREATERS_WHEN_ITN = 4; // Arzt + Prophylaxe
const MAX_DOCTORS_WHEN_ITN = 2;

// ==========================================================
// Regel-Export
// ==========================================================

export const itnRule = {
  meta: {
    id: 'itn',
    name: 'ITN – Kapazitätsbeschränkung',
    description:
      'Begrenzt bei ITN die Anzahl der Behandler pro Slot (Zimmerlogik)',
    scopeType: 'slot',
    mandatory: false,
    defaultActive: true,
  },

  /**
   * @param {Object} analysis
   * @param {Object} ruleConfig
   * @param {Object} helpers
   */
  evaluate(analysis) {
    const findings = [];

    const days = analysis?.days || {};
    const notes = analysis?.notes || [];

    // ------------------------------------------------------
    // ITN-Tage einmalig bestimmen
    // ------------------------------------------------------
    const itnDates = collectItnDates(notes);

    // ------------------------------------------------------
    // Slots prüfen
    // ------------------------------------------------------
    for (const [isoDate, day] of Object.entries(days)) {
      if (!itnDates.has(isoDate)) continue;

      const hours = day?.hours || {};

      for (const [slot, slotData] of Object.entries(hours)) {
        const roles = slotData?.roles || {};

        const doctors = roles['Arzt'] || 0;
        const prophylaxe = roles['Prophylaxe'] || 0;

        const treaters = doctors + prophylaxe;

        // ----------------------------------------------
        // 1) Harte Zimmergrenze
        // ----------------------------------------------
        if (treaters > MAX_TREATERS_WHEN_ITN) {
          findings.push(
            makeFinding(
              'error',
              { type: 'slot', date: isoDate, slot },
              `ITN aktiv: zu viele Behandler (${treaters}/${MAX_TREATERS_WHEN_ITN})`
            )
          );
        }

        // ----------------------------------------------
        // 2) Ärzte-Obergrenze
        // ----------------------------------------------
        if (doctors > MAX_DOCTORS_WHEN_ITN) {
          findings.push(
            makeFinding(
              'error',
              { type: 'slot', date: isoDate, slot },
              `ITN aktiv: zu viele Ärzte (${doctors}/${MAX_DOCTORS_WHEN_ITN})`
            )
          );
        }
      }
    }

    return findings;
  },
};

// ==========================================================
// INTERN: ITN-Tage aus Notes extrahieren
// ==========================================================

function collectItnDates(notes) {
  const set = new Set();
  if (!Array.isArray(notes)) return set;

  for (const n of notes) {
    if (typeof n?.text !== 'string') continue;

    for (const line of n.text.split(/\r?\n/)) {
      const parsed = parseItnLine(line.trim());
      if (parsed?.isoDate) {
        set.add(parsed.isoDate);
      }
    }
  }

  return set;
}

function parseItnLine(text) {
  if (!text || !text.startsWith(ITN_MARKER)) return null;

  // "ITN am Dienstag, 13.01.2026"
  const m = text.match(/^ITN am (.+)$/);
  if (!m) return null;

  let dateStr = m[1];
  if (dateStr.includes(',')) {
    dateStr = dateStr.split(',').pop().trim();
  }

  const d = parseDate(dateStr);
  if (!d) return null;

  return { isoDate: toIso(d) };
}

// ==========================================================
// Finding Factory
// ==========================================================

function makeFinding(severity, scope, message) {
  return {
    severity, // error | warning
    rule: {
      id: 'itn',
      name: 'ITN – Kapazitätsbeschränkung',
    },
    scope,
    message,
  };
}
