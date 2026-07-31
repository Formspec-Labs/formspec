/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { QualifiedSubjectRef, EffectTraceEntry, ResponseItemExpectation, FiniteJson } from './outcome-verification-case.js';
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "StepBinding".
 */
export type StepBinding = OpenRouteBinding | SetItemBinding | ActivateControlBinding | CheckpointBinding;
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "Conclusion".
 */
export type Conclusion = 'passed' | 'failed' | 'indeterminate' | 'stale';
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ReasonCode".
 */
export type ReasonCode =
  | 'MATCH'
  | 'EXPECTED_VALUE_MISMATCH'
  | 'EVIDENCE_CLASS_MISMATCH'
  | 'MISSING_EVIDENCE'
  | 'DUPLICATE_EVIDENCE'
  | 'UNSUPPORTED_OBSERVATION_KIND'
  | 'STALE_CASE'
  | 'STALE_SOURCE'
  | 'STALE_EVIDENCE'
  | 'UNRESOLVED_RULE'
  | 'UNBOUND_EVIDENCE'
  | 'AMBIGUOUS_EVIDENCE';
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "DataSourceResultObservedPayload".
 */
export type DataSourceResultObservedPayload = {
  [k: string]: unknown;
} & {
  catalogRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  catalogDigest: string;
  sourceId: string;
  /**
   * Host-reported outcome of one Data Source load request.
   */
  state: 'loaded' | 'unavailable';
  /**
   * Host-reported freshness of a loaded Data Source value. Hosts report this value; consumers do not infer it from a clock.
   */
  freshness?: 'fresh' | 'stale';
  recordId?: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  valueDigest?: string;
  requestId: string;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedAppGraphObservation".
 */
export type NormalizedAppGraphObservation = NormalizedObservationBase & {
  kind?: 'app-graph';
  evidenceClass?: 'structural';
  payload?: AppGraphObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedValidationReportObservation".
 */
export type NormalizedValidationReportObservation = NormalizedObservationBase & {
  kind?: 'validation-report';
  evidenceClass?: 'simulated' | 'runtime';
  payload?: ValidationReportObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedResponseObservation".
 */
export type NormalizedResponseObservation = NormalizedObservationBase & {
  kind?: 'response';
  evidenceClass?: 'simulated' | 'runtime';
  payload?: ResponseObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedActionInvocationObservation".
 */
export type NormalizedActionInvocationObservation = NormalizedObservationBase & {
  kind?: 'action-invocation';
  evidenceClass?: 'simulated' | 'runtime';
  payload?: ActionInvocationObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedDataSourceResultObservation".
 */
export type NormalizedDataSourceResultObservation = NormalizedObservationBase & {
  kind?: 'data-source-result';
  evidenceClass?: 'simulated' | 'runtime';
  payload?: DataSourceResultObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedRouteStateObservation".
 */
export type NormalizedRouteStateObservation = NormalizedObservationBase & {
  kind?: 'route-state';
  evidenceClass?: 'simulated' | 'runtime';
  payload?: RouteStateObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedRenderedOutputObservation".
 */
export type NormalizedRenderedOutputObservation = NormalizedObservationBase & {
  kind?: 'rendered-output';
  evidenceClass?: 'simulated' | 'runtime';
  payload?: RenderedOutputObservedPayload;
};
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedObservation".
 */
export type NormalizedObservation =
  | NormalizedAppGraphObservation
  | NormalizedValidationReportObservation
  | NormalizedResponseObservation
  | NormalizedActionInvocationObservation
  | NormalizedDataSourceResultObservation
  | NormalizedRouteStateObservation
  | NormalizedRenderedOutputObservation;

/**
 * A generated, point-in-time comparison of normalized owner-produced observations against one digest-pinned Outcome Verification Case. A passing report covers only the case's declared observations and never asserts Need satisfaction.
 */
export interface OutcomeVerificationReport {
  $formspecOutcomeVerificationReport: '0.1';
  /**
   * Deterministic report identity derived from the canonical SHA-256 of targetIdentityDigest, runId, and caseDigest.
   */
  id: string;
  generatedAt: string;
  caseRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  caseDigest: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   */
  lintClearanceDigest: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   */
  actionPlanSetDigest: string;
  executionReceipt: ExecutionReceiptRef;
  run: RunIdentity;
  /**
   * @minItems 1
   */
  inspectedSources: [SourcePin, ...SourcePin[]];
  boundary: ObservationBoundary;
  bindings: StepBinding[];
  /**
   * @minItems 1
   */
  results: [ExpectationResult, ...ExpectationResult[]];
  summary: ResultSummary;
  conclusion: Conclusion;
  claimScope: ClaimScope;
  diagnostics: Diagnostic[];
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ExecutionReceiptRef".
 */
export interface ExecutionReceiptRef {
  ref: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  evidenceDigest: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "RunIdentity".
 */
export interface RunIdentity {
  runId: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  admissionContextDigest: string;
  target: ResolvedTargetIdentity;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ResolvedTargetIdentity".
 */
export interface ResolvedTargetIdentity {
  class: 'preview' | 'test';
  ref: string;
  buildRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  buildDigest: string;
  implementations: ComparatorImplementations;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  implementationSetDigest: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  targetIdentityDigest: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ComparatorImplementations".
 */
export interface ComparatorImplementations {
  host: ImplementationIdentity;
  renderer: ImplementationIdentity;
  runner: ImplementationIdentity;
  runtime: ImplementationIdentity;
  verifier: ImplementationIdentity;
  adapter: ImplementationIdentity;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ImplementationIdentity".
 */
export interface ImplementationIdentity {
  id: string;
  version: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  digest: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "SourcePin".
 */
export interface SourcePin {
  artifactRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  artifactDigest: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ObservationBoundary".
 */
export interface ObservationBoundary {
  startedAt: string;
  endedAt: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "OpenRouteBinding".
 */
export interface OpenRouteBinding {
  id: string;
  stepId: string;
  kind: 'open-route';
  surfaceRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  surfaceDigest: string;
  routeId: string;
  routeInstanceId: string;
  renderInstanceId: string;
  /**
   * Owner-produced Data Source request identities emitted while opening and rendering this route.
   *
   * @minItems 1
   */
  dataSourceRequestIds?: [string, ...string[]];
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "SetItemBinding".
 */
export interface SetItemBinding {
  id: string;
  stepId: string;
  kind: 'set-item';
  routeInstanceId: string;
  renderInstanceId: string;
  control: QualifiedSubjectRef;
  definitionRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  definitionDigest: string;
  path: string;
  responseId: string;
  responseRevision: number;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ActivateControlBinding".
 */
export interface ActivateControlBinding {
  id: string;
  stepId: string;
  kind: 'activate-control';
  routeInstanceId: string;
  renderInstanceId: string;
  control: QualifiedSubjectRef;
  actionsRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  actionsDigest: string;
  actionId: string;
  invocationId: string;
  responseId: string;
  responseRevision: number;
  /**
   * @minItems 1
   */
  effects: [EffectTraceEntry, ...EffectTraceEntry[]];
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "CheckpointBinding".
 */
export interface CheckpointBinding {
  id: string;
  stepId: string;
  kind: 'checkpoint';
  boundary: ObservationBoundary;
  includedBindingRefs: string[];
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ExpectationResult".
 */
export interface ExpectationResult {
  expectationId: string;
  conclusion: Conclusion;
  reasonCode: ReasonCode;
  requiredEvidence: 'structural' | 'simulated' | 'runtime';
  observedEvidence?: 'structural' | 'simulated' | 'runtime';
  observedSummary?: FiniteJson;
  sourceRefs: SourcePin[];
  evidenceRefs: string[];
  observationBoundary?: ObservationBoundary;
  stepBindingRef?: string;
  correlationRefs?: string[];
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ResultSummary".
 */
export interface ResultSummary {
  total: number;
  passed: number;
  failed: number;
  indeterminate: number;
  stale: number;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ClaimScope".
 */
export interface ClaimScope {
  claim: 'declared-observations';
  needSatisfaction: 'not-asserted';
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "Diagnostic".
 */
export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  expectationId?: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "AppGraphObservedPayload".
 */
export interface AppGraphObservedPayload {
  subject: QualifiedSubjectRef;
  relation: 'resolves' | 'mounted' | 'direct-need-trace';
  state: 'present' | 'absent';
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ValidationIssueObserved".
 */
export interface ValidationIssueObserved {
  path: string;
  code: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ValidationReportObservedPayload".
 */
export interface ValidationReportObservedPayload {
  definitionRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  definitionDigest: string;
  responseId: string;
  /**
   * Revision of the exact Response validated by this report.
   */
  responseRevision: number;
  valid: boolean;
  issues: ValidationIssueObserved[];
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ResponseObservedPayload".
 */
export interface ResponseObservedPayload {
  definitionRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  definitionDigest: string;
  responseId: string;
  /**
   * Revision of the exact complete Response snapshot observed.
   */
  responseRevision: number;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   */
  responseDigest: string;
  /**
   * The current lifecycle status of a Response. A completed Response has no error-severity validation results; saving data remains allowed in every status.
   */
  status: 'in-progress' | 'completed' | 'amended' | 'stopped';
  item?: ResponseItemExpectation;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ActionInvocationObservedPayload".
 */
export interface ActionInvocationObservedPayload {
  actionsRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  actionsDigest: string;
  actionId: string;
  /**
   * Terminal outcome returned after a Response Action invocation begins.
   */
  terminal: 'blocked' | 'failed' | 'deferred' | 'completed';
  /**
   * @minItems 1
   */
  effects: [EffectTraceEntry, ...EffectTraceEntry[]];
  invocationId: string;
  responseId?: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "RouteStateObservedPayload".
 */
export interface RouteStateObservedPayload {
  surfaceRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  surfaceDigest: string;
  routeId: string;
  routeInstanceId: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "RenderedOutputObservedPayload".
 */
export interface RenderedOutputObservedPayload {
  node: QualifiedSubjectRef;
  rendered: true;
  operable?: boolean;
  semanticValue?: FiniteJson;
  renderInstanceId: string;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "NormalizedObservationBase".
 */
export interface NormalizedObservationBase {
  id: string;
  expectationId: string;
  kind: string;
  evidenceClass: 'structural' | 'simulated' | 'runtime';
  source: SourcePin;
  boundary: ObservationBoundary;
  checkpointBindingRef: string;
  stepBindingRef?: string;
  evidenceRef?: string;
  adapter: ImplementationIdentity;
  payload: unknown;
}
/**
 * This interface was referenced by `OutcomeVerificationReport`'s JSON-Schema
 * via the `definition` "ComparatorRequest".
 */
export interface ComparatorRequest {
  case: OutcomeVerificationCase;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  caseDigest: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  lintClearanceDigest: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  actionPlanSetDigest: string;
  /**
   * @minItems 1
   */
  pairedSources: [SourcePin, ...SourcePin[]];
  generatedAt: string;
  run: RunIdentity;
  bindings: StepBinding[];
  boundary: ObservationBoundary;
  observations: NormalizedObservation[];
}
/**
 * An authored, data-only procedure and closed set of expected observations for one pinned Need and application version. A case describes a test; it does not authorize execution or assert Need satisfaction.
 */
export interface OutcomeVerificationCase {
  /**
   * Outcome Verification Case specification version.
   */
  $formspecOutcomeVerificationCase: '0.1';
  /**
   * Stable case identifier.
   */
  id: string;
  /**
   * Version of this case. SemVer is recommended.
   */
  version: string;
  need: NeedPin;
  app: AppPin;
  experience: ExperiencePin;
  /**
   * Ordered steps interpreted by a generic admitted runner.
   *
   * @minItems 1
   */
  procedure: [
    OpenRouteStep | SetItemStep | ActivateControlStep | CheckpointStep,
    ...(OpenRouteStep | SetItemStep | ActivateControlStep | CheckpointStep)[]
  ];
  /**
   * Closed observations compared after the declared procedure.
   *
   * @minItems 1
   */
  expectedObservations: [
    (
      | (ExpectedObservationBase & {
          kind?: 'app-graph';
          requiredEvidence?: 'structural';
          subject: QualifiedSubjectRef;
          relation: 'resolves' | 'mounted' | 'direct-need-trace';
          state: 'present' | 'absent';
        })
      | (ExpectedObservationBase & {
          kind?: 'validation-report';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          /**
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "ValidationSubjectRef".
           */
          subject: QualifiedSubjectRef & {
            subjectKind?: 'definition-bind';
          };
          definitionRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          definitionDigest: string;
          valid: boolean;
          containsIssues?: ValidationIssueExpectation[];
          excludesIssues?: ValidationIssueExpectation[];
        })
      | (ExpectedObservationBase & {
          kind?: 'response';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          /**
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "ResponseSubjectRef".
           */
          subject: QualifiedSubjectRef & {
            subjectKind?: 'definition-item';
          };
          definitionRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          definitionDigest: string;
          /**
           * The current lifecycle status of a Response. A completed Response has no error-severity validation results; saving data remains allowed in every status.
           */
          status?: 'in-progress' | 'completed' | 'amended' | 'stopped';
          item: ResponseItemExpectation;
        })
      | (ExpectedObservationBase & {
          kind?: 'action-invocation';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          actionsRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          actionsDigest: string;
          actionId: string;
          /**
           * Terminal outcome returned after a Response Action invocation begins.
           */
          terminal: 'blocked' | 'failed' | 'deferred' | 'completed';
          /**
           * @minItems 1
           */
          effects: [EffectTraceEntry, ...EffectTraceEntry[]];
        })
      | (ExpectedObservationBase & {
          [k: string]: unknown;
        })
      | (ExpectedObservationBase & {
          kind?: 'route-state';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          /**
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "RouteSubjectRef".
           */
          subject: QualifiedSubjectRef & {
            subjectKind?: 'surface-route';
          };
          surfaceRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          surfaceDigest: string;
          routeId: string;
        })
      | (ExpectedObservationBase & {
          kind?: 'rendered-output';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          node: QualifiedSubjectRef;
          rendered: true;
          operable?: boolean;
          semanticValue?: FiniteJson;
        })
    ),
    ...(
      | (ExpectedObservationBase & {
          kind?: 'app-graph';
          requiredEvidence?: 'structural';
          subject: QualifiedSubjectRef;
          relation: 'resolves' | 'mounted' | 'direct-need-trace';
          state: 'present' | 'absent';
        })
      | (ExpectedObservationBase & {
          kind?: 'validation-report';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          /**
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "ValidationSubjectRef".
           */
          subject: QualifiedSubjectRef & {
            subjectKind?: 'definition-bind';
          };
          definitionRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          definitionDigest: string;
          valid: boolean;
          containsIssues?: ValidationIssueExpectation[];
          excludesIssues?: ValidationIssueExpectation[];
        })
      | (ExpectedObservationBase & {
          kind?: 'response';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          /**
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "ResponseSubjectRef".
           */
          subject: QualifiedSubjectRef & {
            subjectKind?: 'definition-item';
          };
          definitionRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          definitionDigest: string;
          /**
           * The current lifecycle status of a Response. A completed Response has no error-severity validation results; saving data remains allowed in every status.
           */
          status?: 'in-progress' | 'completed' | 'amended' | 'stopped';
          item: ResponseItemExpectation;
        })
      | (ExpectedObservationBase & {
          kind?: 'action-invocation';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          actionsRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          actionsDigest: string;
          actionId: string;
          /**
           * Terminal outcome returned after a Response Action invocation begins.
           */
          terminal: 'blocked' | 'failed' | 'deferred' | 'completed';
          /**
           * @minItems 1
           */
          effects: [EffectTraceEntry, ...EffectTraceEntry[]];
        })
      | (ExpectedObservationBase & {
          [k: string]: unknown;
        })
      | (ExpectedObservationBase & {
          kind?: 'route-state';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          /**
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "RouteSubjectRef".
           */
          subject: QualifiedSubjectRef & {
            subjectKind?: 'surface-route';
          };
          surfaceRef: string;
          /**
           * Lowercase SHA-256 digest of canonical JSON bytes.
           *
           * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
           * via the `definition` "Digest".
           */
          surfaceDigest: string;
          routeId: string;
        })
      | (ExpectedObservationBase & {
          kind?: 'rendered-output';
          requiredEvidence?: 'simulated' | 'runtime';
          stepRef: string;
          node: QualifiedSubjectRef;
          rendered: true;
          operable?: boolean;
          semanticValue?: FiniteJson;
        })
    )[]
  ];
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "NeedPin".
 */
export interface NeedPin {
  documentRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  documentDigest: string;
  id: string;
  revision: number;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "AppPin".
 */
export interface AppPin {
  id: string;
  version: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  digest: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExperiencePin".
 */
export interface ExperiencePin {
  documentRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  documentDigest: string;
  unitId: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "OpenRouteStep".
 */
export interface OpenRouteStep {
  id: string;
  kind: 'open-route';
  surfaceRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  surfaceDigest: string;
  routeId: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "SetItemStep".
 */
export interface SetItemStep {
  id: string;
  kind: 'set-item';
  renderStepRef: string;
  control: DefinitionItemControlRef;
  definitionRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  definitionDigest: string;
  path: string;
  value: FiniteJson;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "DefinitionItemControlRef".
 */
export interface DefinitionItemControlRef {
  artifactRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  artifactDigest: string;
  subjectKind: 'definition-item';
  subjectRef: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ActivateControlStep".
 */
export interface ActivateControlStep {
  id: string;
  kind: 'activate-control';
  renderStepRef: string;
  control: ResponseActionControlRef;
  actionsRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  actionsDigest: string;
  actionId: string;
  responseStepRef: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ResponseActionControlRef".
 */
export interface ResponseActionControlRef {
  artifactRef: string;
  /**
   * Lowercase SHA-256 digest of canonical JSON bytes.
   *
   * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
   * via the `definition` "Digest".
   */
  artifactDigest: string;
  subjectKind: 'response-action';
  subjectRef: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "CheckpointStep".
 */
export interface CheckpointStep {
  id: string;
  kind: 'checkpoint';
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedObservationBase".
 */
export interface ExpectedObservationBase {
  id: string;
  kind: string;
  /**
   * @minItems 1
   */
  ruleRefs: [
    ArtifactDeclarationRuleRef | SpecificationRuleRef,
    ...(ArtifactDeclarationRuleRef | SpecificationRuleRef)[]
  ];
  checkpointRef: string;
  requiredEvidence: 'structural' | 'simulated' | 'runtime';
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ArtifactDeclarationRuleRef".
 */
export interface ArtifactDeclarationRuleRef {
  kind: 'artifact-declaration';
  subject: QualifiedSubjectRef;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "SpecificationRuleRef".
 */
export interface SpecificationRuleRef {
  kind: 'specification-rule';
  specRef: string;
  specVersion: string;
  ruleId: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ValidationIssueExpectation".
 */
export interface ValidationIssueExpectation {
  path: string;
  code: string;
}
