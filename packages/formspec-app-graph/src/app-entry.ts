/** @filedesc App Manifest 2.4 entry Surface and selected route validation. */

import type {
  AppGraphContext,
  AppGraphDiagnostic,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import {
  handlesByKind,
  ownProp,
  record,
  recordArray,
  stringProp,
  type JsonRecord,
} from './surface-widgets.js';

interface ManifestSurfaceRef {
  ref: JsonRecord;
  index: number;
  url?: string;
}

function manifestSurfaceRefs(context: AppGraphContext): ManifestSurfaceRef[] {
  return recordArray(ownProp(record(context.manifest.document), 'surfaces')).map((ref, index) => ({
    ref,
    index,
    ...(stringProp(ref, 'url') ? { url: stringProp(ref, 'url') } : {}),
  }));
}

function loadedSurfacesForUrl(
  context: AppGraphContext,
  url: string,
): ResolvedArtifactHandle[] {
  return handlesByKind(context.handles, 'surface').filter(
    (surface) => surface.ref?.url === url,
  );
}

function ambiguousEntryDiagnostic(context: AppGraphContext): AppGraphDiagnostic {
  return {
    code: 'APP-ENTRY-AMBIGUOUS',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: 'App Manifest 2.4 declares more than one Surface without selecting entrySurface.',
    primarySource: diagnosticSourceForHandle(context.manifest, '/surfaces'),
    details: {
      reason: 'entry-surface-required',
      surfaceCount: manifestSurfaceRefs(context).length,
    },
  };
}

function unresolvedSurfaceDiagnostic(
  context: AppGraphContext,
  entrySurface: string,
  manifestMatches: number,
  loadedMatches: number,
): AppGraphDiagnostic {
  return {
    code: 'APP-ENTRY-SURFACE-UNRESOLVED',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `App Manifest entrySurface '${entrySurface}' does not resolve to exactly one manifested and loaded Surface.`,
    primarySource: diagnosticSourceForHandle(context.manifest, '/entrySurface'),
    relatedSources: [diagnosticSourceForHandle(context.manifest, '/surfaces')],
    details: {
      reason: 'entry-surface-unresolved',
      entrySurface,
      manifestMatches,
      loadedMatches,
    },
  };
}

function unresolvedRouteDiagnostic(
  surface: ResolvedArtifactHandle,
  entry: string | undefined,
  routeMatches: number,
): AppGraphDiagnostic {
  return {
    code: 'SURFACE-ENTRY-UNRESOLVED',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: `Selected Surface entry '${entry ?? '<missing>'}' does not resolve to exactly one route in that Surface.`,
    primarySource: diagnosticSourceForHandle(surface, '/entry'),
    relatedSources: [diagnosticSourceForHandle(surface, '/routes')],
    details: {
      reason: 'surface-entry-unresolved',
      surfaceRef: surface.ref?.url,
      entry,
      routeMatches,
    },
  };
}

/**
 * Select the App Manifest 2.4 entry Surface and validate that Surface's entry.
 *
 * An explicit selection error is terminal for this pass. The validator never
 * falls back to the first or sole loaded Surface after an invalid selector.
 */
export function validateAppEntry(context: AppGraphContext): AppGraphDiagnostic[] {
  const manifest = record(context.manifest.document);
  if (stringProp(manifest, '$formspecBundle') !== '2.4') return [];

  const refs = manifestSurfaceRefs(context);
  const entrySurface = stringProp(manifest, 'entrySurface');
  let selected: ResolvedArtifactHandle | undefined;

  if (entrySurface !== undefined) {
    const manifestMatches = refs.filter((ref) => ref.url === entrySurface).length;
    const loadedMatches = loadedSurfacesForUrl(context, entrySurface).length;
    if (manifestMatches !== 1 || loadedMatches !== 1) {
      return [unresolvedSurfaceDiagnostic(
        context,
        entrySurface,
        manifestMatches,
        loadedMatches,
      )];
    }
    selected = loadedSurfacesForUrl(context, entrySurface)[0];
  } else if (refs.length > 1) {
    return [ambiguousEntryDiagnostic(context)];
  } else if (refs.length === 1 && refs[0]?.url) {
    const loaded = loadedSurfacesForUrl(context, refs[0].url);
    if (loaded.length !== 1) {
      return [unresolvedSurfaceDiagnostic(context, refs[0].url, 1, loaded.length)];
    }
    selected = loaded[0];
  }

  if (!selected) return [];
  const document = record(selected.document);
  const entry = stringProp(document, 'entry');
  const routeMatches = recordArray(ownProp(document, 'routes'))
    .filter((route) => stringProp(route, 'id') === entry).length;
  return routeMatches === 1
    ? []
    : [unresolvedRouteDiagnostic(selected, entry, routeMatches)];
}
