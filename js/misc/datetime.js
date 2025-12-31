/**
 * datetime.js
 * Zentrale Zeitfunktionen für Jahr, Monat, KW und Planlogik.
 * Prinzipien: KISS, DRY, native Date-Methoden, ES2021.
 */

// ==========================================================
// BASISDATEN: Heute, Jahr, Monat
// ==========================================================
export function getToday() {
  return new Date();
}

export function getCurrentYear() {
  return new Date().getFullYear();
}

export function getCurrentMonth() {
  return new Date().getMonth() + 1; // 1–12
}

export function getISOWeekYear(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}


// ==========================================================
// KALENDERWOCHE (ISO 8601)
// ==========================================================

/**
 * ISO-Kalenderwoche einer bestimmten Datumseingabe.
 * Rückgabe: Zahl (1–53)
 */
export function getWeekNumber(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7; // Sonntag = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/**
 * Montag einer ISO-KW im angegebenen Jahr (LOKALE ZEIT).
 * ISO-Definition: KW1 enthält den 4. Januar.
 * Vermeidet UTC-Fallen.
 */
export function getLocalMondayOfISOWeek(year, week) {
  // 4. Januar des Jahres
  const date = new Date(year, 0, 4);
  const day = date.getDay() || 7; // 1=Mo, ..., 7=So

  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1 + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/**
 * Wochendaten für Anzeige (Montag–Sonntag) ausgehend von einem Datum.
 * Nutzt lokale Zeit, ideal für Header/Tooltip.
 */
export function getWeekRangeFromDate(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const weekday = d.getDay() === 0 ? 7 : d.getDay();

  const monday = new Date(d);
  monday.setDate(d.getDate() - weekday + 1);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(0, 0, 0, 0);

  return {
    start: monday,
    end: sunday,
    startStr: toIso(monday),
    endStr: toIso(sunday),
  };
}

/**
 * Gibt alle 7 Tage einer KW (Mo–So) als Date-Objekte zurück.
 */
export function getDaysInWeek(year, week) {
  const monday = getLocalMondayOfISOWeek(year, week);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}

// ==========================================================
// MONATSINFORMATIONEN
// ==========================================================
export function getMonthName(monthIndex) {
  const months = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  return months[monthIndex - 1] || '';
}

export function getDaysInMonth(year, month) {
  // month: 1–12
  return new Date(year, month, 0).getDate();
}

// ==========================================================
// ROTATIONSINDEX (1–4 für Schichtrotation o.ä.)
// ==========================================================
export function getRotationIndex(date = new Date(), rotationWeeks = 4) {
  const isoYear = getISOWeekYear(date);
  const isoWeek = getWeekNumber(date);

  const absoluteWeek = isoYear * 53 + isoWeek; // ausreichend stabil
  return ((absoluteWeek - 1) % rotationWeeks) + 1;
}


// ==========================================================
// ZEIT / STUNDENBEREICH
// ==========================================================
/**
 * Erzeugt Stunden-Slots wie "07-08", "08-09", ...
 * Erwartet settings.system.startHour / endHour
 */
export function buildHourSlots(settings = {}) {
  const start = Number(settings?.system?.startHour ?? 7);
  const end = Number(settings?.system?.endHour ?? 19);
  return Array.from(
    { length: end - start },
    (_, i) => `${pad(start + i)}-${pad(start + i + 1)}`
  );
}

// ==========================================================
// HILFSFUNKTIONEN
// ==========================================================
export function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Gibt YYYY-MM-DD im lokalen Kalender zurück.
 */
export function toIso(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return `${y}-${m}-${day}`;
}

/**
 * Wochentag → Index (Mo–Sa = 0–5)
 */
export function getDayIndex(dayNameDe) {
  const map = [
    'Montag',
    'Dienstag',
    'Mittwoch',
    'Donnerstag',
    'Freitag',
    'Samstag',
  ];
  const idx = map.findIndex(
    (n) => n.toLowerCase() === String(dayNameDe).toLowerCase()
  );
  return idx >= 0 ? idx : 0;
}

export function formatDate(dateInput) {
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return 'Ungültiges Datum';
  return d.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ==========================================================
// ERWEITERUNG FÜR ABWESENHEITEN / TERMINE
// ==========================================================
export function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    // ISO → lokale Mitternacht
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    // DD.MM.YYYY
    if (value.includes('.')) {
      const [d, m, y] = value.split('.').map(Number);
      return new Date(y, m - 1, d);
    }
  }

  return null;
}

export function isSameDay(a, b) {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function getDateRange(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return [];
  const days = [];
  const d = new Date(s);
  while (d <= e) {
    days.push(toIso(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

export function formatDateRange(start, end) {
  const s = formatDate(start);
  const e = formatDate(end);
  return s === e ? s : `${s} – ${e}`;
}

// ==========================================================
// OPTIONAL: KW → TAGE (nützlich für Wochenabgleich / API-Exports)
// ==========================================================
/**
 * Gibt alle Datumswerte (Mo–So) einer ISO-KW als ISO-Strings (YYYY-MM-DD) zurück.
 */
export function getISOWeekDates(year, week) {
  return getDaysInWeek(year, week).map((d) => toIso(d));
}

// ==========================================================
// DEUTSCH <-> ISO Conversion für Settings-Formulare
// ==========================================================

/**
 * Wandelt deutsches Datum (TT.MM.JJJJ) in ISO (YYYY-MM-DD) um.
 * Wird bei allen Formular-Saves verwendet.
 */
export function germanToISO(value) {
  if (!value) return '';

  // Bereits ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // DD.MM.YYYY → YYYY-MM-DD
  const m = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

/**
 * Wandelt ISO-Datum (YYYY-MM-DD) in deutsches Format (DD.MM.YYYY) um.
 * Wird bei Formular-Anzeige genutzt.
 */
export function isoToGerman(value) {
  if (!value) return '';

  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2];
    const dd = m[3];
    return `${dd}.${mm}.${yyyy}`;
  }

  // Falls bereits deutsch
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(value)) return value;

  return '';
}

/**
 * Formatiert ein Datum als "Montag, 29.01.2026"
 */
export function formatDateWeekday(dateInput) {
  const d = parseDate(dateInput);
  if (!d) return '';

  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formatiert Timestamp oder Datumsstring mit Uhrzeit (DE)
 * Erwartet ISO, SQL oder Date
 * Ausgabe: DD.MM.YYYY HH:MM
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '–';

  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '–';

  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ==========================================================
// Wochensegmente eines Monats (Viewer / Exporte / Reports)
// ==========================================================
/**
 * Aggregiert alle Tage eines Monats in ISO-Kalenderwochen-Blöcke.
 *
 * Rückgabe:
 * [
 *   {
 *     weekStartDate: Date,
 *     weekEndDate:   Date,
 *     weekStartIso:  "YYYY-MM-DD",
 *     weekEndIso:    "YYYY-MM-DD",
 *     isoWeek:       Number,
 *     days: [
 *       { dateObj: Date, iso: "YYYY-MM-DD" },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */
export function getWeeksForMonth(year, month) {
  const weeksMap = new Map();

  const dim = getDaysInMonth(year, month);
  for (let day = 1; day <= dim; day++) {
    const date = new Date(year, month - 1, day);
    const { start, end } = getWeekRangeFromDate(date);

    const weekStartIso = toIso(start);

    if (!weeksMap.has(weekStartIso)) {
      weeksMap.set(weekStartIso, {
        weekStartDate: start,
        weekEndDate: end,
        weekStartIso,
        weekEndIso: toIso(end),
        isoWeek: getWeekNumber(date),
        isoYear: getISOWeekYear(date),
        days: [],
      });
    }

    weeksMap.get(weekStartIso).days.push({
      dateObj: date,
      iso: toIso(date),
    });
  }

  return Array.from(weeksMap.values()).sort(
    (a, b) => a.weekStartDate - b.weekStartDate
  );
}
