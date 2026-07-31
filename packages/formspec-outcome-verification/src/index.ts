/** @filedesc Public outcome-verification API. */

export {
  canonicalJson,
  canonicalJsonEqual,
  sha256Digest,
} from "./canonical.js";
export {
  digestOutcomeSourceSet,
  issueOutcomeLintClearance,
  OutcomeLintClearanceError,
  validateOutcomeLintClearance,
} from "./clearance.js";
export {
  compareCanonicalFiniteJson,
  compareOutcomeVerification,
  deriveOutcomeReportId,
  generateOutcomeVerificationReport,
} from "./comparator.js";
export {
  digestDemoClaimContext,
  digestRequiredCaseSet,
  evaluateOutcomeClaimGate,
} from "./claim-gate.js";
export {
  lintOutcomeVerificationCase,
  lintOutcomeVerificationReport,
  OUTCOME_EVIDENCE_COMPATIBILITY,
} from "./lint.js";
export {
  digestRunnerAdmissionContext,
  deriveActionInvocationId,
  OutcomeRunnerError,
  runOutcomeVerificationCase,
  type OutcomeRunnerErrorCode,
} from "./runner.js";
export {
  digestOutcomeImplementationSet,
  digestResolvedTargetIdentity,
  resolvedTargetIdentityIsValid,
} from "./target-identity.js";
export {
  digestOutcomeSpecificationRuleIndex,
  OUTCOME_V01_SPECIFICATION_RULE_INDEX,
} from "./rule-index.js";
export type * from "./types.js";
