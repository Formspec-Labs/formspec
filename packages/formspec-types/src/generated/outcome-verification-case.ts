/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * Lowercase SHA-256 digest of canonical JSON bytes.
 *
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "Digest".
 */
export type Digest = string;
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ProcedureStep".
 */
export type ProcedureStep = OpenRouteStep | SetItemStep | ActivateControlStep | CheckpointStep;
/**
 * A JSON value. JSON serialization excludes non-finite numbers and host objects.
 *
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "FiniteJson".
 */
export type FiniteJson = null | boolean | string | number | unknown[] | {};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedObservation".
 */
export type ExpectedObservation =
  | ExpectedAppGraphObservation
  | ExpectedValidationReportObservation
  | ExpectedResponseObservation
  | ExpectedActionInvocationObservation
  | ExpectedDataSourceResultObservation
  | ExpectedRouteStateObservation
  | ExpectedRenderedOutputObservation;
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedAppGraphObservation".
 */
export type ExpectedAppGraphObservation = ExpectedObservationBase & {
  kind?: 'app-graph';
  requiredEvidence?: 'structural';
  subject: QualifiedSubjectRef;
  relation: 'resolves' | 'mounted' | 'direct-need-trace';
  state: 'present' | 'absent';
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "RuleRef".
 */
export type RuleRef = ArtifactDeclarationRuleRef | SpecificationRuleRef;
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedValidationReportObservation".
 */
export type ExpectedValidationReportObservation = ExpectedObservationBase & {
  kind?: 'validation-report';
  requiredEvidence?: 'simulated' | 'runtime';
  stepRef: string;
  subject: ValidationSubjectRef;
  definitionRef: string;
  definitionDigest: Digest;
  valid: boolean;
  containsIssues?: ValidationIssueExpectation[];
  excludesIssues?: ValidationIssueExpectation[];
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ValidationSubjectRef".
 */
export type ValidationSubjectRef = QualifiedSubjectRef & {
  subjectKind?: 'definition-bind';
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedResponseObservation".
 */
export type ExpectedResponseObservation = ExpectedObservationBase & {
  kind?: 'response';
  requiredEvidence?: 'simulated' | 'runtime';
  stepRef: string;
  subject: ResponseSubjectRef;
  definitionRef: string;
  definitionDigest: Digest;
  /**
   * The current lifecycle status of a Response. A completed Response has no error-severity validation results; saving data remains allowed in every status.
   */
  status?: 'in-progress' | 'completed' | 'amended' | 'stopped';
  item: ResponseItemExpectation;
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ResponseSubjectRef".
 */
export type ResponseSubjectRef = QualifiedSubjectRef & {
  subjectKind?: 'definition-item';
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ResponseItemExpectation".
 */
export type ResponseItemExpectation = {
  [k: string]: unknown;
} & {
  path: string;
  presence: 'present' | 'absent';
  value?: FiniteJson;
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedActionInvocationObservation".
 */
export type ExpectedActionInvocationObservation = ExpectedObservationBase & {
  kind?: 'action-invocation';
  requiredEvidence?: 'simulated' | 'runtime';
  stepRef: string;
  actionsRef: string;
  actionsDigest: Digest;
  actionId: string;
  /**
   * Terminal outcome returned after a Response Action invocation begins.
   */
  terminal: 'blocked' | 'failed' | 'deferred' | 'completed';
  /**
   * @minItems 1
   */
  effects: [EffectTraceEntry, ...EffectTraceEntry[]];
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedDataSourceResultObservation".
 */
export type ExpectedDataSourceResultObservation = ExpectedObservationBase & {
  [k: string]: unknown;
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedRouteStateObservation".
 */
export type ExpectedRouteStateObservation = ExpectedObservationBase & {
  kind?: 'route-state';
  requiredEvidence?: 'simulated' | 'runtime';
  stepRef: string;
  subject: RouteSubjectRef;
  surfaceRef: string;
  surfaceDigest: Digest;
  routeId: string;
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "RouteSubjectRef".
 */
export type RouteSubjectRef = QualifiedSubjectRef & {
  subjectKind?: 'surface-route';
};
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExpectedRenderedOutputObservation".
 */
export type ExpectedRenderedOutputObservation = ExpectedObservationBase & {
  kind?: 'rendered-output';
  requiredEvidence?: 'simulated' | 'runtime';
  stepRef: string;
  node: QualifiedSubjectRef;
  rendered: true;
  operable?: boolean;
  semanticValue?: FiniteJson;
};

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
  procedure: [ProcedureStep, ...ProcedureStep[]];
  /**
   * Closed observations compared after the declared procedure.
   *
   * @minItems 1
   */
  expectedObservations: [ExpectedObservation, ...ExpectedObservation[]];
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "NeedPin".
 */
export interface NeedPin {
  documentRef: string;
  documentDigest: Digest;
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
  digest: Digest;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ExperiencePin".
 */
export interface ExperiencePin {
  documentRef: string;
  documentDigest: Digest;
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
  surfaceDigest: Digest;
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
  definitionDigest: Digest;
  path: string;
  value: FiniteJson;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "DefinitionItemControlRef".
 */
export interface DefinitionItemControlRef {
  artifactRef: string;
  artifactDigest: Digest;
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
  actionsDigest: Digest;
  actionId: string;
  responseStepRef: string;
}
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "ResponseActionControlRef".
 */
export interface ResponseActionControlRef {
  artifactRef: string;
  artifactDigest: Digest;
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
  ruleRefs: [RuleRef, ...RuleRef[]];
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
 * via the `definition` "QualifiedSubjectRef".
 */
export interface QualifiedSubjectRef {
  artifactRef: string;
  artifactDigest: Digest;
  subjectKind:
    | 'app-manifest'
    | 'need'
    | 'experience-unit'
    | 'definition-item'
    | 'definition-bind'
    | 'definition-shape'
    | 'response-action'
    | 'response-action-effect'
    | 'surface-route'
    | 'surface-slot'
    | 'surface-node'
    | 'data-source';
  subjectRef: string;
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
/**
 * This interface was referenced by `OutcomeVerificationCase`'s JSON-Schema
 * via the `definition` "EffectTraceEntry".
 */
export interface EffectTraceEntry {
  index: number;
  /**
   * Closed Response Actions effect-type vocabulary.
   */
  type:
    | 'mappingExecution'
    | 'ledgerAppend'
    | 'handoffAssembly'
    | 'evidenceRequest'
    | 'serviceRequest'
    | 'hostEvent'
    | 'browserResource';
  /**
   * Outcome of one declared Action effect. not-invoked is an explicit owner-produced record, not an inference from a missing effect.
   */
  status: 'succeeded' | 'failed' | 'deferred' | 'replayed' | 'not-invoked';
  outcomeRef?: string;
}
