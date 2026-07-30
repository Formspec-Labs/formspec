/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { Generation } from './common.js';
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioCatalogRef".
 */
export type SurfaceScenarioCatalogRef = string;
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioSourceRef".
 */
export type SurfaceScenarioSourceRef = string;
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioSourceOutcome".
 */
export type SurfaceScenarioSourceOutcome = SurfaceScenarioLoadedSource | SurfaceScenarioUnavailableSource;

/**
 * Preview-only runtime state for exercising a data-only Surface bundle. This document is not an App Manifest member and MUST NOT be treated as production data. It supplies route parameters, qualified Data Source outcomes, coarse authorization verdicts, and simulated action outcomes to a fixed generic preview host.
 */
export interface SurfacePreviewScenario {
  $formspecSurfaceScenario: '0.1';
  version: string;
  initialPath: string;
  routeParams?: {
    [k: string]: string;
  };
  defaultProfile: string;
  'x-generation'?: Generation;
  routeParamsGeneration?: Generation;
  profiles: {
    [k: string]: SurfaceScenarioProfile;
  };
  actions: SurfaceScenarioActionOutcomes;
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
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Za-z][A-Za-z0-9_-]*$".
 *
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioProfile".
 */
export interface SurfaceScenarioProfile {
  authorization: SurfaceScenarioAuthorization;
  sources: SurfaceScenarioSourceOutcome[];
}
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioAuthorization".
 */
export interface SurfaceScenarioAuthorization {
  default: 'authorized' | 'refused';
  overrides?: SurfaceScenarioAuthorizationOverride[];
}
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioAuthorizationOverride".
 */
export interface SurfaceScenarioAuthorizationOverride {
  catalogRef: SurfaceScenarioCatalogRef;
  sourceRef: SurfaceScenarioSourceRef;
  decision: 'authorized' | 'refused';
}
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioLoadedSource".
 */
export interface SurfaceScenarioLoadedSource {
  catalogRef: SurfaceScenarioCatalogRef;
  sourceRef: SurfaceScenarioSourceRef;
  status: 'loaded';
  freshness: 'fresh' | 'stale';
  'x-generation'?: Generation;
  value: unknown;
}
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioUnavailableSource".
 */
export interface SurfaceScenarioUnavailableSource {
  catalogRef: SurfaceScenarioCatalogRef;
  sourceRef: SurfaceScenarioSourceRef;
  status: 'unavailable';
  'x-generation'?: Generation;
  reason: string;
}
/**
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioActionOutcomes".
 */
export interface SurfaceScenarioActionOutcomes {
  default: SurfaceScenarioActionOutcome;
  byAction?: {
    [k: string]: SurfaceScenarioActionOutcome;
  };
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Za-z][A-Za-z0-9-]*$".
 *
 * This interface was referenced by `SurfacePreviewScenario`'s JSON-Schema
 * via the `definition` "SurfaceScenarioActionOutcome".
 */
export interface SurfaceScenarioActionOutcome {
  status: 'complete' | 'fail' | 'defer';
  message?: string;
  'x-generation'?: Generation;
}
