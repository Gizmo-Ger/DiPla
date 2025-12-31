// ==========================================================
// Rule: Vertragsstunden vs. Wochenarbeitszeit
// ==========================================================

export const contractHoursRule = {
  meta: {
    id: 'contractHours',
    name: 'Abweichung Vertragsstunden',
    scopeType: 'employee',
    mandatory: false,
    defaultActive: true,
    params: {
      toleranceInfo: { default: 1.0 }, // ± Stunden
      toleranceWarning: { default: 3.0 }, // ± Stunden
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];
    const days = analysis?.days || {};
    const staffList = Array.isArray(helpers?.getStaff) ? [] : null; // nur zur Klarheit – wir nutzen getStaff(id)

    const { toleranceInfo, toleranceWarning } = ruleConfig.params;

    // ------------------------------------------------------
    // Mitarbeiter-IDs der Woche sammeln
    // ------------------------------------------------------
    const employeeIds = new Set();

    for (const day of Object.values(days)) {
      const hours = day?.hours || {};
      for (const slotData of Object.values(hours)) {
        const employees = slotData?.employees || [];
        for (const e of employees) {
          if (e?.empId) employeeIds.add(e.empId);
        }
      }
    }

    // ------------------------------------------------------
    // Wochenarbeitszeit je Mitarbeiter berechnen
    // ------------------------------------------------------
    for (const empId of employeeIds) {
      const staff = helpers.getStaff(empId);
      if (!staff) continue;

      const contractHours = Number(staff.contractHours);
      if (!Number.isFinite(contractHours)) continue;

      const workdayHours = Number(staff.workdayHours) || 8;
      const slotHours = 1; // 1 Slot = 1 Stunde (Systemannahme)

      let workedHours = 0;

      for (const day of Object.values(days)) {
        const hours = day?.hours || {};
        for (const slotData of Object.values(hours)) {
          const employees = slotData?.employees || [];
          if (employees.some((e) => e.empId === empId)) {
            workedHours += slotHours;
          }
        }
      }

      const diff = workedHours - contractHours;
      const absDiff = Math.abs(diff);

      // --------------------------------------------------
      // Severity bestimmen
      // --------------------------------------------------
      let severity = null;

      if (absDiff >= toleranceWarning) {
        severity = 'warning';
      } else if (absDiff >= toleranceInfo) {
        severity = 'info';
      }

      if (!severity) continue;

      // --------------------------------------------------
      // Finding erzeugen
      // --------------------------------------------------
      out.push({
        severity,
        rule: { id: 'contractHours' },
        scope: {
          type: 'employee',
          employeeId: empId,
          week: analysis.meta.week,
        },
        message:
          `Geplant: ${workedHours} h · Vertrag: ${contractHours} h ` +
          `(Abweichung: ${diff > 0 ? '+' : ''}${diff} h)`,
      });
    }

    return out;
  },
};
