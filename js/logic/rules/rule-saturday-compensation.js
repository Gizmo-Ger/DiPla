// ==========================================================
// Rule: Samstagsarbeit – Urlaubsausgleich
// Empfehlung, keine Buchung
// ==========================================================

export const saturdayCompensationRule = {
  meta: {
    id: 'saturdayCompensation',
    name: 'Samstagsarbeit – Urlaubsausgleich',
    scopeType: 'employee',
    mandatory: false,
    defaultActive: true,
    params: {
      saturdayIndex: { default: 6 }, // JS: 0=So … 6=Sa
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];
    const days = analysis?.days || {};
    const { saturdayIndex } = ruleConfig.params;

    // ------------------------------------------------------
    // 1) Samstag finden
    // ------------------------------------------------------
    for (const [iso, day] of Object.entries(days)) {
      const d = new Date(iso);
      if (d.getDay() !== saturdayIndex) continue;

      const hours = day?.hours || {};

      // --------------------------------------------------
      // 2) Mitarbeiter ermitteln, die am Samstag arbeiten
      // --------------------------------------------------
      const workingEmployees = new Set();

      for (const slotData of Object.values(hours)) {
        for (const e of slotData?.employees || []) {
          workingEmployees.add(e.empId);
        }
      }

      // --------------------------------------------------
      // 3) Für jeden Mitarbeiter: Ausgleich prüfen
      // --------------------------------------------------
      for (const empId of workingEmployees) {
        let hasFreeDay = false;

        for (const [iso2, day2] of Object.entries(days)) {
          const d2 = new Date(iso2);
          const wd = d2.getDay();

          // Sonntag & Samstag ignorieren
          if (wd === 0 || wd === 6) continue;

          const hours2 = day2?.hours || {};
          let worked = false;

          for (const slotData of Object.values(hours2)) {
            if ((slotData?.employees || []).some((e) => e.empId === empId)) {
              worked = true;
              break;
            }
          }

          if (!worked) {
            hasFreeDay = true;
            break;
          }
        }

        const credit = hasFreeDay ? 0.5 : 1.0;

        out.push({
          severity: 'info', // Empfehlung
          rule: {
            id: this.meta.id,
            name: this.meta.name,
          },
          scope: {
            type: 'employee',
            employeeId: empId,
            week: analysis.meta.week,
          },
          message:
            `Samstagsarbeit: Anspruch auf ${credit} Urlaubstag` +
            (hasFreeDay ? ' (mit Freizeitausgleich)' : ' (ohne Ausgleich)'),
          context: { credit },
        });
      }
    }

    return out;
  },
};
