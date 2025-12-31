// ==========================================================
// Rule: JVA-Besetzung
// Pflichttermin: Mittwoch & Freitag, 08:00–14:00
// ==========================================================

export const jvaCoverageRule = {
  meta: {
    id: 'jvaCoverage',
    name: 'JVA-Besetzung (Mi/Fr 08–14)',
    scopeType: 'day',
    mandatory: false,
    defaultActive: true,
    params: {
      jvaRole: { default: 'JVA' },
      requiredWeekdays: {
        // ISO: Montag=1 … Sonntag=7
        default: [3, 5], // Mittwoch, Freitag
      },
      startHour: { default: 8 },
      endHour: { default: 14 },
    },
  },

evaluate(analysis, ruleConfig, helpers) {
  const out = [];
  const days = analysis?.days || {};

  const {
    requiredWeekdays,
    startHour,
    endHour,
  } = ruleConfig.params;

  for (const [iso, day] of Object.entries(days)) {
    const hours = day?.hours || {};

    // ISO-Wochentag
    const jsDay = new Date(iso).getDay();
    const weekday = jsDay === 0 ? 7 : jsDay;

    if (!requiredWeekdays.includes(weekday)) continue;

    let hasDoctor = false;
    let hasAssist = false;

    for (const [slot, slotData] of Object.entries(hours)) {
      const slotHour = Number(slot.split('-')[0]);
      if (slotHour < startHour || slotHour >= endHour) continue;

      const employees = Array.isArray(slotData?.employees)
        ? slotData.employees
        : [];

      for (const e of employees) {
        const staff = helpers.getStaff(e.empId);
        if (!staff || !Array.isArray(staff.altRoles)) continue;

        // Arzt für JVA
        if (
          e.role === 'JVA' &&
          staff.primaryRole === 'Arzt' &&
          staff.altRoles.includes('JVA')
        ) {
          hasDoctor = true;
        }

        // Assistenz für JVA
        if (
          e.role === 'Assistenz' &&
          staff.primaryRole === 'Assistenz' &&
          staff.altRoles.includes('JVA')
        ) {
          hasAssist = true;
        }
      }
    }

    if (!hasDoctor) {
      out.push(
        makeFinding(
          this.meta,
          'error',
          { type: 'day', date: iso },
          'Kein Arzt mit JVA-Qualifikation eingeteilt'
        )
      );
    }

    if (!hasAssist) {
      out.push(
        makeFinding(
          this.meta,
          'error',
          { type: 'day', date: iso },
          'Keine Assistenz mit JVA-Qualifikation eingeteilt'
        )
      );
    }
  }

  return out;
}



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
