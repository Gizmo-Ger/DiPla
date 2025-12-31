// ==========================================================
// diagnostics.js — FINAL
// Einheitliches Frontend-Logging
// ==========================================================

export const D = {
  // --------------------------------------------------------
  // GLOBAL CONFIG
  // --------------------------------------------------------
  enabled: true,

  level: 'debug', // debug | info | warn | error | off

  levels: {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    off: 99,
  },

  // --------------------------------------------------------
  // INTERNAL
  // --------------------------------------------------------
  _allowed(level) {
    return this.enabled && this.levels[level] >= this.levels[this.level];
  },

  // --------------------------------------------------------
  // SEPARATOR
  // --------------------------------------------------------
  separator(title = '') {
    if (!this._allowed('info')) return;
    console.log(`\n========== ${title} ==========\n`);
  },

  // --------------------------------------------------------
  // INFO
  // --------------------------------------------------------
  info(module, msg, data) {
    if (!this._allowed('info')) return;
    console.log(`%c[INFO] [${module}]`, 'color:#007aff;font-weight:bold;', msg);
    if (data !== undefined) console.log(data);
  },

  // --------------------------------------------------------
  // WARN
  // --------------------------------------------------------
  warn(module, msg, data) {
    if (!this._allowed('warn')) return;
    console.warn(
      `%c[WARN] [${module}]`,
      'color:#e67e22;font-weight:bold;',
      msg
    );
    if (data !== undefined) console.warn(data);
  },

  // --------------------------------------------------------
  // ERROR
  // --------------------------------------------------------
  error(module, msg, err) {
    if (!this._allowed('error')) return;
    console.error(
      `%c[ERROR] [${module}]`,
      'color:#ff3b30;font-weight:bold;',
      msg
    );
    if (err !== undefined) console.error(err);
  },

  // --------------------------------------------------------
  // DEBUG
  // --------------------------------------------------------
  debug(module, msg, data) {
    if (!this._allowed('debug')) return;
    console.debug(
      `%c[DEBUG] [${module}]`,
      'color:#34c759;font-weight:bold;',
      msg
    );
    if (data !== undefined) console.debug(data);
  },
};
