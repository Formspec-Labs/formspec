/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, Generation } from './common.js';
/**
 * A Formspec Locale Document provides internationalized strings for one exact Definition or App Manifest target. Locale 2.0 replaces targetDefinition with target.kind plus target.url, admits the closed Surface shell key family, uses FEL {{expression}} interpolation as its only authored template syntax, and keeps every fallback step within the same target identity. A Locale Document MUST NOT affect data collection, validation logic, authorization, or behavioral semantics.
 */
export type LocaleDocument = {
  [k: string]: unknown;
} & {
  /**
   * Locale specification version. MUST be '2.0'.
   */
  $formspecLocale: '2.0';
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef. Module-contributed Locale string keys use $module.<modId>.<nodeId>.<prop>. The x-formspec-surface module reserves the closed $module.x-formspec-surface.shell.<SurfaceStringKey> family for app-targeted shell text.
   */
  modules?: ModuleRef[];
  /**
   * Canonical identifier for this Locale Document. Stable across versions — the tuple (url, version) SHOULD be globally unique.
   */
  url?: string;
  /**
   * Version of this Locale Document. SemVer is RECOMMENDED. The tuple (url, version) SHOULD be unique across all published locale versions.
   */
  version: string;
  /**
   * Machine-friendly short identifier for programmatic use.
   */
  name?: string;
  /**
   * Human-readable display name for the Locale Document.
   */
  title?: string;
  /**
   * Human-readable description of the locale's purpose and target audience.
   */
  description?: string;
  /**
   * BCP 47 language tag identifying the locale this document provides strings for. Processors MUST perform case-insensitive comparison and SHOULD normalize to lowercase language with title-case region (e.g., 'fr-CA').
   */
  locale: string;
  /**
   * BCP 47 language tag of the locale to consult when a key is not found in this document's strings. Enables explicit fallback chains (e.g., fr-CA → fr). If absent, the cascade proceeds to implicit language fallback (strip region subtag) or inline defaults. Processors MUST detect circular fallback chains and terminate the cascade with a warning.
   */
  fallback?: string;
  /**
   * How this locale writes values that FEL formats by style. formats.date maps a formatDate style name (short, medium, long, full) to a pattern; a style without a pattern keeps the processor's built-in rendering for the locale. Patterns use the ICU letters yyyy, yy, MMMM, MMM, MM, M, dd, d, EEEE, EEE; every other character is literal. A Definition never carries a pattern: it names the style, the Locale decides the shape.
   */
  formats?: {
    date?: {
      short?: string;
      medium?: string;
      long?: string;
      full?: string;
    };
  };
  target: LocaleTarget;
  /**
   * Map of string keys to localized values. Values are strings and MAY contain FEL interpolation only through {{expression}} syntax. Surface-only {name} placeholders are not a second template language. Shell keys use the read-only shell variable context defined by the Locale specification.
   */
  strings: {
    [k: string]: string;
  };
  /**
   * Generation provenance keyed exactly like strings. Strict data-only authoring profiles require every authored localized string to have a same-key direct current adopted Need anchor.
   */
  stringGeneration?: {
    [k: string]: Generation;
  };
  /**
   * Extension namespace for vendor-specific or tooling-specific metadata. All keys MUST be x- prefixed. Processors MUST ignore unrecognized extensions. Extensions MUST NOT alter locale resolution semantics.
   */
  extensions?: {};
};
/**
 * Closed one-to-one mapping to SurfaceStringKey. A new shell string requires a Locale schema revision.
 *
 * This interface was referenced by `undefined`'s JSON-Schema
 * via the `definition` "SurfaceShellStringKey".
 */
export type SurfaceShellStringKey =
  | '$module.x-formspec-surface.shell.slotUnavailableDefinitionForm'
  | '$module.x-formspec-surface.shell.slotUnavailableExperienceUnit'
  | '$module.x-formspec-surface.shell.slotUnavailableWidgetUnimplemented'
  | '$module.x-formspec-surface.shell.slotUnavailableWidgetIncompatible'
  | '$module.x-formspec-surface.shell.slotUnavailableWidgetUndeclared'
  | '$module.x-formspec-surface.shell.slotUnavailableWidgetData'
  | '$module.x-formspec-surface.shell.slotUnavailableStaticContent'
  | '$module.x-formspec-surface.shell.slotUnavailableEmbedUnresolved'
  | '$module.x-formspec-surface.shell.slotUnavailableEmbedCycle'
  | '$module.x-formspec-surface.shell.widgetEmpty'
  | '$module.x-formspec-surface.shell.notFoundTitle'
  | '$module.x-formspec-surface.shell.notFoundBody'
  | '$module.x-formspec-surface.shell.navigationLabel'
  | '$module.x-formspec-surface.shell.transitionContinue'
  | '$module.x-formspec-surface.shell.transitionPending'
  | '$module.x-formspec-surface.shell.transitionFailed'
  | '$module.x-formspec-surface.shell.transitionTargetUnresolved'
  | '$module.x-formspec-surface.shell.transitionTargetCollision'
  | '$module.x-formspec-surface.shell.transitionNoResponseActions'
  | '$module.x-formspec-surface.shell.transitionTriggerUnresolved'
  | '$module.x-formspec-surface.shell.transitionTriggerAmbiguous'
  | '$module.x-formspec-surface.shell.transitionNoExecutor'
  | '$module.x-formspec-surface.shell.transitionSuppliedBySlot'
  | '$module.x-formspec-surface.shell.transitionFireable';
/**
 * Extension object whose keys must be prefixed with x-.
 */
export interface Extensions {}
/**
 * Exact Definition or App Manifest target. Loaded Locale identity is (target.kind, target.url, normalized locale). A processor MUST NOT apply this document to another target or cross target identity during fallback.
 */
export interface LocaleTarget {
  /**
   * Target artifact kind. No aliases or additional kinds are admitted in Locale 2.0.
   */
  kind: 'definition' | 'app';
  /**
   * Canonical absolute URL of the target Definition or App Manifest.
   */
  url: string;
  /**
   * Optional SemVer range checked against the selected target's version.
   */
  compatibleVersions?: string;
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
