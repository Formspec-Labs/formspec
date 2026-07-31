/** @filedesc Deterministic comparison of declared expectations and normalized facts. */

import type {
  ActionInvocationObservedPayload,
  AppGraphObservedPayload,
  ComparatorRequest,
  Conclusion,
  DataSourceResultObservedPayload,
  ExpectationResult,
  ExpectedObservation,
  FiniteJson,
  NormalizedObservation,
  ObservationBoundary,
  OutcomeVerificationReport,
  ReasonCode,
  RenderedOutputObservedPayload,
  ResponseObservedPayload,
  RouteStateObservedPayload,
  SourcePin,
  StepBinding,
  ValidationReportObservedPayload,
} from "@formspec-org/types";

import {
  canonicalJson,
  canonicalJsonEqual,
  sha256Digest,
} from "./canonical.js";
import { validateOutcomeLintClearance } from "./clearance.js";
import { consumeOutcomeRunCustody } from "./custody.js";
import { resolvedTargetIdentityIsValid } from "./target-identity.js";
import type {
  EvidenceClass,
  OutcomeComparisonInput,
  OutcomeComparisonResult,
  OutcomeComparatorDependencies,
  OutcomeComparatorInput,
  OutcomeExecutionEvidence,
  OutcomeObservationKind,
} from "./types.js";

type ComparatorView = Omit<
  ComparatorRequest,
  "reportId" | "lintClearanceDigest" | "generatedAt" | "actionPlanSetDigest"
> & {
  run: OutcomeComparatorInput["run"];
};

interface ExpectedBaseView {
  id: string;
  kind: OutcomeObservationKind;
  checkpointRef: string;
  requiredEvidence: EvidenceClass;
  stepRef?: string;
  ruleRefs: unknown[];
}

type ExpectedView =
  | (ExpectedBaseView & {
      kind: "app-graph";
      subject: AppGraphObservedPayload["subject"];
      relation: AppGraphObservedPayload["relation"];
      state: AppGraphObservedPayload["state"];
    })
  | (ExpectedBaseView & {
      kind: "validation-report";
      definitionRef: string;
      definitionDigest: string;
      valid: boolean;
      containsIssues?: Array<{ path: string; code: string }>;
      excludesIssues?: Array<{ path: string; code: string }>;
    })
  | (ExpectedBaseView & {
      kind: "response";
      definitionRef: string;
      definitionDigest: string;
      status?: ResponseObservedPayload["status"];
      item?: {
        path: string;
        presence: "present" | "absent";
        value?: FiniteJson;
      };
    })
  | (ExpectedBaseView & {
      kind: "action-invocation";
      actionsRef: string;
      actionsDigest: string;
      actionId: string;
      terminal: ActionInvocationObservedPayload["terminal"];
      effects: ActionInvocationObservedPayload["effects"];
    })
  | (ExpectedBaseView & {
      kind: "data-source-result";
      catalogRef: string;
      catalogDigest: string;
      sourceId: string;
      state: DataSourceResultObservedPayload["state"];
      freshness?: DataSourceResultObservedPayload["freshness"];
      recordId?: string;
      valueDigest?: string;
      recordStepRef?: string;
    })
  | (ExpectedBaseView & {
      kind: "route-state";
      surfaceRef: string;
      surfaceDigest: string;
      routeId: string;
    })
  | (ExpectedBaseView & {
      kind: "rendered-output";
      node: RenderedOutputObservedPayload["node"];
      rendered: true;
      operable?: boolean;
      semanticValue?: FiniteJson;
    });

interface ObservationView {
  id: string;
  expectationId: string;
  kind: OutcomeObservationKind;
  evidenceClass: EvidenceClass;
  source: SourcePin;
  boundary: ObservationBoundary;
  checkpointBindingRef: string;
  stepBindingRef?: string;
  evidenceRef?: string;
  adapter: ComparatorView["run"]["target"]["implementations"]["adapter"];
  payload:
    | AppGraphObservedPayload
    | ValidationReportObservedPayload
    | ResponseObservedPayload
    | ActionInvocationObservedPayload
    | DataSourceResultObservedPayload
    | RouteStateObservedPayload
    | RenderedOutputObservedPayload;
}

const CONCLUSION_PRECEDENCE: Record<Conclusion, number> = {
  passed: 0,
  indeterminate: 1,
  failed: 2,
  stale: 3,
};

function conclusionFor(results: readonly ExpectationResult[]): Conclusion {
  return results.reduce<Conclusion>(
    (worst, result) =>
      CONCLUSION_PRECEDENCE[result.conclusion] > CONCLUSION_PRECEDENCE[worst]
        ? result.conclusion
        : worst,
    "passed"
  );
}

function asExpectedView(expectation: ExpectedObservation): ExpectedView {
  return expectation as unknown as ExpectedView;
}

function asObservationView(
  observation: NormalizedObservation
): ObservationView {
  return observation as unknown as ObservationView;
}

function correlationRefs(observation: ObservationView): string[] {
  const payload = observation.payload;
  switch (observation.kind) {
    case "app-graph":
      return [];
    case "validation-report":
    case "response":
      return [(payload as ResponseObservedPayload).responseId];
    case "action-invocation": {
      const action = payload as ActionInvocationObservedPayload;
      return [
        action.invocationId,
        ...(action.responseId === undefined ? [] : [action.responseId]),
      ];
    }
    case "data-source-result":
      return [(payload as DataSourceResultObservedPayload).requestId];
    case "route-state":
      return [(payload as RouteStateObservedPayload).routeInstanceId];
    case "rendered-output":
      return [(payload as RenderedOutputObservedPayload).renderInstanceId];
    default:
      return [];
  }
}

function expectationResult(
  expectation: ExpectedView,
  conclusion: Conclusion,
  reasonCode: ReasonCode,
  observation?: ObservationView,
  sourceRefs: SourcePin[] = []
): ExpectationResult {
  return {
    expectationId: expectation.id,
    conclusion,
    reasonCode,
    requiredEvidence: expectation.requiredEvidence,
    ...(observation === undefined
      ? {}
      : {
          observedEvidence: observation.evidenceClass,
          observedSummary: observation.payload as unknown as FiniteJson,
          observationBoundary: observation.boundary,
          ...(observation.stepBindingRef === undefined
            ? {}
            : { stepBindingRef: observation.stepBindingRef }),
          correlationRefs: correlationRefs(observation),
        }),
    sourceRefs,
    evidenceRefs:
      observation?.evidenceRef === undefined ? [] : [observation.evidenceRef],
  };
}

function parseBoundary(
  boundary: ObservationBoundary
): { start: number; end: number } | undefined {
  const start = Date.parse(boundary.startedAt);
  const end = Date.parse(boundary.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return undefined;
  }
  return { start, end };
}

function boundaryContains(
  outer: ObservationBoundary,
  inner: ObservationBoundary
): boolean {
  const parsedOuter = parseBoundary(outer);
  const parsedInner = parseBoundary(inner);
  return (
    parsedOuter !== undefined &&
    parsedInner !== undefined &&
    parsedOuter.start <= parsedInner.start &&
    parsedOuter.end >= parsedInner.end
  );
}

function sourceState(
  expected: SourcePin,
  sources: readonly SourcePin[]
): "current" | "missing" | "ambiguous" | "stale" {
  const matches = sources.filter(
    (source) => source.artifactRef === expected.artifactRef
  );
  if (matches.length === 0) {
    return "missing";
  }
  if (matches.length > 1) {
    return "ambiguous";
  }
  return matches[0]?.artifactDigest === expected.artifactDigest
    ? "current"
    : "stale";
}

function expectedPrimarySource(expectation: ExpectedView): SourcePin {
  switch (expectation.kind) {
    case "app-graph":
      return {
        artifactRef: expectation.subject.artifactRef,
        artifactDigest: expectation.subject.artifactDigest,
      };
    case "validation-report":
    case "response":
      return {
        artifactRef: expectation.definitionRef,
        artifactDigest: expectation.definitionDigest,
      };
    case "action-invocation":
      return {
        artifactRef: expectation.actionsRef,
        artifactDigest: expectation.actionsDigest,
      };
    case "data-source-result":
      return {
        artifactRef: expectation.catalogRef,
        artifactDigest: expectation.catalogDigest,
      };
    case "rendered-output":
      return {
        artifactRef: expectation.node.artifactRef,
        artifactDigest: expectation.node.artifactDigest,
      };
    case "route-state":
      return {
        artifactRef: expectation.surfaceRef,
        artifactDigest: expectation.surfaceDigest,
      };
  }
}

function requiredSources(
  request: ComparatorView,
  expectation: ExpectedView
): SourcePin[] {
  const pins: SourcePin[] = [
    {
      artifactRef: request.case.need.documentRef,
      artifactDigest: request.case.need.documentDigest,
    },
    {
      artifactRef: request.case.app.id,
      artifactDigest: request.case.app.digest,
    },
    expectedPrimarySource(expectation),
  ];
  if (request.case.experience !== undefined) {
    pins.push({
      artifactRef: request.case.experience.documentRef,
      artifactDigest: request.case.experience.documentDigest,
    });
  }
  for (const ruleRef of expectation.ruleRefs) {
    if (
      typeof ruleRef === "object" &&
      ruleRef !== null &&
      "kind" in ruleRef &&
      ruleRef.kind === "artifact-declaration" &&
      "subject" in ruleRef &&
      typeof ruleRef.subject === "object" &&
      ruleRef.subject !== null &&
      "artifactRef" in ruleRef.subject &&
      "artifactDigest" in ruleRef.subject
    ) {
      pins.push({
        artifactRef: String(ruleRef.subject.artifactRef),
        artifactDigest: String(ruleRef.subject.artifactDigest),
      });
    }
  }
  const unique = new Map<string, SourcePin>();
  for (const pin of pins) {
    unique.set(`${pin.artifactRef}\u0000${pin.artifactDigest}`, pin);
  }
  return [...unique.values()];
}

function sameValidationIssues(
  expected: readonly { path: string; code: string }[] | undefined,
  actual: readonly { path: string; code: string }[],
  mode: "contains" | "excludes"
): boolean {
  if (expected === undefined) {
    return true;
  }
  const key = (issue: { path: string; code: string }) =>
    JSON.stringify([issue.path, issue.code]);
  const actualSet = new Set(actual.map(key));
  return expected.every((issue) =>
    mode === "contains" ? actualSet.has(key(issue)) : !actualSet.has(key(issue))
  );
}

function compareValidation(
  expected: Extract<ExpectedView, { kind: "validation-report" }>,
  observed: ValidationReportObservedPayload
): boolean {
  return (
    expected.definitionRef === observed.definitionRef &&
    expected.definitionDigest === observed.definitionDigest &&
    expected.valid === observed.valid &&
    sameValidationIssues(
      expected.containsIssues,
      observed.issues,
      "contains"
    ) &&
    sameValidationIssues(expected.excludesIssues, observed.issues, "excludes")
  );
}

function compareResponse(
  expected: Extract<ExpectedView, { kind: "response" }>,
  observed: ResponseObservedPayload
): boolean {
  if (
    expected.definitionRef !== observed.definitionRef ||
    expected.definitionDigest !== observed.definitionDigest ||
    (expected.status !== undefined && expected.status !== observed.status)
  ) {
    return false;
  }
  if (expected.item === undefined) {
    return false;
  }
  if (
    observed.item === undefined ||
    expected.item.path !== observed.item.path ||
    expected.item.presence !== observed.item.presence
  ) {
    return false;
  }
  if (expected.item.presence === "absent") {
    return observed.item.value === undefined;
  }
  return canonicalJsonEqual(expected.item.value, observed.item.value);
}

function compareAction(
  expected: Extract<ExpectedView, { kind: "action-invocation" }>,
  observed: ActionInvocationObservedPayload
): boolean {
  return (
    expected.actionsRef === observed.actionsRef &&
    expected.actionsDigest === observed.actionsDigest &&
    expected.actionId === observed.actionId &&
    expected.terminal === observed.terminal &&
    canonicalJsonEqual(expected.effects, observed.effects)
  );
}

function compareDataSource(
  expected: Extract<ExpectedView, { kind: "data-source-result" }>,
  observed: DataSourceResultObservedPayload
): boolean {
  return (
    expected.catalogRef === observed.catalogRef &&
    expected.catalogDigest === observed.catalogDigest &&
    expected.sourceId === observed.sourceId &&
    expected.state === observed.state &&
    (expected.freshness === undefined ||
      expected.freshness === observed.freshness) &&
    (expected.recordId === undefined ||
      expected.recordId === observed.recordId) &&
    (expected.valueDigest === undefined ||
      expected.valueDigest === observed.valueDigest)
  );
}

function compareRendered(
  expected: Extract<ExpectedView, { kind: "rendered-output" }>,
  observed: RenderedOutputObservedPayload
): boolean {
  return (
    canonicalJsonEqual(expected.node, observed.node) &&
    expected.rendered === observed.rendered &&
    (expected.operable === undefined ||
      expected.operable === observed.operable) &&
    (expected.semanticValue === undefined ||
      canonicalJsonEqual(expected.semanticValue, observed.semanticValue))
  );
}

function compareRouteState(
  expected: Extract<ExpectedView, { kind: "route-state" }>,
  observed: RouteStateObservedPayload
): boolean {
  return (
    expected.surfaceRef === observed.surfaceRef &&
    expected.surfaceDigest === observed.surfaceDigest &&
    expected.routeId === observed.routeId
  );
}

function payloadMatches(
  expectation: ExpectedView,
  observation: ObservationView
): boolean {
  switch (expectation.kind) {
    case "app-graph":
      return canonicalJsonEqual(
        {
          subject: expectation.subject,
          relation: expectation.relation,
          state: expectation.state,
        },
        observation.payload as AppGraphObservedPayload
      );
    case "validation-report":
      return compareValidation(
        expectation,
        observation.payload as ValidationReportObservedPayload
      );
    case "response":
      return compareResponse(
        expectation,
        observation.payload as ResponseObservedPayload
      );
    case "action-invocation":
      return compareAction(
        expectation,
        observation.payload as ActionInvocationObservedPayload
      );
    case "data-source-result":
      return compareDataSource(
        expectation,
        observation.payload as DataSourceResultObservedPayload
      );
    case "rendered-output":
      return compareRendered(
        expectation,
        observation.payload as RenderedOutputObservedPayload
      );
    case "route-state":
      return compareRouteState(
        expectation,
        observation.payload as RouteStateObservedPayload
      );
  }
}

function bindingMatchesObservation(
  binding: StepBinding,
  observation: ObservationView,
  bindings: readonly StepBinding[]
): boolean {
  switch (observation.kind) {
    case "app-graph":
      return true;
    case "validation-report": {
      const payload = observation.payload as ValidationReportObservedPayload;
      if (
        (binding.kind !== "set-item" && binding.kind !== "activate-control") ||
        binding.responseId !== payload.responseId ||
        binding.responseRevision !== payload.responseRevision
      ) {
        return false;
      }
      if (binding.kind === "set-item") {
        return (
          binding.definitionRef === payload.definitionRef &&
          binding.definitionDigest === payload.definitionDigest
        );
      }
      const owners = bindings.filter(
        (candidate): candidate is Extract<StepBinding, { kind: "set-item" }> =>
          candidate.kind === "set-item" &&
          candidate.renderInstanceId === binding.renderInstanceId &&
          candidate.responseId === payload.responseId &&
          candidate.responseRevision <= payload.responseRevision
      );
      const ownerPins = new Set(
        owners.map(
          (owner) => `${owner.definitionRef}\u0000${owner.definitionDigest}`
        )
      );
      return (
        owners.length > 0 &&
        ownerPins.size === 1 &&
        ownerPins.has(
          `${payload.definitionRef}\u0000${payload.definitionDigest}`
        )
      );
    }
    case "response": {
      const payload = observation.payload as ResponseObservedPayload;
      if (
        (binding.kind !== "set-item" && binding.kind !== "activate-control") ||
        binding.responseId !== payload.responseId ||
        binding.responseRevision !== payload.responseRevision
      ) {
        return false;
      }
      if (binding.kind === "set-item") {
        return (
          binding.definitionRef === payload.definitionRef &&
          binding.definitionDigest === payload.definitionDigest
        );
      }
      const owners = bindings.filter(
        (candidate): candidate is Extract<StepBinding, { kind: "set-item" }> =>
          candidate.kind === "set-item" &&
          candidate.renderInstanceId === binding.renderInstanceId &&
          candidate.responseId === payload.responseId &&
          candidate.responseRevision <= payload.responseRevision
      );
      const ownerPins = new Set(
        owners.map(
          (owner) => `${owner.definitionRef}\u0000${owner.definitionDigest}`
        )
      );
      return (
        owners.length > 0 &&
        ownerPins.size === 1 &&
        ownerPins.has(
          `${payload.definitionRef}\u0000${payload.definitionDigest}`
        )
      );
    }
    case "action-invocation": {
      const payload = observation.payload as ActionInvocationObservedPayload;
      return (
        binding.kind === "activate-control" &&
        binding.actionsRef === payload.actionsRef &&
        binding.actionsDigest === payload.actionsDigest &&
        binding.actionId === payload.actionId &&
        binding.invocationId === payload.invocationId &&
        canonicalJsonEqual(binding.effects, payload.effects) &&
        (payload.responseId === undefined ||
          binding.responseId === payload.responseId)
      );
    }
    case "data-source-result": {
      const payload = observation.payload as DataSourceResultObservedPayload;
      return (
        binding.kind === "open-route" &&
        binding.dataSourceRequestIds?.includes(payload.requestId) === true
      );
    }
    case "rendered-output": {
      const payload = observation.payload as RenderedOutputObservedPayload;
      return (
        (binding.kind === "open-route" ||
          binding.kind === "set-item" ||
          binding.kind === "activate-control") &&
        binding.renderInstanceId === payload.renderInstanceId
      );
    }
    case "route-state": {
      const payload = observation.payload as RouteStateObservedPayload;
      return (
        (binding.kind === "open-route" ||
          binding.kind === "activate-control") &&
        binding.routeInstanceId === payload.routeInstanceId
      );
    }
  }
}

function hasRequiredOwnerEvidence(observation: ObservationView): boolean {
  if (observation.kind === "validation-report") {
    const payload = observation.payload as ValidationReportObservedPayload;
    return (
      Number.isInteger(payload.responseRevision) &&
      payload.responseRevision >= 0 &&
      Array.isArray(payload.issues) &&
      (payload.valid || payload.issues.length > 0)
    );
  }
  if (observation.kind === "response") {
    const payload = observation.payload as ResponseObservedPayload;
    return (
      Number.isInteger(payload.responseRevision) &&
      payload.responseRevision >= 0 &&
      /^sha256:[0-9a-f]{64}$/.test(payload.responseDigest)
    );
  }
  return true;
}

function compareOne(
  request: ComparatorView,
  rawExpectation: ExpectedObservation,
  matching: readonly NormalizedObservation[],
  caseDigestMatches: boolean,
  ambiguousObservationIds: ReadonlySet<string>
): ExpectationResult {
  const expectation = asExpectedView(rawExpectation);
  const sources = requiredSources(request, expectation);
  if (!caseDigestMatches) {
    return expectationResult(
      expectation,
      "stale",
      "STALE_CASE",
      undefined,
      sources
    );
  }

  for (const source of sources) {
    const state = sourceState(source, request.pairedSources);
    if (state === "stale") {
      return expectationResult(
        expectation,
        "stale",
        "STALE_SOURCE",
        undefined,
        sources
      );
    }
    if (state === "missing" || state === "ambiguous") {
      return expectationResult(
        expectation,
        "indeterminate",
        state === "missing" ? "UNBOUND_EVIDENCE" : "AMBIGUOUS_EVIDENCE",
        undefined,
        sources
      );
    }
  }

  if (matching.length === 0) {
    return expectationResult(
      expectation,
      "indeterminate",
      "MISSING_EVIDENCE",
      undefined,
      sources
    );
  }
  if (matching.length > 1) {
    return expectationResult(
      expectation,
      "indeterminate",
      "DUPLICATE_EVIDENCE",
      undefined,
      sources
    );
  }
  const observation = asObservationView(matching[0] as NormalizedObservation);
  if (ambiguousObservationIds.has(observation.id)) {
    return expectationResult(
      expectation,
      "indeterminate",
      "AMBIGUOUS_EVIDENCE",
      observation,
      sources
    );
  }

  if (
    observation.kind !== expectation.kind ||
    observation.payload === undefined
  ) {
    return expectationResult(
      expectation,
      "indeterminate",
      "UNSUPPORTED_OBSERVATION_KIND",
      observation,
      sources
    );
  }
  if (observation.evidenceClass !== expectation.requiredEvidence) {
    return expectationResult(
      expectation,
      "indeterminate",
      "EVIDENCE_CLASS_MISMATCH",
      observation,
      sources
    );
  }
  if (!hasRequiredOwnerEvidence(observation)) {
    return expectationResult(
      expectation,
      "indeterminate",
      "UNBOUND_EVIDENCE",
      observation,
      sources
    );
  }

  if (
    !canonicalJsonEqual(
      observation.adapter,
      request.run.target.implementations.adapter
    )
  ) {
    return expectationResult(
      expectation,
      "indeterminate",
      "UNBOUND_EVIDENCE",
      observation,
      sources
    );
  }

  const expectedSource = expectedPrimarySource(expectation);
  if (!canonicalJsonEqual(observation.source, expectedSource)) {
    return expectationResult(
      expectation,
      "stale",
      "STALE_EVIDENCE",
      observation,
      sources
    );
  }

  const checkpointCandidates = request.bindings.filter(
    (binding) =>
      binding.kind === "checkpoint" &&
      binding.stepId === expectation.checkpointRef
  );
  const checkpoint = checkpointCandidates[0];
  if (
    checkpointCandidates.length !== 1 ||
    checkpoint?.kind !== "checkpoint" ||
    observation.checkpointBindingRef !== checkpoint.id ||
    request.bindings.filter(
      (binding) => binding.id === observation.checkpointBindingRef
    ).length !== 1
  ) {
    return expectationResult(
      expectation,
      "indeterminate",
      "UNBOUND_EVIDENCE",
      observation,
      sources
    );
  }
  if (
    !boundaryContains(checkpoint.boundary, observation.boundary) ||
    !boundaryContains(request.boundary, checkpoint.boundary) ||
    !boundaryContains(request.boundary, observation.boundary)
  ) {
    return expectationResult(
      expectation,
      "stale",
      "STALE_EVIDENCE",
      observation,
      sources
    );
  }

  if (expectation.stepRef !== undefined) {
    const bindingCandidates = request.bindings.filter(
      (candidate) => candidate.stepId === expectation.stepRef
    );
    const binding = bindingCandidates[0];
    if (
      bindingCandidates.length !== 1 ||
      binding === undefined ||
      observation.stepBindingRef !== binding.id ||
      request.bindings.filter(
        (candidate) => candidate.id === observation.stepBindingRef
      ).length !== 1 ||
      !checkpoint.includedBindingRefs.includes(binding.id) ||
      !bindingMatchesObservation(binding, observation, request.bindings)
    ) {
      return expectationResult(
        expectation,
        "indeterminate",
        "UNBOUND_EVIDENCE",
        observation,
        sources
      );
    }
  } else if (expectation.kind !== "app-graph") {
    return expectationResult(
      expectation,
      "indeterminate",
      "UNBOUND_EVIDENCE",
      observation,
      sources
    );
  }

  if (
    expectation.kind === "data-source-result" &&
    expectation.recordStepRef !== undefined
  ) {
    const recordBindings = request.bindings.filter(
      (candidate) =>
        candidate.stepId === expectation.recordStepRef &&
        (candidate.kind === "set-item" || candidate.kind === "activate-control")
    );
    const recordBinding = recordBindings[0];
    const payload = observation.payload as DataSourceResultObservedPayload;
    if (
      recordBindings.length !== 1 ||
      recordBinding === undefined ||
      (recordBinding.kind !== "set-item" &&
        recordBinding.kind !== "activate-control") ||
      payload.recordId !== recordBinding.responseId
    ) {
      return expectationResult(
        expectation,
        "indeterminate",
        "UNBOUND_EVIDENCE",
        observation,
        sources
      );
    }
  }

  if (!payloadMatches(expectation, observation)) {
    return expectationResult(
      expectation,
      "failed",
      "EXPECTED_VALUE_MISMATCH",
      observation,
      sources
    );
  }
  return expectationResult(
    expectation,
    "passed",
    "MATCH",
    observation,
    sources
  );
}

export async function deriveOutcomeReportId(input: {
  targetIdentityDigest: string;
  runId: string;
  caseDigest: string;
}): Promise<string> {
  const digest = await sha256Digest(input);
  return `urn:formspec:outcome-report:${digest.slice("sha256:".length)}`;
}

type OutcomeComparisonCoreInput = OutcomeComparisonInput;

async function validateComparisonInput(
  request: OutcomeComparisonCoreInput,
  generatedAt: string
): Promise<string> {
  const actualCaseDigest = await sha256Digest(request.case);
  if (
    !(await validateOutcomeLintClearance(request.lintClearance, {
      caseDigest: actualCaseDigest,
      sources: request.pairedSources,
      verifierImplementationDigest:
        request.run.target.implementations.verifier.digest,
    }))
  ) {
    throw new Error(
      "OUTCOME_LINT_CLEARANCE_INVALID: comparator requires current schema and cross-document lint clearance"
    );
  }
  if (!(await resolvedTargetIdentityIsValid(request.run.target))) {
    throw new Error(
      "OUTCOME_TARGET_IDENTITY_INVALID: comparator requires a self-consistent resolved target"
    );
  }
  if (
    !Number.isFinite(Date.parse(generatedAt)) ||
    Date.parse(generatedAt) < Date.parse(request.boundary.endedAt)
  ) {
    throw new Error(
      "OUTCOME_VERIFIER_CLOCK_INVALID: generatedAt must be RFC3339 and follow the observation boundary"
    );
  }
  return actualCaseDigest;
}

function executionEvidence(
  request: OutcomeComparisonCoreInput,
  generatedAt: string
): OutcomeExecutionEvidence {
  return {
    caseDocument: structuredClone(request.case),
    caseDigest: request.caseDigest,
    pairedSources: structuredClone(request.pairedSources),
    generatedAt,
    run: structuredClone(request.run),
    lintClearanceDigest: request.lintClearance.clearanceDigest,
    actionPlanSetDigest: request.lintClearance.actionPlanSetDigest,
    bindings: structuredClone(request.bindings),
    boundary: structuredClone(request.boundary),
    observations: structuredClone(request.observations),
  };
}

async function buildOutcomeReport(
  request: OutcomeComparisonCoreInput,
  generatedAt: string,
  executionReceipt: { ref: string; evidenceDigest: string },
  actualCaseDigest: string
): Promise<OutcomeVerificationReport> {
  const caseDigestMatches = actualCaseDigest === request.caseDigest;
  const observationsByExpectation = new Map<string, NormalizedObservation[]>();
  const observationIdCounts = new Map<string, number>();
  for (const observation of request.observations) {
    if (typeof observation.id === "string") {
      observationIdCounts.set(
        observation.id,
        (observationIdCounts.get(observation.id) ?? 0) + 1
      );
    }
    const expectationId = observation.expectationId;
    if (typeof expectationId !== "string") {
      continue;
    }
    const group = observationsByExpectation.get(expectationId) ?? [];
    group.push(observation);
    observationsByExpectation.set(expectationId, group);
  }
  const ambiguousObservationIds = new Set(
    [...observationIdCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id)
  );

  const results = request.case.expectedObservations.map((expectation) =>
    compareOne(
      request,
      expectation,
      observationsByExpectation.get(expectation.id) ?? [],
      caseDigestMatches,
      ambiguousObservationIds
    )
  ) as [ExpectationResult, ...ExpectationResult[]];
  const summary = {
    total: results.length,
    passed: 0,
    failed: 0,
    indeterminate: 0,
    stale: 0,
  };
  for (const item of results) {
    summary[item.conclusion] += 1;
  }

  return {
    $formspecOutcomeVerificationReport: "0.1",
    id: await deriveOutcomeReportId({
      targetIdentityDigest: request.run.target.targetIdentityDigest,
      runId: request.run.runId,
      caseDigest: request.caseDigest,
    }),
    generatedAt,
    caseRef: request.case.id,
    caseDigest: request.caseDigest,
    lintClearanceDigest: request.lintClearance.clearanceDigest,
    actionPlanSetDigest: request.lintClearance.actionPlanSetDigest,
    executionReceipt,
    run: request.run,
    inspectedSources: [...request.pairedSources] as [SourcePin, ...SourcePin[]],
    boundary: request.boundary,
    bindings: [...request.bindings],
    results,
    summary,
    conclusion: conclusionFor(results),
    claimScope: {
      claim: "declared-observations",
      needSatisfaction: "not-asserted",
    },
    diagnostics: caseDigestMatches
      ? []
      : [
          {
            code: "STALE_CASE",
            severity: "error",
            message: `Supplied case digest ${request.caseDigest} does not match ${actualCaseDigest}`,
          },
        ],
  };
}

/** Recompute report bytes without emitting a new report or mutating custody. */
export async function recomputeOutcomeVerificationReport(
  request: OutcomeComparisonCoreInput & {
    generatedAt: string;
    executionReceipt: { ref: string; evidenceDigest: string };
  }
): Promise<{
  report: OutcomeVerificationReport;
  evidence: OutcomeExecutionEvidence;
  evidenceDigest: string;
}> {
  const actualCaseDigest = await validateComparisonInput(
    request,
    request.generatedAt
  );
  const evidence = executionEvidence(request, request.generatedAt);
  const evidenceDigest = await sha256Digest(evidence);
  if (evidenceDigest !== request.executionReceipt.evidenceDigest) {
    throw new Error(
      `OUTCOME_EXECUTION_RECEIPT_INVALID: evidence digest mismatch ${evidenceDigest} != ${request.executionReceipt.evidenceDigest}`
    );
  }
  return {
    report: await buildOutcomeReport(
      request,
      request.generatedAt,
      request.executionReceipt,
      actualCaseDigest
    ),
    evidence,
    evidenceDigest,
  };
}

export async function compareOutcomeVerification(
  request: OutcomeComparisonInput,
  generatedAt: string
): Promise<OutcomeComparisonResult> {
  const actualCaseDigest = await validateComparisonInput(request, generatedAt);
  const evidence = executionEvidence(request, generatedAt);
  const evidenceDigest = await sha256Digest(evidence);
  const report = await buildOutcomeReport(
    request,
    generatedAt,
    { ref: "urn:formspec:non-report-comparison", evidenceDigest },
    actualCaseDigest
  );
  const {
    $formspecOutcomeVerificationReport: _version,
    id: _id,
    executionReceipt: _executionReceipt,
    ...comparison
  } = report;
  return comparison;
}

export async function generateOutcomeVerificationReport(
  request: OutcomeComparatorInput,
  dependencies: OutcomeComparatorDependencies
): Promise<OutcomeVerificationReport> {
  const generatedAt = dependencies.clock.now();
  const actualCaseDigest = await validateComparisonInput(request, generatedAt);
  const custodyMatches =
    request.custody.caseDigest === request.caseDigest &&
    request.custody.runId === request.run.runId &&
    request.custody.admissionContextDigest ===
      request.run.admissionContextDigest &&
    request.custody.lintClearanceDigest ===
      request.lintClearance.clearanceDigest &&
    request.custody.actionPlanSetDigest ===
      request.lintClearance.actionPlanSetDigest &&
    canonicalJsonEqual(request.custody.target, request.run.target) &&
    request.custody.runnerEvidenceDigest ===
      (await sha256Digest({
        bindings: request.bindings,
        observations: request.observations,
        boundary: request.boundary,
      }));
  const custodyWasIssued = consumeOutcomeRunCustody(request.custody);
  if (!custodyWasIssued || !custodyMatches) {
    throw new Error(
      "OUTCOME_RUN_CUSTODY_INVALID: comparator requires unused runner-issued custody"
    );
  }

  const evidence = executionEvidence(request, generatedAt);
  const evidenceDigest = await sha256Digest(evidence);
  const reportId = await deriveOutcomeReportId({
    targetIdentityDigest: request.run.target.targetIdentityDigest,
    runId: request.run.runId,
    caseDigest: request.caseDigest,
  });
  const receipt = {
    ref: request.custody.receiptRef,
    evidenceDigest,
  };
  if (
    (await dependencies.runBindings.finalizeEvidence({
      receiptRef: receipt.ref,
      evidenceDigest,
      reportId,
      evidence,
    })) !== "finalized"
  ) {
    throw new Error(
      "OUTCOME_EXECUTION_RECEIPT_CONFLICT: evidence could not be finalized"
    );
  }
  const report = await buildOutcomeReport(
    request,
    generatedAt,
    receipt,
    actualCaseDigest
  );
  const reportDigest = await sha256Digest(report);
  if (
    (await dependencies.runBindings.recordReport({
      receiptRef: receipt.ref,
      evidenceDigest,
      reportId,
      reportDigest,
    })) !== "recorded"
  ) {
    throw new Error(
      "OUTCOME_EXECUTION_RECEIPT_CONFLICT: report could not be recorded"
    );
  }
  return report;
}

export function compareCanonicalFiniteJson(
  left: FiniteJson,
  right: FiniteJson
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
