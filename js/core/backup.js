// ======================================================================
// backup.js — Admin UI für Backups (Settings + Monatspläne)
// ----------------------------------------------------------------------
// Spricht NUR die vorhandenen Backend-Endpunkte an:
//
// GET  /api/backup/index.php
// GET  /api/backup/available_months.php
// POST /api/backup/settings_create.php     {comment}
// POST /api/backup/settings_restore.php    {version}
// POST /api/backup/delete_settings.php     {version}
//
// POST /api/backup/month_create.php        {year, month, comment}
// POST /api/backup/month_restore.php       {year, month, version}
// POST /api/backup/delete_month.php        {key, version}
//
// POST /api/backup/backup_export.php       {mode:'data_only'|'full'} -> ZIP Download
//
// Robust gegen Response-Formate:
// - status: "ok" oder "success"
// - payload: data ODER months
// - months im Index: Object-map ODER Array
// ======================================================================

import { D } from '/js/core/diagnostics.js';
import popup from '/js/core/popup.js';

const API = '/api/backup';

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------
function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthKey(year, month) {
  return `${String(year).padStart(4, '0')}-${pad2(month)}`;
}

function safeText(s) {
  return (s ?? '').toString();
}

function parseOk(json) {
  // akzeptiere: {status:'ok'|'success'}; Fehler: {status:'error', message}
  if (!json || typeof json !== 'object') {
    throw new Error('Ungültige Server-Antwort (kein JSON-Objekt)');
  }
  if (json.status === 'error') {
    throw new Error(json.message || 'Serverfehler');
  }
  if (json.status !== 'ok' && json.status !== 'success') {
    // manche Endpunkte liefern evtl. nur ok/success; alles andere als Fehler behandeln
    throw new Error(json.message || 'Ungültige Server-Antwort');
  }
  return json;
}

function toDisplayDate(iso) {
  if (!iso) return '';
  try {
    const dt = new Date(iso);
    const fmt = new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return fmt.format(dt);
  } catch {
    return String(iso);
  }
}

function normalizeIndex(idx) {
  // Minimalstruktur absichern
  const out = idx && typeof idx === 'object' ? idx : {};
  out.schemaVersion = out.schemaVersion ?? 1;
  out.updatedAt = out.updatedAt ?? null;

  out.settings = out.settings && typeof out.settings === 'object' ? out.settings : { latest: null, versions: [] };
  out.settings.latest = out.settings.latest ?? null;
  out.settings.versions = Array.isArray(out.settings.versions) ? out.settings.versions : [];

  // months kann [] (leer) sein oder ein object-map mit keys
  const m = out.months;
  if (Array.isArray(m)) {
    // optional: falls Array-Form verwendet wird, versuchen zu mappen
    out._monthsMap = {};
    for (const set of m) {
      if (!set || typeof set !== 'object') continue;
      const y = set.year;
      const mo = set.month;
      if (Number.isInteger(y) && Number.isInteger(mo)) {
        const k = monthKey(y, mo);
        out._monthsMap[k] = set;
      }
    }
  } else if (m && typeof m === 'object') {
    out._monthsMap = m;
  } else {
    out._monthsMap = {};
  }

  return out;
}

function versionsDesc(list) {
  // sort by createdAt desc (fallback: id desc)
  const arr = Array.isArray(list) ? [...list] : [];
  arr.sort((a, b) => {
    const ac = safeText(a?.createdAt);
    const bc = safeText(b?.createdAt);
    if (ac && bc) return bc.localeCompare(ac);
    return safeText(b?.id).localeCompare(safeText(a?.id));
  });
  return arr;
}

// ----------------------------------------------------------------------
// BackupService — API Layer
// ----------------------------------------------------------------------
class BackupService {
  static async fetchRawJSON(url, options = {}) {
    const res = await fetch(url, options);
    let json = null;

    try {
      json = await res.json();
    } catch {
      // non-json
      if (!res.ok) throw new Error(`Server-Fehler (${res.status})`);
      throw new Error('Ungültige Server-Antwort (kein JSON)');
    }

    // Wenn HTTP error -> message aus JSON bevorzugen
    if (!res.ok) {
      const msg = json?.message || `Server-Fehler (${res.status})`;
      throw new Error(msg);
    }

    return json;
  }

  static async getIndex() {
    const json = await this.fetchRawJSON(`${API}/index.php`);

    // index.php bei dir: {status:'success', message:'...', data:{...}}
    const ok = parseOk(json);

    // payload: data oder direkt (fallback)
    const data = ok.data ?? ok.index ?? ok;
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid index response');
    }
    return data;
  }

  static async getAvailableMonths() {
    const json = await this.fetchRawJSON(`${API}/available_months.php`);
    const ok = parseOk(json);

    // Zwei mögliche Formen:
    // A) {status:'ok', months:[{year,month}]}
    // B) {status:'success', data:[{year,month}]}
    const raw = Array.isArray(ok.data)
      ? ok.data
      : Array.isArray(ok.months)
        ? ok.months
        : null;

    if (!raw) {
      throw new Error('Invalid available_months response');
    }

    const out = [];
    for (const m of raw) {
      const y = Number(m?.year);
      const mo = Number(m?.month);
      if (!Number.isInteger(y) || !Number.isInteger(mo)) continue;
      if (mo < 1 || mo > 12) continue;
      out.push({ year: y, month: mo, key: monthKey(y, mo) });
    }

    out.sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year));
    return out;
  }

  static async postJSON(endpoint, payload) {
    const json = await this.fetchRawJSON(`${API}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    });

    // Endpunkte variieren: {status:'ok'} oder {status:'success', data:{}}
    const ok = parseOk(json);
    return ok;
  }

  static settingsCreate(comment) {
    return this.postJSON('settings_create.php', { comment: safeText(comment).trim() });
  }

  static settingsRestore(version) {
    return this.postJSON('settings_restore.php', { version });
  }

  static settingsDelete(version) {
    return this.postJSON('delete_settings.php', { version });
  }

  static monthCreate(year, month, comment) {
    return this.postJSON('month_create.php', {
      year: Number(year),
      month: Number(month),
      comment: safeText(comment).trim(),
    });
  }

  static monthRestore(year, month, version) {
    return this.postJSON('month_restore.php', {
      year: Number(year),
      month: Number(month),
      version,
    });
  }

  static monthDelete(key, version) {
    return this.postJSON('delete_month.php', {
      key,
      version,
    });
  }

  static async exportZip(mode) {
    // PHP liefert ZIP mit Content-Disposition -> Blob download
    const res = await fetch(`${API}/backup_export.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });

    if (!res.ok) {
      // wenn JSON error geliefert wird, auslesen
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const j = await res.json();
        throw new Error(j?.message || `Export fehlgeschlagen (${res.status})`);
      }
      throw new Error(`Export fehlgeschlagen (${res.status})`);
    }

    const blob = await res.blob();

    // Filename aus Content-Disposition
    const cd = res.headers.get('content-disposition') || '';
    let filename = 'export.zip';
    const m = cd.match(/filename="([^"]+)"/i);
    if (m?.[1]) filename = m[1];

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

// ----------------------------------------------------------------------
// BackupUI — DOM + Interactions
// ----------------------------------------------------------------------
class BackupUI {
  constructor(root) {
    this.root = root;

    this.state = {
      index: null,
      availableMonths: [],
      selectedYear: null,
      selectedMonth: null,
      busy: false,
    };

    this.els = {
      settingsComment: null,
      settingsCreateBtn: null,
      monthsYearSelect: null,
      monthsMonthSelect: null,
      monthsComment: null,
      monthsCreateBtn: null,
      settingsList: null,
      monthsList: null,
      exportDataBtn: null,
      exportFullBtn: null,
    };
  }

  async init() {
    this.renderShell();
    await this.reloadAll();
    this.bindFooter();
  }

  setBusy(on) {
    this.state.busy = !!on;

    const disable = (el, d) => {
      if (!el) return;
      el.disabled = d;
    };

    disable(this.els.settingsCreateBtn, on);
    disable(this.els.monthsCreateBtn, on);
    disable(this.els.exportDataBtn, on);
    disable(this.els.exportFullBtn, on);

    // auch Action Buttons in den Listen:
    this.root.querySelectorAll('[data-bb-action]').forEach((b) => {
      b.disabled = on || b.dataset.bbDisabled === '1';
    });
  }

  async reloadAll() {
    this.setBusy(true);
    try {
      const [rawIndex, avail] = await Promise.all([
        BackupService.getIndex(),
        BackupService.getAvailableMonths(),
      ]);

      const idx = normalizeIndex(rawIndex);

      this.state.index = idx;
      this.state.availableMonths = avail;

      // Default selection: erster verfügbarer Monat, falls nicht gesetzt
      if (!this.state.selectedYear || !this.state.selectedMonth) {
        const last = avail.length ? avail[avail.length - 1] : null;
        if (last) {
          this.state.selectedYear = last.year;
          this.state.selectedMonth = last.month;
        } else {
          this.state.selectedYear = null;
          this.state.selectedMonth = null;
        }
      } else {
        // falls aktuelle Auswahl nicht mehr existiert -> fallback
        const k = monthKey(this.state.selectedYear, this.state.selectedMonth);
        const exists = avail.some((x) => x.key === k);
        if (!exists) {
          const last = avail.length ? avail[avail.length - 1] : null;
          this.state.selectedYear = last?.year ?? null;
          this.state.selectedMonth = last?.month ?? null;
        }
      }

      this.renderSettingsSection();
      this.renderMonthsSection();
      this.bindDynamicActions();

      D.info?.('backup', 'reloadAll ok');
    } catch (e) {
      D.error('backup', 'reloadAll failed', e);
      await popup.alert(String(e?.message || e), { type: 'error', okText: 'OK' });
    } finally {
      this.setBusy(false);
    }
  }

  // --------------------------------------------------------------------
  // Shell
  // --------------------------------------------------------------------
  renderShell() {
    this.root.innerHTML = `
      <div class="bb-root">
        <section class="bb-section" id="bb-settings">
          <div class="bb-section-title">
            <h2>Einstellungen</h2>
            <div class="bb-hint">Sichert ./data/settings.json als Version. Letzte Version ist nicht löschbar.</div>
          </div>
          <div class="bb-grid" id="bb-settings-grid"></div>
        </section>

        <section class="bb-section" id="bb-months">
          <div class="bb-section-title">
            <h2>Arbeitspläne</h2>
            <div class="bb-hint">Nur Monate mit vorhandener Datei ./data/YYYY/m.json werden angeboten.</div>
          </div>
          <div class="bb-grid" id="bb-months-grid"></div>
        </section>

        <div class="bb-footer">
          <button class="bb-btn bb-btn-primary" id="bb-export-data" type="button">Produktivdaten exportieren</button>
          <button class="bb-btn" id="bb-export-full" type="button">Voll-Export (inkl. Backups)</button>
        </div>
      </div>
    `;

    this.els.exportDataBtn = this.root.querySelector('#bb-export-data');
    this.els.exportFullBtn = this.root.querySelector('#bb-export-full');
  }

  // --------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------
  renderSettingsSection() {
    const grid = this.root.querySelector('#bb-settings-grid');
    const idx = this.state.index;
    const latest = idx?.settings?.latest ?? null;
    const versions = versionsDesc(idx?.settings?.versions);

    grid.innerHTML = `
      <div class="bb-grid-head">Stand / Datum</div>
      <div class="bb-grid-head">Kommentar</div>
      <div class="bb-grid-head bb-right">Aktion</div>

      ${this.renderSettingsCurrentRow(latest)}
      ${this.renderSettingsListRows(versions, latest)}
    `;

    this.els.settingsComment = grid.querySelector('#bb-settings-comment');
    this.els.settingsCreateBtn = grid.querySelector('#bb-settings-create');
  }

  renderSettingsCurrentRow(latest) {
    const lastLabel = latest ? `Letztes Backup: ${latest}` : 'Noch keine Sicherung vorhanden';
    return `
      <div class="bb-cell-date">
        <div class="bb-current">Aktueller Stand</div>
        <div class="bb-sub">${safeText(lastLabel)}</div>
      </div>

      <div>
        <input class="bb-input" id="bb-settings-comment" type="text"
               placeholder="Kommentar (z.B. Rolle hinzugefügt, Mitarbeiter XY geändert …)" maxlength="300" />
      </div>

      <div class="bb-actions">
        <button class="bb-btn bb-btn-primary" id="bb-settings-create" type="button" data-bb-action="settings-create">
          Jetzt sichern
        </button>
      </div>
    `;
  }

  renderSettingsListRows(versions, latest) {
    if (!versions.length) {
      return `<div class="bb-empty">Keine Settings-Backups vorhanden.</div>`;
    }

    return versions
      .map((v) => {
        const id = safeText(v?.id);
        const isLatest = latest && id === latest;

        const ok = v?.valid === true;
        const pill = ok
          ? `<span class="bb-pill ok">✓ Integrität OK</span>`
          : `<span class="bb-pill bad">✕ Integrität</span>`;

        const delDisabled = isLatest || versions.length === 1;

        return `
          <div class="bb-cell-date ${isLatest ? 'bb-current' : ''}">
            <div>${toDisplayDate(v?.createdAt)} <span class="bb-sub">(${id})</span></div>
            <div class="bb-sub">
              ${isLatest ? `<span class="bb-pill ok">Aktuell</span>` : ``}
              ${pill}
            </div>
          </div>

          <div>
            <input class="bb-input" type="text" value="${escapeAttr(v?.comment)}" readonly />
          </div>

          <div class="bb-actions">
            <button class="bb-btn" type="button"
              data-bb-action="settings-restore"
              data-version="${escapeAttr(id)}">
              Wiederherstellen
            </button>

            <button class="bb-btn bb-btn-danger"
              type="button"
              data-bb-action="settings-delete"
              data-version="${escapeAttr(id)}"
              data-bb-disabled="${delDisabled ? '1' : '0'}"
              ${delDisabled ? 'disabled' : ''}>
              Löschen
            </button>
          </div>
        `;
      })
      .join('');
  }

  // --------------------------------------------------------------------
  // Months
  // --------------------------------------------------------------------
  renderMonthsSection() {
    const grid = this.root.querySelector('#bb-months-grid');
    const idx = this.state.index;
    const monthsMap = idx?._monthsMap || {};
    const avail = this.state.availableMonths;

    const y = this.state.selectedYear;
    const m = this.state.selectedMonth;
    const selectedKey = y && m ? monthKey(y, m) : null;

    // set aus index
    const set = selectedKey ? monthsMap[selectedKey] : null;
    const latest = set?.latest ?? null;
    const versions = versionsDesc(set?.versions);

    const yearOptions = this.buildYearOptions(avail, y);
    const monthOptions = this.buildMonthOptions(avail, y, m);

    grid.innerHTML = `
      <div class="bb-grid-head">Zeitraum</div>
      <div class="bb-grid-head">Kommentar</div>
      <div class="bb-grid-head bb-right">Aktion</div>

      ${this.renderMonthsCreateRow(yearOptions, monthOptions, latest)}
      ${this.renderMonthsListRows(selectedKey, versions, latest)}
    `;

    this.els.monthsYearSelect = grid.querySelector('#bb-months-year');
    this.els.monthsMonthSelect = grid.querySelector('#bb-months-month');
    this.els.monthsComment = grid.querySelector('#bb-months-comment');
    this.els.monthsCreateBtn = grid.querySelector('#bb-months-create');

    // Select binding (statisch)
    this.els.monthsYearSelect?.addEventListener('change', async () => {
      this.state.selectedYear = Number(this.els.monthsYearSelect.value);
      // Monat neu setzen: erster verfügbarer Monat im Jahr
      const first = this.state.availableMonths.find((x) => x.year === this.state.selectedYear);
      this.state.selectedMonth = first?.month ?? null;
      await this.reloadAll();
    });

    this.els.monthsMonthSelect?.addEventListener('change', async () => {
      this.state.selectedMonth = Number(this.els.monthsMonthSelect.value);
      await this.reloadAll();
    });
  }

  renderMonthsCreateRow(yearOptions, monthOptions, latest) {
    const label = latest ? `Letztes Backup: ${latest}` : 'Noch keine Sicherung für diesen Monat';
    const hasAvail = this.state.availableMonths.length > 0;

    return `
      <div class="bb-cell-date">
        <div class="bb-select-wrap">
          <select class="bb-select" id="bb-months-year" ${hasAvail ? '' : 'disabled'}>
            ${yearOptions}
          </select>
          <select class="bb-select bb-month" id="bb-months-month" ${hasAvail ? '' : 'disabled'}>
            ${monthOptions}
          </select>
        </div>
        <div class="bb-sub">${safeText(label)}</div>
      </div>

      <div>
        <input class="bb-input" id="bb-months-comment" type="text"
               placeholder="Kommentar (z.B. Monatsabschluss, Korrektur, Urlaub eingepflegt …)" maxlength="300"
               ${hasAvail ? '' : 'disabled'} />
      </div>

      <div class="bb-actions">
        <button class="bb-btn bb-btn-primary" id="bb-months-create" type="button"
          data-bb-action="month-create" ${hasAvail ? '' : 'disabled'}>
          Monat sichern
        </button>
      </div>
    `;
  }

  renderMonthsListRows(selectedKey, versions, latest) {
    if (!this.state.availableMonths.length) {
      return `<div class="bb-empty">Keine Monatspläne im Produktivordner gefunden (./data/YYYY/m.json).</div>`;
    }

    if (!selectedKey) {
      return `<div class="bb-empty">Bitte Jahr/Monat auswählen.</div>`;
    }

    if (!versions.length) {
      return `<div class="bb-empty">Keine Backups für ${selectedKey} vorhanden.</div>`;
    }

    return versions
      .map((v) => {
        const id = safeText(v?.id);
        const isLatest = latest && id === latest;

        const ok = v?.valid === true;
        const pill = ok
          ? `<span class="bb-pill ok">✓ Integrität OK</span>`
          : `<span class="bb-pill bad">✕ Integrität</span>`;

        const delDisabled = isLatest || versions.length === 1;

        return `
          <div class="bb-cell-date ${isLatest ? 'bb-current' : ''}">
            <div>${toDisplayDate(v?.createdAt)} <span class="bb-sub">(${id})</span></div>
            <div class="bb-sub">
              ${isLatest ? `<span class="bb-pill ok">Aktuell</span>` : ``}
              ${pill}
            </div>
          </div>

          <div>
            <input class="bb-input" type="text" value="${escapeAttr(v?.comment)}" readonly />
          </div>

          <div class="bb-actions">
            <button class="bb-btn" type="button"
              data-bb-action="month-restore"
              data-key="${escapeAttr(selectedKey)}"
              data-version="${escapeAttr(id)}">
              Wiederherstellen
            </button>

            <button class="bb-btn bb-btn-danger" type="button"
              data-bb-action="month-delete"
              data-key="${escapeAttr(selectedKey)}"
              data-version="${escapeAttr(id)}"
              data-bb-disabled="${delDisabled ? '1' : '0'}"
              ${delDisabled ? 'disabled' : ''}>
              Löschen
            </button>
          </div>
        `;
      })
      .join('');
  }

  buildYearOptions(avail, selectedYear) {
    const years = [...new Set(avail.map((x) => x.year))].sort((a, b) => a - b);
    if (!years.length) return `<option value="">—</option>`;

    const sel = selectedYear ?? years[years.length - 1];
    return years.map((y) => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y}</option>`).join('');
  }

  buildMonthOptions(avail, year, selectedMonth) {
    const list = avail.filter((x) => x.year === (year ?? x.year));
    const months = list.map((x) => x.month).sort((a, b) => a - b);
    if (!months.length) return `<option value="">—</option>`;

    const sel = selectedMonth ?? months[months.length - 1];
    const fmt = new Intl.DateTimeFormat('de-DE', { month: 'long' });
    return months
      .map((m) => {
        const name = fmt.format(new Date(2025, m - 1, 1));
        return `<option value="${m}" ${m === sel ? 'selected' : ''}>${capitalize(name)} (${pad2(m)})</option>`;
      })
      .join('');
  }

  bindFooter() {
    this.els.exportDataBtn?.addEventListener('click', async () => {
      await this.runBusy(async () => {
        await BackupService.exportZip('data_only');
        await popup.alert('Export gestartet.', { type: 'info', okText: 'OK' });
      });
    });

    this.els.exportFullBtn?.addEventListener('click', async () => {
      const yes = await popup.confirm(
        'Voll-Export enthält Produktivdaten und alle Backups. Fortfahren?',
        { type: 'warn', okText: 'Export', cancelText: 'Abbrechen' }
      );
      if (!yes) return;

      await this.runBusy(async () => {
        await BackupService.exportZip('full');
        await popup.alert('Export gestartet.', { type: 'info', okText: 'OK' });
      });
    });
  }

  // --------------------------------------------------------------------
  // Dynamic actions (delegation)
  // --------------------------------------------------------------------
  bindDynamicActions() {
    // Create Buttons (oben)
    this.els.settingsCreateBtn?.addEventListener('click', async () => {
      const comment = safeText(this.els.settingsComment?.value).trim();

      await this.runBusy(async () => {
        await BackupService.settingsCreate(comment);
        if (this.els.settingsComment) this.els.settingsComment.value = '';
        await popup.alert('Einstellungen wurden gesichert.', { type: 'info', okText: 'OK' });
        await this.reloadAll();
      });
    });

    this.els.monthsCreateBtn?.addEventListener('click', async () => {
      const y = this.state.selectedYear;
      const m = this.state.selectedMonth;
      if (!Number.isInteger(y) || !Number.isInteger(m)) {
        await popup.alert('Bitte Jahr und Monat auswählen.', { type: 'error', okText: 'OK' });
        return;
      }

      const comment = safeText(this.els.monthsComment?.value).trim();

      await this.runBusy(async () => {
        await BackupService.monthCreate(y, m, comment);
        if (this.els.monthsComment) this.els.monthsComment.value = '';
        await popup.alert(`Monatsplan ${monthKey(y, m)} wurde gesichert.`, { type: 'info', okText: 'OK' });
        await this.reloadAll();
      });
    });

    // Restore/Delete Buttons in lists (event delegation)
    this.root.querySelectorAll('[data-bb-action="settings-restore"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const version = btn.dataset.version;
        const yes = await popup.confirm(
          `Einstellungen wirklich auf ${version} zurücksetzen? Aktuelle Einstellungen werden überschrieben.`,
          { type: 'warn', okText: 'Wiederherstellen', cancelText: 'Abbrechen' }
        );
        if (!yes) return;

        await this.runBusy(async () => {
          await BackupService.settingsRestore(version);
          await popup.alert('Einstellungen wurden wiederhergestellt.', { type: 'info', okText: 'OK' });
          // index bleibt unverändert, UI reload trotzdem
          await this.reloadAll();
        });
      });
    });

    this.root.querySelectorAll('[data-bb-action="settings-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const version = btn.dataset.version;

        const yes = await popup.confirm(
          `Settings-Backup ${version} wirklich löschen?`,
          { type: 'warn', okText: 'Löschen', cancelText: 'Abbrechen' }
        );
        if (!yes) return;

        await this.runBusy(async () => {
          await BackupService.settingsDelete(version);
          await popup.alert('Backup wurde gelöscht.', { type: 'info', okText: 'OK' });
          await this.reloadAll();
        });
      });
    });

    this.root.querySelectorAll('[data-bb-action="month-restore"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.key;
        const version = btn.dataset.version;

        const yes = await popup.confirm(
          `Monatsplan ${key} wirklich auf ${version} zurücksetzen? Aktueller Monatsplan wird überschrieben.`,
          { type: 'warn', okText: 'Wiederherstellen', cancelText: 'Abbrechen' }
        );
        if (!yes) return;

        const [y, m] = key.split('-').map((x) => Number(x));
        await this.runBusy(async () => {
          await BackupService.monthRestore(y, m, version);
          await popup.alert(`Monatsplan ${key} wurde wiederhergestellt.`, { type: 'info', okText: 'OK' });
          await this.reloadAll();
        });
      });
    });

    this.root.querySelectorAll('[data-bb-action="month-delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const key = btn.dataset.key;
        const version = btn.dataset.version;

        const yes = await popup.confirm(
          `Monats-Backup ${key} / ${version} wirklich löschen?`,
          { type: 'warn', okText: 'Löschen', cancelText: 'Abbrechen' }
        );
        if (!yes) return;

        await this.runBusy(async () => {
          await BackupService.monthDelete(key, version);
          await popup.alert('Backup wurde gelöscht.', { type: 'info', okText: 'OK' });
          await this.reloadAll();
        });
      });
    });
  }

  async runBusy(fn) {
    if (this.state.busy) return;
    this.setBusy(true);
    try {
      await fn();
    } catch (e) {
      D.error('backup', 'action failed', e);
      await popup.alert(String(e?.message || e), { type: 'error', okText: 'OK' });
    } finally {
      this.setBusy(false);
    }
  }
}

// ----------------------------------------------------------------------
// HTML escaping for attributes
// ----------------------------------------------------------------------
function escapeAttr(val) {
  const s = safeText(val);
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function capitalize(s) {
  const t = safeText(s);
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ----------------------------------------------------------------------
// Boot
// ----------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const root = document.getElementById('backup-root');
  if (!root) {
    D.error('backup', 'Missing #backup-root in backup.html');
    return;
  }

  try {
    const ui = new BackupUI(root);
    await ui.init();
  } catch (e) {
    D.error('backup', 'init failed', e);
    await popup.alert(String(e?.message || e), { type: 'error', okText: 'OK' });
  }
});
