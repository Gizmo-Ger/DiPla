// ==========================================================
// Rule: Leerer Plan (keine Arbeitsleistung)
// BLOCKIERENDE REGEL
// ==========================================================

export const emptyPlanRule = {
  meta: {
    id: 'emptyPlan',
    name: 'Plan enthält keine Arbeitszeiten',
    scopeType: 'week',
    mandatory: true,
    defaultActive: true,
  },

  evaluate(analysis) {
    const days = analysis?.days || {};
    let hasWork = false;

    for (const day of Object.values(days)) {
      const hours = day?.hours || {};

      for (const slot of Object.values(hours)) {
        if (slot?.employees?.length > 0) {
          hasWork = true;
          break;
        }
      }

      if (hasWork) break;
    }

    if (!hasWork) {
      return [
        {
          severity: 'error',
          rule: { id: 'emptyPlan' },
          scope: { type: 'week' },
          message:
            'Ein leerer Plan kann nicht geprüft werden. Bitte tragen Sie Arbeitszeiten ein.',
        },
      ];
    }

    return [];
  },
};
