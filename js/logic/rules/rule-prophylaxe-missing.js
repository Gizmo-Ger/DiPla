// ==========================================================
// Rule: Prophylaxe nicht besetzt
// Hinweisregel (blockiert nichts)
// ==========================================================

export const prophylaxeMissingRule = {
  meta: {
    id: 'prophylaxeMissing',
    name: 'Prophylaxe nicht besetzt',
    scopeType: 'slot',
    mandatory: false,
    defaultActive: true,
    params: {
      doctorRoles: { default: ['Arzt'] },
      prophylaxeRole: { default: 'Prophylaxe' },
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];

    const days = analysis?.days || {};
    const { doctorRoles, prophylaxeRole } = ruleConfig.params;

    for (const [iso, day] of Object.entries(days)) {
      const hours = day?.hours || {};

      for (const [slot, slotData] of Object.entries(hours)) {
        const roles = slotData?.roles || {};

        // --------------------------------------------
        // 1) Ärzte prüfen → kein Betrieb → ignorieren
        // --------------------------------------------
        const doctors = helpers.countByRoles(roles, doctorRoles);
        if (doctors === 0) continue;

        // --------------------------------------------
        // 2) Prophylaxe prüfen
        // --------------------------------------------
        const prophylaxeCount = roles[prophylaxeRole] || 0;
        if (prophylaxeCount > 0) continue;

        // --------------------------------------------
        // 3) Hinweis erzeugen
        // --------------------------------------------
        out.push({
          severity: 'info',
          rule: { id: 'prophylaxeMissing' },
          scope: {
            type: 'day',
            date: iso,
            slot,
          },
          message: 'Prophylaxe ist in diesem Zeitraum nicht besetzt',
        });
      }
    }

    return out;
  },
};
