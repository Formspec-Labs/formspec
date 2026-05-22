/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "Action".
 */
export type Action = {
  [k: string]: unknown;
} & {
  /**
   * Unique within document. Starts with a letter; allows letters, digits, and hyphens.
   */
  id: string;
  intent: ActionIntent;
  /**
   * Optional free string naming the caller. Metadata only; MUST NOT be used for authorization.
   */
  actor?: string;
  /**
   * Optional locale reference or literal label. Presentational only.
   */
  label?:
    | {
        ref: string;
      }
    | {
        literal: string;
      };
  /**
   * Optional ordered list of FEL preconditions.
   */
  preconditions?: Precondition[];
  validation?: ValidationOverride;
  /**
   * Ordered effect chain. Executes in declared order.
   *
   * @minItems 1
   */
  effects: [EffectRequest, ...EffectRequest[]];
  /**
   * Terminal behavior after a failing effect.
   */
  onFailure?: 'stop' | 'retry-once';
  /**
   * Terminal behavior after a deferred effect.
   */
  onDeferred?: 'stop' | 'await';
};
/**
 * Closed VM ActionIntent enum OR an x-prefixed publisher extension intent.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "ActionIntent".
 */
export type ActionIntent = ('save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence') | string;
/**
 * The exact (profile, blocking, persistence) triple defined by VM §3-§5 with the §6.3 validity predicate enforced as schema-level constraints. Response Actions ValidationOverride and other consumers that carry only the tuple MUST $ref this closed $def.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "ValidationOverride".
 */
export type ValidationOverride = {
  [k: string]: unknown;
} & {
  /**
   * Closed named profile pinning a (Core global mode, per-shape timing filter) pair under a single identifier. live: Core 'continuous' + continuous-timing shapes during normal revalidation. on-submit: Core 'continuous' + continuous and submit-timing shapes; demand shapes excluded. on-demand: Core 'deferred' + only demand-timing shapes fire. off: Core 'disabled' + no shapes fire (no ValidationReport produced). See specs/core/validation-mapping.md §3.
   */
  profile: 'live' | 'on-submit' | 'on-demand' | 'off';
  /**
   * Closed two-value enum naming whether error-severity findings stop the surrounding intent. non-blocking: findings never stop the intent. block-on-error: intent halts before higher-persistence transitions when ValidationReport.valid is false (counts.error > 0). Preserves Core §5.5 VE-05 by blocking the transition, not the underlying data persistence. See specs/core/validation-mapping.md §4.
   */
  blocking: 'non-blocking' | 'block-on-error';
  /**
   * Closed three-value enum naming the Response lifecycle effect of the intent. none: no status change, no persistence. draft-checkpoint: persist current Response state, status remains 'in-progress' (permitted under any validation outcome, VE-05). complete-response: persist AND transition status to 'completed' (requires ValidationReport.valid === true, Core §5.4 invariant). See specs/core/validation-mapping.md §5.
   */
  persistence: 'none' | 'draft-checkpoint' | 'complete-response';
};
/**
 * Closed effect request taxonomy.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "EffectRequest".
 */
export type EffectRequest =
  | MappingExecutionEffect
  | LedgerAppendEffect
  | HandoffAssemblyEffect
  | EvidenceRequestEffect
  | HostEventEffect;
/**
 * FEL expression evaluated once before a durable effect first executes and frozen across retries/replays.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "IdempotencyKey".
 */
export type IdempotencyKey = string;

/**
 * Sidecar document declaring named response actions, FEL preconditions, validation tuple overrides, ordered effect requests, and invocation terminal controls. See specs/response-actions/response-actions-spec.md for normative prose.
 */
export interface ResponseActionsDocument {
  /**
   * Response Actions document version. MUST be '1.0'.
   */
  $formspecResponseActions: '1.0';
  /**
   * Version of this Response Actions document. SemVer RECOMMENDED.
   */
  version: string;
  /**
   * The Definition this Response Actions document binds to. Identical role to Experience.targetDefinition.
   */
  targetDefinition: {
    /**
     * Canonical URL of the Definition this Response Actions document binds to.
     */
    url: string;
    /**
     * Version range or exact version expression accepted for the target Definition.
     */
    compatibleVersions?: string;
  };
  /**
   * Named actions. Order is documentation-only; resolution is by Action.id. Each id MUST be unique within the document.
   *
   * @minItems 1
   */
  actions: [Action, ...Action[]];
}
/**
 * A FEL-guarded precondition.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "Precondition".
 */
export interface Precondition {
  /**
   * Stable identifier for this precondition.
   */
  id: string;
  /**
   * FEL expression evaluated in the Response Actions host-binding catalog. MUST evaluate to a boolean.
   */
  expression: string;
  /**
   * block terminates as blocked with cause=precondition; defer terminates as deferred.
   */
  severity: 'block' | 'defer';
}
/**
 * Durable effect requesting Mapping execution.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "MappingExecutionEffect".
 */
export interface MappingExecutionEffect {
  type: 'mappingExecution';
  mappingRef: string;
  idempotencyKey: IdempotencyKey;
  onError?: 'fail' | 'defer';
}
/**
 * Durable effect requesting a Respondent Ledger append.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "LedgerAppendEffect".
 */
export interface LedgerAppendEffect {
  type: 'ledgerAppend';
  /**
   * Published Respondent Ledger domain event kind. case.* and action.* lifecycle kinds MUST NOT be author-declared effects.
   */
  eventKind: string;
  /**
   * Optional FEL expression producing the event payload. Evaluated in the effect-time catalog.
   */
  payloadRef?: string;
  idempotencyKey: IdempotencyKey;
  onError?: 'fail' | 'defer';
}
/**
 * Durable effect requesting Intake Handoff assembly.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "HandoffAssemblyEffect".
 */
export interface HandoffAssemblyEffect {
  type: 'handoffAssembly';
  handoffProfileRef: string;
  recipientRef: string;
  idempotencyKey: IdempotencyKey;
  onError?: 'fail' | 'defer';
}
/**
 * Durable effect requesting demand-timing evidence collection.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "EvidenceRequestEffect".
 */
export interface EvidenceRequestEffect {
  type: 'evidenceRequest';
  requestRef: string;
  idempotencyKey: IdempotencyKey;
  onError?: 'fail' | 'defer';
}
/**
 * Transient host-local event. MUST NOT carry idempotencyKey.
 *
 * This interface was referenced by `ResponseActionsDocument`'s JSON-Schema
 * via the `definition` "HostEventEffect".
 */
export interface HostEventEffect {
  type: 'hostEvent';
  eventName: string;
  /**
   * Optional FEL expression producing transient event detail.
   */
  detailRef?: string;
}
