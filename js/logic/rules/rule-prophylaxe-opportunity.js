// ==========================================================
// Rule: Prophylaxe-Möglichkeit bei freier Kapazität
// Hinweisregel (blockiert nichts)
// ==========================================================

export const prophylaxeOpportunityRule = {
  meta: {
    id: 'prophylaxeOpportunity',
    name: 'Zusätzliche Prophylaxe möglich',
    scopeType: 'slot',
    mandatory: false,
    defaultActive: true,
    params: {
      doctorRoles: { default: ['Arzt'] },
      assistRoles: { default: ['Assistenz'] },
      prophylaxeRole: { default: 'Prophylaxe' },
      maxTreaters: { default: 6 }, // muss zu roomCapacity passen
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];

    const days = analysis?.days || {};
    const { doctorRoles, assistRoles, prophylaxeRole, maxTreaters } =
      ruleConfig.params;

    for (const [iso, day] of Object.entries(days)) {
      const hours = day?.hours || {};

      for (const [slot, slotData] of Object.entries(hours)) {
        const roles = slotData?.roles || {};
        const employees = Array.isArray(slotData?.employees)
          ? slotData.employees
          : [];

        // --------------------------------------------------
        // 1) Ärzte & Assistenz zählen
        // --------------------------------------------------
        const doctors = helpers.countByRoles(roles, doctorRoles);
        if (doctors === 0) continue; // kein Betrieb

        const assist = helpers.countByRoles(roles, assistRoles);

        // Assistenz reicht NICHT → nichts vorschlagen
        if (assist < doctors) continue;

        // --------------------------------------------------
        // 2) Raumkapazität prüfen
        // --------------------------------------------------
        const prophylaxeCount = roles[prophylaxeRole] || 0;
        const treaters = doctors + prophylaxeCount;

        if (treaters >= maxTreaters) continue; // kein freier Raum

        // --------------------------------------------------
        // 3) Überzählige Assistenz mit Prophylaxe-Quali suchen
        // --------------------------------------------------
        const surplusAssist = assist - doctors;
        if (surplusAssist <= 0) continue;

        for (const e of employees) {
          if (e.role !== assistRoles[0]) continue;

          const staff = helpers.getStaff(e.empId);
          if (!staff) continue;

          if (
            Array.isArray(staff.altRoles) &&
            staff.altRoles.includes(prophylaxeRole)
          ) {
            out.push({
              severity: 'info',
              rule: { id: 'prophylaxeOpportunity' },
              scope: {
                type: 'slot',
                date: iso,
                slot,
                employeeId: e.empId,
              },
              message: `Mitarbeiter ${e.empId} kann zusätzlich Prophylaxe anbieten`,
            });

            break; // EIN Hinweis pro Slot reicht
          }
        }
      }
    }

    return out;
  },
};
