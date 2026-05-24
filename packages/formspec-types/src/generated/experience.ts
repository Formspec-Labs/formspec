/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef, TargetDefinition, Extensions } from './common.js';
/**
 * Closed-core task-oriented unit kind OR a module-contributed `x-` extension (ADR 0150 §4.5). Closed-core values: data-entry (user provides or revises data), review (read-only display of captured data), confirmation (user affirms accuracy before a transition), evidence-collection (user supplies evidence — attachments, attestations), attestation (user certifies a statement under accountability), error-resolution (user resolves a validation finding), assistance (user receives help). Extension values follow the canonical `^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$` regex (§4.8).
 *
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "UnitKind".
 */
export type UnitKind =
  | (
      | 'data-entry'
      | 'review'
      | 'confirmation'
      | 'evidence-collection'
      | 'attestation'
      | 'error-resolution'
      | 'assistance'
    )
  | string;

/**
 * A Formspec Experience Document per the Experience specification. A standalone sidecar that names abstract task intent for a Formspec Definition: actors, tasks, units, applicability, and typed references to items, concepts, and actions. Like Theme, Component, Locale, and References documents, an Experience Document targets a Definition but lives alongside it. Multiple Experience Documents MAY target the same Definition (e.g., different actor populations, platforms, or postures). Experience metadata MUST NOT alter core behavioral semantics (required, relevant, readonly, calculate, validation).
 */
export interface ExperienceDocument {
  /**
   * Experience specification version. MUST be '1.0'.
   */
  $formspecExperience: '1.0';
  /**
   * OPTIONAL declaration of substrate modules this document depends on. Each entry is a canonical ModuleRef (id + version, with optional publisher + lockHash for posture admission). Default-module-set behavior per ADR 0150 §4.9 preserves form-only documents — omitting modules[] is identical to declaring the core module set. Per ADR 0150 §4.3.
   */
  modules?: ModuleRef[];
  /**
   * Version of this Experience Document. SemVer is RECOMMENDED.
   */
  version: string;
  targetDefinition: TargetDefinition;
  name?: string;
  title?: string;
  description?: string;
  applicability?: Applicability;
  actors?: Actor[];
  tasks?: Task[];
  /**
   * Substantive Experience payload. Each Unit organizes typed item, concept, and action references under abstract task intent.
   */
  units?: Unit[];
  extensions?: Extensions;
  /**
   * This interface was referenced by `ExperienceDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: `x-${string}`]: unknown;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "Applicability".
 */
export interface Applicability {
  actorRefs?: string[];
  /**
   * Open enum. Common values: web, mobile, pdf, cli, voice, agent.
   */
  platforms?: string[];
  /**
   * BCP 47 locale tags.
   */
  locales?: string[];
  posture?: string;
  channels?: string[];
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "Actor".
 */
export interface Actor {
  /**
   * Stable identifier for this Actor. Unique within actors[].
   */
  id: string;
  title?: string;
  description?: string;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "Task".
 */
export interface Task {
  /**
   * Stable identifier for this Task. Unique within tasks[]. Referenced by Component nodes via taskRefs[].
   */
  id: string;
  title?: string;
  description?: string;
  actorRefs?: string[];
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "Unit".
 */
export interface Unit {
  /**
   * Stable identifier for this Unit. Unique within units[]. Referenced by Component nodes via unitRef.
   */
  id: string;
  kind: UnitKind;
  title?: string;
  description?: string;
  /**
   * Actor this unit is intended for. MUST resolve to actors[].id.
   */
  actorRef?: string;
  /**
   * Tasks this unit advances. Each MUST resolve to tasks[].id.
   */
  taskRefs?: string[];
  itemRefs?: ItemRef[];
  conceptRefs?: ConceptRef[];
  actionRefs?: ActionRef[];
  applicability?: Applicability;
  accessibility?: Accessibility;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "ItemRef".
 */
export interface ItemRef {
  /**
   * Canonical Definition item path using Core FieldRef syntax. For repeat-group children use the [*] wildcard path (e.g., household.members[*].firstName).
   */
  path: string;
  /**
   * User-facing purpose. Default depends on enclosing unit.kind (S6.1).
   */
  purpose?: 'collect' | 'display' | 'attest' | 'cite';
  description?: string;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "ConceptRef".
 */
export interface ConceptRef {
  /**
   * Registry / Ontology concept identifier.
   */
  id: string;
  source?: 'registry' | 'ontology' | 'external';
  description?: string;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "ActionRef".
 */
export interface ActionRef {
  /**
   * Response Action identifier. MUST resolve against the loaded Response Actions document's actions[*].id set.
   */
  id: string;
  role?: 'primary' | 'secondary' | 'escape';
  description?: string;
  extensions?: Extensions;
}
/**
 * This interface was referenced by `ExperienceDocument`'s JSON-Schema
 * via the `definition` "Accessibility".
 */
export interface Accessibility {
  assistive?: boolean;
  complexity?: 'low' | 'moderate' | 'high';
  requiresLiteracy?: boolean;
  extensions?: Extensions;
}
