/**
 * Project-level command handlers.
 *
 * Project commands manage the project lifecycle: importing complete artifact
 * bundles, merging subforms, loading/unloading extension registries, and
 * publishing versioned releases.
 *
 * @module handlers/project
 */
import type { CommandHandler, LocaleState, ProjectBundle } from '../types.js';
import type { FormItem } from '@formspec-org/types';
import { normalizeComponentState } from '../component-documents.js';
import { mappingStateFromDocument, themeStateFromDocument } from '../document-envelopes.js';
import { normalizeBindsFromUnknown } from '../definition-binds.js';
import { normalizeBcp47 } from '@formspec-org/engine';
import { indexRegistryPayload } from '../registry-index.js';

export const projectHandlers = {

  'project.import': (state, payload) => {
    const p = payload as Partial<ProjectBundle>;

    // ADR 0150 §5.2 App Manifest reframe: definitions[] is plural; the import
    // handler consumes only the first Definition at P0 (single-definition
    // authoring). Multi-definition import lands at P1+ with the multi-Definition
    // authoring surface.
    const importedDefinition = p.definitions?.[0];
    if (importedDefinition) {
      const def = importedDefinition as typeof state.definition;
      state.definition = {
        ...def,
        binds: normalizeBindsFromUnknown(def.binds),
      } as typeof state.definition;
    }
    if (p.component) {
      state.component = normalizeComponentState(p.component, state.definition.url);
    } else if (importedDefinition) {
      state.component = normalizeComponentState(state.component, state.definition.url);
    }
    if (p.theme) {
      state.theme = themeStateFromDocument(p.theme);
    }

    if (p.mappings) {
      state.mappings = Object.fromEntries(
        Object.entries(p.mappings).map(([id, mapping]) => [id, mappingStateFromDocument(mapping)]),
      );
    }

    // Import locale documents
    if (p.locales && typeof p.locales === 'object') {
      state.locales = {};
      for (const [code, localeData] of Object.entries(p.locales)) {
        const locale = normalizeBcp47((localeData as LocaleState).locale ?? code);
        state.locales[locale] = {
          ...(localeData as LocaleState),
          locale,
        };
      }

      // Clear dangling selection if imported locales do not contain it.
      if (state.selectedLocaleId && !state.locales[state.selectedLocaleId]) {
        state.selectedLocaleId = undefined;
      }
    }

    // Import standalone sidecar documents (single emission policy: present iff non-null).
    if (p.screener !== undefined) {
      state.screener = p.screener ?? null;
    }
    if (p.experience !== undefined) {
      state.experience = p.experience ?? null;
    }
    if (p.responseActions !== undefined) {
      state.responseActions = p.responseActions ?? null;
    }

    // Sync targetDefinition URLs
    const url = state.definition.url;
    if (!state.component.targetDefinition) state.component.targetDefinition = { url };
    else state.component.targetDefinition.url = url;
    if (!state.theme.targetDefinition) state.theme.targetDefinition = { url };
    else state.theme.targetDefinition.url = url;

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
