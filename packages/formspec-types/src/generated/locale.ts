/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { ModuleRef } from './common.js';
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
  target: LocaleTarget;
  /**
   * Map of string keys to localized values. Values are strings and MAY contain FEL interpolation only through {{expression}} syntax. Surface-only {name} placeholders are not a second template language. Shell keys use the read-only shell variable context defined by the Locale specification.
   */
  strings: {
    [k: string]: string;
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
