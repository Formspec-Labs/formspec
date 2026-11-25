/** @filedesc Pure bundle export shared by RawProject.export() and diagnose(). */
import type { MappingDocument } from '@formspec-org/types';
import type { ProjectBundle, ProjectState } from './types.js';
import { exportComponentTree } from './component-export.js';
import { serializeToJSON } from './queries/serialization.js';
import {
  withComponentEnvelope,
  withMappingEnvelope,
  withThemeEnvelope,
} from './document-envelopes.js';

/**
 * Export the current project state as a cloned, schema-enveloped {@link ProjectBundle}.
 */
export function exportBundle(state: ProjectState): ProjectBundle {
  const url = state.definition.url;

  // mapping.schema.json requires `rules` minItems 1: a rule-less mapping is authoring
  // scaffolding (the seeded `default`, a freshly created tab), not a document.
  const exportMappings: Record<string, MappingDocument> = {};
  for (const [id, m] of Object.entries(state.mappings)) {
    if (m.rules?.length) exportMappings[id] = withMappingEnvelope(m, url);
  }

  const componentExport = exportComponentTree(state);
  const bundle: ProjectBundle = {
    // ADR 0150 §5.2 App Manifest reframe: `definitions` is plural. P0 authoring
    // still owns a single Definition, so this array is single-element; multi-
    // definition authoring lands at P1+.
    definitions: [serializeToJSON(state)],
    // component-spec §1.2: a Component Document overrides Theme widget selection, so a
    // tree the Definition alone generates is not emitted — its absence lets the theme apply.
    ...(componentExport.derived ? {} : {
      component: withComponentEnvelope({ ...state.component, tree: componentExport.tree }, url),
    }),
    // theme-spec §2.2.1: an absent targetDefinition is bundle scope and stays absent
    // (never `?? { url }`); the document's own key order is kept.
    ...(state.themeDeclared ? { theme: withThemeEnvelope(state.theme) } : {}),
    mappings: exportMappings,
  };

  // Locale state is the document (import keeps it whole, `$formspecLocale` included), so
  // export it whole: picking fields here dropped `formats` and reordered what an author wrote.
  if (Object.keys(state.locales).length > 0) {
    bundle.locales = { ...state.locales };
  }

  // Single emission policy for standalone sidecars: present iff non-null in state.
  if (state.screener) {
    bundle.screener = state.screener;
  }
  if (state.experience) {
    bundle.experience = state.experience;
  }
  if (state.responseActions) {
    bundle.responseActions = state.responseActions;
  }
  // Both serialized from authored state, never from the derived `extensions.registries`
  // rows (the index injects a `url` the author never wrote).
  if (state.ontology) {
    bundle.ontology = state.ontology;
  }
  if (Object.keys(state.registries).length > 0) {
    bundle.registries = state.registries;
  }
  if (state.references) {
    bundle.references = state.references;
  }

  return structuredClone(bundle);
}
