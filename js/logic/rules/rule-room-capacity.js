// ==========================================================
// Rule: Behandlungskapazität (Zimmer + Ärzte-Limit)
// ==========================================================

export const roomCapacityRule = {
  meta: {
    id: 'roomCapacity',
    name: 'Behandlungskapazität',
    scopeType: 'slot',
    mandatory: false,
    defaultActive: true,
    params: {
      doctorRoles: { default: ['Arzt'] },
      prophylaxeRoles: { default: ['Prophylaxe'] },
      maxDoctors: { default: 3 },
      maxTreaters: { default: 6 }, // z. B. 7 Zimmer – 1 Reserve
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];
    const days = analysis?.days || {};

    const { doctorRoles, prophylaxeRoles, maxDoctors, maxTreaters } =
      ruleConfig.params;

    for (const [iso, day] of Object.entries(days)) {
      const hours = day?.hours || {};

      for (const [slot, slotData] of Object.entries(hours)) {
        const roles = slotData?.roles || {};

        const doctors = helpers.countByRoles(roles, doctorRoles);
        const prophylaxe = helpers.countByRoles(roles, prophylaxeRoles);
        const treaters = doctors + prophylaxe;

        // ----------------------------------------------
        // Ärzte-Limit (hart)
        // ----------------------------------------------
        if (doctors > maxDoctors) {
          out.push(
            makeFinding(
              this.meta,
              'error',
              { type: 'slot', date: iso, slot },
              `Zu viele Ärzte (${doctors}/${maxDoctors})`
            )
          );
        }

        // ----------------------------------------------
        // Zimmerkapazität (hart)
        // ----------------------------------------------
        if (treaters > maxTreaters) {
          out.push(
            makeFinding(
              this.meta,
              'error',
              { type: 'slot', date: iso, slot },
              `Zu viele Behandler (${treaters}/${maxTreaters}) – Zimmerkapazität überschritten`
            )
          );
        }
      }
    }

    return out;
  },
};

// ----------------------------------------------------------
// Finding-Factory (einheitlich)
// ----------------------------------------------------------
function makeFinding(ruleMeta, severity, scope, message) {
  return {
    severity, // error | warning | info
    rule: {
      id: ruleMeta.id,
      name: ruleMeta.name,
    },
    scope,
    message,
  };
}
