// ============================================================
// File: events.js (FINAL v1.0)
// Simple global event bus for clean UI → logic → persist flow
// ============================================================

export function emit(event, detail = {}) {
  document.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(event, handler) {
  document.addEventListener(event, handler);
}

export function off(event, handler) {
  document.removeEventListener(event, handler);
}
