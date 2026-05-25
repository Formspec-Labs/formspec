/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
/**
 * Shared origin class for response values and respondent-ledger changes. Closed-core values mirror respondent-ledger-event.schema.json ChangeSetEntry.valueClass; module-contributed extensions use the x-* registry lane.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "ValueClass".
 */
export type ValueClass =
  | ('user-input' | 'prepopulated' | 'calculated' | 'imported' | 'attachment' | 'system-derived' | 'migration-derived')
  | `x-${string}`;
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "BuiltInWidgetName".
 */
export type BuiltInWidgetName =
  | 'Section'
  | 'Stack'
  | 'Grid'
  | 'TextInput'
  | 'NumberInput'
  | 'DatePicker'
  | 'Select'
  | 'CheckboxGroup'
  | 'Toggle'
  | 'FileUpload'
  | 'Heading'
  | 'Text'
  | 'Divider'
  | 'Card'
  | 'Collapsible'
  | 'ConditionalGroup'
  | 'Tabs'
  | 'ActionButton'
  | 'Accordion'
  | 'RadioGroup'
  | 'MoneyInput'
  | 'Slider'
  | 'Rating'
  | 'Signature'
  | 'Alert'
  | 'Badge'
  | 'ProgressBar'
  | 'Summary'
  | 'ValidationSummary'
  | 'DataTable'
  | 'Panel'
  | 'Modal'
  | 'Popover';
/**
 * Custom widget identifier. Custom widgets must use the x- prefix.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "CustomWidgetName".
 */
export type CustomWidgetName = `x-${string}`;
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "WidgetName".
 */
export type WidgetName = BuiltInWidgetName | CustomWidgetName;
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "ThemeWidgetName".
 */
export type ThemeWidgetName = BuiltInWidgetName | CustomWidgetName | 'none';

/**
 * Shared schema definitions used by Formspec Definition, Theme, and Component documents.
 */
export interface CommonSchema {
  [k: string]: unknown;
}
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "TargetDefinition".
 */
export interface TargetDefinition {
  /**
   * Canonical URL of the target Definition.
   */
  url: string;
  /**
   * Semver range expression describing which Definition versions this document supports.
   */
  compatibleVersions?: string;
}
/**
 * Flat design token map. Keys are dot-delimited names; values are strings or numbers.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Tokens".
 */
export interface Tokens {
  [k: string]: string | number;
}
/**
 * Named viewport breakpoints. Values are minimum viewport widths in pixels.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Breakpoints".
 */
export interface Breakpoints {
  [k: string]: number;
}
/**
 * Contact point - schema.org-aligned, vCard 4.0 semantics.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "ContactPoint".
 */
export interface ContactPoint {
  /**
   * Open vocabulary: 'customer support', 'accessibility', 'language line', etc. Renderers SHOULD honor 'customer support' as default.
   */
  contactType?: string;
  email?: string;
  telephone?: string;
  url?: string;
  availableLanguage?: string[];
}
/**
 * Language-keyed string map (BCP 47 keys). JSON-LD-compatible with @container: '@language'.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "LangMap".
 */
export interface LangMap {
  [k: string]: string;
}
/**
 * Shared base for entities that publish or issue Formspec documents. Issuer and Publisher both extend Party.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Party".
 */
export interface Party {
  /**
   * Display name. Plain string or LangMap.
   */
  name: string | LangMap;
  /**
   * Stable entity URI - ROR, Wikidata, DID, or own-domain URL.
   */
  identifier?: string;
  /**
   * Public organizational homepage (distinct from any document URL).
   */
  homepage?: string;
  contactPoint?: ContactPoint | ContactPoint[];
}
/**
 * Flat style map. Values may contain $token.path references.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "StyleMap".
 */
export interface StyleMap {
  [k: string]: string | number;
}
/**
 * Extension object whose keys must be prefixed with x-.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Extensions".
 */
export interface Extensions {
  [k: `x-${string}`]: unknown;
}
/**
 * Accessibility overrides applied to a rendered element.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "AccessibilityBlock".
 */
export interface AccessibilityBlock {
  /**
   * Accessibility role override.
   */
  role?: string;
  /**
   * Accessible description text.
   */
  description?: string;
  /**
   * Live-region behavior.
   */
  liveRegion?: 'off' | 'polite' | 'assertive';
}
/**
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "VisualSurfaceProps".
 */
export interface VisualSurfaceProps {
  /**
   * Inner spacing for container content.
   */
  padding?: string | number;
  /**
   * Container background token or renderer value.
   */
  background?: string | number;
  /**
   * Container border token or renderer value.
   */
  border?: string | number;
  /**
   * Container corner radius token or renderer value.
   */
  radius?: string | number;
  /**
   * Container elevation token or renderer value.
   */
  elevation?: string | number;
}
/**
 * Canonical module reference per ADR 0150 §4.4. Used by document `modules[]` (§4.3), `posture.allowedModules[]` (§4.4), `bundle-manifest.modules[]` (§5.2), and `module.dependencies[]` (§4.1).
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "ModuleRef".
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
 * Authoring identity per ADR 0150 §5.4. Distinct from `respondent-ledger-event.Actor` (respondent-identity) and `experience.Actor` (workflow-role) — three Actor $defs by design. `kind` and `actChannel` are terminal-closed enums; product nuance (e.g. discriminating Wireframes-MCP from Forms-MCP, both `actChannel: 'mcp'`) rides URN-encoded into `id`, not via new enum values.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "AuthorActor".
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
 * App Manifest session index entry per ADR 0150 §5.5. App Manifest carries `sessions: SessionRef[]` as the durable list of sessions held against the app; each entry is a temporal grouping with the act-record in the ledger via `respondent-ledger.sessionRefs[]` referencing this URN.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "SessionRef".
 */
export interface SessionRef {
  /**
   * Stable session URN.
   */
  id: string;
  openedAt: string;
  /**
   * Absent = currently open.
   */
  closedAt?: string;
  /**
   * URN refs into the App Manifest's actor list.
   *
   * @minItems 1
   */
  actors: [string, ...string[]];
  extensions?: Extensions;
}
/**
 * Generalized x-generation provenance carrier per ADR 0150 §5.3/§5.4. SUPERSET of the existing inline x-generation shape at component.schema.json:240-282 — every pre-existing field (source, strategy, generatedBy, generatedAt, anchors) remains valid; new fields (sourceModule, movedFrom, copiedFrom) layered on top. `generatedBy` migrates from free-form string to `oneOf [string, AuthorActor]` for backward compatibility while enabling structured authoring identity. `additionalProperties` stays open (no false) so tool-layer use is unconstrained beyond the documented superset.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "Generation".
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
   * Existing field (component.schema.json:272-279): source anchors with a standard prefix and source-layer-owned suffix. Preserves original `^(item|unit|task|action|concept):.+$` items pattern enforcement.
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
 * Graph-wide Component node identity for x-generation movedFrom/copiedFrom provenance. Mirrors the app-graph Component node identity tuple: Component membership, Surface sibling identity, route, absolute route-scoped nodePath, and optional public/structural node ids. This is provenance metadata only; it does not authorize, execute, or resolve runtime behavior.
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "ComponentNodeIdentityRef".
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
 *
 * This interface was referenced by `CommonSchema`'s JSON-Schema
 * via the `definition` "CrossComponentRef".
 */
export interface CrossComponentRef {
  route: string;
  nodePath: string;
}
