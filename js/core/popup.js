// ======================================================================
// popup.js – Zentrales Popup-System
// Toast, Confirm, Alert, Loading, Logic
// ======================================================================

import { formatDateWeekday, isoToGerman } from '/js/misc/datetime.js';

// ----------------------------------------------------------------------
// GLOBAL STATE
// ----------------------------------------------------------------------
let toastEl = null;
let overlayEl = null;
let loadingEl = null;
let hideTimer = null;

// Logic popup state
let logicEl = null;
let logicVisible = false;
let dragState = null;

// ======================================================================
// TOAST
// ======================================================================
export function toast(message, options = {}) {
  const { duration = 1800, type = 'info' } = options;

  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast-popup';
    toastEl.classList.add('ui-toast');
    document.body.appendChild(toastEl);
  }

  toastEl.textContent = message;
  toastEl.setAttribute('data-type', type);
  // toastEl.style.opacity = '1';
  toastEl.classList.add('visible');

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    // toastEl.style.opacity = '0';
    toastEl.classList.remove('visible');
  }, duration);
}

// ======================================================================
// CONFIRM OVERLAY (INTERNAL)
// ======================================================================
function ensureOverlay() {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement('div');
  overlayEl.id = 'confirm-overlay';
  overlayEl.classList.add('ui-confirm');
  overlayEl.innerHTML = `
    <div id="confirm-box">
      <div id="confirm-message"></div>
      <div id="confirm-buttons"></div>
    </div>
  `;
  document.body.appendChild(overlayEl);
  return overlayEl;
}

// ======================================================================
// CONFIRM
// ======================================================================
export function confirm(message, options = {}) {
  return new Promise((resolve) => {
    const { type = 'info', okText = 'OK', cancelText = 'Abbrechen' } = options;

    const overlay = ensureOverlay();
    const msgBox = overlay.querySelector('#confirm-message');
    const btnBox = overlay.querySelector('#confirm-buttons');

    msgBox.textContent = message;
    btnBox.innerHTML = `
      <button class="ui-btn ui-btn-primary" id="confirm-ok">${okText}</button>
      <button class="ui-btn ui-btn-secondary" id="confirm-cancel">${cancelText}</button>
    `;


    overlay.setAttribute('data-type', type);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => (overlay.style.opacity = '1'));

    const close = (value) => {
      overlay.style.opacity = '0';
      setTimeout(() => (overlay.style.display = 'none'), 180);
      resolve(value);
    };

    btnBox.querySelector('#confirm-ok').onclick = () => close(true);
    btnBox.querySelector('#confirm-cancel').onclick = () => close(false);
  });
}

// ======================================================================
// ALERT
// ======================================================================
export function alert(message, options = {}) {
  return new Promise((resolve) => {
    const { type = 'error', okText = 'OK' } = options;

    const overlay = ensureOverlay();
    const msgBox = overlay.querySelector('#confirm-message');
    const btnBox = overlay.querySelector('#confirm-buttons');

    msgBox.textContent = message;
    btnBox.innerHTML = `<button class="ui-btn ui-btn-primary" id="confirm-ok">${okText}</button>`;

    overlay.setAttribute('data-type', type);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => (overlay.style.opacity = '1'));

    btnBox.querySelector('#confirm-ok').onclick = () => {
      overlay.style.opacity = '0';
      setTimeout(() => (overlay.style.display = 'none'), 180);
      resolve(true);
    };
  });
}

// ======================================================================
// CONFIRM CHOICE
// ======================================================================
export function confirmChoice(message, choices = [], options = {}) {
  return new Promise((resolve) => {
    const { type = 'info', allowHTML = false } = options;

    const overlay = ensureOverlay();
    const msgBox = overlay.querySelector('#confirm-message');
    const btnBox = overlay.querySelector('#confirm-buttons');

    if (allowHTML) {
      msgBox.innerHTML = message;
    } else {
      msgBox.textContent = message;
    }
    btnBox.innerHTML = choices
      .map((c, i) => `<button class="ui-btn ui-btn-secondary" data-choice="${i}">${c.label}</button>`)
      .join('');

    overlay.setAttribute('data-type', type);
    overlay.style.display = 'flex';
    requestAnimationFrame(() => (overlay.style.opacity = '1'));

    btnBox.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.dataset.choice);
        overlay.style.opacity = '0';
        setTimeout(() => (overlay.style.display = 'none'), 180);
        resolve(choices[idx].value);
      };
    });
  });
}

// ======================================================================
// LOADING
// ======================================================================
export function loading(message = 'Bitte warten…') {
  if (!loadingEl) {
    loadingEl = document.createElement('div');
    loadingEl.id = 'loading-overlay';
    loadingEl.innerHTML = `
      <div id="loading-box">
        <div class="loading-spinner"></div>
        <div class="loading-msg"></div>
      </div>
    `;
    document.body.appendChild(loadingEl);
  }

  loadingEl.querySelector('.loading-msg').textContent = message;
  loadingEl.style.display = 'flex';
  requestAnimationFrame(() => (loadingEl.style.opacity = '1'));

  return {
    close() {
      loadingEl.style.opacity = '0';
      setTimeout(() => (loadingEl.style.display = 'none'), 150);
    },
  };
}

// ======================================================================
// LOGIC POPUP
// ======================================================================
export function logic(findingsWeek, options = {}) {
  const { onSelect = null, draggable = true } = options;

  if (!logicEl) {
    logicEl = document.createElement('div');
    logicEl.id = 'logic-popup';
    logicEl.innerHTML = `
      <div class="logic-header">
        <span class="logic-title">Planprüfung</span>
        <span class="logic-counter"></span>
        <button class="sm-btn sm-btn-icon logic-close" title="Schließen">✕</button>
      </div>
      <div class="logic-body"></div>
    `;
    document.body.appendChild(logicEl);

    // Close
    logicEl.querySelector('.logic-close').onclick = () => {
      logicVisible = false;
      logicEl.style.display = 'none';
    };

    // Optional: Click delegation (vorbereitet)
    // onSelect wird NICHT erzwungen; wenn null, passiert nichts.
    const body = logicEl.querySelector('.logic-body');
    body.addEventListener('click', (e) => {
      if (typeof onSelect !== 'function') return;

      const item = e.target.closest('.logic-item');
      if (!item) return;

      const idx = Number(item.dataset.index);
      if (!Number.isInteger(idx)) return;

      const f =
        findingsWeek?.items && findingsWeek.items[idx]
          ? findingsWeek.items[idx]
          : null;
      if (!f) return;

      onSelect(f);
    });

    // Dragging
    if (draggable) {
      const header = logicEl.querySelector('.logic-header');
      header.style.cursor = 'move';

      header.addEventListener('mousedown', (e) => {
        dragState = {
          x: e.clientX - logicEl.offsetLeft,
          y: e.clientY - logicEl.offsetTop,
        };
        document.body.classList.add('logic-dragging');
      });

      document.addEventListener('mouseup', () => {
        if (!dragState) return;
        dragState = null;
        document.body.classList.remove('logic-dragging');
      });

      document.addEventListener('mousemove', (e) => {
        if (!dragState) return;
        logicEl.style.left = `${e.clientX - dragState.x}px`;
        logicEl.style.top = `${e.clientY - dragState.y}px`;
      });
    }
  }

  logicVisible = true;
  logicEl.style.display = 'block';

  // Wichtig: Immer das aktuelle findingsWeek in UI rendern
  updateLogic(findingsWeek);
}

// ======================================================================
// LOGIC LIVE UPDATE
// ======================================================================
export function updateLogic(findingsWeek) {
  if (!logicEl || !logicVisible) return;

  const body = logicEl.querySelector('.logic-body');
  const counterEl = logicEl.querySelector('.logic-counter');

  body.innerHTML = renderLogic(findingsWeek);

  const errors = findingsWeek?.summary?.errorCount ?? 0;
  const warnings = findingsWeek?.summary?.warningCount ?? 0;

  counterEl.textContent =
    errors > 0
      ? `❌ ${errors}  ⚠ ${warnings}`
      : warnings > 0
        ? `⚠ ${warnings}`
        : '✓ OK';
}

// ======================================================================
// LOGIC RENDERER
// ======================================================================
function renderScopeLabel(finding) {
  const s = finding?.scope || {};

  if (s.type === 'slot') {
    return `${isoToGerman(s.date)} · ${s.slot} Uhr`;
  }

  if (s.type === 'day') {
    return formatDateWeekday(s.date);
  }

  if (s.type === 'employee') {
    return `Mitarbeiter: ${s.employeeId}`;
  }

  return '';
}

function renderRuleTitle(finding) {
  const name = finding?.rule?.name || 'Unbenannte Regel';
  const id = finding?.rule?.id;

  return `
    <div class="logic-rule-title">
      ${name}
      ${id ? `<span class="logic-rule-id">(${id})</span>` : ''}
    </div>
  `;
}

function renderLogic(findingsWeek) {
  if (!findingsWeek || !Array.isArray(findingsWeek.items)) {
    return `<div class="logic-empty">Keine Findings</div>`;
  }

  if (!findingsWeek.items.length) {
    return `<div class="logic-ok">✓ Plan ist freigabefähig</div>`;
  }

  // data-index: wichtig für spätere Interaktion (ohne DOM->Object Mapping Chaos)
  return findingsWeek.items
    .map(
      (f, idx) => `
    <div class="logic-item ${f.severity}" data-index="${idx}">
      ${renderRuleTitle(f)}
      <div class="logic-scope">${renderScopeLabel(f)}</div>
      <div class="logic-message">${f.message}</div>
    </div>
  `
    )
    .join('');
}

// ======================================================================
// DEFAULT EXPORT
// ======================================================================
export const popup = {
  toast,
  alert,
  confirm,
  confirmChoice,
  loading,
  logic,
  updateLogic,
};

export default popup;
