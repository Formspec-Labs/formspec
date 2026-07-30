/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, Generation } from './common.js';
/**
 * Sidecar document declaring named response or app actions, FEL preconditions, validation tuple overrides, ordered effect requests, and invocation terminal controls. See specs/response-actions/response-actions-spec.md for normative prose.
 */
export type ResponseActionsDocument = {
  /**
   * Response Actions document version. MUST be '1.0'.
   */
  $formspecResponseActions: '1.0';
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Default-module-set behavior per ADR 0150 §4.9 preserves form-only documents — omitting modules[] is identical to declaring the core module set. Per ADR 0150 §4.3.
   */
  modules?: ModuleRef[];
  /**
   * Version of this Response Actions document. SemVer RECOMMENDED.
   */
  version: string;
  /**
   * Execution scope. response actions submit and validate the target Definition. app actions execute without a form submission and MUST omit targetDefinition.
   */
  scope?: 'response' | 'app';
  /**
   * The Definition this Response Actions document binds to. Identical role to Experience.targetDefinition.
   */
  targetDefinition?: {
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
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
} & (DefinitionScopedResponseActions | ApplicationScopedActions);
/**
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "Action".
 */
export type Action = {
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
  'x-generation'?: Generation;
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
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "ActionIntent".
 */
export type ActionIntent = ('save-draft' | 'autosave' | 'review' | 'submit' | 'request-evidence') | `x-${string}`;
/**
 * The exact (profile, blocking, persistence) triple defined by VM §3-§5 with the §6.3 validity predicate enforced as schema-level constraints. Response Actions ValidationOverride and other consumers that carry only the tuple MUST $ref this closed $def.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "ValidationOverride".
 */
export type ValidationOverride = {
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
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "EffectRequest".
 */
export type EffectRequest =
  | MappingExecutionEffect
  | LedgerAppendEffect
  | HandoffAssemblyEffect
  | EvidenceRequestEffect
  | HostEventEffect
  | BrowserResourceEffect;
/**
 * FEL expression evaluated once before a durable effect first executes and frozen across retries/replays.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "IdempotencyKey".
 */
export type IdempotencyKey = string;
/**
 * Extension object whose keys must be prefixed with x-.
 */
export interface Extensions {}
/**
 * Authoring identity per ADR 0150 §5.4. Distinct from `respondent-ledger-event.Actor` (respondent-identity) and `experience.Actor` (workflow-role) — three Actor $defs by design. `kind` and `actChannel` are terminal-closed enums; product nuance (e.g. discriminating Wireframes-MCP from Forms-MCP, both `actChannel: 'mcp'`) rides URN-encoded into `id`, not via new enum values.
 */
export interface AuthorActor {
  /**
   * Stable actor URN (urn:formspec:actor:... scheme). Product nuance rides URN-encoded (e.g. urn:formspec:actor:mcp:wireframes:agent-7).
   */
  id: string;
  /**
   * Terminal-closed per §5.4 (NOT §4.5-extensible). Answers 'what kind of authoring entity'.
   */
  kind: 'human' | 'ai-agent' | 'service';
  /**
   * Terminal-closed per §5.4. Orthogonal to kind. Answers 'through what channel'. An ai-agent MAY have actChannel:'mcp' (mediated via MCP) OR 'agent' (autonomous). A human MAY have actChannel:'human' (direct editor) OR 'mcp' (CLI-driven MCP).
   */
  actChannel: 'human' | 'mcp' | 'agent' | 'service';
  /**
   * Optional human-readable label for timeline/support views.
   */
  display?: string;
  extensions?: Extensions;
}
/**
 * Graph-wide Component node identity for x-generation movedFrom/copiedFrom provenance. Mirrors the app-graph Component node identity tuple: Component membership, Surface sibling identity, route, absolute route-scoped nodePath, and optional public/structural node ids. This is provenance metadata only; it does not authorize, execute, or resolve runtime behavior.
 */
export interface ComponentNodeIdentityRef {
  component: {
    /**
     * App Manifest components[] membership handle.
     */
    handle: string;
    /**
     * Canonical URL of the Component document when available.
     */
    url?: string;
    /**
     * Component document version evidence when available.
     */
    version?: string;
  };
  surface: {
    /**
     * Canonical URL of the Surface document.
     */
    url: string;
    /**
     * Surface document version evidence when available.
     */
    version?: string;
  };
  /**
   * Surface routes[].id for the route-scoped node.
   */
  route: string;
  /**
   * Absolute route-scoped Component node path built from stable node segments.
   */
  nodePath: string;
  /**
   * Optional ComponentBase.id evidence for the node.
   */
  id?: string;
  /**
   * Optional structural authoring identity for the node.
   */
  nodeId?: string;
}
/**
 * Legacy same-runtime route + intra-document node path. Retained for Studio/kernel compatibility; it is not sufficient graph-wide Component provenance once multiple Surfaces or Component documents are loaded.
 */
export interface CrossComponentRef {
  route: string;
  nodePath: string;
}
/**
 * A FEL-guarded precondition.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
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
 * This interface was referenced by `undefined`'s JSON-Schema
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
 * This interface was referenced by `undefined`'s JSON-Schema
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
 * This interface was referenced by `undefined`'s JSON-Schema
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
 * This interface was referenced by `undefined`'s JSON-Schema
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
 * This interface was referenced by `undefined`'s JSON-Schema
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
/**
 * Transient browser navigation or download request resolved from validated structured action input. MUST NOT carry idempotencyKey.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "BrowserResourceEffect".
 */
export interface BrowserResourceEffect {
  type: 'browserResource';
  /**
   * open follows a safe internal, HTTPS, or explicitly authored mailto destination. download saves an authored resource.
   */
  operation: 'open' | 'download';
  /**
   * Safe own-property path into the structured action input. The resolved value is a browser resource object; it is never evaluated as code.
   */
  resourceRef: string;
  /**
   * Browsing context for open operations. Downloads ignore this value.
   */
  target?: 'self' | 'new';
  onError?: 'fail' | 'defer';
}
export interface DefinitionScopedResponseActions {
  scope?: 'response';
}
export interface ApplicationScopedActions {
  scope: 'app';
}
