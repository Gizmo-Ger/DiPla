// ==========================================================
// File: plan-status.js
// Purpose: Zentrale Steuerung des Plan-Workflows
// Statusfluss: empty → draft → approved → draft
// ==========================================================

import { state } from './state.js';
import { emit } from './events.js';
import { D } from './diagnostics.js';

// ----------------------------------------------------------
// STATUS-KONSTANTEN
// ----------------------------------------------------------
export const PLAN_STATUS = {
  EMPTY: 'empty',
  DRAFT: 'draft',
  APPROVED: 'approved',
};

// ----------------------------------------------------------
// Aktuellen Status defensiv ermitteln
// ----------------------------------------------------------
export function getPlanStatus() {
  const st = state.plan?.status;
  return Object.values(PLAN_STATUS).includes(st) ? st : PLAN_STATUS.EMPTY;
}

// ----------------------------------------------------------
// Prüfen, ob Plan inhaltlich leer ist
// (keine belegten Slots)
// ----------------------------------------------------------
function hasAnyAssignments(plan) {
  if (!plan?.days) return false;

  for (const day of Object.values(plan.days)) {
    for (const emp of Object.values(day || {})) {
      if (!emp || typeof emp !== 'object') continue;

      for (const key of Object.keys(emp)) {
        if (!key.startsWith('_')) {
          return true; // belegter Slot gefunden
        }
      }
    }
  }
  return false;
}

// ----------------------------------------------------------
// Darf freigegeben werden?
// Entscheidung basiert auf:
// - Logic-Ergebnis
// - tatsächlichem Planinhalt
// - logicResult = findings.summary
// ----------------------------------------------------------
export function canApprovePlan(summary) {
  if (!summary) return false;
  if ((summary.errorCount || 0) > 0) return false;

  if (!hasAnyAssignments(state.plan)) {
    D.warn('plan-status', 'Freigabe verweigert – Plan ist leer');
    return false;
  }

  return true;
}

// ----------------------------------------------------------
// PLAN FREIGEBEN
// ----------------------------------------------------------
export function approvePlan(logicResult, source = 'approve') {
  if (!state.plan) return false;

  if (!canApprovePlan(logicResult)) {
    D.warn('plan-status', 'Freigabe verweigert', {
      errorCount: logicResult?.errorCount,
    });
    return false;
  }

  state.plan.status = PLAN_STATUS.APPROVED;

  D.info('plan-status', 'Plan freigegeben');

  emit('plan-status-changed', {
    status: state.plan.status,
    source,
  });

  return true;
}

// ----------------------------------------------------------
// FREIGABE AUFHEBEN (explizit)
// ----------------------------------------------------------
export function revokeApproval(reason = 'manual', source = 'revoke') {
  if (!state.plan) return;
  if (state.plan.status !== PLAN_STATUS.APPROVED) return;

  state.plan.status = PLAN_STATUS.DRAFT;

  D.info('plan-status', 'Planfreigabe aufgehoben', { reason });

  emit('plan-status-changed', {
    status: state.plan.status,
    source,
  });
}

// ----------------------------------------------------------
// PLAN INHALTLICH MODIFIZIERT
// WICHTIG:
// - darf NUR bei echten Planänderungen aufgerufen werden
// - NICHT bei Notes, UI-State, Fokus etc.
// ----------------------------------------------------------
export function markPlanModified(source = 'unknown') {
  if (!state.plan) return;

  // EMPTY → DRAFT
  if (!state.plan.status || state.plan.status === PLAN_STATUS.EMPTY) {
    state.plan.status = PLAN_STATUS.DRAFT;

    D.info('plan-status', 'Planstatus EMPTY → DRAFT', { source });

    emit('plan-status-changed', {
      status: PLAN_STATUS.DRAFT,
      source,
    });
    return;
  }

  // APPROVED → DRAFT
  if (state.plan.status === PLAN_STATUS.APPROVED) {
    state.plan.status = PLAN_STATUS.DRAFT;

    D.info('plan-status', 'Plan geändert – Freigabe zurückgesetzt', {
      source,
    });

    emit('plan-status-changed', {
      status: PLAN_STATUS.DRAFT,
      source,
    });
  }
}

// ----------------------------------------------------------
// Initialisierung nach Plan-Load
// ----------------------------------------------------------
export function initPlanStatus(plan) {
  if (!plan) return;

  if (!plan.status) {
    plan.status = PLAN_STATUS.EMPTY;
  }

  D.debug('plan-status', 'Planstatus initialisiert', {
    status: plan.status,
  });
}
