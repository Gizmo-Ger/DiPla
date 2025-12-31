// ==========================================================
// persist.js (FINAL v4.1 – Hybrid Delta + Monats-Snapshot)
// ==========================================================

import { D } from './diagnostics.js';
import { state } from './state.js';
import { emit } from './events.js';

import {
  expandPlanFromIntervals,
  compressPlanToIntervals,
} from './interval.js';
import { parseDate } from '../misc/datetime.js';
import { initPlanStatus } from './plan-status.js';

const PLAN_BASE = '/api/plan.php';
const SETTINGS_BASE = '/api/settings.php';

const loadedPlans = new Set();

// ---------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------
// Lokale Snapshots pro Jahr/Monat
const USE_LOCAL_SNAPSHOT = false;

// Delta-Tracking (nur lokal, keine API)
let lastPersistedPlan = null;

// ==========================================================
// SNAPSHOT-UTILS
// ==========================================================
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}

function getSnapshotKey(year, month) {
  return `dienstplan:${year}-${pad2(month)}:snapshot`;
}

export function saveMonthSnapshot(bucket) {
  if (!USE_LOCAL_SNAPSHOT) return;
  if (!bucket || !bucket.year || !bucket.month) return;

  const key = getSnapshotKey(bucket.year, bucket.month);

  try {
    const copy = JSON.parse(
      JSON.stringify({
        year: bucket.year,
        month: bucket.month,
        status: bucket.status || 'draft',
        days: bucket.days || {},
        notes: bucket.notes || [],
        holidays: bucket.holidays || [],
        absences: bucket.absences || [],
      })
    );

    localStorage.setItem(key, JSON.stringify(copy));

    D.debug('persist', 'Snapshot gespeichert', { key });
  } catch (err) {
    D.error('persist', 'saveMonthSnapshot Fehler', err);
  }
}

export function loadMonthSnapshot(year, month) {
  if (!USE_LOCAL_SNAPSHOT) return null;

  const key = getSnapshotKey(year, month);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const plan = JSON.parse(raw);

    if (!plan.days) plan.days = {};
    if (!plan.notes) plan.notes = [];
    if (!plan.holidays) plan.holidays = [];
    if (!plan.absences) plan.absences = [];
    if (!plan.status) plan.status = 'draft';

    D.info('persist', 'Snapshot geladen', { year, month });
    return plan;
  } catch (err) {
    D.error('persist', 'loadMonthSnapshot Fehler', err);
    return null;
  }
}

// ==========================================================
// DELTA / SNAPSHOT BASIS
// ==========================================================
export function setLastPersistedPlan(plan) {
  lastPersistedPlan = plan ? JSON.parse(JSON.stringify(plan)) : null;
}

export function getLastPersistedPlan() {
  return lastPersistedPlan;
}

export function computePlanDiff(oldPlan, newPlan) {
  const diff = {
    daysAdded: {},
    daysChanged: {},
    daysRemoved: [],
  };

  const o = oldPlan?.days || {};
  const n = newPlan?.days || {};

  const oldKeys = new Set(Object.keys(o));
  const newKeys = new Set(Object.keys(n));

  for (const iso of newKeys) {
    if (!o[iso]) {
      diff.daysAdded[iso] = n[iso];
      oldKeys.delete(iso);
      continue;
    }
    if (!deepEqual(o[iso], n[iso])) {
      diff.daysChanged[iso] = n[iso];
    }
    oldKeys.delete(iso);
  }

  for (const iso of oldKeys) {
    diff.daysRemoved.push(iso);
  }

  return diff;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object') return false;

  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;

  for (const k of ka) {
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// ==========================================================
// BUCKET-HILFSFUNKTION (Monatsbuckets aus einem Plan)
// ==========================================================
function buildMonthlyBucketsFromPlan(plan) {
  const buckets = new Map();

  const ensureBucket = (year, month) => {
    const key = `${year}-${month}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        year,
        month,
        status: plan.status || 'draft',
        days: {},
        notes: [],
        holidays: [],
        absences: [],
      });
    }
    return buckets.get(key);
  };

  // DAYS
  for (const [iso, empData] of Object.entries(plan.days || {})) {
    const y = +iso.slice(0, 4);
    const m = +iso.slice(5, 7);
    if (!y || !m) continue;

    const bucket = ensureBucket(y, m);
    bucket.days[iso] = empData;
  }

  // NOTES
  if (Array.isArray(plan.notes)) {
    for (const note of plan.notes) {
      if (!note?.weekStart) continue;
      const iso = String(note.weekStart);
      const y = +iso.slice(0, 4);
      const m = +iso.slice(5, 7);
      const bucket = ensureBucket(y, m);
      bucket.notes.push({ ...note });
    }
  }

  // HOLIDAYS
  if (Array.isArray(plan.holidays)) {
    for (const h of plan.holidays) {
      const iso = String(h).split(' – ')[0];
      const y = +iso.slice(0, 4);
      const m = +iso.slice(5, 7);
      const bucket = ensureBucket(y, m);
      if (!bucket.holidays.includes(h)) bucket.holidays.push(h);
    }
  }

  // ABSENCES
  if (Array.isArray(plan.absences)) {
    for (const a of plan.absences) {
      const start = parseDate(a.start);
      const end = parseDate(a.end);
      if (!start || !end) continue;

      let cursor = new Date(start.getFullYear(), start.getMonth(), 1);

      while (cursor <= end) {
        const y = cursor.getFullYear();
        const m = cursor.getMonth() + 1;

        const bucket = ensureBucket(y, m);
        bucket.absences.push({ ...a });

        cursor.setMonth(cursor.getMonth() + 1, 1);
      }
    }
  }

  return buckets;
}

// ==========================================================
// HYBRID-DELTA: Lokal + Snapshot, kein Server
// ==========================================================
export async function persistPlanDelta(plan = state.plan) {
  try {
    if (!plan || !plan.days) return;

    const previous = getLastPersistedPlan();

    // Erstes Persist → einmal Full Save + Snapshot
    if (!previous) {
      await persistMonthPlan(plan);
      setLastPersistedPlan(plan);
      D.info('persist', 'Initialer Full Save als Delta-Basis');
      return;
    }

    const diff = computePlanDiff(previous, plan);
    const changed =
      Object.keys(diff.daysAdded).length > 0 ||
      Object.keys(diff.daysChanged).length > 0 ||
      diff.daysRemoved.length > 0;

    if (!changed) {
      D.debug('persist', 'Keine Änderungen → Delta übersprungen');
      return;
    }

    // Delta nur lokal für Debug/Analyse
    const key = `${plan.year || 'y'}-${pad2(plan.month || 0)}`;
    try {
      localStorage.setItem(
        `dienstplan:${key}:delta:${Date.now()}`,
        JSON.stringify(diff)
      );
    } catch (e) {
      D.error('persist', 'localStorage Delta-Save Fehler', e);
    }

    // Snapshots pro Monat aktualisieren
    const buckets = buildMonthlyBucketsFromPlan(plan);
    for (const bucket of buckets.values()) {
      saveMonthSnapshot(bucket);
    }

    setLastPersistedPlan(plan);
    D.info('persist', 'Delta + Snapshots aktualisiert', { key });
  } catch (err) {
    D.error('persist', 'persistPlanDelta Fehler', err);
  }
}

// ==========================================================
// CLEAN UP meta (_absence, _holiday)
// ==========================================================
function cleanDayMeta(dayObj) {
  if (!dayObj || typeof dayObj !== 'object') return dayObj;

  if (dayObj._holiday) delete dayObj._holiday;

  for (const [empId, empDay] of Object.entries(dayObj)) {
    if (!empDay || typeof empDay !== 'object') continue;

    if (empDay._holiday) delete empDay._holiday;
    if (empDay._absence) delete empDay._absence;

    if (Object.keys(empDay).length === 0) delete dayObj[empId];
  }

  return Object.keys(dayObj).length === 0 ? null : dayObj;
}

// ==========================================================
// SETTINGS
// ==========================================================
export async function loadSettings() {
  try {
    const res = await fetch(`${SETTINGS_BASE}?ts=${Date.now()}`, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    state.settings = (await res.json()) || {};
    D.info('persist', 'Settings geladen');

    return state.settings;
  } catch (err) {
    D.error('persist', 'loadSettings Fehler', err);
    throw err;
  }
}

export async function persistSettings() {
  try {
    const res = await fetch(SETTINGS_BASE, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.settings),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    D.info('persist', 'Settings gespeichert');
  } catch (err) {
    D.error('persist', 'persistSettings Fehler', err);
  }
}

// ==========================================================
// MONATSPLAN LADEN (Snapshot bevorzugt, sonst Server)
// ==========================================================
export async function loadMonthPlan(year, month) {
  const key = `${year}-${month}`;

  try {
    // 1) Snapshot bevorzugen
    const snap = loadMonthSnapshot(year, month);
    if (snap) {
      expandPlanFromIntervals(snap);
      loadedPlans.add(key);
      return snap;
    }

    // 2) Fallback: Server
    const url = `${PLAN_BASE}?year=${year}&month=${month}&ts=${Date.now()}`;
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const plan = (await res.json()) || {};

    if (!plan.days) plan.days = {};
    if (!plan.notes) plan.notes = [];
    if (!plan.holidays) plan.holidays = [];
    if (!plan.absences) plan.absences = [];
    if (!plan.status) plan.status = 'empty';

    expandPlanFromIntervals(plan);
    initPlanStatus(plan);

    loadedPlans.add(key);

    // Basis-Snapshot aus Serverstand
    if (USE_LOCAL_SNAPSHOT) {
      const baseBucket = {
        year,
        month,
        status: plan.status || 'empty',
        days: plan.days,
        notes: plan.notes,
        holidays: plan.holidays,
        absences: plan.absences,
      };
      saveMonthSnapshot(baseBucket);
    }

    D.info('persist', 'Monatsplan vom Server geladen', { year, month });
    return plan;
  } catch (err) {
    D.error('persist', 'loadMonthPlan Fehler', err);
    throw err;
  }
}

export function isPlanLoadedFor(year, month) {
  return loadedPlans.has(`${year}-${month}`);
}

// ==========================================================
// MONATSPLAN SPEICHERN (Full Save + Snapshots)
// ==========================================================
export async function persistMonthPlan(plan = state.plan, opts = {}) {
  const silent = opts.silent === true;

  try {
    if (!plan || !plan.days) {
      D.error('persist', 'Ungültiger Plan beim Speichern', plan);
      return;
    }

    // 🔍 DEBUG: Start Persist
    D.debug('persist', 'persistMonthPlan gestartet', {
      status: plan.status,
      year: plan.year,
      month: plan.month,
    });

    if (!silent) {
      emit('plan-save-start', {
        year: plan.year,
        month: plan.month,
      });
    }

    const buckets = buildMonthlyBucketsFromPlan(plan);
    let hadError = false;

    // CLEANUP + SPEICHERN
    for (const bucket of buckets.values()) {
      for (const iso of Object.keys(bucket.days)) {
        const cleaned = cleanDayMeta(bucket.days[iso]);
        if (!cleaned) delete bucket.days[iso];
        else bucket.days[iso] = cleaned;
      }

      // Snapshot vor Kompression speichern
      saveMonthSnapshot(bucket);

      const intervalBucket = compressPlanToIntervals(bucket);
      intervalBucket.absences = bucket.absences || [];
      intervalBucket.holidays = bucket.holidays || [];

      const url = `${PLAN_BASE}?year=${bucket.year}&month=${bucket.month}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(intervalBucket),
        });

        const json = await res.json();

        if (!res.ok || json.status !== 'ok') {
          hadError = true;
          D.error('persist', 'Fehler beim Speichern', { bucket, json });
        } else {
          D.info('persist', 'Monat gespeichert', {
            year: bucket.year,
            month: bucket.month,
          });
        }
      } catch (err) {
        hadError = true;
        D.error('persist', 'Bucket Save Exception', { bucket, err });
      }
    }

    setLastPersistedPlan(plan);

    if (hadError) {
      emit('plan-save-error', { year: plan.year, month: plan.month });
    } else if (!silent) {
      emit('plan-save-success', { year: plan.year, month: plan.month });
    }

    D.info('persist', 'Plan gespeichert', {
      status: plan.status,
      year: plan.year,
      month: plan.month,
      silent,
    });
  } catch (err) {
    emit('plan-save-error', { year: plan?.year, month: plan?.month, err });
    D.error('persist', 'persistMonthPlan globale Exception', err);
  }
}
