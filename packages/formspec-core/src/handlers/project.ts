/**
 * Project-level command handlers.
 *
 * Project commands manage the project lifecycle: importing complete artifact
 * bundles, merging subforms, loading/unloading extension registries, and
 * publishing versioned releases.
 *
 * @module handlers/project
 */
import type { CommandHandler, LocaleState, ProjectImportPayload } from '../types.js';
import type { FormItem } from '@formspec-org/types';
import { createComponentArtifact, normalizeComponentState } from '../component-documents.js';
import { importComponentTree } from '../component-export.js';
import { itemsByPath } from '../item-index.js';
import { generatedWidgetMoves, moveGeneratedWidgets } from '../tree-reconciler.js';
import { mappingStateFromDocument, themeStateFromDocument } from '../document-envelopes.js';
import { normalizeBindsFromUnknown } from '../definition-binds.js';
import { normalizeBcp47 } from '@formspec-org/engine';
import { assertDocumentId } from '../document-id.js';
import { indexRegistryPayload, syncAuthoredRegistries } from '../registry-index.js';

export const projectHandlers = {

  'project.import': (state, payload) => {
    const { replace, ...p } = payload as ProjectImportPayload;

    // ADR 0150 §5.2 App Manifest reframe: definitions[] is plural; the import
    // handler consumes only the first Definition at P0 (single-definition
    // authoring). Multi-definition import lands at P1+ with the multi-Definition
    // authoring surface.
    const importedDefinition = p.definitions?.[0];
    if (replace && !importedDefinition) throw new Error('project.import with replace needs a Definition');
    const previousItems = state.definition.items;
    if (importedDefinition) {
      const def = importedDefinition as typeof state.definition;
      state.definition = {
        ...def,
        binds: normalizeBindsFromUnknown(def.binds),
      } as typeof state.definition;
    }
    if (p.component) {
      state.component = normalizeComponentState(p.component, state.definition.url);
      if (state.component.tree) {
        state.component.tree = importComponentTree(state.component.tree, state.definition.items);
      }
    } else if (replace) {
      state.component = createComponentArtifact(state.definition.url);
    } else if (importedDefinition) {
      state.component = normalizeComponentState(state.component, state.definition.url);
      // The existing tree stays: nodes still showing a widget generated for an item's old
      // shape follow the imported shape, as they do when a handler edits it.
      moveGeneratedWidgets(
        state.component.tree,
        generatedWidgetMoves(itemsByPath(previousItems), itemsByPath(state.definition.items)),
      );
    }
    if (p.theme) {
      state.theme = themeStateFromDocument(p.theme);
    } else if (replace) {
      state.theme = { targetDefinition: { url: state.definition.url } };
    }

    if (p.mappings || replace) {
      const imported: typeof state.mappings = Object.fromEntries(
        Object.entries(p.mappings ?? {}).map(([id, mapping]) => [id, mappingStateFromDocument(mapping)]),
      );
      if (replace) {
        if (Object.keys(imported).length === 0) imported.default = { rules: [] };
      } else {
        // A bundle replaces every mapping that carries rules. It cannot carry a rule-less
        // one — export omits them (mapping.schema.json: rules minItems 1) — so a rule-less
        // mapping (an empty tab, its targetSchema) is authoring scaffolding, not a document
        // the bundle deleted: keep it unless the bundle supplies that id.
        for (const [id, mapping] of Object.entries(state.mappings)) {
          if (!mapping.rules?.length && !imported[id]) imported[id] = mapping;
        }
      }
      state.mappings = imported;
    }
    if (!state.selectedMappingId || !state.mappings[state.selectedMappingId]) {
      state.selectedMappingId = Object.keys(state.mappings)[0];
    }

    // Import locale documents
    if (replace) state.locales = {};
    if (p.locales && typeof p.locales === 'object') {
      state.locales = {};
      for (const [code, localeData] of Object.entries(p.locales)) {
        const imported = localeData as LocaleState;
        const locale = normalizeBcp47(imported.locale ?? code);
        state.locales[locale] = {
          ...imported,
          $formspecLocale: '2.0',
          locale,
          target: imported.target ?? {
            kind: 'definition',
            url: state.definition.url,
          },
        };
      }
    }
    // Clear a dangling selection when the imported locales do not contain it.
    if (state.selectedLocaleId && !state.locales[state.selectedLocaleId]) {
      state.selectedLocaleId = undefined;
    }

    // Import standalone sidecar documents (single emission policy: present iff non-null).
    if (p.screener !== undefined || replace) {
      state.screener = p.screener ?? null;
    }
    if (p.experience !== undefined || replace) {
      state.experience = p.experience ?? null;
    }
    if (p.responseActions !== undefined || replace) {
      state.responseActions = p.responseActions ?? null;
    }
    if (p.ontology !== undefined || replace) {
      state.ontology = p.ontology ?? null;
    }
    if (p.references !== undefined || replace) {
      state.references = p.references ?? null;
    }
    if (p.registries !== undefined || replace) {
      // The id guard sits on the ingest door too, so a bad id fails here rather than mid-write.
      for (const id of Object.keys(p.registries ?? {})) assertDocumentId(id, 'registry');
      for (const id of Object.keys(p.mappings ?? {})) assertDocumentId(id, 'mapping');
      state.registries = { ...(p.registries ?? {}) };
      syncAuthoredRegistries(state);
    }

    // A replaced project starts its own history of versions: the changelog baseline and
    // releases described the form it replaced. Loaded registries are workspace setup and stay.
    if (replace) {
      state.versioning = { baseline: structuredClone(state.definition), releases: [] };
    }

    // Sync targetDefinition URLs.
    //
    // Component's schema still REQUIRES targetDefinition, so an imported Component
    // without one is completed here. Theme's does not: theme-spec §2.2.1 makes an
    // absent targetDefinition a declaration of BUNDLE scope, so minting one on import
    // would rewrite a bundle-scoped Theme into a Definition-scoped one — the exact
    // MUST NOT the scope rev introduced. Sync the URL when the Theme declares a target;
    // otherwise leave the Theme alone.
    const url = state.definition.url;
    if (!state.component.targetDefinition) state.component.targetDefinition = { url };
    else state.component.targetDefinition.url = url;
    if (state.theme.targetDefinition) state.theme.targetDefinition.url = url;

    const needsTreeRebuild = !!importedDefinition || !!p.component;
    return { rebuildComponentTree: needsTreeRebuild, clearHistory: false };
  },

  'project.importSubform': (state, payload) => {
    const { definition, targetGroupPath, keyPrefix } = payload as {
      definition: any; targetGroupPath?: string; keyPrefix?: string;
    };

    const items = definition.items as FormItem[];
    const prefixed = keyPrefix
      ? items.map((item: any) => ({ ...item, key: `${keyPrefix}${item.key}` }))
      : items;

    if (targetGroupPath) {
      // Find the target group and append items
      const parts = targetGroupPath.split('.');
      let current = state.definition.items;
      for (const part of parts) {
        const found = current.find(it => it.key === part);
        if (!found) throw new Error(`Group not found: ${targetGroupPath}`);
        if (!found.children) found.children = [];
        current = found.children;
      }
      current.push(...prefixed);
    } else {
      state.definition.items.push(...prefixed);
    }

    return { rebuildComponentTree: true };
  },

  'project.loadRegistry': (state, payload) => {
    const { registry } = payload as { registry: Record<string, unknown> };
    state.extensions.registries.push(indexRegistryPayload(registry));
    return { rebuildComponentTree: false };
  },

  'project.removeRegistry': (state, payload) => {
    const { url } = payload as { url: string };
    // A derived row is the authored document's projection: removing it removes the document,
    // or the next sync would put the row straight back.
    for (const row of state.extensions.registries) {
      if (row.url === url && row.authoredId !== undefined) delete state.registries[row.authoredId];
    }
    state.extensions.registries = state.extensions.registries.filter(r => r.url !== url);
    return { rebuildComponentTree: false };
  },

  'project.publish': (state, payload) => {
    const { version, summary } = payload as { version: string; summary?: string };

    state.definition.version = version;

    state.versioning.releases.push({
      version,
      publishedAt: new Date().toISOString(),
      changelog: summary ?? null,
      snapshot: structuredClone(state.definition),
    });

    // Update baseline
    state.versioning.baseline = structuredClone(state.definition);

    return { rebuildComponentTree: false };
  },
} satisfies Record<string, CommandHandler>;
