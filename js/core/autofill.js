// ==========================================================
// File: autofill.js – FINAL v3.2 (per-Employee shiftVersions)
// Multi-Range Autofill, robustes Parsing + korrektes validFrom
// ==========================================================

import { D } from './diagnostics.js';
import { state } from './state.js';

import {
  getWeekNumber,
  getLocalMondayOfISOWeek,
  buildHourSlots,
  toIso,
  getISOWeekYear,
  getDaysInMonth,
  parseDate,
} from '../misc/datetime.js';

// Mo–Sa relevant
const DAY_KEYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa'];

// Default JVA-Bereich Arzt (08–14)
const JVA_ARZT = { from: 8, to: 14 };

// Rollen-Konstanten
const ROLE_SCHOOL = 'Schule';
const ROLE_JVA_ARZT = 'JVA';
const ROLE_JVA_ASSI = 'JVA-Assistenz';
const DEFAULT_AUTOFILL_ROLE = 'Dienst';

// ----------------------------------------------------------
// Hilfsfunktionen Rollen
// ----------------------------------------------------------
function isNonFunctional(roleName, rolesCfg) {
  const cfg = rolesCfg?.[roleName];
  return !!cfg && cfg.functional === false;
}

function pickAutofillRole(settings) {
  const roles = settings.roles || {};
  if (roles[DEFAULT_AUTOFILL_ROLE]) return DEFAULT_AUTOFILL_ROLE;

  const fn = Object.entries(roles).find(
    ([, cfg]) => !cfg || cfg.functional !== false
  );
  return fn ? fn[0] : DEFAULT_AUTOFILL_ROLE;
}

// ----------------------------------------------------------
// Version Handling – NUR pro Mitarbeiter
// ----------------------------------------------------------
function normalizeShiftVersion(v) {
  if (!v.shifts) v.shifts = {};

  // 4 Rotationswochen erzwingen
  for (const w of ['1', '2', '3', '4']) {
    if (!v.shifts[w]) v.shifts[w] = {};
    const wk = v.shifts[w];
    for (const d of DAY_KEYS) {
      wk[d] = wk[d] ?? '';
    }
  }

  if (typeof v.validFrom !== 'string') v.validFrom = '';
}

/**
 * Ermittelt die passende Schichtversion für ein Datum.
 *
 * Quelle: emp.shiftVersions (Array)
 * - Nur Versionen mit validFrom <= date werden berücksichtigt.
 * - Neueste gültige Version gewinnt.
 * - Vor der ersten validFrom: keine Schicht → Autofill macht nichts.
 */
function getShiftVersionForDate(emp, date) {
  const versions = Array.isArray(emp?.shiftVersions) ? emp.shiftVersions : [];
  if (!versions.length) return null;

  versions.forEach(normalizeShiftVersion);

  const enriched = versions.map((v) => {
    const d = parseDate(v.validFrom);
    return {
      version: v,
      from: d instanceof Date && !isNaN(d) ? d : null,
    };
  });

  // Alle Versionen, die bereits "aktiv" sind (validFrom <= Datum)
  const valid = enriched.filter((e) => e.from && e.from <= date);
  if (!valid.length) return null;

  // Neueste gültige Version
  valid.sort((a, b) => b.from - a.from);
  return valid[0].version;
}

// ----------------------------------------------------------
// Rotation
// ----------------------------------------------------------
function getFirstMondayOfMonth(y, m) {
  const d = new Date(y, m - 1, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Rotation 1–4 relativ zum ersten Montag des Monats.
 * Wenn Datum vor dem ersten Montag liegt → null.
 */
function getRotationIndexForDate(date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const fm = getFirstMondayOfMonth(y, m);
  if (date < fm) return null;

  const diff = Math.floor((date - fm) / 86400000);
  return (((Math.floor(diff / 7) % 4) + 4) % 4) + 1;
}

// ----------------------------------------------------------
// Pattern Parser (A+B)
// ----------------------------------------------------------
function parseRange(str) {
  if (!str) return null;

  let s = String(str).trim().toLowerCase();
  if (s === 'frei' || s === '-' || s === '') return null;

  s = s
    .replace(/[–—−]/g, '-')
    .replace(/uhr/g, '')
    .replace(/h/g, '')
    .replace(/bis/g, '-')
    .replace(/\s+/g, '')
    .replace(/(\d+)\.(\d+)/g, '$1:$2')
    .replace(/:00/g, '');

  if (s.includes('/')) return parseMultiRange(s);

  const m = /^(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return null;

  const from = Number(m[1]);
  const to = Number(m[2]);

  if (from < 0 || from > 23) return null;
  if (to < 1 || to > 24) return null;
  if (to <= from) return null;

  return [{ from, to }];
}

function parseMultiRange(s) {
  const parts = s.split('/').map((p) => p.trim());
  const ranges = [];

  for (const p of parts) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(p);
    if (!m) continue;

    const from = Number(m[1]);
    const to = Number(m[2]);

    if (from < 0 || from > 23) continue;
    if (to < 1 || to > 24) continue;
    if (to <= from) continue;

    ranges.push({ from, to });
  }

  return ranges.length ? ranges : null;
}

function slotInsideAny(slot, ranges) {
  if (!Array.isArray(ranges)) return false;
  const [sh, eh] = slot.split('-').map(Number);

  return ranges.some((r) => sh >= r.from && eh <= r.to);
}

function interpretPattern(pattern) {
  if (!pattern) return { kind: 'none', ranges: null };

  const lower = String(pattern).trim().toLowerCase();

  if (!lower || lower === 'frei') return { kind: 'none', ranges: null };
  if (lower === 'schule') return { kind: 'school', ranges: null };
  if (lower === 'jva') return { kind: 'jva', ranges: [{ ...JVA_ARZT }] };

  const r = parseRange(lower);
  if (r) return { kind: 'range', ranges: r };

  return { kind: 'none', ranges: null };
}

// ----------------------------------------------------------
// Kernlogik Tagesautofill – Multi-Range
// ----------------------------------------------------------
function fillDay(date, settings, plan) {
  const staff = settings.staff || [];
  const rolesCfg = settings.roles || {};

  const iso = toIso(date);
  const jsDay = date.getDay();
  if (jsDay === 0) return; // Sonntag raus

  const dayKey = DAY_KEYS[jsDay - 1];
  const rot = getRotationIndexForDate(date);
  if (!rot) return;

  if (!plan.days[iso]) plan.days[iso] = {};
  const dayObj = plan.days[iso];

  const hours = buildHourSlots(settings);

  for (const emp of staff) {
    const empId = emp.id;
    if (!empId) continue;

    if (!dayObj[empId]) dayObj[empId] = {};
    const empDay = dayObj[empId];

    // Blockiert durch Feiertag / Abwesenheit
    if (empDay._holiday || empDay._absence) continue;

    // Nicht-funktionale Rollen schon gesetzt → lass die Finger weg
    const hasNF = Object.values(empDay).some(
      (r) => typeof r === 'string' && isNonFunctional(r, rolesCfg)
    );
    if (hasNF) continue;

    // PASSENDE SHIFT-VERSION HOLEN (nur pro MA)
    const v = getShiftVersionForDate(emp, date);
    if (!v) continue;

    const wk = v.shifts[String(rot)];
    const patternStr = wk?.[dayKey] || '';
    const { kind, ranges } = interpretPattern(patternStr);

    if (kind === 'none') continue;

    let targetRole = '';

    if (kind === 'school') {
      targetRole = ROLE_SCHOOL;
    } else if (kind === 'jva') {
      if (Array.isArray(emp.roles) && emp.roles.includes('JVA-Assistenz')) {
        targetRole = ROLE_JVA_ASSI;
      } else {
        targetRole = ROLE_JVA_ARZT;
      }
    } else if (kind === 'range') {
      targetRole = emp.primaryRole || pickAutofillRole(settings);
    }

    if (!targetRole) continue;

    for (const slot of hours) {
      const existing = empDay[slot];

      // bestehende nicht-funktionale Rolle nie überschreiben
      if (existing && isNonFunctional(existing, rolesCfg)) continue;

      if (kind === 'school') {
        if (!existing) empDay[slot] = targetRole;
        continue;
      }

      if (kind === 'jva' || kind === 'range') {
        if (!slotInsideAny(slot, ranges)) continue;
        if (!existing) empDay[slot] = targetRole;
      }
    }
  }
}

// ----------------------------------------------------------
// PUBLIC: KW-Autofill
// ----------------------------------------------------------
export async function autofillWeek(
  startDate,
  settings = state.settings,
  plan = state.plan
) {
  try {
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);

  const monday = getLocalMondayOfISOWeek(getISOWeekYear(d), getWeekNumber(d));
    if (!plan || typeof plan !== 'object') {
      plan = {
        year: monday.getFullYear(),
        month: monday.getMonth() + 1,
        days: {},
        notes: [],
        holidays: [],
        absences: [],
      };
    }

    if (!plan.days) plan.days = {};

    for (let i = 0; i < 6; i++) {
      const dd = new Date(monday);
      dd.setDate(monday.getDate() + i);
      fillDay(dd, settings, plan);
    }

    if (state.plan?.status === 'approved') {
      plan.status = 'draft';
    }
    state.plan = plan;

    D.info('autofill', 'KW Autofill abgeschlossen', {
      weekStart: toIso(monday),
    });

    document.dispatchEvent(
      new CustomEvent('plan-modified', { detail: { source: 'autofill-week' } })
    );
  } catch (e) {
    D.error('autofill', 'Fehler in autofillWeek()', e);
  }
}

// ----------------------------------------------------------
// PUBLIC: Monats-Autofill
// ----------------------------------------------------------
export async function autofillMonthPlan(
  year,
  month,
  settings = state.settings,
  plan = state.plan
) {
  try {
    if (!plan || typeof plan !== 'object') {
      plan = { year, month, days: {}, notes: [], holidays: [], absences: [] };
    }

    if (!plan.days) plan.days = {};

    const dim = getDaysInMonth(year, month);

    for (let d = 1; d <= dim; d++) {
      const date = new Date(year, month - 1, d);
      date.setHours(0, 0, 0, 0);
      if (date.getDay() === 0) continue; // Sonntag auslassen
      fillDay(date, settings, plan);
    }

    if (state.plan?.status === 'approved') {
      plan.status = 'draft';
    }
    state.plan = plan;

    D.info('autofill', 'Monats-Autofill abgeschlossen', { year, month });

    document.dispatchEvent(
      new CustomEvent('plan-modified', { detail: { source: 'autofill-month' } })
    );
  } catch (e) {
    D.error('autofill', 'Fehler in autofillMonthPlan()', e);
  }
}
