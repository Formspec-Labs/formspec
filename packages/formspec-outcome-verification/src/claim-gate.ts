/** @filedesc Demo-only claim gate that recomputes complete evidence bundles. */

import { canonicalJsonEqual, sha256Digest } from "./canonical.js";
import {
  actionPlansForOutcomeLintClearance,
  issueOutcomeLintClearance,
} from "./clearance.js";
import {
  deriveOutcomeReportId,
  recomputeOutcomeVerificationReport,
} from "./comparator.js";
import { lintOutcomeVerificationReport } from "./lint.js";
import { digestOutcomeSpecificationRuleIndex } from "./rule-index.js";
import { digestRunnerAdmissionContext } from "./runner.js";
import { resolvedTargetIdentityIsValid } from "./target-identity.js";
import type {
  OutcomeClaimEvidence,
  OutcomeClaimGateCaseResult,
  OutcomeClaimGateInput,
  OutcomeClaimGateDependencies,
  OutcomeClaimGateReason,
  OutcomeClaimGateResult,
  OutcomeDemoClaimContext,
  SourcePin,
} from "./types.js";

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export function digestRequiredCaseSet(
  requiredCaseDigests: readonly string[]
): Promise<string> {
  return sha256Digest({
    requiredCaseDigests: [...new Set(requiredCaseDigests)].sort(),
  });
}

export function digestDemoClaimContext(
  context: OutcomeDemoClaimContext
): Promise<string> {
  return sha256Digest({
    ...context,
    requiredCaseDigests: [...new Set(context.requiredCaseDigests)].sort(),
  });
}

function approvalShapeIsValid(
  approval: OutcomeClaimGateInput["humanAdequacyApproval"]
): boolean {
  return (
    approval !== undefined &&
    typeof approval.demoClaimContextDigest === "string" &&
    approval.demoClaimContextDigest.length > 0 &&
    typeof approval.reviewedContext === "object" &&
    approval.reviewedContext !== null &&
    approval.reviewedContext.evidenceProfile === "runtime-demo" &&
    typeof approval.reviewerRef === "string" &&
    approval.reviewerRef.length > 0 &&
    typeof approval.reviewedAt === "string" &&
    Number.isFinite(Date.parse(approval.reviewedAt))
  );
}

function sourcePins(
  evidence: OutcomeClaimEvidence
): [SourcePin, ...SourcePin[]] {
  return structuredClone(evidence.report.inspectedSources);
}

async function evaluateEvidence(
  evidence: OutcomeClaimEvidence,
  input: OutcomeClaimGateInput,
  dependencies: OutcomeClaimGateDependencies
): Promise<OutcomeClaimGateReason[]> {
  const reasons: OutcomeClaimGateReason[] = [];
  const caseDigest = await sha256Digest(evidence.caseDocument);
  if (caseDigest !== evidence.report.caseDigest) {
    reasons.push("REPORT_CASE_DIGEST_MISMATCH");
    return reasons;
  }
  if ((await sha256Digest(evidence.report)) !== evidence.reportDigest) {
    reasons.push("REPORT_DIGEST_MISMATCH");
    return reasons;
  }

  const admission = evidence.admission;
  const resolvedTarget = await dependencies.targetIdentities.resolveTarget(
    admission.target
  );
  if (
    resolvedTarget === undefined ||
    !(await resolvedTargetIdentityIsValid(resolvedTarget, admission.target))
  ) {
    reasons.push("TARGET_CONTEXT_MISMATCH");
    return unique(reasons);
  }
  const expectedReportId = await deriveOutcomeReportId({
    targetIdentityDigest: resolvedTarget.targetIdentityDigest,
    runId: evidence.report.run.runId,
    caseDigest,
  });
  if (evidence.report.id !== expectedReportId) {
    reasons.push("REPORT_ID_MISMATCH");
  }

  if (
    evidence.caseDocument.app.id !== input.claimContext.app.id ||
    evidence.caseDocument.app.version !== input.claimContext.app.version ||
    evidence.caseDocument.app.digest !== input.claimContext.app.digest ||
    admission.target.class !== input.claimContext.target.class ||
    admission.target.ref !== input.claimContext.target.ref
  ) {
    reasons.push("TARGET_CONTEXT_MISMATCH");
  }
  if (
    resolvedTarget.buildRef !== input.claimContext.target.buildRef ||
    resolvedTarget.buildDigest !== input.claimContext.target.buildDigest ||
    evidence.report.run.target.buildRef !== resolvedTarget.buildRef ||
    evidence.report.run.target.buildDigest !== resolvedTarget.buildDigest
  ) {
    reasons.push("TARGET_BUILD_MISMATCH");
  }
  if (
    !canonicalJsonEqual(
      resolvedTarget.implementations,
      input.claimContext.target.implementations
    ) ||
    !canonicalJsonEqual(
      evidence.report.run.target.implementations,
      resolvedTarget.implementations
    ) ||
    resolvedTarget.implementationSetDigest !==
      input.claimContext.target.implementationSetDigest ||
    evidence.report.run.target.implementationSetDigest !==
      resolvedTarget.implementationSetDigest
  ) {
    reasons.push("IMPLEMENTATION_SET_MISMATCH");
  }
  if (
    admission.caseDigest !== caseDigest ||
    admission.runId !== evidence.report.run.runId ||
    !canonicalJsonEqual(resolvedTarget, input.claimContext.target) ||
    !canonicalJsonEqual(resolvedTarget, evidence.report.run.target) ||
    !canonicalJsonEqual(resolvedTarget, evidence.comparison.run.target) ||
    (await digestRunnerAdmissionContext(admission)) !==
      admission.admissionDigest ||
    admission.admissionDigest !== evidence.report.run.admissionContextDigest
  ) {
    reasons.push("TARGET_CONTEXT_MISMATCH");
  }

  try {
    const lintClearance = await issueOutcomeLintClearance(
      {
        caseDocument: evidence.caseDocument,
        context: evidence.lintContext,
      },
      {
        schemaValidation: dependencies.schemaValidation,
        verifier: resolvedTarget.implementations.verifier,
        ownerFacts: dependencies.ownerFacts,
      }
    );
    if (lintClearance.clearanceDigest !== evidence.report.lintClearanceDigest) {
      reasons.push("LINT_CLEARANCE_MISMATCH");
    }
    if (
      lintClearance.actionPlanSetDigest !== evidence.report.actionPlanSetDigest
    ) {
      reasons.push("ACTION_PLAN_SET_MISMATCH");
    }
    const plans = actionPlansForOutcomeLintClearance(lintClearance);
    if (
      plans === undefined ||
      plans.some((plan) => plan.effects.some((effect) => effect.durable))
    ) {
      reasons.push("ACTION_PLAN_SET_MISMATCH");
    }
    const { generatedAt, ...comparison } = evidence.comparison;
    const recomputed = await recomputeOutcomeVerificationReport({
      ...comparison,
      case: evidence.caseDocument,
      caseDigest,
      pairedSources: sourcePins(evidence),
      lintClearance,
      generatedAt,
      executionReceipt: evidence.report.executionReceipt,
    });
    if (!canonicalJsonEqual(recomputed.report, evidence.report)) {
      reasons.push("REPORT_INCONSISTENT");
    }
    const receipt = await dependencies.runBindings.readReceipt(
      evidence.report.executionReceipt.ref
    );
    if (receipt === undefined) {
      reasons.push("EXECUTION_RECEIPT_MISSING");
    } else if (
      receipt.receiptRef !== evidence.report.executionReceipt.ref ||
      receipt.evidenceDigest !==
        evidence.report.executionReceipt.evidenceDigest ||
      receipt.reportId !== evidence.report.id ||
      receipt.reportDigest !== evidence.reportDigest ||
      !canonicalJsonEqual(receipt.evidence, recomputed.evidence)
    ) {
      reasons.push("EXECUTION_RECEIPT_MISMATCH");
    }
  } catch {
    reasons.push("EVIDENCE_BUNDLE_INVALID");
  }

  const report = evidence.report;
  const profileValid =
    input.claimContext.evidenceProfile === "runtime-demo" &&
    evidence.caseDocument.expectedObservations.every((expectation) =>
      expectation.kind === "app-graph"
        ? expectation.requiredEvidence === "structural"
        : expectation.requiredEvidence === "runtime"
    ) &&
    evidence.comparison.observations.every((observation) =>
      observation.kind === "app-graph"
        ? observation.evidenceClass === "structural"
        : observation.evidenceClass === "runtime"
    ) &&
    report.results.every((result) =>
      result.requiredEvidence === "structural"
        ? result.observedEvidence === "structural"
        : result.requiredEvidence === "runtime" &&
          result.observedEvidence === "runtime"
    );
  if (!profileValid) {
    reasons.push("EVIDENCE_PROFILE_MISMATCH");
  }
  if (
    report.diagnostics.some((diagnostic) => diagnostic.code === "STALE_CASE") ||
    report.results.some((result) => result.reasonCode === "STALE_CASE")
  ) {
    reasons.push("REPORT_CASE_DIGEST_MISMATCH");
  } else if (
    report.conclusion === "stale" ||
    report.results.some((result) => result.conclusion === "stale")
  ) {
    reasons.push("REPORT_STALE");
  } else if (
    report.conclusion !== "passed" ||
    report.results.some((result) => result.conclusion !== "passed")
  ) {
    reasons.push("REPORT_NOT_PASSING");
  }
  if (lintOutcomeVerificationReport(report).length > 0) {
    reasons.push("REPORT_INCONSISTENT");
  }
  return unique(reasons);
}

export async function evaluateOutcomeClaimGate(
  input: OutcomeClaimGateInput,
  dependencies: OutcomeClaimGateDependencies
): Promise<OutcomeClaimGateResult> {
  const topLevelReasons: OutcomeClaimGateReason[] = [];
  const required = input.claimContext.requiredCaseDigests;
  const claimContextDigest = await digestDemoClaimContext(input.claimContext);
  const approvalValid = approvalShapeIsValid(input.humanAdequacyApproval);
  const humanAdequacyApproved =
    approvalValid &&
    input.humanAdequacyApproval?.demoClaimContextDigest ===
      claimContextDigest &&
    canonicalJsonEqual(
      input.humanAdequacyApproval?.reviewedContext,
      input.claimContext
    );
  if (!approvalValid) {
    topLevelReasons.push("HUMAN_ADEQUACY_NOT_APPROVED");
  } else if (!humanAdequacyApproved) {
    topLevelReasons.push("HUMAN_ADEQUACY_APPROVAL_STALE");
  }
  if (required.length === 0) {
    topLevelReasons.push("REQUIRED_CASE_SET_EMPTY");
  }
  const resolvedVerificationDependencies = {
    schemaValidator: dependencies.schemaValidation.identity,
    ownerFacts: dependencies.ownerFacts.identity,
    specificationRuleIndexDigest: await digestOutcomeSpecificationRuleIndex(),
  };
  if (
    !canonicalJsonEqual(
      input.claimContext.verificationDependencies,
      resolvedVerificationDependencies
    )
  ) {
    topLevelReasons.push("VERIFICATION_DEPENDENCY_MISMATCH");
  }

  const requiredCounts = new Map<string, number>();
  for (const digest of required) {
    requiredCounts.set(digest, (requiredCounts.get(digest) ?? 0) + 1);
  }
  if ([...requiredCounts.values()].some((count) => count > 1)) {
    topLevelReasons.push("REQUIRED_CASE_DIGEST_DUPLICATE");
  }

  const indexedEvidence = await Promise.all(
    input.evidence.map(async (evidence) => ({
      evidence,
      caseDigest: await sha256Digest(evidence.caseDocument),
    }))
  );
  const cases: OutcomeClaimGateCaseResult[] = [];
  for (const caseDigest of requiredCounts.keys()) {
    const matches = indexedEvidence.filter(
      (entry) => entry.caseDigest === caseDigest
    );
    let reasons: OutcomeClaimGateReason[] = [];
    if (matches.length === 0) {
      reasons = ["REQUIRED_REPORT_MISSING"];
    } else if (matches.length > 1) {
      reasons = ["REPORT_DUPLICATE"];
    } else {
      reasons = await evaluateEvidence(
        matches[0]!.evidence,
        input,
        dependencies
      );
    }
    cases.push({
      caseDigest,
      supported: reasons.length === 0,
      reasons,
      ...(matches.length === 1
        ? { reportId: matches[0]!.evidence.report.id }
        : {}),
    });
  }

  const reasons = unique([
    ...topLevelReasons,
    ...cases.flatMap((result) => result.reasons),
  ]);
  return {
    supported: reasons.length === 0,
    claim: "demo",
    humanAdequacyApproved,
    reasons,
    cases,
  };
}
