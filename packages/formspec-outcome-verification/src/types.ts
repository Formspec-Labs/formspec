/** @filedesc Runtime-only runner and lint interfaces over generated documents. */

import type {
  ActivateControlBinding,
  ActivateControlStep,
  CheckpointBinding,
  CheckpointStep,
  ComparatorRequest,
  ComparatorImplementations,
  EffectTraceEntry,
  FiniteJson,
  ImplementationIdentity,
  NormalizedActionInvocationObservation,
  NormalizedAppGraphObservation,
  NormalizedDataSourceResultObservation,
  NormalizedObservation,
  NormalizedObservationBase,
  NormalizedRenderedOutputObservation,
  NormalizedRouteStateObservation,
  NormalizedResponseObservation,
  NormalizedValidationReportObservation,
  OpenRouteBinding,
  OpenRouteStep,
  OutcomeVerificationCase,
  OutcomeVerificationReport,
  ProcedureStep,
  QualifiedSubjectRef,
  SetItemBinding,
  SetItemStep,
  SourcePin,
  StepBinding,
} from "@formspec-org/types";

declare const outcomeLintClearanceBrand: unique symbol;
declare const outcomeRunCustodyBrand: unique symbol;

export type {
  ActivateControlBinding,
  ActivateControlStep,
  AppGraphObservedPayload,
  CheckpointBinding,
  CheckpointStep,
  ComparatorImplementations,
  ComparatorRequest,
  Conclusion,
  DataSourceResultObservedPayload,
  Diagnostic,
  EffectTraceEntry,
  ExpectationResult,
  ExpectedObservation,
  FiniteJson,
  ImplementationIdentity,
  NormalizedActionInvocationObservation,
  NormalizedAppGraphObservation,
  NormalizedDataSourceResultObservation,
  NormalizedObservation,
  NormalizedRenderedOutputObservation,
  NormalizedRouteStateObservation,
  NormalizedResponseObservation,
  NormalizedValidationReportObservation,
  ObservationBoundary,
  OpenRouteBinding,
  OpenRouteStep,
  OutcomeVerificationCase,
  OutcomeVerificationReport,
  ProcedureStep,
  QualifiedSubjectRef,
  ReasonCode,
  ResponseObservedPayload,
  RunIdentity,
  SetItemBinding,
  SetItemStep,
  SourcePin,
  StepBinding,
  ValidationReportObservedPayload,
  ActionInvocationObservedPayload,
  RenderedOutputObservedPayload,
} from "@formspec-org/types";

export type EvidenceClass = NormalizedObservationBase["evidenceClass"];

export type OutcomeObservationKind = NonNullable<
  | NormalizedAppGraphObservation["kind"]
  | NormalizedValidationReportObservation["kind"]
  | NormalizedResponseObservation["kind"]
  | NormalizedActionInvocationObservation["kind"]
  | NormalizedDataSourceResultObservation["kind"]
  | NormalizedRouteStateObservation["kind"]
  | NormalizedRenderedOutputObservation["kind"]
>;

export type OutcomeStepKind = ProcedureStep["kind"];

export interface DurableEffectDeclaration {
  index: number;
  type: EffectTraceEntry["type"];
  durable: boolean;
}

export interface OwnerResolvedActionPlan {
  stepId: string;
  actionsRef: string;
  actionsDigest: string;
  actionId: string;
  effects: DurableEffectDeclaration[];
}

export interface OutcomeTargetRequest {
  class: "preview" | "test";
  ref: string;
}

/**
 * Environment-resolved identity for one executable target. The caller can
 * request a target, but cannot supply any of these build or implementation
 * facts.
 */
export interface ResolvedTargetIdentity extends OutcomeTargetRequest {
  buildRef: string;
  buildDigest: string;
  implementations: ComparatorImplementations;
  implementationSetDigest: string;
  targetIdentityDigest: string;
}

export interface OutcomeTargetIdentityPort {
  resolveTarget(
    request: OutcomeTargetRequest
  ): Promise<ResolvedTargetIdentity | undefined>;
}

/**
 * Caller-owned, sanitized admission facts. This is deliberately not a
 * persisted Formspec document and contains no credential value. The admitted
 * step kinds narrow caller authorization; they do not describe runner
 * capability.
 */
export interface RunnerAdmissionContext {
  target: OutcomeTargetRequest;
  mode: "new";
  runId: string;
  caseDigest: string;
  admittedStepKinds: OutcomeStepKind[];
  principal: {
    kind: "actor" | "capability";
    ref: string;
  };
  admissionDigest: string;
}

export type RunnerAdmissionFacts = Omit<
  RunnerAdmissionContext,
  "admissionDigest"
>;

export interface RunnerPortContext {
  admission: RunnerAdmissionContext;
  caseDigest: string;
  target: ResolvedTargetIdentity;
}

/**
 * The only execution surface exposed by the generic runner. In particular,
 * there is no direct Action-executor port.
 */
export interface OutcomeRunnerPorts {
  openRoute(
    step: OpenRouteStep,
    context: RunnerPortContext
  ): Promise<OpenRouteBinding>;
  setItem(
    step: SetItemStep,
    renderBinding: OpenRouteBinding,
    context: RunnerPortContext
  ): Promise<SetItemBinding>;
  activateControl(
    step: ActivateControlStep,
    renderBinding: OpenRouteBinding,
    responseBinding: SetItemBinding,
    invocationId: string,
    context: RunnerPortContext
  ): Promise<ActivateControlBinding>;
  checkpoint(
    step: CheckpointStep,
    priorBindings: readonly StepBinding[],
    context: RunnerPortContext
  ): Promise<{
    binding: CheckpointBinding;
    observations: NormalizedObservation[];
  }>;
}

export interface AppArtifactBinding {
  appRef: string;
  appDigest: string;
  artifactRef: string;
  artifactDigest: string;
  kind:
    | "surface"
    | "definition"
    | "response-actions"
    | "data-sources"
    | "experience"
    | "needs";
}

export interface OutcomeOwnerFacts {
  sources: PairedSource[];
  semanticControlBindings: SemanticControlBinding[];
  experienceUnitBindings: ExperienceUnitBinding[];
  subjectNeedBindings: SubjectNeedBinding[];
  appArtifactBindings: AppArtifactBinding[];
  actionPlans: OutcomeLintActionPlan[];
}

/**
 * Trusted owner authority implemented above this package from AppGraph and
 * owner-specific interfaces. Caller-supplied fact arrays are never clearance
 * authority.
 */
export interface OutcomeOwnerFactsPort {
  identity: ImplementationIdentity;
  deriveFacts(input: {
    caseDocument: OutcomeVerificationCase;
    sources: readonly PairedSource[];
  }): Promise<OutcomeOwnerFacts>;
}

/** Environment-owned atomic custody keyed by target identity and run ID. */
export interface OutcomeRunBindingPort {
  beginRun(input: {
    targetIdentityDigest: string;
    runId: string;
    caseDigest: string;
    admissionContextDigest: string;
    principal: RunnerAdmissionContext["principal"];
    lintClearanceDigest: string;
    actionPlanSetDigest: string;
  }): Promise<{ status: "bound"; receiptRef: string } | { status: "conflict" }>;
  completeRun(input: {
    receiptRef: string;
    runnerEvidenceDigest: string;
    evidence: OutcomeRunnerEvidence;
  }): Promise<"completed" | "conflict">;
  finalizeEvidence(input: {
    receiptRef: string;
    evidenceDigest: string;
    reportId: string;
    evidence: OutcomeExecutionEvidence;
  }): Promise<"finalized" | "conflict">;
  recordReport(input: {
    receiptRef: string;
    evidenceDigest: string;
    reportId: string;
    reportDigest: string;
  }): Promise<"recorded" | "conflict">;
  readReceipt(
    receiptRef: string
  ): Promise<OutcomeExecutionReceiptRecord | undefined>;
}

export interface OutcomeExecutionEvidence {
  caseDocument: OutcomeVerificationCase;
  caseDigest: string;
  pairedSources: SourcePin[];
  generatedAt: string;
  run: {
    runId: string;
    admissionContextDigest: string;
    target: ResolvedTargetIdentity;
  };
  lintClearanceDigest: string;
  actionPlanSetDigest: string;
  bindings: StepBinding[];
  boundary: {
    startedAt: string;
    endedAt: string;
  };
  observations: NormalizedObservation[];
}

export interface OutcomeRunnerEvidence {
  bindings: StepBinding[];
  observations: NormalizedObservation[];
  boundary: {
    startedAt: string;
    endedAt: string;
  };
}

export interface OutcomeExecutionReceiptRecord {
  receiptRef: string;
  evidenceDigest: string;
  reportId: string;
  evidence: OutcomeExecutionEvidence;
  reportDigest?: string;
}

export interface OutcomeRunCustody {
  readonly receiptRef: string;
  readonly caseDigest: string;
  readonly runId: string;
  readonly admissionContextDigest: string;
  readonly target: ResolvedTargetIdentity;
  readonly lintClearanceDigest: string;
  readonly actionPlanSetDigest: string;
  readonly runnerEvidenceDigest: string;
  readonly [outcomeRunCustodyBrand]: true;
}

export interface OutcomeRunResult {
  caseDigest: string;
  runId: string;
  target: ResolvedTargetIdentity;
  custody: OutcomeRunCustody;
  boundary: OutcomeRunnerEvidence["boundary"];
  bindings: StepBinding[];
  observations: NormalizedObservation[];
}

export interface PairedSubject {
  kind: QualifiedSubjectRef["subjectKind"];
  ref: string;
}

/** Caller-paired source material used by cross-document lint. */
export interface PairedSource extends SourcePin {
  document: unknown;
  subjects?: PairedSubject[];
}

export interface SpecificationRule {
  specRef: string;
  specVersion: string;
  ruleId: string;
  current?: boolean;
}

export interface SemanticControlBinding {
  control: QualifiedSubjectRef;
  /** Procedure open-route step whose owner inventory published the control. */
  renderStepRef: string;
  definition?: {
    ref: string;
    digest: string;
    path: string;
  };
  action?: {
    ref: string;
    digest: string;
    id: string;
  };
}

/**
 * Owner-derived route mount. The lint caller builds this from resolved Surface
 * `experience-unit` slots; case-authored ruleRefs do not create the relation.
 */
export interface ExperienceUnitBinding {
  surfaceRef: string;
  surfaceDigest: string;
  routeId: string;
  experienceRef: string;
  experienceDigest: string;
  unitId: string;
  /** Owner-inventoried structural subjects served by this mounted Unit. */
  subjects: QualifiedSubjectRef[];
}

/** Owner-inventoried direct Need anchor on one exact artifact subject. */
export interface SubjectNeedBinding {
  subject: QualifiedSubjectRef;
  needId: string;
  needRevision: number;
}

export interface OutcomeLintActionPlan {
  actionsRef: string;
  actionsDigest: string;
  actionId: string;
  effects: Array<
    Pick<EffectTraceEntry, "index" | "type"> & { durable: boolean }
  >;
}

export interface OutcomeLintContext {
  sources: PairedSource[];
  supportedStepKinds: OutcomeStepKind[];
  supportedObservationKinds: OutcomeObservationKind[];
  semanticControlBindings: SemanticControlBinding[];
  experienceUnitBindings: ExperienceUnitBinding[];
  subjectNeedBindings: SubjectNeedBinding[];
  appArtifactBindings: AppArtifactBinding[];
  /** Owner-resolved Action declarations used to prove complete effect traces. */
  actionPlans: OutcomeLintActionPlan[];
  /** Digest printed on or paired with the case by its caller. */
  caseDigest?: string;
  /** Canonical digest computed from the current case bytes by its caller. */
  currentCaseDigest?: string;
}

/** Internal resolved lint view. Only clearance constructs this safely. */
export interface OutcomeResolvedLintContext extends OutcomeLintContext {
  specificationRules: SpecificationRule[];
}

export interface OutcomeLintFinding {
  code: string;
  severity: "error";
  path: string;
  message: string;
}

export interface OutcomeSchemaValidationPort {
  identity: ImplementationIdentity;
  validate(input: {
    kind: "case" | "source";
    artifactRef: string;
    document: unknown;
  }): Promise<{
    valid: boolean;
    schemaId: string;
    diagnostics?: string[];
  }>;
}

export interface OutcomeLintClearanceDependencies {
  schemaValidation: OutcomeSchemaValidationPort;
  verifier: ImplementationIdentity;
  ownerFacts: OutcomeOwnerFactsPort;
}

/**
 * Opaque preflight identity issued only after schema-adjacent cross-document
 * lint succeeds for the exact case and source set.
 */
export interface OutcomeLintClearance {
  readonly caseDigest: string;
  readonly sourceSetDigest: string;
  readonly lintContextDigest: string;
  readonly verifierImplementationDigest: string;
  readonly specificationRuleIndexDigest: string;
  readonly ownerFactsImplementationDigest: string;
  readonly actionPlanSetDigest: string;
  readonly clearanceDigest: string;
  readonly [outcomeLintClearanceBrand]: true;
}

export interface OutcomeVerifierClock {
  now(): string;
}

export type OutcomeComparatorInput = Omit<
  ComparatorRequest,
  | "reportId"
  | "lintClearanceDigest"
  | "generatedAt"
  | "run"
  | "implementations"
  | "actionPlanSetDigest"
> & {
  lintClearance: OutcomeLintClearance;
  run: {
    runId: string;
    admissionContextDigest: string;
    target: ResolvedTargetIdentity;
  };
  custody: OutcomeRunCustody;
};

export interface OutcomeComparatorDependencies {
  clock: OutcomeVerifierClock;
  runBindings: OutcomeRunBindingPort;
}

export type OutcomeComparisonInput = Omit<OutcomeComparatorInput, "custody">;

/** Pure comparator output. It is not a persisted verification report. */
export type OutcomeComparisonResult = Omit<
  OutcomeVerificationReport,
  "$formspecOutcomeVerificationReport" | "id" | "executionReceipt"
>;

export interface OutcomeRunnerDependencies {
  targetIdentities: OutcomeTargetIdentityPort;
  runBindings: OutcomeRunBindingPort;
  ports: OutcomeRunnerPorts;
  supportedStepKinds: readonly OutcomeStepKind[];
  clock: OutcomeVerifierClock;
}

export type OutcomeClaimGateReason =
  | "HUMAN_ADEQUACY_NOT_APPROVED"
  | "HUMAN_ADEQUACY_APPROVAL_STALE"
  | "REQUIRED_CASE_SET_EMPTY"
  | "REQUIRED_CASE_DIGEST_DUPLICATE"
  | "REQUIRED_REPORT_MISSING"
  | "REPORT_DUPLICATE"
  | "REPORT_DIGEST_MISMATCH"
  | "REPORT_ID_MISMATCH"
  | "REPORT_CASE_DIGEST_MISMATCH"
  | "REPORT_STALE"
  | "REPORT_NOT_PASSING"
  | "REPORT_INCONSISTENT"
  | "EVIDENCE_BUNDLE_INVALID"
  | "TARGET_CONTEXT_MISMATCH"
  | "TARGET_BUILD_MISMATCH"
  | "IMPLEMENTATION_SET_MISMATCH"
  | "VERIFICATION_DEPENDENCY_MISMATCH"
  | "EVIDENCE_PROFILE_MISMATCH"
  | "EXECUTION_RECEIPT_MISSING"
  | "EXECUTION_RECEIPT_MISMATCH"
  | "ACTION_PLAN_SET_MISMATCH"
  | "LINT_CLEARANCE_MISSING"
  | "LINT_CLEARANCE_MISMATCH";

export interface OutcomeHumanAdequacyApproval {
  /** Digest returned by digestDemoClaimContext for the reviewed context. */
  demoClaimContextDigest: string;
  reviewedContext: OutcomeDemoClaimContext;
  reviewerRef: string;
  reviewedAt: string;
}

export interface OutcomeDemoClaimContext {
  evidenceProfile: "runtime-demo";
  app: {
    id: string;
    version: string;
    digest: string;
  };
  target: ResolvedTargetIdentity;
  verificationDependencies: {
    schemaValidator: ImplementationIdentity;
    ownerFacts: ImplementationIdentity;
    specificationRuleIndexDigest: string;
  };
  requiredCaseDigests: string[];
}

export interface OutcomeClaimReport {
  report: OutcomeVerificationReport;
  /** Canonical digest captured with the immutable report evidence. */
  reportDigest: string;
}

export interface OutcomeClaimEvidence {
  caseDocument: OutcomeVerificationCase;
  lintContext: OutcomeLintContext;
  admission: RunnerAdmissionContext;
  comparison: Omit<
    OutcomeComparatorInput,
    "case" | "caseDigest" | "pairedSources" | "lintClearance" | "custody"
  > & {
    generatedAt: string;
  };
  report: OutcomeVerificationReport;
  reportDigest: string;
}

/** Caller-owned gate input. It is not a Formspec document. */
export interface OutcomeClaimGateInput {
  claimContext: OutcomeDemoClaimContext;
  evidence: OutcomeClaimEvidence[];
  humanAdequacyApproval?: OutcomeHumanAdequacyApproval;
}

export interface OutcomeClaimGateDependencies {
  schemaValidation: OutcomeSchemaValidationPort;
  targetIdentities: OutcomeTargetIdentityPort;
  ownerFacts: OutcomeOwnerFactsPort;
  runBindings: OutcomeRunBindingPort;
}

export interface OutcomeClaimGateCaseResult {
  caseDigest: string;
  supported: boolean;
  reasons: OutcomeClaimGateReason[];
  reportId?: string;
}

export interface OutcomeClaimGateResult {
  supported: boolean;
  claim: "demo";
  humanAdequacyApproved: boolean;
  reasons: OutcomeClaimGateReason[];
  cases: OutcomeClaimGateCaseResult[];
}

/**
 * Compile-time identity gates: persisted document and comparator types come
 * directly from the generated schema package, not a local duplicate.
 */
export type GeneratedCaseIdentity =
  OutcomeVerificationCase extends import("@formspec-org/types").OutcomeVerificationCase
    ? import("@formspec-org/types").OutcomeVerificationCase extends OutcomeVerificationCase
      ? true
      : never
    : never;
export type GeneratedReportIdentity =
  OutcomeVerificationReport extends import("@formspec-org/types").OutcomeVerificationReport
    ? import("@formspec-org/types").OutcomeVerificationReport extends OutcomeVerificationReport
      ? true
      : never
    : never;

/** Used only to ensure the imported finite JSON type stays reachable. */
export type CanonicalizableValue = FiniteJson;
