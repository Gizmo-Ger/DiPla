// ==========================================================
// File: notes.js – FINAL MULTI-NOTE VERSION (System + User)
// ==========================================================

import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';
import { getWeekRangeFromDate, toIso, formatDate } from '../misc/datetime.js';
import { persistMonthPlan } from '../core/persist.js';
import { toast } from '../core/popup.js';

// ==========================================================
// Helpers
// ==========================================================

function isoToLocalDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function intersectRanges(startA, endA, startB, endB) {
  const s = startA > startB ? startA : startB;
  const e = endA < endB ? endA : endB;
  return s > e ? null : { start: s, end: e };
}

function debounce(fn, delay = 800) {
  let t;
  fn.cancel = () => clearTimeout(t);
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// ==========================================================
// Notes helpers
// ==========================================================

function buildSystemBlock(systemNotes) {
  if (!Array.isArray(systemNotes) || systemNotes.length === 0) return '';
  return systemNotes.map((n) => `# ${n.text}`).join('\n');
}

function isSystemLine(line) {
  return typeof line === 'string' && line.startsWith('#');
}

function enforceEditableRegion(textarea, systemLineCount) {
  if (!systemLineCount) return;

  const lines = textarea.value.split('\n');
  let pos = 0;

  for (let i = 0; i < systemLineCount; i++) {
    pos += (lines[i] || '').length + 1;
  }

  if (textarea.selectionStart < pos) {
    textarea.setSelectionRange(pos, pos);
  }
}

// ==========================================================
// Persist (debounced)
// ==========================================================

const debouncedPersistNotes = debounce(() => {
  persistMonthPlan(state.plan, { silent: true });

  toast('Notizen gespeichert', {
    type: 'info',
    duration: 1200,
  });

  D.debug('notes', 'Notes gespeichert (debounced)', {
    weekStart: state.activeWeekStart && toIso(state.activeWeekStart),
  });
}, 800);

// ==========================================================
// Normalisierung (Legacy + neues Schema)
// ==========================================================

function normalizeNotes(notes) {
  if (!Array.isArray(notes)) return [];

  return notes
    .filter((n) => n && n.weekStart)
    .map((n) => ({
      id: n.id,
      weekStart: n.weekStart,
      text: n.text || '',
      source: n.source === 'system' ? 'system' : 'user',
      visibility: n.visibility === 'private' ? 'private' : 'public',
      recipients: Array.isArray(n.recipients) ? n.recipients : undefined,
      author: n.author,
      meta: {
        type: n.meta?.type,
        locked: n.meta?.locked === true || n._meeting === true,
        generatedAt: n.meta?.generatedAt,
      },
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// ==========================================================
// INIT
// ==========================================================

export function initNotesBox() {
  const box = document.getElementById('notes-box');
  if (!box) return;

  box.innerHTML = `
    <h3>Feiertage</h3>
    <div id="notes-holidays" class="notes-subbox"></div>

    <h3>Abwesenheiten</h3>
    <div id="notes-absence" class="notes-subbox"></div>

    <h3>Notizen</h3>
    <textarea
      id="notes-textarea"
      class="notes-textarea"
      placeholder="Hinweise, interne Infos, Nachrichten mit @Kürzel"></textarea>
  `;
}

// ==========================================================
// UPDATE
// ==========================================================

export function updateNotesBox(refDate = new Date()) {
  try {
    const { start, end } = getWeekRangeFromDate(refDate);
    const isoStart = toIso(start);

    const plan = state.plan || {};
    plan.notes = normalizeNotes(plan.notes || []);

    const weekNotes = plan.notes.filter((n) => n.weekStart === isoStart);

    const holBox = document.getElementById('notes-holidays');
    const absBox = document.getElementById('notes-absence');
    const txt = document.getElementById('notes-textarea');
    if (!holBox || !absBox || !txt) return;

    // ======================================================
    // FEIERTAGE
    // ======================================================

    const holidays = (plan.holidays || [])
      .map((h) =>
        typeof h === 'string'
          ? { iso: h.split(' – ')[0], name: h.split(' – ')[1] }
          : h
      )
      .filter(Boolean)
      .filter((h) => h.iso >= isoStart && h.iso <= toIso(end))
      .sort((a, b) => a.iso.localeCompare(b.iso));

    holBox.innerHTML = holidays.length
      ? holidays
          .map(
            (h) => `
          <div class="box-row">
            <div class="box-date">${formatDate(h.iso)}</div>
            <div class="box-label">${h.name}</div>
          </div>
        `
          )
          .join('')
      : `<div class="empty-info">Keine Feiertage in dieser Woche</div>`;

    // ======================================================
    // ABWESENHEITEN
    // ======================================================

    const staff = state.settings?.staff || [];
    const staffById = new Map(staff.map((e) => [e.id, e]));

    const rawAbsences = Array.isArray(plan.absences) ? plan.absences : [];
    const grouped = {};

    for (const a of rawAbsences) {
      if (!a?.employeeId) continue;

      const absStart = isoToLocalDate(a.start);
      const absEnd = isoToLocalDate(a.end);
      if (!absStart || !absEnd) continue;

      const overlap = intersectRanges(absStart, absEnd, start, end);
      if (!overlap) continue;

      const emp = staffById.get(a.employeeId);
      const empName = emp
        ? `${emp.firstName} ${emp.lastName}`.trim()
        : a.employeeId;

      const key = `${a.employeeId}::${a.type}`;

      if (!grouped[key]) {
        grouped[key] = {
          employeeId: a.employeeId,
          empName,
          type: a.type,
          start: overlap.start,
          end: overlap.end,
        };
      } else {
        if (overlap.start < grouped[key].start)
          grouped[key].start = overlap.start;
        if (overlap.end > grouped[key].end) grouped[key].end = overlap.end;
      }
    }

    const groupedByType = { Krank: [], Urlaub: [], Fortbildung: [] };

    for (const a of Object.values(grouped)) {
      const emp = staffById.get(a.employeeId);
      const short = emp?.short || emp?.id || a.empName;
      const period = `${formatDate(a.start)} – ${formatDate(a.end)}`;
      if (groupedByType[a.type]) {
        groupedByType[a.type].push(`${short} (${period})`);
      }
    }

    function absenceLine(label, arr) {
      return `
        <div class="absence-line">
          <span class="absence-type">${label}:</span>
          <span class="absence-items ${arr.length ? '' : 'empty-info'}">
            ${arr.length ? arr.join(', ') : 'keine Einträge'}
          </span>
        </div>
      `;
    }

    absBox.innerHTML =
      absenceLine('Krank', groupedByType.Krank) +
      absenceLine('Urlaub', groupedByType.Urlaub) +
      absenceLine('Fortbildung', groupedByType.Fortbildung);

    // ======================================================
    // NOTES TEXTAREA
    // ======================================================

    const systemNotes = weekNotes.filter(
      (n) => n.source === 'system' && n.meta?.locked === true
    );

    const userNotes = weekNotes.filter((n) => n.source === 'user');

    const systemBlock = buildSystemBlock(systemNotes);
    const systemLineCount = systemBlock ? systemBlock.split('\n').length : 0;

    const userBlock = userNotes
      .map((n) => {
        if (n.visibility === 'private' && n.recipients?.length) {
          return `@${n.recipients[0]} ${n.text}`;
        }
        return n.text;
      })
      .join('\n');

    txt.value = [systemBlock, userBlock].filter(Boolean).join('\n');

    txt.onkeydown = () => enforceEditableRegion(txt, systemLineCount);
    txt.onmouseup = () => enforceEditableRegion(txt, systemLineCount);
    txt.onfocus = () => enforceEditableRegion(txt, systemLineCount);

    txt.oninput = () => {
      const lines = txt.value.split('\n');

      if (systemLineCount > 0) {
        const currentSystem = lines.slice(0, systemLineCount).join('\n');
        if (currentSystem !== systemBlock) {
          const rest = lines.slice(systemLineCount).join('\n').trim();
          txt.value = [systemBlock, rest].filter(Boolean).join('\n');
          enforceEditableRegion(txt, systemLineCount);
          return;
        }
      }

      plan.notes = plan.notes.filter(
        (n) => n.weekStart !== isoStart || n.source === 'system'
      );

      for (const raw of lines) {
        if (isSystemLine(raw)) continue;

        const line = raw.trim();
        if (!line) continue;

        const m = /^@([A-Z0-9_-]{1,12})\s+(.*)$/.exec(line);

        plan.notes.push({
          weekStart: isoStart,
          text: m ? m[2] : line,
          source: 'user',
          visibility: m ? 'private' : 'public',
          recipients: m ? [m[1]] : undefined,
          author: state.currentUser || 'ADMIN',
          meta: {
            locked: false,
            generatedAt: new Date().toISOString(),
          },
        });
      }

      debouncedPersistNotes();
    };

    txt.onblur = () => {
      debouncedPersistNotes.cancel?.();
      persistMonthPlan(state.plan, { silent: true });

      D.debug('notes', 'Notes gespeichert (blur)', {
        weekStart: isoStart,
      });
    };
  } catch (err) {
    D.error('notes', 'Fehler in updateNotesBox()', err);
  }
}
