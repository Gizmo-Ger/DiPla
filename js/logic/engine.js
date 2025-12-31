// ==========================================================
// js/logic/engine.js
// Zentrale Logik-Engine – FINAL, gehärtet
// ==========================================================

import { getAllRules } from './rules/index.js';
import { analyzePlan } from './analyze.js';

// ==========================================================
// PUBLIC API
// ==========================================================

export function runLogic({ plan, settings, context }) {
  const findings = [];

  // --------------------------------------------------------
  // 0) Harte Vorbedingungen
  // --------------------------------------------------------
  if (!plan || !settings) {
    console.warn('[logic] Plan oder Settings fehlen – Logic abgebrochen');
    return emptyInvalidResult(context);
  }

  if (
    !context ||
    !Number.isInteger(context.year) ||
    !Number.isInteger(context.week)
  ) {
    throw new Error('[logic] Context (year/week) fehlt oder ungültig');
  }

  // --------------------------------------------------------
  // 1) Analyse erzeugen
  // --------------------------------------------------------
  let analysis;
  try {
    analysis = analyzePlan({ plan, settings, context });
  } catch (err) {
    console.error('[logic] analyzePlan fehlgeschlagen', err);
    return emptyInvalidResult(context);
  }

  if (!analysis || typeof analysis !== 'object' || !analysis.days) {
    console.warn('[logic] Ungültige Analyse – Logic abgebrochen');
    return emptyInvalidResult(context);
  }

  // --------------------------------------------------------
  // 2) Helpers (read-only, deterministisch)
  // --------------------------------------------------------
  const helpers = {
    countByRoles(rolesCountMap, roleIds = []) {
      if (!rolesCountMap || typeof rolesCountMap !== 'object') return 0;
      if (!Array.isArray(roleIds)) return 0;

      let sum = 0;
      for (const roleId of roleIds) {
        sum += rolesCountMap[roleId] || 0;
      }
      return sum;
    },

    getStaff(empId) {
      if (!empId) return null;
      return settings?.staff?.find((s) => s.id === empId) || null;
    },
  };

  // --------------------------------------------------------
  // 3) Regeln laden
  // --------------------------------------------------------
  let rules = [];
  try {
    rules = getAllRules() || [];
  } catch (err) {
    console.error('[logic] getAllRules fehlgeschlagen', err);
    return emptyInvalidResult(context);
  }

  // --------------------------------------------------------
  // 4) Rule-Meta indexieren
  // --------------------------------------------------------
  const ruleMetaById = {};
  for (const r of rules) {
    if (r?.meta?.id) ruleMetaById[r.meta.id] = r.meta;
  }

  // --------------------------------------------------------
  // 5) Regeln ausführen
  // --------------------------------------------------------
  for (const rule of rules) {
    if (!rule?.meta?.id || typeof rule.evaluate !== 'function') continue;

    const ruleId = rule.meta.id;
    const ruleState = settings?.logic?.rules?.[ruleId] || {};

    const isActive =
      rule.meta.mandatory ||
      ruleState.active === true ||
      ruleState.enabled === true;

    if (!isActive) continue;

    const ruleConfig = buildRuleConfig(rule.meta, ruleState);

    try {
      const result = rule.evaluate(analysis, ruleConfig, helpers);
      if (Array.isArray(result)) findings.push(...result);
    } catch (err) {
      console.error(`[logic] Regel ${ruleId} fehlgeschlagen`, err);
    }
  }

  // --------------------------------------------------------
  // 6) Normalisieren & Aggregieren
  // --------------------------------------------------------
  const normalized = normalizeFindings(findings, ruleMetaById);
  return aggregateFindings(normalized, context);
}

// ==========================================================
// INTERNAL HELPERS
// ==========================================================

function buildRuleConfig(meta, ruleState) {
  const params = {};
  if (meta?.params) {
    for (const [key, def] of Object.entries(meta.params)) {
      params[key] = ruleState?.params?.[key] ?? def.default;
    }
  }
  return { active: true, params };
}

function normalizeSeverity(raw) {
  if (raw === 'error') return 'error';
  if (raw === 'warning') return 'warning';
  return 'info';
}

function normalizeFindings(items, ruleMetaById) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((f) => f?.rule?.id) // 🔒 harte Validierung
    .map((f, idx) => {
      const ruleId = f.rule.id;

      return {
        id: f.id || `${ruleId}:${idx}`,
        severity: normalizeSeverity(f.severity),
        rule: {
          id: ruleId,
          name: ruleMetaById[ruleId]?.name || ruleId,
        },
        scope: f.scope || {},
        message: f.message || '',
        context: f.context || {},
      };
    });
}

function aggregateFindings(items, context) {
  let errorCount = 0;
  let warningCount = 0;
  const byDay = {};

  for (const f of items) {
    if (f.severity === 'error') errorCount++;
    if (f.severity === 'warning') warningCount++;

    const d = f.scope?.date;
    if (d) {
      byDay[d] ??= { errors: 0, warnings: 0 };
      if (f.severity === 'error') byDay[d].errors++;
      if (f.severity === 'warning') byDay[d].warnings++;
    }
  }

  return {
    week: {
      year: context.year,
      week: context.week,
    },
    status: {
      hasErrors: errorCount > 0,
      hasWarnings: warningCount > 0,
      approvable: errorCount === 0,
    },
    summary: {
      errorCount,
      warningCount,
      byDay,
    },
    items,
  };
}

// ----------------------------------------------------------
// Empty Results
// ----------------------------------------------------------

function emptyInvalidResult(context) {
  return {
    week: {
      year: context?.year ?? null,
      week: context?.week ?? null,
    },
    status: {
      hasErrors: false,
      hasWarnings: false,
      approvable: false,
    },
    summary: {
      errorCount: 0,
      warningCount: 0,
      byDay: {},
    },
    items: [],
  };
}
