// ==========================================================
// Rule: Anmeldung besetzt bei Betrieb
// Mindestens 1 Frontdesk, ideal 2
// Scope: Slot (Stunde)
// ==========================================================

export const frontdeskCoverageRule = {
  meta: {
    id: 'frontdeskCoverage',
    name: 'Anmeldung besetzt bei Betrieb',
    scopeType: 'slot',
    mandatory: false,
    defaultActive: true,
    params: {
      treaterRoles: { default: ['Arzt', 'Prophylaxe'] },
      frontdeskRoles: { default: ['Anmeldung', 'Abrechnung'] },
      idealFrontdesk: { default: 2 },
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];
    const days = analysis?.days || {};

    const { treaterRoles, frontdeskRoles, idealFrontdesk } = ruleConfig.params;

    for (const [iso, day] of Object.entries(days)) {
      const hours = day?.hours || {};

      for (const [slot, slotData] of Object.entries(hours)) {
        const roles = slotData?.roles || {};

        // --------------------------------------------------
        // Behandler zählen
        // --------------------------------------------------
        const treaters = helpers.countByRoles(roles, treaterRoles);

        // Kein Betrieb → keine Anmeldungspflicht
        if (treaters === 0) continue;

        // --------------------------------------------------
        // Frontdesk zählen
        // --------------------------------------------------
        const frontdesk = helpers.countByRoles(roles, frontdeskRoles);

        // --------------------------------------------------
        // 0 Frontdesk → ERROR (blockiert Freigabe)
        // --------------------------------------------------
        if (frontdesk === 0) {
          out.push(
            makeFinding(
              this.meta,
              'error',
              iso,
              slot,
              'Keine Anmeldung/Abrechnung besetzt trotz laufendem Betrieb'
            )
          );
          continue;
        }

        // --------------------------------------------------
        // < ideal → WARNING (Freigabe möglich)
        // --------------------------------------------------
        if (frontdesk < idealFrontdesk) {
          out.push(
            makeFinding(
              this.meta,
              'warning',
              iso,
              slot,
              `Nur ${frontdesk} Frontdesk besetzt (ideal: ${idealFrontdesk})`
            )
          );
        }
      }
    }

    return out;
  },
};

// ----------------------------------------------------------
// Finding-Factory (einheitlich für alle Rules)
// ----------------------------------------------------------
function makeFinding(ruleMeta, severity, dateIso, slot, message) {
  return {
    severity, // error | warning | info
    rule: {
      id: ruleMeta.id,
      name: ruleMeta.name,
    },
    scope: {
      type: 'slot',
      date: dateIso,
      slot,
    },
    message,
  };
}
