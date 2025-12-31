// ==========================================================
// File: notifications.js – FINAL
// Purpose: Post-Release Notifications (idempotent)
// - Shift-Soll/Ist-Vergleich
// - erzeugt PRIVATE Notes für Mitarbeiter
// - läuft ausschließlich NACH Planfreigabe
// ==========================================================

import { D } from "/js/core/diagnostics.js";
import { toIso, parseDate, formatDate } from "/js/misc/datetime.js";

// ----------------------------------------------------------
// KONSTANTEN
// ----------------------------------------------------------
const NOTIFICATION_TYPE = "shift-change";
const NOTE_PREFIX = "Achtung – geänderte Arbeitszeit am";

// ----------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------
export async function runPostReleaseNotifications(plan, settings) {
  if (!plan || !settings?.staff) return false;

  let changed = false;

  for (const emp of settings.staff) {
    if (!emp.active) continue;

    const empId = emp.id;
    const shiftMap = buildExpectedShiftMap(emp);

    for (const [isoDate, day] of Object.entries(plan.days || {})) {
      const empDay = day?.[empId];
      if (!empDay) continue;

      const expected = shiftMap.get(isoDate) || "";
      const actual   = extractActualShift(empDay);

      // Kein Soll oder kein Ist → ignorieren
      if (!expected || !actual) continue;

      if (expected !== actual) {
        const inserted = upsertShiftChangeNote(
          plan,
          isoDate,
          empId,
          expected,
          actual
        );
        if (inserted) changed = true;
      }
    }
  }

  if (changed) {
    D.info("notifications", "Shift-Change Notifications erzeugt");
  }

  return changed;
}

// ==========================================================
// SOLL-SCHICHT AUS SETTINGS
// ==========================================================
function buildExpectedShiftMap(emp) {
  const map = new Map();

  if (!Array.isArray(emp.shiftVersions)) return map;

  const versions = [...emp.shiftVersions].sort(
    (a, b) => a.validFrom.localeCompare(b.validFrom)
  );

  for (const v of versions) {
    const validFrom = parseDate(v.validFrom);
    if (!validFrom) continue;

    for (const [weekType, days] of Object.entries(v.shifts || {})) {
      for (const [dow, interval] of Object.entries(days || {})) {
        if (!interval) continue;

        // Woche + Wochentag → ISO-Date berechnen
        // (vereinfachend: Mapping erfolgt später pro Tag)
        map.set(`${weekType}:${dow}`, interval);
      }
    }
  }

  return {
    get(isoDate) {
      const d = parseDate(isoDate);
      if (!d) return "";

      const dowMap = ["so", "mo", "di", "mi", "do", "fr", "sa"];
      const dow = dowMap[d.getDay()];

      const week = getWeekIndex(d);
      return map.get(`${week}:${dow}`) || "";
    }
  };
}

function getWeekIndex(date) {
  const week = Math.ceil(date.getDate() / 7);
  return String(week);
}

// ==========================================================
// IST-SCHICHT AUS PLAN
// ==========================================================
function extractActualShift(empDay) {
  const intervals = [];

  for (const [key, val] of Object.entries(empDay)) {
    if (key.startsWith("_")) continue;
    if (typeof val === "string") {
      intervals.push(key);
    }
  }

  if (!intervals.length) return "";
  return intervals.sort().join(",");
}

// ==========================================================
// NOTE UPSERT (IDEMPOTENT)
// ==========================================================
function upsertShiftChangeNote(plan, isoDate, empId, expected, actual) {
  if (!Array.isArray(plan.notes)) plan.notes = [];

  const weekStart = toIso(getWeekStart(parseDate(isoDate)));

  const hash = `${isoDate}|${expected}|${actual}`;

  const exists = plan.notes.some(n =>
    n.weekStart === weekStart &&
    n.source === "system" &&
    n.meta?.type === NOTIFICATION_TYPE &&
    n.meta?.hash === hash
  );

  if (exists) return false;

  plan.notes.push({
    weekStart,
    text: `${NOTE_PREFIX} ${formatDate(isoDate)}`,
    source: "system",
    visibility: "private",
    recipients: [empId],
    meta: {
      type: NOTIFICATION_TYPE,
      hash,
      locked: true,
      generatedAt: new Date().toISOString()
    }
  });

  D.debug("notifications", "Shift-Change Note erzeugt", {
    empId,
    isoDate,
    expected,
    actual
  });

  return true;
}

// ==========================================================
// HELFER
// ==========================================================
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  if (day !== 1) d.setDate(d.getDate() - (day - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
