/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */
import type { TargetDefinition } from './component.js';
/**
 * A Formspec Locale Document — a sidecar JSON artifact that provides internationalized strings for a Formspec Definition. A Locale Document binds to a Definition by URL, maps item paths to localized strings via a flat key-value structure, supports FEL interpolation for dynamic content via {{expression}} syntax, and composes via a fallback cascade (regional → base language → inline defaults). Multiple Locale Documents MAY target the same Definition, one per locale. A Locale Document MUST NOT affect data collection, validation logic, or behavioral semantics — it controls only the display strings presented to the user.
 */
export interface LocaleDocument {
  /**
   * Locale specification version. MUST be '1.0'.
   */
  $formspecLocale: '1.0';
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
  targetDefinition: TargetDefinition;
  /**
   * Map of string keys to localized values. Keys follow the dot-delimited path format defined in the Locale Specification §3.1. Values are strings, optionally containing FEL interpolation via {{expression}} syntax. Keys address item properties (key.label, key.description, key.hint), context labels (key.label@context, key.hint@context), choice options (key.options.value.label), shared option sets ($optionSet.setName.value.label), validation messages (key.errors.CODE, key.constraintMessage, key.requiredMessage), form-level strings ($form.title, $form.description), shape messages ($shape.id.message), theme page strings ($page.pageId.title, $page.pageId.description), and component node strings ($component.nodeId.property).
   */
  strings: {
    [k: string]: string;
  };
  /**
   * Extension namespace for vendor-specific or tooling-specific metadata. All keys MUST be x- prefixed. Processors MUST ignore unrecognized extensions. Extensions MUST NOT alter locale resolution semantics.
   */
  extensions?: {};
}
