/**
 * Pure query function for project diagnostics backed by the canonical stack linter.
 */
import {
  documentLintDiagnostics,
  type AppGraphArtifactRef,
  type AppGraphDiagnostic,
  type AppGraphDocumentLintContext,
  type AppGraphDocumentLinter,
  type ResolvedArtifactHandle,
} from '@formspec-org/app-graph';
import { lintDocument } from '@formspec-org/engine/fel-tools';
import { exportBundle } from '../export-bundle.js';
import type { ProjectState, Diagnostics } from '../types.js';

function refFor(document: unknown): AppGraphArtifactRef | undefined {
  if (!document || typeof document !== 'object') return undefined;
  const record = document as Record<string, unknown>;
  const url = typeof record.url === 'string' && record.url.length > 0 ? record.url : undefined;
  const version = typeof record.version === 'string' && record.version.length > 0 ? record.version : undefined;
  if (url === undefined && version === undefined) return undefined;
  return {
    ...(url !== undefined ? { url } : {}),
    ...(version !== undefined ? { version } : {}),
  };
}

function makeHandle(artifactKind: string, slot: string, document: unknown): ResolvedArtifactHandle {
  const ref = refFor(document);
  return {
    slot,
    artifactKind,
    status: 'loaded',
    document,
    ...(ref !== undefined ? { ref } : {}),
  };
}

/**
 * Strip explicit `undefined` properties so every returned entry conforms to
 * `app-graph-validation-report.schema.json` `$defs/Diagnostic` both in-memory
 * and after JSON serialization.
 */
function sanitizeDiagnostic(diagnostic: AppGraphDiagnostic): AppGraphDiagnostic {
  const result: AppGraphDiagnostic = {
    code: diagnostic.code,
    severity: diagnostic.severity,
    phase: diagnostic.phase,
    origin: diagnostic.origin,
    message: diagnostic.message,
  };
  if (diagnostic.primarySource) {
    const src = diagnostic.primarySource;
    const clean: NonNullable<AppGraphDiagnostic['primarySource']> = {};
    if (src.artifactSlot !== undefined) clean.artifactSlot = src.artifactSlot;
    if (src.artifactKind !== undefined) clean.artifactKind = src.artifactKind;
    if (src.source !== undefined) clean.source = src.source;
    if (src.jsonPointer !== undefined) clean.jsonPointer = src.jsonPointer;
    if (src.ref !== undefined) clean.ref = src.ref;
    result.primarySource = clean;
  }
  if (diagnostic.relatedSources) {
    result.relatedSources = diagnostic.relatedSources;
  }
  if (diagnostic.details) {
    const cleanDetails: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(diagnostic.details)) {
      if (v !== undefined) cleanDetails[k] = v;
    }
    if (Object.keys(cleanDetails).length > 0) {
      result.details = cleanDetails;
    }
  }
  return result;
}

const stackLinter: AppGraphDocumentLinter = (document, context) => lintDocument(document, context);

/**
 * Lint every exported document in the project through the stack linter and
 * return canonical AppGraph diagnostics plus severity counts.
 *
 * Throws if tools WASM is uninitialised; never silently returns an empty report.
 */
export function diagnose(state: ProjectState): Diagnostics {
  const bundle = exportBundle(state);
  const definition = bundle.definitions[0];
  const registryDocuments = state.extensions.registries.map((entry) => entry.document);
  const diagnostics: AppGraphDiagnostic[] = [];

  const lintOne = (artifactKind: string, slot: string, document: unknown, context: AppGraphDocumentLintContext) => {
    const handle = makeHandle(artifactKind, slot, document);
    for (const entry of documentLintDiagnostics(stackLinter, handle, context)) {
      diagnostics.push(sanitizeDiagnostic(entry));
    }
  };

  // Definition — paired with all loaded and authored extension registries.
  lintOne(
    'definition',
    'definition',
    definition,
    registryDocuments.length > 0 ? { registryDocuments } : {},
  );

  // Component document — paired with Definition and Theme (when declared).
  if (bundle.component) {
    lintOne('component', 'component', bundle.component, {
      definitionDocument: definition,
      ...(bundle.theme ? { themeDocument: bundle.theme } : {}),
    });
  }

  // Theme document — paired with Definition.
  if (bundle.theme) {
    lintOne('theme', 'theme', bundle.theme, {
      definitionDocument: definition,
    });
  }

  // Mapping documents — paired with Definition.
  for (const [id, mapping] of Object.entries(bundle.mappings)) {
    lintOne('mapping', id === 'default' ? 'mapping' : `mapping:${id}`, mapping, {
      definitionDocument: definition,
    });
  }

  // Locale documents — paired with Definition, Theme, Component, and all sibling Locales.
  if (bundle.locales) {
    const localeEntries = Object.entries(bundle.locales);
    for (const [code, locale] of localeEntries) {
      const siblingLocales = localeEntries
        .filter(([otherCode]) => otherCode !== code)
        .map(([, doc]) => doc);
      lintOne('locale', `locale:${code}`, locale, {
        definitionDocument: definition,
        ...(bundle.screener ? { screenerDocument: bundle.screener } : {}),
        ...(bundle.theme ? { themeDocument: bundle.theme } : {}),
        ...(bundle.component ? { componentDocuments: [bundle.component] } : {}),
        ...(siblingLocales.length > 0 ? { localeDocuments: siblingLocales } : {}),
      });
    }
  }

  // Screener document — paired with Definition.
  if (bundle.screener) {
    lintOne('screener', 'screener', bundle.screener, {
      definitionDocument: definition,
    });
  }

  // Response Actions document — paired with Definition and Component (when present).
  if (bundle.responseActions) {
    lintOne('responseActions', 'responseActions', bundle.responseActions, {
      definitionDocument: definition,
      ...(bundle.component ? { componentDocuments: [bundle.component] } : {}),
    });
  }

  // Ontology document — paired with Definition.
  if (bundle.ontology) {
    lintOne('ontology', 'ontology', bundle.ontology, {
      definitionDocument: definition,
    });
  }

  // References document — paired with Definition.
  if (bundle.references) {
    lintOne('references', 'references', bundle.references, {
      definitionDocument: definition,
    });
  }

  // Authored Registry documents.
  if (bundle.registries) {
    for (const [id, registry] of Object.entries(bundle.registries)) {
      lintOne('registry', id === 'default' ? 'registry' : `registry:${id}`, registry, {});
    }
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const d of diagnostics) {
    counts[d.severity]++;
  }

  return { diagnostics, counts };
}
