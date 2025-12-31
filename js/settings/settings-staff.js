// ======================================================================
// settings-staff.js – v2.6.1 FINAL (konsolidiert + vollständig)
// Mitarbeiterverwaltung + versionierte Schichtmodelle
// + Administrator-Flag (persistiert in settings.json)
// + Passwort setzen über Backend (users.json) inkl. Bestätigung
// + Datepicker (type=date) für Birth/Entry/Exit/ValidFrom (ISO intern)
// + Urlaub (Stammdaten):
//    - annualLeaveEntitlement = Jahresurlaub laut Vertrag (pro Jahr)
//    - carryOverLeave         = Übertrag aus Vorjahren (noch zu nehmen)
// WICHTIG: Mitarbeiter werden NICHT gelöscht – nur deprecated/veraltet.
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';
import { persistSettings } from '/js/core/persist.js';
import { popup } from '/js/core/popup.js';

// API
const API_SET_PASSWORD = '/api/auth/set-password.php';

// ==========================================================
// Helfer: Sortierfunktion für Mitarbeiterliste
// ==========================================================
let staffSortDir = 'asc'; // 'asc' | 'desc'

function sortStaffForSettings(list) {
  const dir = staffSortDir === 'asc' ? 1 : -1;

  return [...list].sort((a, b) => {
    const la = (a.lastName || '').toLocaleLowerCase('de-DE');
    const lb = (b.lastName || '').toLocaleLowerCase('de-DE');

    if (la < lb) return -1 * dir;
    if (la > lb) return  1 * dir;

    const fa = (a.firstName || '').toLocaleLowerCase('de-DE');
    const fb = (b.firstName || '').toLocaleLowerCase('de-DE');

    if (fa < fb) return -1 * dir;
    if (fa > fb) return  1 * dir;

    return 0;
  });
}

// ==========================================================
// Helfer: Displayname
// ==========================================================
function getDisplayName(emp) {
  const fn = emp.firstName || emp.vorname || '';
  const ln = emp.lastName || emp.nachname || '';
  const full = [fn, ln].filter(Boolean).join(' ');
  if (full) return full;
  if (emp.name) return emp.name;
  return emp.id || 'Unbekannt';
}

// ==========================================================
// Helfer: ISO Date normalisieren
// ==========================================================
function normalizeISODate(v) {
  const s = (v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

// ==========================================================
// Helfer: Zahl oder null (für Urlaub etc.)
// ==========================================================
function normalizeNumberOrNull(v) {
  const s = (v ?? '').toString().trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ==========================================================
// Urlaub: Migration + Ensure
// - Alt: annualLeave, remainingLeave (aus v2.6-Entwurf)
// - Neu: annualLeaveEntitlement, carryOverLeave (fachlich korrekt)
// ==========================================================
function ensureLeaveFields(emp) {
  // Migration alter Namen (falls noch vorhanden)
  if (emp.annualLeaveEntitlement == null && emp.annualLeave != null) {
    emp.annualLeaveEntitlement = emp.annualLeave;
  }
  if (emp.carryOverLeave == null && emp.remainingLeave != null) {
    emp.carryOverLeave = emp.remainingLeave;
  }

  // Default: null (keine Zwangswerte)
  if (emp.annualLeaveEntitlement === undefined)
    emp.annualLeaveEntitlement = null;
  if (emp.carryOverLeave === undefined) emp.carryOverLeave = null;

  // Sanitize
  if (emp.annualLeaveEntitlement !== null) {
    const n = Number(emp.annualLeaveEntitlement);
    emp.annualLeaveEntitlement = Number.isFinite(n) ? n : null;
  }
  if (emp.carryOverLeave !== null) {
    const n = Number(emp.carryOverLeave);
    emp.carryOverLeave = Number.isFinite(n) ? n : null;
  }
}

// ==========================================================
// Shift-Versionierung
// ==========================================================
function weekEmpty() {
  return { mo: '', di: '', mi: '', do: '', fr: '', sa: '' };
}

function createEmptyShiftVersion(versionNumber) {
  return {
    version: versionNumber,
    validFrom: '', // ISO
    shifts: {
      1: weekEmpty(),
      2: weekEmpty(),
      3: weekEmpty(),
      4: weekEmpty(),
    },
  };
}

function ensureShiftVersionStruct(v) {
  if (!v || typeof v !== 'object') return;

  if (!v.shifts || typeof v.shifts !== 'object') v.shifts = {};
  for (const w of ['1', '2', '3', '4']) {
    if (!v.shifts[w] || typeof v.shifts[w] !== 'object')
      v.shifts[w] = weekEmpty();
    for (const d of ['mo', 'di', 'mi', 'do', 'fr', 'sa']) {
      v.shifts[w][d] = v.shifts[w][d] ?? '';
    }
  }

  if (typeof v.version !== 'number') v.version = 1;
  if (typeof v.validFrom !== 'string') v.validFrom = '';
  v.validFrom = normalizeISODate(v.validFrom);
}

function migrateAndEnsureShiftVersions(emp) {
  // legacy: weeklyHours -> contractHours
  if (emp.contractHours == null && typeof emp.weeklyHours === 'number') {
    emp.contractHours = emp.weeklyHours;
  }

  const hasNew = Array.isArray(emp.shiftVersions);
  const hasLegacy = emp.shifts && typeof emp.shifts === 'object';

  if (!hasNew) {
    const base = createEmptyShiftVersion(1);

    if (hasLegacy) {
      for (const w of ['1', '2', '3', '4']) {
        const src = emp.shifts[w] || {};
        const dst = base.shifts[w];
        dst.mo = src.mo ?? '';
        dst.di = src.di ?? '';
        dst.mi = src.mi ?? '';
        dst.do = src.do ?? '';
        dst.fr = src.fr ?? '';
        dst.sa = src.sa ?? '';
      }
      base.validFrom = normalizeISODate(emp.shiftsValidFrom || '');
    }

    emp.shiftVersions = [base];
  }

  emp.shiftVersions.forEach(ensureShiftVersionStruct);

  // NEW: Urlaub sicherstellen
  ensureLeaveFields(emp);
}

function getVersion(emp, index) {
  migrateAndEnsureShiftVersions(emp);
  const versions = emp.shiftVersions;
  if (!versions.length) emp.shiftVersions = [createEmptyShiftVersion(1)];

  if (index == null || index < 0 || index >= versions.length) {
    return versions[versions.length - 1];
  }
  return versions[index];
}

function createNewVersionFromCurrent(emp) {
  migrateAndEnsureShiftVersions(emp);

  const versions = emp.shiftVersions;
  const current = versions[versions.length - 1];
  const clone = JSON.parse(JSON.stringify(current));

  const max = Math.max(...versions.map((v) => v.version || 1), 1);
  clone.version = max + 1;
  clone.validFrom = ''; // neu setzen lassen
  ensureShiftVersionStruct(clone);

  versions.push(clone);
}

// ==========================================================
// HTML Renderer – Übersicht
// ==========================================================
function staffRowHTML(emp) {
  return `
    <div class="sm-staff-row" data-id="${emp.id}">
      <div class="sm-staff-name">${getDisplayName(emp)}</div>
      <div class="sm-staff-id">${emp.id}</div>
      <button class="sm-btn-icon sm-gear-btn" data-id="${emp.id}" title="Bearbeiten">⚙</button>
    </div>
  `;
}

// ==========================================================
// HTML Renderer – Editor (vollständig)
// ==========================================================
function staffEditorHTML(emp, roles, selectedVersionIndex = null) {
  migrateAndEnsureShiftVersions(emp);

  const versions = emp.shiftVersions;
  if (!versions.length) emp.shiftVersions = [createEmptyShiftVersion(1)];

  if (selectedVersionIndex == null) selectedVersionIndex = versions.length - 1;
  const v = getVersion(emp, selectedVersionIndex);

  const functionalRoles = Object.keys(roles).filter(
    (r) => roles[r]?.functional
  );

  const versionOptions = emp.shiftVersions
    .map(
      (ver, idx) =>
        `<option value="${idx}" ${idx === selectedVersionIndex ? 'selected' : ''}>Version ${ver.version}</option>`
    )
    .join('');

  const days = ['mo', 'di', 'mi', 'do', 'fr', 'sa'];
  const weeks = ['1', '2', '3', '4'];
  const dayLabels = {
    mo: 'Mo',
    di: 'Di',
    mi: 'Mi',
    do: 'Do',
    fr: 'Fr',
    sa: 'Sa',
  };

  const shiftGridHTML = `
    <div class="sm-shift-grid">
      <div></div>
      ${days.map((d) => `<div class="sm-shift-grid-header">${dayLabels[d]}</div>`).join('')}

      ${weeks
        .map(
          (w) => `
        <div class="sm-shift-week">Woche ${w}</div>
        ${days
          .map(
            (d) => `
          <input class="sm-shift-input sm-shift"
                 data-week="${w}"
                 data-day="${d}"
                 value="${v.shifts?.[w]?.[d] ?? ''}"
                 placeholder="08-14 / frei / Schule / JVA">
        `
          )
          .join('')}
      `
        )
        .join('')}
    </div>
  `;

  const birthISO = normalizeISODate(emp.birthDate);
  const entryISO = normalizeISODate(emp.entryDate);
  const exitISO = normalizeISODate(emp.exitDate);
  const validISO = normalizeISODate(v.validFrom);

  const annualVal =
    emp.annualLeaveEntitlement == null
      ? ''
      : String(emp.annualLeaveEntitlement);
  const carryVal = emp.carryOverLeave == null ? '' : String(emp.carryOverLeave);

  return `
    <div class="sm-staff-editor">

      <button id="sm-back" class="sm-btn sm-btn-secondary" style="margin-bottom:10px;">← Zurück</button>

      <h3>Mitarbeiter bearbeiten</h3>

      <div class="sm-editor-row">
        <label>Vorname</label>
        <input id="sm-fn" class="sm-input" value="${emp.firstName || ''}">
      </div>

      <div class="sm-editor-row">
        <label>Nachname</label>
        <input id="sm-ln" class="sm-input" value="${emp.lastName || ''}">
      </div>

      <div class="sm-editor-row">
        <label>Kürzel</label>
        <input id="sm-id" class="sm-input" value="${emp.id}" disabled>
      </div>

      <div class="sm-editor-row">
        <label>Geburtsdatum</label>
        <input id="sm-birth" type="date" class="sm-input" value="${birthISO}">
      </div>

      <div class="sm-editor-row">
        <label>Eintritt</label>
        <input id="sm-entry" type="date" class="sm-input" value="${entryISO}">
      </div>

      <div class="sm-editor-row">
        <label>Austritt</label>
        <input id="sm-exit" type="date" class="sm-input" value="${exitISO}">
      </div>

      <div class="sm-editor-row">
        <label>Wochenstunden (Vertrag)</label>
        <input id="sm-hours" class="sm-input" style="max-width:100px;" value="${emp.contractHours ?? ''}">
      </div>

      <h4 style="margin-top:14px;">Urlaub (Stammdaten)</h4>

      <div class="sm-editor-row">
        <label>Jahresurlaub (vertraglich, Tage)</label>
        <input id="sm-annual-leave-entitlement" type="number" min="0" step="0.5"
               class="sm-input" style="max-width:140px;" value="${annualVal}">
      </div>

      <div class="sm-editor-row">
        <label>Übertrag aus Vorjahren (Tage)</label>
        <input id="sm-carryover-leave" type="number" min="0" step="0.5"
               class="sm-input" style="max-width:140px;" value="${carryVal}">
      </div>

      <div class="sm-editor-row sm-check-row">
        <label>Aktiv</label>
        <input id="sm-active" type="checkbox" ${emp.active !== false ? 'checked' : ''}>
      </div>

      <div class="sm-editor-row sm-check-row">
        <label>veraltet</label>
        <input id="sm-depr" type="checkbox" ${emp.deprecated ? 'checked' : ''}>
      </div>

      <div class="sm-editor-row sm-check-row">
        <label>Administrator</label>
        <input id="sm-admin" type="checkbox" ${emp.isAdmin ? 'checked' : ''}>
      </div>

      <h4 style="margin-top:14px;">Passwort</h4>

      <div class="sm-editor-row">
        <label>Neues Passwort</label>
        <input id="sm-password" type="password" class="sm-input"
               autocomplete="new-password" autocapitalize="off" spellcheck="false">
      </div>

      <div class="sm-editor-row">
        <label>Passwort bestätigen</label>
        <input id="sm-password2" type="password" class="sm-input"
               autocomplete="new-password" autocapitalize="off" spellcheck="false">
      </div>

      <div style="margin-bottom:10px;">
        <button id="sm-set-password" class="sm-btn sm-btn-secondary">Passwort setzen</button>
      </div>

      <h4>Primäre Rolle</h4>
      <div class="sm-role-box">
        ${functionalRoles
          .map(
            (r) => `
          <label class="sm-role-check">
            <input type="radio" name="sm-primary" value="${r}" ${emp.primaryRole === r ? 'checked' : ''}>
            ${r}
          </label>
        `
          )
          .join('')}
      </div>

      <h4>Alternative Rollen</h4>
      <div class="sm-role-box">
        ${functionalRoles
          .map(
            (r) => `
          <label class="sm-role-check">
            <input type="checkbox" class="sm-alt-role" value="${r}" ${emp.altRoles?.includes(r) ? 'checked' : ''}>
            ${r}
          </label>
        `
          )
          .join('')}
      </div>

      <h4>Schichtplan</h4>

      <div class="sm-editor-row">
        <label>Version</label>
        <select id="sm-version-select" class="sm-input">${versionOptions}</select>
      </div>

      <div class="sm-editor-row">
        <label>Gültig ab</label>
        <input id="sm-valid-from" type="date" class="sm-input" value="${validISO}">
      </div>

      <div style="margin-bottom:8px;">
        <button id="sm-new-version" class="sm-btn sm-btn-secondary">Neue Version erstellen</button>
      </div>

      ${shiftGridHTML}

      <div class="sm-editor-buttons">
        <button id="sm-cancel" class="sm-btn sm-btn-secondary">Abbrechen</button>
        <button id="sm-save" class="sm-btn sm-btn-primary">Speichern</button>
      </div>

    </div>
  `;
}

// ==========================================================
// Plugin – Staff Tab
// ==========================================================
export const SettingsPlugin = {
  id: 'staff',
  title: 'Mitarbeiter',
  order: 20,

  render(settings) {
  const staff = sortStaffForSettings(settings.staff || []);

  return `
    <div class="sm-header-row">
      <h3>Mitarbeiter</h3>
      <div class="sm-sort">
        <button class="sm-sort-btn" data-dir="asc" title="Nachname A–Z">▲</button>
        <button class="sm-sort-btn" data-dir="desc" title="Nachname Z–A">▼</button>
      </div>
    </div>

    <div class="sm-staff-list">
      ${staff.map(staffRowHTML).join('')}
    </div>

    <div style="margin-top:18px; display:flex; gap:8px;">
      <input id="sm-add-name" class="sm-input" placeholder="Name">
      <input id="sm-add-id" class="sm-input" placeholder="Kürzel" maxlength="4" style="max-width:120px;">
      <button id="sm-add-btn" class="sm-btn-add">+</button>
    </div>
  `;
}
,

  bind() {
  const panel = document.querySelector('.sm-panel');
  if (!panel) return;

  const staff = state.settings.staff || (state.settings.staff = []);
  const roles = state.settings.roles || {};

  staff.forEach((emp) => migrateAndEnsureShiftVersions(emp));

  // -----------------------------
  // Sortier-Buttons (UI only)
  // -----------------------------
  panel.querySelectorAll('.sm-sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      staffSortDir = btn.dataset.dir;

      document.dispatchEvent(
        new CustomEvent('settings-tab-reload', { detail: { tab: 'staff' } })
      );
    });
  });

  // -----------------------------
  // Edit-Buttons
  // -----------------------------
  panel.querySelectorAll('.sm-gear-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const emp = staff.find((e) => e.id === id);
      if (!emp) return;

      panel.innerHTML = staffEditorHTML(emp, roles);
      bindEditor(emp, roles);
    });
  });

  // -----------------------------
  // Mitarbeiter hinzufügen
  // -----------------------------
  panel.querySelector('#sm-add-btn')?.addEventListener('click', () => {
    const nameInput = panel.querySelector('#sm-add-name');
    const idInput = panel.querySelector('#sm-add-id');

    const rawName = (nameInput?.value ?? '').trim();
    const id = (idInput?.value ?? '').trim().toUpperCase();

    if (!rawName || !id) {
      popup.toast('Name + Kürzel erforderlich.', { type: 'error' });
      return;
    }
    if (staff.some((e) => e.id === id)) {
      popup.toast('Kürzel existiert bereits.', { type: 'error' });
      return;
    }

    let firstName = rawName;
    let lastName = '';
    const parts = rawName.split(' ').filter(Boolean);
    if (parts.length > 1) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    const emp = {
      id,
      firstName,
      lastName,
      birthDate: '',
      entryDate: '',
      exitDate: '',
      active: true,
      deprecated: false,
      primaryRole: '',
      altRoles: [],
      contractHours: null,
      shiftVersions: [],
      isAdmin: false,
      annualLeaveEntitlement: null,
      carryOverLeave: null,
    };

    staff.push(emp);
    migrateAndEnsureShiftVersions(emp);
    persistSettings(state.settings);

    document.dispatchEvent(
      new CustomEvent('settings-tab-reload', { detail: { tab: 'staff' } })
    );
  });
}
,
};

// ==========================================================
// Editor Binder (vollständig)
// ==========================================================
function bindEditor(emp, roles, selectedVersionIndex = null) {
  const panel = document.querySelector('.sm-panel');
  if (!panel) return;

  // Back/Cancel
  panel.querySelector('#sm-back')?.addEventListener('click', () => {
    document.dispatchEvent(
      new CustomEvent('settings-tab-reload', { detail: { tab: 'staff' } })
    );
  });
  panel.querySelector('#sm-cancel')?.addEventListener('click', () => {
    document.dispatchEvent(
      new CustomEvent('settings-tab-reload', { detail: { tab: 'staff' } })
    );
  });

  // Version select
  panel.querySelector('#sm-version-select')?.addEventListener('change', () => {
    const idx = Number(panel.querySelector('#sm-version-select')?.value ?? 0);
    panel.innerHTML = staffEditorHTML(emp, roles, idx);
    bindEditor(emp, roles, idx);
  });

  // New version
  panel.querySelector('#sm-new-version')?.addEventListener('click', () => {
    createNewVersionFromCurrent(emp);
    persistSettings(state.settings);

    const newIdx = emp.shiftVersions.length - 1;
    panel.innerHTML = staffEditorHTML(emp, roles, newIdx);
    bindEditor(emp, roles, newIdx);
  });

  // Passwort setzen
  panel
    .querySelector('#sm-set-password')
    ?.addEventListener('click', async () => {
      const p1 = (panel.querySelector('#sm-password')?.value ?? '').trim();
      const p2 = (panel.querySelector('#sm-password2')?.value ?? '').trim();

      if (!p1 || !p2) {
        popup.toast('Bitte Passwort und Bestätigung eingeben.', {
          type: 'error',
        });
        return;
      }
      if (p1 !== p2) {
        popup.toast('Passwort und Bestätigung stimmen nicht überein.', {
          type: 'error',
        });
        return;
      }
      if (p1.length < 8) {
        popup.toast('Passwort zu kurz (mind. 8 Zeichen).', { type: 'error' });
        return;
      }

      const ok = await popup.confirm(
        `Passwort für ${emp.id} wirklich setzen?`,
        { type: 'warning', okText: 'Passwort setzen' }
      );
      if (!ok) return;

      const loader = popup.loading('Setze Passwort…');
      try {
        const fd = new FormData();
        fd.append('user', emp.id);
        fd.append('password', p1);

        const r = await fetch(API_SET_PASSWORD, { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));

        if (!r.ok || j.status !== 'ok') {
          throw new Error(j.message || `HTTP ${r.status}`);
        }

        const pEl1 = panel.querySelector('#sm-password');
        const pEl2 = panel.querySelector('#sm-password2');
        if (pEl1) pEl1.value = '';
        if (pEl2) pEl2.value = '';

        popup.toast('Passwort gesetzt.', { type: 'success' });
      } catch (e) {
        D.error('staff', 'set-password failed', e);
        popup.toast('Fehler beim Setzen des Passworts.', { type: 'error' });
      } finally {
        loader.close();
      }
    });

  // Save
  panel.querySelector('#sm-save')?.addEventListener('click', () => {
    // Basisfelder
    emp.firstName = (panel.querySelector('#sm-fn')?.value ?? '').trim();
    emp.lastName = (panel.querySelector('#sm-ln')?.value ?? '').trim();

    emp.birthDate = normalizeISODate(
      panel.querySelector('#sm-birth')?.value ?? ''
    );
    emp.entryDate = normalizeISODate(
      panel.querySelector('#sm-entry')?.value ?? ''
    );
    emp.exitDate = normalizeISODate(
      panel.querySelector('#sm-exit')?.value ?? ''
    );

    emp.active = !!panel.querySelector('#sm-active')?.checked;
    emp.deprecated = !!panel.querySelector('#sm-depr')?.checked;
    emp.isAdmin = !!panel.querySelector('#sm-admin')?.checked;

    const hoursVal = (panel.querySelector('#sm-hours')?.value ?? '').trim();
    emp.contractHours = hoursVal ? Number(hoursVal) : null;

    // Urlaub (Stammdaten)
    emp.annualLeaveEntitlement = normalizeNumberOrNull(
      panel.querySelector('#sm-annual-leave-entitlement')?.value ?? ''
    );
    emp.carryOverLeave = normalizeNumberOrNull(
      panel.querySelector('#sm-carryover-leave')?.value ?? ''
    );
    ensureLeaveFields(emp);

    // Rollen
    const primary = panel.querySelector("input[name='sm-primary']:checked");
    emp.primaryRole = primary ? primary.value : '';

    emp.altRoles = Array.from(panel.querySelectorAll('.sm-alt-role'))
      .filter((i) => i.checked)
      .map((i) => i.value);

    // Shifts + validFrom
    migrateAndEnsureShiftVersions(emp);
    const v = getVersion(emp, selectedVersionIndex);

    v.validFrom = normalizeISODate(
      panel.querySelector('#sm-valid-from')?.value ?? ''
    );

    panel.querySelectorAll('.sm-shift').forEach((input) => {
      const w = input.dataset.week;
      const d = input.dataset.day;
      if (v.shifts?.[w]) v.shifts[w][d] = (input.value ?? '').trim();
    });

    persistSettings(state.settings);

    document.dispatchEvent(
      new CustomEvent('settings-tab-reload', { detail: { tab: 'staff' } })
    );
  });
}
