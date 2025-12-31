// ==========================================================
// File: drag.js (FINAL v3.1 – Hybrid Delta + Snapshot)
// Purpose: Interaktive Zellenbearbeitung + Blockverschiebung
// ==========================================================

import { state } from '../core/state.js';
import { D } from '../core/diagnostics.js';
import { emit } from '../core/events.js';
import { toast } from '../core/popup.js';
import { enqueuePlanSave } from '../core/persist-queue.js';

export class DragService {
  constructor() {
    this.isPainting = false;
    this.isDeleting = false;
    this.isMoving = false;

    this.currentEmployeeId = null;
    this.currentDay = null;
    this.calendarGrid = null;

    this.shiftKeyPressed = false;
    this.moveOrigin = null;
    this.moveStartIndex = null;
    this.originalShiftData = null;
    this.currentMoveOffset = 0;
    this.maxRowIndex = 0;

    this._saveTimeout = null;
    this._saveDelay = 0; // nicht mehr genutzt, aber harmless

    this.nonFunctionalRoles = [];
    this._listenersBound = false;
  }

  // --------------------------------------------------------
  // INITIALISIERUNG
  // --------------------------------------------------------
  initialize(grid) {
    if (!grid) {
      D.error('ui-drag', 'initialize() ohne gültiges Grid');
      return;
    }

    this.calendarGrid = grid;
    this._refreshNonFunctionalRoles();
    this._computeMaxRowIndex();

    if (!this._listenersBound) {
      this._addListeners();
      this._listenersBound = true;
      D.info('ui-drag', 'Drag-Service initialisiert');
    } else {
      D.debug('ui-drag', 'Drag-Service re-used (ohne neue Listener)');
    }
  }

  _refreshNonFunctionalRoles() {
    const roles = state.settings?.roles || {};
    this.nonFunctionalRoles = Object.entries(roles)
      .filter(([, meta]) => meta && meta.functional === false)
      .map(([name]) => name.toLowerCase());

    D.debug('ui-drag', 'nonFunctionalRoles aktualisiert', {
      nonFunctionalRoles: this.nonFunctionalRoles,
    });
  }

  _addListeners() {
    this.calendarGrid.addEventListener('mousedown', (e) => this._start(e));
    this.calendarGrid.addEventListener('mousemove', (e) => this._move(e));
    this.calendarGrid.addEventListener('dblclick', (e) => this._reset(e));

    document.addEventListener('mouseup', (e) => this._stop(e));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift' && !this.shiftKeyPressed) {
        this.shiftKeyPressed = true;
        if (this.calendarGrid) this.calendarGrid.style.cursor = 'grab';
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.shiftKeyPressed = false;
        if (this.calendarGrid) this.calendarGrid.style.cursor = '';
        this._clearBlockHighlights();
      }
    });
  }

  // ========================================================
  // START
  // ========================================================
  _start(e) {
    if (e.button !== 0) return;

    const cell = e.target.closest('.time-cell');
    if (!cell) return;

    if (this.isLocked(cell)) {
      D.debug('ui-drag', 'Cell locked – keine Aktion', this._cellMeta(cell));
      return;
    }

    this.isDeleting = e.altKey === true;
    this.isMoving = this.shiftKeyPressed === true;

    if (!this.isDeleting && !this.isMoving && !state.selectedRole) {
      toast('Keine Rolle ausgewählt', { type: 'warn', duration: 1200 });
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    this.isPainting = true;
    this.currentEmployeeId = cell.dataset.employeeId;
    this.currentDay = cell.dataset.day;
    this.currentMoveOffset = 0;

    if (this.isMoving) {
      this.moveOrigin = cell;
      this.moveStartIndex = this._getCellIndex(cell);
      this.originalShiftData = this._getConnected(cell);
    } else {
      this.moveOrigin = null;
      this.moveStartIndex = null;
      this.originalShiftData = null;
    }

    this._process(cell);

    e.preventDefault();
    e.stopPropagation();
  }

  // ========================================================
  // MOVE
  // ========================================================
  _move(e) {
    if (!this.isPainting) return;

    const cell = e.target.closest('.time-cell');
    if (!cell) return;

    if (
      cell.dataset.employeeId !== this.currentEmployeeId ||
      cell.dataset.day !== this.currentDay
    ) {
      return;
    }

    if (this.isMoving) {
      const idx = this._getCellIndex(cell);
      const offset = idx - (this.moveStartIndex ?? idx);

      if (offset !== this.currentMoveOffset) {
        this.currentMoveOffset = offset;
        this._preview(offset);
      }
    } else {
      this._process(cell);
    }

    e.preventDefault();
  }

  // ========================================================
  // STOP
  // ========================================================
  _stop(/*e*/) {
    if (!this.isPainting) return;

    if (this.isMoving && this.currentMoveOffset !== 0) {
      this._applyMove();
    }

    this._clearBlockHighlights();

    this.isPainting = false;
    this.isDeleting = false;
    this.isMoving = false;
    this.currentEmployeeId = null;
    this.currentDay = null;
    this.moveOrigin = null;
    this.moveStartIndex = null;
    this.originalShiftData = null;
    this.currentMoveOffset = 0;

    this._saveDebounced();
  }

  _reset(e) {
    const c = e.target.closest('.time-cell');
    if (!c || this.isLocked(c)) return;

    this._clearCell(c);
    this._saveDebounced();
  }

  // ========================================================
  // PROCESS
  // ========================================================
  _process(c) {
    if (this.isDeleting) {
      this._clearCell(c);
    } else if (!this.isMoving) {
      this._paint(c);
    }
  }

  _paint(c) {
    const role = state.selectedRole;
    if (!role || this.isLocked(c)) return;

    this._setRole(c, role);
  }

  _clearCell(c) {
    if (this.isLocked(c)) return;

    const iso = c.dataset.date;
    const emp = c.dataset.employeeId;
    const hr = c.dataset.hour;

    if (state.plan?.days?.[iso]?.[emp]?.[hr]) {
      delete state.plan.days[iso][emp][hr];
    }

    c.removeAttribute('data-role');
    c.style.backgroundColor = '';
  }

  // ========================================================
  // BLOCK PREVIEW / APPLY
  // ========================================================
  _preview(offset) {
    this._clearBlockHighlights();
    if (!this.originalShiftData || !this.originalShiftData.length) return;

    for (const s of this.originalShiftData) {
      const target = this._cellByRow(s.index + offset);
      if (target) {
        target.classList.add('drag-preview');
      }
    }
  }

  _applyMove() {
    if (!this.originalShiftData || !this.originalShiftData.length) return;

    const offset = this.currentMoveOffset;
    if (!offset) return;

    const newCells = [];

    for (const s of this.originalShiftData) {
      const newRow = s.index + offset;
      if (newRow < 0 || newRow > this.maxRowIndex) return;

      const target = this._cellByRow(newRow);
      if (!target || this.isLocked(target)) return;

      newCells.push({ target, role: s.role });
    }

    for (const s of this.originalShiftData) {
      const old = this._cellByRow(s.index);
      if (old && !this.isLocked(old)) {
        this._clearCell(old);
      }
    }

    for (const n of newCells) {
      this._setRole(n.target, n.role);
    }

    this._saveDebounced();
  }

  _setRole(c, role) {
    if (!role || this.isLocked(c)) return;

    const color = state.settings.roles?.[role]?.color || '#ccc';

    c.dataset.role = role;
    c.style.backgroundColor = color;

    const iso = c.dataset.date;
    const emp = c.dataset.employeeId;
    const hr = c.dataset.hour;

    if (!state.plan.days) state.plan.days = {};
    if (!state.plan.days[iso]) state.plan.days[iso] = {};
    if (!state.plan.days[iso][emp]) state.plan.days[iso][emp] = {};

    state.plan.days[iso][emp][hr] = role;
  }

  // ========================================================
  // LOCK-LOGIK
  // ========================================================
  isLocked(cell) {
    if (!cell) return false;

    const iso = cell.dataset.date;
    const empId = cell.dataset.employeeId;
    const empDay = state.plan?.days?.[iso]?.[empId] || {};

    if (empDay._absence) return true;
    if (empDay._holiday) return true;

    const role = (cell.dataset.role || '').toLowerCase();
    if (role && this.nonFunctionalRoles.includes(role)) return true;

    return false;
  }

  // ========================================================
  // UTILS
  // ========================================================
  _getCellIndex(c) {
    const n = Number(c.dataset.row);
    return Number.isNaN(n) ? 0 : n;
  }

  _cellByRow(row) {
    if (
      !this.calendarGrid ||
      this.currentEmployeeId == null ||
      !this.currentDay
    )
      return null;

    return this.calendarGrid.querySelector(
      `.time-cell[data-row="${row}"][data-employee-id="${this.currentEmployeeId}"][data-day="${this.currentDay}"]`
    );
  }

  _getConnected(origin) {
    const idx = this._getCellIndex(origin);
    const role = origin.dataset.role;
    if (!role) return [];

    const rows = [idx];

    let up = idx - 1;
    while (up >= 0) {
      const c = this._cellByRow(up);
      if (!c || c.dataset.role !== role) break;
      rows.push(up);
      up--;
    }

    let dn = idx + 1;
    while (dn <= this.maxRowIndex) {
      const c = this._cellByRow(dn);
      if (!c || c.dataset.role !== role) break;
      rows.push(dn);
      dn++;
    }

    return rows.sort((a, b) => a - b).map((r) => ({ index: r, role }));
  }

  _computeMaxRowIndex() {
    if (!this.calendarGrid) {
      this.maxRowIndex = 0;
      return;
    }

    const cells = [
      ...this.calendarGrid.querySelectorAll('.time-cell[data-row]'),
    ];
    if (!cells.length) {
      this.maxRowIndex = 0;
      return;
    }

    let max = 0;
    for (const c of cells) {
      const idx = Number(c.dataset.row);
      if (!Number.isNaN(idx) && idx > max) max = idx;
    }

    this.maxRowIndex = max;
    D.debug('ui-drag', 'maxRowIndex ermittelt', {
      maxRowIndex: this.maxRowIndex,
    });
  }

  _clearBlockHighlights() {
    if (!this.calendarGrid) return;
    this.calendarGrid
      .querySelectorAll('.drag-preview')
      .forEach((c) => c.classList.remove('drag-preview'));
  }

  _cellMeta(cell) {
    return {
      date: cell.dataset.date,
      day: cell.dataset.day,
      employeeId: cell.dataset.employeeId,
      hour: cell.dataset.hour,
      role: cell.dataset.role || null,
    };
  }

  // ========================================================
  // SAVE (JETZT SYNCHRON)
  // ========================================================
  _saveDebounced() {
    // Kein Timer mehr – wir sichern sofort.
    if (!state.plan) return;

    if (state.plan.status === 'approved') {
      state.plan.status = 'draft';
    }

    D.debug('ui-drag', 'Planänderung durch Drag', {
      employeeId: this.currentEmployeeId,
      day: this.currentDay,
    });

    enqueuePlanSave(() => {
      emit('plan-modified', { source: 'drag' });
    });
  }
}
