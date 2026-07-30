/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Item, Bind } from './definition.js';
/**
 * A standalone Formspec Screener document for respondent classification and routing. A Screener is a freestanding routing instrument — it does not bind to a target Definition. Its relationship to Definitions is expressed entirely through route targets. A Screener declares screening items, binds evaluated in an isolated scope, and an ordered evaluation pipeline with pluggable strategies (first-match, fan-out, score-threshold, or extensions). Evaluation produces a Determination Record capturing matched routes, eliminated routes, scores, inputs with answer states, and evaluation metadata. Lifecycle primitives: availability windows, result validity durations, and evaluation version binding.
 */
export interface ScreenerDocument {
  /**
   * Screener specification version. MUST be '1.0'.
   */
  $formspecScreener: '1.0';
  /**
   * Canonical, stable URI identifying this screener. MUST be globally unique. The pair (url, version) uniquely identifies a specific screener revision. Does not need to be a resolvable HTTP URL; URN syntax is acceptable.
   */
  url: string;
  /**
   * Semantic version of this Screener Document, following semver 2.0.0. Independent of any Definition version.
   */
  version: string;
  /**
   * Human-readable name for the screener.
   */
  title: string;
  /**
   * Purpose description for the screener.
   */
  description?: string;
  availability?: Availability;
  /**
   * ISO 8601 duration declaring how long a completed Determination Record remains valid before re-screening is required. When omitted, the Determination Record has no expiration.
   */
  resultValidity?: string;
  /**
   * Determines which version of the screener's evaluation logic governs when the screener is updated between session start and completion. 'submission': rules at session start govern (default). 'completion': rules at completion govern.
   */
  evaluationBinding?: 'submission' | 'completion';
  /**
   * Screening items. Uses the standard Formspec Item schema (core §4.2). Screener items are NOT part of any form's instance data — they exist only for routing classification. Item keys MUST be unique within the Screener Document.
   */
  items: Item[];
  /**
   * Bind declarations scoped to screener items. Uses the standard Formspec Bind schema (core §4.3). Paths reference screener item keys. These binds are evaluated in the screener's own scope — they do NOT interact with any Definition's binds.
   */
  binds?: Bind[];
  /**
   * Ordered evaluation pipeline. Phases execute in declaration order. Override routes are hoisted and evaluated before all phases.
   */
  evaluation: Phase[];
  /**
   * Extension declarations. Uses the same extension mechanism as Definition (core §4.6).
   */
  extensions?: {};
}
/**
 * Calendar window during which the screener accepts new respondents. When omitted, the screener is always available.
 */
export interface Availability {
  /**
   * Earliest date (inclusive) on which the screener accepts respondents. If omitted, no start constraint.
   */
  from?: string;
  /**
   * Latest date (inclusive) on which the screener accepts respondents. If omitted, no end constraint.
   */
  until?: string;
}
/**
 * Respondent-facing consequences associated with this item, including triggered deadlines, lock-in effects, and external actions such as referrals.
 */
export interface ConsequencesMetadata {
  /**
   * Plain-language consequence summary.
   */
  summary?: string;
  /**
   * Whether the action or answer creates an irreversible effect.
   */
  irreversible?: boolean;
  /**
   * Whether this item becomes locked after submission.
   */
  locksAfterSubmit?: boolean;
  /**
   * Deadlines or clocks triggered by this item or action.
   */
  deadlines?: ConsequenceDeadline[];
  /**
   * External actions triggered by this item or action, such as a referral, payment, or mandatory report.
   */
  externalActions?: ExternalAction[];
  /**
   * Reference to the rule, citation, or authority chain explaining the consequence.
   */
  authorityRef?: string;
}
/**
 * One clock or deadline that starts when an answer or submission action occurs.
 */
export interface ConsequenceDeadline {
  label: string;
  /**
   * Absolute deadline when known.
   */
  due?: string;
  /**
   * Relative deadline such as `30 days after submission`.
   */
  offset?: string;
  authorityRef?: string;
}
/**
 * External act that may require its own deliberate consent moment.
 */
export interface ExternalAction {
  /**
   * Closed core external-action kind. `referral` covers cross-agency referral warnings.
   */
  kind: 'referral' | 'payment' | 'credit-check' | 'mandatory-report' | 'identity-verification' | 'other';
  label: string;
  description?: string;
  /**
   * Agency, system, or recipient that receives the action.
   */
  recipient?: string;
  /**
   * Whether the renderer should collect a distinct deliberate consent act before this action fires.
   */
  consentRequired?: boolean;
  authorityRef?: string;
}
/**
 * Plain-language purpose and citation metadata explaining why this item is asked or shown.
 */
export interface PurposeMetadata {
  /**
   * Plain-language reason this item is asked or shown.
   */
  summary?: string;
  /**
   * Reference to a rule, citation, or PKAF authority chain supporting the question.
   */
  authorityRef?: string;
  /**
   * References to citations in a References document or external citation registry.
   */
  citationRefs?: string[];
  /**
   * Plain-language or registry-backed audience names that use this answer.
   */
  recipientAudiences?: string[];
  /**
   * Plain-language retention statement when known.
   */
  retention?: string;
}
/**
 * EXT-28 / ADR-0155 §5: per-item party-scoped visibility, editability, and signature obligation policy. Absence means the item is visible-to, editable-by, and signed-by all declared parties (legacy single-party semantics extended to N parties). See core spec §4.8.3.
 */
export interface ItemPartyPolicy {
  /**
   * Role IDs of parties that MAY see this item. Each entry MUST resolve to a `parties[*].roleId` declared in the same Definition. An empty array is a definition error per MP-10.
   *
   * @minItems 1
   */
  visibleTo?: [string, ...string[]];
  /**
   * Role IDs of parties that MAY edit this item. MUST be a subset of `visibleTo` per MP-11.
   *
   * @minItems 1
   */
  editableBy?: [string, ...string[]];
  /**
   * Role IDs of parties whose `AuthoredSignature` MUST cover this item. MUST be a subset of `visibleTo` per MP-11.
   *
   * @minItems 1
   */
  signedBy?: [string, ...string[]];
}
/**
 * Generation provenance for this rendered Item. Strict data-only authoring profiles require every group, field, and display Item to carry a direct need:<id>@<revision> anchor resolving to an adopted Need at its current revision.
 */
export interface Generation {
  /**
   * Existing field (component.schema.json:256-259): generator source label, such as an Experience Unit, prompt, template, or generator input bundle. Preserved as-is.
   */
  source?: string;
  /**
   * Existing field (component.schema.json:260-263): generator strategy identifier, such as unit-to-section or a host-defined strategy name. Preserved as-is.
   */
  strategy?: string;
  /**
   * Existing field (component.schema.json:268-271): generation timestamp. Authors SHOULD use an RFC 3339 date-time string. Preserved as-is.
   */
  generatedAt?: string;
  /**
   * Existing field (component.schema.json:272-279): source anchors with a standard prefix and source-layer-owned suffix. The prefix set is closed; `need` joined it per needs-spec S8, whose `need:<id>@<revision>` grammar is normative in spec prose (this shared regex stays broad by existing convention — per-prefix grammar is not encoded here).
   */
  anchors?: string[];
  /**
   * Actor attribution per §5.4. Migration-friendly: pre-existing free-form string values (e.g. 'component-generator/1.0.0') continue to validate; new authoring stamps the full AuthorActor inline.
   */
  generatedBy?: string | AuthorActor;
  sourceModule?: ModuleRef;
  /**
   * Set by tooling on cross-Component move per §5.3. Graph-wide provenance uses ComponentNodeIdentityRef; CrossComponentRef is retained only as same-runtime compatibility evidence.
   */
  movedFrom?: ComponentNodeIdentityRef | CrossComponentRef;
  /**
   * Set by tooling on cross-Component copy per §5.3. Graph-wide provenance uses ComponentNodeIdentityRef; CrossComponentRef is retained only as same-runtime compatibility evidence.
   */
  copiedFrom?: ComponentNodeIdentityRef | CrossComponentRef;
  extensions?: Extensions;
}
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
 * Extension object whose keys must be prefixed with x-.
 */
export interface Extensions {}
/**
 * Module/template provenance per §5.3. Orthogonal to generatedBy — answers 'which module supplied this template' not 'who authored this op'.
 */
export interface ModuleRef {
  /**
   * Module ID following the Registry naming pattern per ADR 0150 §4.8. Despite §4.4 prose calling this a 'URN', §4.3 examples and §4.8 regex are bare `^x-` prefix (e.g. 'x-formspec-core-task'). This pattern matches the canonical regex.
   */
  id: string;
  /**
   * Strict SemVer string or range expression (e.g. '1.0.0', '^1.0.0', '>=1.0.0 <2.0.0').
   */
  version: string;
  /**
   * OPTIONAL provenance assertion (the document asserts; posture admission checks).
   */
  publisher?: string;
  /**
   * OPTIONAL digest pin (e.g. 'sha256:...'). Pins hostile-substitution risk when paired with posture.allowedModules[].
   */
  lockHash?: string;
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
 * A single stage in the evaluation pipeline. Each phase declares a strategy that determines how its routes are evaluated. Phases execute in declaration order and produce independent results aggregated into the Determination Record.
 *
 * This interface was referenced by `ScreenerDocument`'s JSON-Schema
 * via the `definition` "Phase".
 */
export interface Phase {
  /**
   * Unique identifier for this phase within the Screener.
   */
  id: string;
  /**
   * Human-readable name for this phase.
   */
  label?: string;
  /**
   * Description of this phase's purpose.
   */
  description?: string;
  /**
   * Evaluation strategy. Normative closed-core values: 'first-match', 'fan-out', 'score-threshold'. Module extension strategies follow the canonical `^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$` regex (ADR 0150 §4.5/§4.8).
   */
  strategy: ('first-match' | 'fan-out' | 'score-threshold') | string;
  /**
   * Routes to evaluate using this phase's strategy.
   */
  routes: Route[];
  /**
   * When present, the phase is evaluated only when this expression evaluates to true. When absent, the phase always evaluates.
   */
  activeWhen?: string;
  /**
   * Strategy-specific configuration. Normative strategies define their own config schemas. Extension strategies define their own.
   */
  config?: {
    /**
     * Fan-out: minimum routes that must match for success.
     */
    minMatches?: number;
    /**
     * Fan-out: maximum matched routes to include.
     */
    maxMatches?: number;
    /**
     * Score-threshold: return only the top N scoring routes.
     */
    topN?: number;
    /**
     * Score-threshold: when true, normalize scores to 0.0-1.0 range before threshold comparison.
     */
    normalize?: boolean;
    [k: string]: unknown;
  };
}
/**
 * A single routing rule within an evaluation phase. Routes combine a condition or score expression with a target destination. Override routes are hoisted out of their phase and evaluated before all phases.
 *
 * This interface was referenced by `ScreenerDocument`'s JSON-Schema
 * via the `definition` "Route".
 */
export interface Route {
  /**
   * Boolean FEL expression evaluated against screener item values. Required for 'first-match' and 'fan-out' strategies.
   */
  condition?: string;
  /**
   * Numeric FEL expression evaluated against screener item values. Required for 'score-threshold' strategy.
   */
  score?: string;
  /**
   * Minimum score required for this route to match (score >= threshold). Required for 'score-threshold' strategy.
   */
  threshold?: number;
  /**
   * Route destination URI. Four categories: (1) a Formspec Definition reference (url|version), (2) an external URI, (3) a named outcome (outcome:name), (4) a Surface route reference (surface:<route-id>) per ADR 0150 §7. The Screener remains freestanding; AppGraphValidator validates surface:<route-id> only when App Manifest v2.3 screeners[] explicitly associates the Screener with loaded Surface documents. The <route-id> after `surface:` MUST resolve to exactly one loaded Surface routes[].id in that associated app graph.
   */
  target: string;
  /**
   * Human-readable route description.
   */
  label?: string;
  /**
   * Human-readable message to display to the respondent when this route matches. MAY contain {{expression}} interpolation sequences.
   */
  message?: string;
  /**
   * Arbitrary key-value metadata attached to the route. Preserved in the Determination Record without interpretation by the processor.
   */
  metadata?: {
    [k: string]: unknown;
  };
  /**
   * When true, this route is an override route. Override routes are hoisted out of their phase and evaluated before all phases.
   */
  override?: boolean;
  /**
   * When true and the override matches, the entire evaluation pipeline halts. Ignored when 'override' is false.
   */
  terminal?: boolean;
}
