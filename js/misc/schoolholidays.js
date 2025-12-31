// ======================================================================
// schoolholidays.js – FINAL (Schema v2)
// Schulferien Deutschland (SH)
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { parseDate, toIso } from '/js/misc/datetime.js';

// ----------------------------------------------------------------------
// KONFIG
// ----------------------------------------------------------------------
const API_BASE = 'https://ferien-api.de/api/v1/holidays';
export const STATE_SH = 'SH';

// Cache: `${state}-${year}` → periods[]
const cache = new Map();

// ======================================================================
// FETCH
// ======================================================================
export async function fetchSchoolHolidays(stateCode, year) {
  if (!stateCode || !Number.isInteger(year)) {
    throw new Error('stateCode und year erforderlich');
  }

  const key = `${stateCode}-${year}`;
  if (cache.has(key)) return cache.get(key);

  const url = `${API_BASE}/${stateCode}/${year}`;
  let raw;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (e) {
    D.error('schoolholidays', 'Fetch fehlgeschlagen', { stateCode, year, e });
    throw e;
  }

  const periods = normalizeApiResponse(raw);
  cache.set(key, periods);

  return periods;
}

export function clearSchoolHolidayCache() {
  cache.clear();
}

// ======================================================================
// DISPLAY
// ======================================================================
export function buildSchoolHolidayLine(period) {
  const name = normalizeHolidayName(period.name);
  return `SCHULFERIEN: ${name} (${period.startDE}–${period.endDE})`;
}

// ======================================================================
// VIEWER / LOGIC
// ======================================================================
export function isDateInSchoolHoliday(date, notes = []) {
  const d = parseDate(date);
  if (!d) return false;

  const iso = toIso(d);

  return notes.some(
    (n) =>
      n.source === 'system' &&
      n.meta?.type === 'schoolholidays' &&
      iso >= n.meta.start &&
      iso <= n.meta.end
  );
}

// ======================================================================
// INTERN
// ======================================================================
// NOTE:
// Name- & Datums-Normalisierung absichtlich lokal gehalten,
// da diese Logik ausschließlich für API-Normalisierung gedacht ist.

// ======================================================================
// INTERN (Refactored)
// ======================================================================

function normalizeApiResponse(data) {
  if (!Array.isArray(data)) return [];

  return data.reduce((acc, item) => {
    const start = item.start || item.startDate;
    const end = item.end || item.endDate;

    if (start && end) {
      acc.push({
        name: normalizeHolidayName(item.name || item.holiday || ''),
        start,
        end,
        startDE: isoToGerman(start),
        endDE: isoToGerman(end),
      });
    }
    return acc;
  }, []);
}

function normalizeHolidayName(name) {
  if (!name) return '';
  return capitalizeWords(
    name
      .replace(/schleswig[-\s]?holstein/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

function capitalizeWords(str) {
  return str.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function isoToGerman(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return '';
  return `${d}.${m}.${y}`;
}