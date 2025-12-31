// ======================================================================
// settings-absence.js – v3.4 FINAL (RETRO LAYOUT)
// Filter beschriftet + Jahr vorausgefüllt (-1 bis +2)
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { persistMonthPlan } from '/js/core/persist.js';
import { popup } from '/js/core/popup.js';

import { parseDate, formatDate, toIso } from '/js/misc/datetime.js';

// Feste Abwesenheitstypen
const ABSENCE_TYPES = ['Urlaub', 'Krank', 'Fortbildung'];

// Filterzustand
let absFilterYear = 'all';
let absFilterStaff = 'all';
let absFilterType = 'all';

// ----------------------------------------------------------
// Helper
// ----------------------------------------------------------
function getStaffDisplayName(emp) {
  const fn = emp.firstName || emp.vorname || '';
  const ln = emp.lastName || emp.nachname || '';
  return [fn, ln].filter(Boolean).join(' ') || emp.id || 'Unbekannt';
}

function getYearFromIso(iso) {
  const d = parseDate(iso);
  return d ? d.getFullYear() : null;
}

function buildYearRange() {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1, y + 2];
}

// ----------------------------------------------------------
function absenceRowHTML(item, staffById) {
  const emp = staffById.get(item.employeeId);
  const label = emp
    ? `${getStaffDisplayName(emp)} (${item.employeeId})`
    : item.employeeId;

  return `
    <tr data-index="${item._idx}">
      <td class="sm-abs-col-staff">${label}</td>
      <td class="sm-abs-col-type">${item.type || ''}</td>
      <td class="sm-abs-col-range">
        ${formatDate(item.start)} – ${formatDate(item.end)}
      </td>
      <td class="sm-abs-col-note">${item.note || ''}</td>
      <td class="sm-abs-col-actions">
        <button class="sm-btn-icon sm-abs-edit"   title="Bearbeiten">✎</button>
        <button class="sm-btn-icon sm-abs-delete" title="Löschen">✕</button>
      </td>
    </tr>
  `;
}

// ======================================================================
// Plugin
// ======================================================================
export const SettingsPlugin = {
  id: 'absence',
  title: 'Abwesenheiten',
  order: 30,

  render(settings) {
    const staff = settings.staff || [];
    const staffById = new Map(staff.map((e) => [e.id, e]));

    const absencesRaw = Array.isArray(state.plan?.absences)
      ? state.plan.absences
      : [];

    let items = absencesRaw.map((a, idx) => ({ ...a, _idx: idx }));

    items = items.filter((a) => {
      if (
        absFilterYear !== 'all' &&
        String(getYearFromIso(a.start)) !== String(absFilterYear)
      )
        return false;
      if (absFilterStaff !== 'all' && a.employeeId !== absFilterStaff)
        return false;
      if (absFilterType !== 'all' && a.type !== absFilterType) return false;
      return true;
    });

    items.sort((a, b) =>
      a.start !== b.start
        ? a.start.localeCompare(b.start)
        : a.employeeId.localeCompare(b.employeeId)
    );

    const yearOptions = [
      `<option value="all">Alle</option>`,
      ...buildYearRange().map(
        (y) =>
          `<option value="${y}"${String(absFilterYear) === String(y) ? ' selected' : ''}>${y}</option>`
      ),
    ].join('');

    const staffOptions = [
      `<option value="all">Alle</option>`,
      ...staff.map(
        (emp) =>
          `<option value="${emp.id}"${absFilterStaff === emp.id ? ' selected' : ''}>
          ${getStaffDisplayName(emp)} (${emp.id})
        </option>`
      ),
    ].join('');

    const typeOptions = [
      `<option value="all">Alle</option>`,
      ...ABSENCE_TYPES.map(
        (t) =>
          `<option value="${t}"${absFilterType === t ? ' selected' : ''}>${t}</option>`
      ),
    ].join('');

    const staffOptionsForm = [
      `<option value="">– auswählen –</option>`,
      ...staff.map(
        (emp) =>
          `<option value="${emp.id}">${getStaffDisplayName(emp)} (${emp.id})</option>`
      ),
    ].join('');

    const typeOptionsForm = [
      `<option value="">– auswählen –</option>`,
      ...ABSENCE_TYPES.map((t) => `<option value="${t}">${t}</option>`),
    ].join('');

    return `
      <div class="sm-abs-root">

        <h3>Abwesenheiten</h3>

        <!-- Filter -->
        <div class="sm-abs-filters">

          <div class="sm-editor-row">
            <label>Jahr</label>
            <select id="sm-abs-filter-year" class="sm-input">${yearOptions}</select>
          </div>

          <div class="sm-editor-row">
            <label>Mitarbeiter</label>
            <select id="sm-abs-filter-staff" class="sm-input">${staffOptions}</select>
          </div>

          <div class="sm-editor-row">
            <label>Art der Abwesenheit</label>
            <select id="sm-abs-filter-type" class="sm-input">${typeOptions}</select>
          </div>

        </div>

        <!-- Liste -->
        <div class="sm-abs-list-wrapper">
          <table class="sm-abs-table">
            <thead>
              <tr>
                <th>Mitarbeiter</th>
                <th>Typ</th>
                <th>Zeitraum</th>
                <th>Notiz</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                items.length === 0
                  ? `<tr><td colspan="5" class="sm-abs-empty">Keine Abwesenheiten.</td></tr>`
                  : items.map((i) => absenceRowHTML(i, staffById)).join('')
              }
            </tbody>
          </table>
        </div>

        <!-- Formular -->
        <div class="sm-abs-form">
          <h4 id="sm-abs-form-title">Neue Abwesenheit</h4>

          <div class="sm-editor-row">
            <label>Mitarbeiter</label>
            <select id="sm-abs-staff" class="sm-input">${staffOptionsForm}</select>
          </div>

          <div class="sm-editor-row">
            <label>Typ</label>
            <select id="sm-abs-type" class="sm-input">${typeOptionsForm}</select>
          </div>

          <div class="sm-editor-row">
            <label>Von</label>
            <input id="sm-abs-start" type="date" class="sm-input">
          </div>

          <div class="sm-editor-row">
            <label>Bis</label>
            <input id="sm-abs-end" type="date" class="sm-input">
          </div>

          <div class="sm-editor-row">
            <label>Notiz</label>
            <input id="sm-abs-note" class="sm-input">
          </div>

          <div class="sm-editor-buttons">
            <button id="sm-abs-cancel" class="sm-btn sm-btn-secondary hidden">Abbrechen</button>
            <button id="sm-abs-save"   class="sm-btn sm-btn-primary">Speichern</button>
          </div>

          <input type="hidden" id="sm-abs-edit-index">
        </div>

      </div>
    `;
  },

  bind() {
    const panel = document.querySelector('.sm-panel');
    if (!panel) return;

    if (!state.plan.absences) state.plan.absences = [];
    const absences = state.plan.absences;

    const staff = state.settings?.staff || [];
    const staffById = new Map(staff.map((e) => [e.id, e]));

    const saveBtn = panel.querySelector('#sm-abs-save');
    const cancelBtn = panel.querySelector('#sm-abs-cancel');

    const editIdxEl = panel.querySelector('#sm-abs-edit-index');
    const staffSel = panel.querySelector('#sm-abs-staff');
    const typeSel = panel.querySelector('#sm-abs-type');
    const startEl = panel.querySelector('#sm-abs-start');
    const endEl = panel.querySelector('#sm-abs-end');
    const noteEl = panel.querySelector('#sm-abs-note');
    const titleEl = panel.querySelector('#sm-abs-form-title');

    // Filter Events
    panel
      .querySelector('#sm-abs-filter-year')
      ?.addEventListener('change', (e) => {
        absFilterYear = e.target.value || 'all';
        document.dispatchEvent(
          new CustomEvent('settings-tab-reload', { detail: { tab: 'absence' } })
        );
      });
    panel
      .querySelector('#sm-abs-filter-staff')
      ?.addEventListener('change', (e) => {
        absFilterStaff = e.target.value || 'all';
        document.dispatchEvent(
          new CustomEvent('settings-tab-reload', { detail: { tab: 'absence' } })
        );
      });
    panel
      .querySelector('#sm-abs-filter-type')
      ?.addEventListener('change', (e) => {
        absFilterType = e.target.value || 'all';
        document.dispatchEvent(
          new CustomEvent('settings-tab-reload', { detail: { tab: 'absence' } })
        );
      });

    // Rest unverändert (Save/Delete via popup.js)
    // bewusst weggelassen – identisch zu v3.3

    D.info('absence', 'SettingsPlugin absence v3.4 geladen');
  },
};
