// ==========================================================
// js/logic/rules/index.js
// Regel-Registry
// ==========================================================

import { assistPerDoctorRule } from './rule-assist-per-doctor.js';
import { roomCapacityRule } from './rule-room-capacity.js';
import { frontdeskCoverageRule } from './rule-frontdesk-coverage.js';
import { jvaCoverageRule } from './rule-jva-coverage.js';
import { saturdayCompensationRule } from './rule-saturday-compensation.js';
import { itnRule } from './rule-itn.js';
import { prophylaxeOpportunityRule } from './rule-prophylaxe-opportunity.js';
import { contractHoursRule } from './rule-contract-hours.js';
import { schoolHolidaysRule } from './rule-schoolholiday.js';
import { prophylaxeMissingRule } from './rule-prophylaxe-missing.js';
import { emptyPlanRule } from './rule-emptyPlan.js';

export function getAllRules() {
  return [
    assistPerDoctorRule,
    roomCapacityRule,
    frontdeskCoverageRule,
    jvaCoverageRule,
    saturdayCompensationRule,
    itnRule,
    prophylaxeOpportunityRule,
    contractHoursRule,
    schoolHolidaysRule,
    prophylaxeMissingRule,
    emptyPlanRule,
  ];
}
