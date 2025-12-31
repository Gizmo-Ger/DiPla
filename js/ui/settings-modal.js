// ==========================================================
// settings-modal.js – v2.0 (angepasst an neue sm-Nomenklatur)
// Autarkes Settings-Modal (Tabs + Plugins)
// ==========================================================

import { D } from '/js/core/diagnostics.js';
import { state } from '/js/core/state.js';

let modal = null;
let backdrop = null;
let dialog = null;
let tabsHeader = null;
let panel = null;

let SETTINGS_PLUGINS = null;
let initialized = false;
let currentTabId = null;

// Plugin-Ordner
const SETTINGS_DIR = '/js/settings/';
const PLUGIN_FILES = [
  'settings-roles.js',
  'settings-staff.js',
  'settings-absence.js',
  'settings-teammeeting.js',
  'settings-itn.js',
  'settings-bridgedays.js',
  'settings-meta.js',
  'settings-logic.js',
  'settings-export-pdf.js',
  'settings-export-ical.js',
  'settings-statistics.js',
  'settings-backup.js',
  'settings-auth.js',
  'settings-schoolholidays.js',
];

// ==========================================================
// INIT
// ==========================================================
export async function initSettingsModal() {
  if (initialized) return;

  _createDOM();
  await _loadPlugins();
  _buildTabs();
  _bindCloseHandlers();
  _enableDragging();
  _enableResize();
  _bindGlobalTabReload();

  initialized = true;
}

// ==========================================================
// DOM ERSTELLEN
// ==========================================================
function _createDOM() {
  // Backdrop
  backdrop = document.createElement('div');
  backdrop.id = 'sm-backdrop';
  backdrop.classList.add('hidden');
  document.body.appendChild(backdrop);

  // Modal Root
  modal = document.createElement('div');
  modal.id = 'sm-modal';
  modal.classList.add('hidden');
  document.body.appendChild(modal);

  modal.style.position = 'fixed';

  // Dialog
  dialog = document.createElement('div');
  dialog.className = 'sm-dialog';
  modal.appendChild(dialog);

  // Header
  const header = document.createElement('div');
  header.className = 'sm-header';
  header.innerHTML = `
    <h2>Einstellungen</h2>
    <button id="sm-close" class="sm-close-btn">×</button>
  `;
  dialog.appendChild(header);

  // Body
  const body = document.createElement('div');
  body.className = 'sm-body';
  body.innerHTML = `
    <div class="sm-tabs" id="sm-tabs"></div>
    <div class="sm-panel" id="sm-panel"></div>
  `;
  dialog.appendChild(body);

  tabsHeader = body.querySelector('#sm-tabs');
  panel = body.querySelector('#sm-panel');
}

// ==========================================================
// PLUGINS LADEN
// ==========================================================
async function _loadPlugins() {
  const plugins = [];

  for (const file of PLUGIN_FILES) {
    try {
      const mod = await import(SETTINGS_DIR + file);

      if (mod.SettingsPlugin) {
        plugins.push(mod.SettingsPlugin);
      } else {
        D.warn('sm-modal', `Kein SettingsPlugin in ${file}`);
      }
    } catch (err) {
      D.error('sm-modal', `Fehler beim Import von ${file}`, err);
    }
  }

  plugins.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  SETTINGS_PLUGINS = plugins;
}

// ==========================================================
// TABS ERZEUGEN
// ==========================================================
function _buildTabs() {
  if (!SETTINGS_PLUGINS?.length) {
    tabsHeader.innerHTML = `<span>Keine Settings-Plugins gefunden.</span>`;
    return;
  }

  tabsHeader.innerHTML = SETTINGS_PLUGINS.map(
    (p) => `
    <button class="sm-tab-btn" data-tab="${p.id}">
      ${p.title}
    </button>
  `
  ).join('');

  tabsHeader.querySelectorAll('.sm-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _setActiveTabButton(btn);
      _activateTab(btn.dataset.tab);
    });
  });
}

// ==========================================================
// TAB AKTIVIEREN
// ==========================================================
async function _activateTab(tabId) {
  const plugin = SETTINGS_PLUGINS.find((p) => p.id === tabId);
  if (!plugin) {
    panel.innerHTML = `<div>Unbekannter Tab: ${tabId}</div>`;
    return;
  }

  currentTabId = tabId;
  panel.innerHTML = `<div>Lädt…</div>`;

  try {
    panel.innerHTML = plugin.render(state.settings);
    await plugin.bind?.(panel);
  } catch (err) {
    D.error('sm-modal', `Fehler beim Rendern von ${plugin.id}`, err);
    panel.innerHTML = `<div>Fehler beim Laden.</div>`;
  }
}

function _setActiveTabButton(activeBtn) {
  tabsHeader
    .querySelectorAll('.sm-tab-btn')
    .forEach((b) => b.classList.remove('active'));

  activeBtn?.classList.add('active');
}

// ==========================================================
// ÖFFNEN
// ==========================================================
export async function openSettingsModal() {
  if (!initialized) await initSettingsModal();

  modal.classList.remove('hidden');
  modal.classList.add('visible');

  const rect = modal.getBoundingClientRect();
  modal.style.left = `${(window.innerWidth - rect.width) / 2}px`;
  modal.style.top = `${(window.innerHeight - rect.height) / 2}px`;

  const tabBtn = currentTabId
    ? tabsHeader.querySelector(`.sm-tab-btn[data-tab="${currentTabId}"]`)
    : tabsHeader.querySelector('.sm-tab-btn');

  if (tabBtn) {
    _setActiveTabButton(tabBtn);
    await _activateTab(tabBtn.dataset.tab);
  }

  backdrop.classList.remove('hidden');
  backdrop.classList.add('visible');
}

// ==========================================================
// SCHLIESSEN
// ==========================================================
export function closeSettingsModal() {
  if (!modal || !backdrop) return;

  modal.classList.remove('visible');
  backdrop.classList.remove('visible');

  // NEU → Signal: Modal wurde geschlossen
  document.dispatchEvent(new CustomEvent('settings-closed'));

  setTimeout(() => {
    modal.classList.add('hidden');
    backdrop.classList.add('hidden');
  }, 180);
}

// ==========================================================
// CLOSE-HANDLER
// ==========================================================
function _bindCloseHandlers() {
  const closeBtn = dialog.querySelector('#sm-close');
  closeBtn?.addEventListener('click', closeSettingsModal);
  backdrop.addEventListener('click', closeSettingsModal);
}

// ==========================================================
// DRAGGING
// ==========================================================
function _enableDragging() {
  const header = dialog.querySelector('.sm-header');
  if (!header) return;

  let dragging = false;
  let startX = 0,
    startY = 0;
  let startLeft = 0,
    startTop = 0;

  header.addEventListener('mousedown', (e) => {
    dragging = true;

    const rect = modal.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;

    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let newLeft = startLeft + dx;
    let newTop = startTop + dy;

    newLeft = Math.max(
      0,
      Math.min(newLeft, window.innerWidth - modal.offsetWidth)
    );
    newTop = Math.max(
      0,
      Math.min(newTop, window.innerHeight - modal.offsetHeight)
    );

    modal.style.left = `${newLeft}px`;
    modal.style.top = `${newTop}px`;
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.userSelect = '';
  });
}

// ==========================================================
// RESIZE
// ==========================================================
function _enableResize() {
  let resizer = dialog.querySelector('.sm-resizer');
  if (!resizer) {
    resizer = document.createElement('div');
    resizer.className = 'sm-resizer';
    dialog.appendChild(resizer);
  }

  let resizing = false;
  let startX = 0,
    startY = 0;
  let startW = 0,
    startH = 0;

  resizer.addEventListener('mousedown', (e) => {
    resizing = true;
    const rect = modal.getBoundingClientRect();

    startX = e.clientX;
    startY = e.clientY;
    startW = rect.width;
    startH = rect.height;

    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!resizing) return;

    modal.style.width = `${Math.max(600, startW + (e.clientX - startX))}px`;
    modal.style.height = `${Math.max(400, startH + (e.clientY - startY))}px`;
  });

  document.addEventListener('mouseup', () => {
    resizing = false;
    document.body.style.userSelect = '';
  });
}

// ==========================================================
// GLOBALER TAB RELOAD
// ==========================================================
function _bindGlobalTabReload() {
  document.addEventListener('settings-tab-reload', (ev) => {
    const tabId = ev.detail?.tab || currentTabId;

    const btn = tabsHeader.querySelector(`.sm-tab-btn[data-tab="${tabId}"]`);
    if (!btn) return;

    _setActiveTabButton(btn);
    _activateTab(tabId);
  });
}

document.addEventListener('settings-closed', async () => {
  const { renderPlan } = await import('/js/ui/plan.js');
  const base = state.activeWeekStart || new Date();
  renderPlan(base);
});
