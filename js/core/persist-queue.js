// ==========================================================
// File: persist-queue.js (THIN WRAPPER)
// Purpose: Legacy-Wrapper für UI-Code, delegiert an persistMonthPlan
// ==========================================================

import { state } from './state.js';
import { persistMonthPlan } from './persist.js';
import { D } from './diagnostics.js';

let saveTimer = null;
const SAVE_DELAY = 400; // ms

export function enqueuePlanSave(taskFn) {
  try {
    if (typeof taskFn === 'function') {
      taskFn();
    }

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persistMonthPlan(state.plan);
    }, SAVE_DELAY);
  } catch (err) {
    D.error('persist-queue', 'enqueuePlanSave Ausnahme', err);
  }
}
