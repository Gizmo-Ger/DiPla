// ==========================================================
// Rule: Assistenz pro Arzt (inkl. Springer)
// Scope: Slot (Stunde)
// ==========================================================

export const assistPerDoctorRule = {
  meta: {
    id: 'assistPerDoctor',
    name: 'Assistenz pro Arzt',
    scopeType: 'slot',
    mandatory: false,
    defaultActive: true,
    params: {
      doctorRoles: { default: ['Arzt'] },
      assistRoles: { default: ['Assistenz'] },
    },
  },

  evaluate(analysis, ruleConfig, helpers) {
    const out = [];
    const days = analysis?.days || {};
    const { doctorRoles, assistRoles } = ruleConfig.params;

    for (const [iso, day] of Object.entries(days)) {
      const hours = day?.hours || {};

      for (const [slot, slotData] of Object.entries(hours)) {
        const roles = slotData?.roles || {};

        const doctors = helpers.countByRoles(roles, doctorRoles);
        if (doctors === 0) continue;

        const assist = helpers.countByRoles(roles, assistRoles);

        // --------------------------------------------------
        // > 3 Ärzte → harter Fehler
        // --------------------------------------------------
        if (doctors > 3) {
          out.push(
            makeFinding(
              this.meta,
              'error',
              iso,
              slot,
              `Zu viele Ärzte (${doctors}) gleichzeitig eingeplant`
            )
          );
          continue;
        }

        // --------------------------------------------------
        // 1–2 Ärzte → Assistenz = Ärzte
        // --------------------------------------------------
        if (doctors <= 2) {
          if (assist < doctors) {
            out.push(
              makeFinding(
                this.meta,
                'error',
                iso,
                slot,
                `Zu wenig Assistenz (${assist}/${doctors}) bei ${doctors} Ärzt${doctors > 1 ? 'en' : ''}`
              )
            );
          }
          continue;
        }

        // --------------------------------------------------
        // 3 Ärzte → Springerlogik
        // --------------------------------------------------
        if (assist <= 2) {
          out.push(
            makeFinding(
              this.meta,
              'error',
              iso,
              slot,
              `Zu wenig Assistenz (${assist}/3) bei 3 Ärzten`
            )
          );
        } else if (assist === 3) {
          out.push(
            makeFinding(
              this.meta,
              'warning',
              iso,
              slot,
              '3 Ärzte mit 3 Assistenzen – Springer fehlt'
            )
          );
        }
      }
    }

    return out;
  },
};

// ----------------------------------------------------------
// Finding-Factory (einheitlich!)
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
