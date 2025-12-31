// ==========================================================
// Regel: Schule an Schulferientag
// ID: schoolHolidays
// WARNUNG (kein Fehler)
// ==========================================================

export const schoolHolidaysRule = {
  meta: {
    id: 'schoolHolidays',
    name: 'Arbeiten an Schulferientag',
    description:
      "Warnt, wenn ein Mitarbeiter an einem Schulferientag als 'Schule' eingeplant ist.",
    severity: 'warning',
    mandatory: false,
  },

  evaluate(analysis) {
    const findings = [];
    const notes = analysis.notes || [];

    // ------------------------------------------------------
    // Schulferien-Systemnotes vorfiltern
    // ------------------------------------------------------
    const schoolHolidayNotes = notes.filter(
      (n) =>
        n.source === 'system' &&
        n.meta?.type === 'schoolholidays' &&
        n.meta.start &&
        n.meta.end
    );

    if (!schoolHolidayNotes.length) {
      return findings;
    }

    // ------------------------------------------------------
    // Tage prüfen
    // ------------------------------------------------------
    for (const [isoDate, day] of Object.entries(analysis.days)) {
      // 1) Liegt Datum in Schulferien?
      const isSchoolHoliday = schoolHolidayNotes.some(
        (n) => isoDate >= n.meta.start && isoDate <= n.meta.end
      );

      if (!isSchoolHoliday) continue;

      // 2) Rolle "schule" prüfen
      const affectedEmployees = new Set();

      for (const slot of Object.values(day.hours || {})) {
        if (!slot?.employees) continue;

        for (const e of slot.employees) {
          if (e.role === 'schule') {
            affectedEmployees.add(e.empId);
          }
        }
      }

      // 3) Findings erzeugen
      for (const empId of affectedEmployees) {
        findings.push({
          severity: 'warning',
          rule: { id: 'schoolHolidays' },
          scope: {
            type: 'day',
            date: isoDate,
            employeeId: empId,
          },
          message:
            `Schulferien: Mitarbeiter ${empId} ist am ${isoDate} als ` +
            `"Schule" eingeplant. In den Ferien arbeitet der Mitarbeiter ` +
            `üblicherweise in der Assistenz.`,
        });
      }
    }

    return findings;
  },
};
