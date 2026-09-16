/** @filedesc Ontology §6.2 JSON-LD context derived from a Definition and an Ontology document's bindings (Rust/WASM). */
import { deriveJsonLdContext as wasmDeriveJsonLdContext, type JsonLdContextDiagnostic } from '@formspec-org/engine/fel-tools';
import type { FormDefinition, OntologyDocument } from '@formspec-org/types';

/** One thing the derivation could not honor; see the Ontology spec §6.2 for the three kinds. */
export type JsonLdDiagnostic = JsonLdContextDiagnostic;

/** The derived `@context` object (unwrapped) and everything the derivation could not honor. */
export interface JsonLdDerivation {
  /** Assign to `ontology.context['@context']` or apply as `{ '@context': context, ...response.data }`. */
  context: Record<string, unknown>;
  /** Empty when every concept binding produced its term. */
  diagnostics: JsonLdDiagnostic[];
}

/**
 * Derive the JSON-LD `@context` that lifts a Response to linked data (Ontology spec §6.2).
 *
 * Bound fields name their concept typed by `dataType`; bound groups become scoped contexts
 * (repeatable ones `@set` containers); unbound structural groups nest; a key reused across
 * scopes cannot collide. The derived context is the reference: lint diffs an authored
 * `context['@context']` against it. Requires `initFormspecEngineTools()`.
 */
export function deriveJsonLdContext(definition: FormDefinition, ontology: OntologyDocument): JsonLdDerivation {
  return wasmDeriveJsonLdContext(definition, ontology);
}
