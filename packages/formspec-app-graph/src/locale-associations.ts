/** @filedesc App Manifest 2.4 Locale reference and target coherence checks. */

import { satisfies, valid, validRange } from 'semver';
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

interface LocaleRefRecord {
  ref: JsonRecord;
  index: number;
  url?: string;
  locale?: string;
}

interface LocaleTupleRecord {
  handle: ResolvedArtifactHandle;
  kind: string;
  url: string;
  locale: string;
  key: string;
}

/**
 * Normalize the case conventions that are significant to BCP 47 comparison.
 *
 * The source schemas already constrain the tag grammar. This function does not
 * expand aliases or consult an external language registry.
 */
export function normalizeLocaleTag(locale: string): string {
  return locale.split('-').map((part, index) => {
    if (index === 0) return part.toLowerCase();
    if (/^[A-Za-z]{4}$/.test(part)) {
      return `${part[0]?.toUpperCase()}${part.slice(1).toLowerCase()}`;
    }
    if (/^[A-Za-z]{2}$/.test(part) || /^[0-9]{3}$/.test(part)) {
      return part.toUpperCase();
    }
    return part.toLowerCase();
  }).join('-');
}

function manifestRecord(context: AppGraphContext): JsonRecord | undefined {
  return record(context.manifest.document);
}

function localeRefs(context: AppGraphContext): LocaleRefRecord[] {
  return recordArray(ownProp(manifestRecord(context), 'locales')).map((ref, index) => ({
    ref,
    index,
    ...(stringProp(ref, 'url') ? { url: stringProp(ref, 'url') } : {}),
    ...(stringProp(ref, 'locale') ? { locale: stringProp(ref, 'locale') } : {}),
  }));
}

function diagnostic(
  code: string,
  message: string,
  primary: ResolvedArtifactHandle,
  pointer: string,
  details: Record<string, unknown>,
  relatedSources?: AppGraphDiagnostic['relatedSources'],
): AppGraphDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource: diagnosticSourceForHandle(primary, pointer),
    ...(relatedSources && relatedSources.length > 0 ? { relatedSources } : {}),
    details,
  };
}

function duplicateRefDiagnostics(context: AppGraphContext): AppGraphDiagnostic[] {
  const refsByUrl = new Map<string, LocaleRefRecord[]>();
  for (const ref of localeRefs(context)) {
    if (!ref.url) continue;
    refsByUrl.set(ref.url, [...(refsByUrl.get(ref.url) ?? []), ref]);
  }
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const [url, refs] of refsByUrl) {
    if (refs.length < 2) continue;
    diagnostics.push(diagnostic(
      'APP-GRAPH-LOCALE-REF',
      `App Manifest 2.4 declares Locale URL '${url}' more than once.`,
      context.manifest,
      `/locales/${refs[0]?.index ?? 0}/url`,
      {
        reason: 'duplicate-reference-url',
        url,
        referenceIndices: refs.map((ref) => ref.index),
      },
      refs.slice(1).map((ref) =>
        diagnosticSourceForHandle(context.manifest, `/locales/${ref.index}/url`)
      ),
    ));
  }
  return diagnostics;
}

function targetArtifact(
  context: AppGraphContext,
  kind: string,
  url: string,
): { version?: string; matches: number } {
  if (kind === 'app') {
    const manifest = manifestRecord(context);
    return stringProp(manifest, 'id') === url
      ? { version: stringProp(manifest, 'version'), matches: 1 }
      : { matches: 0 };
  }
  if (kind !== 'definition') return { matches: 0 };
  const definitions = handlesByKind(context.handles, 'definition').filter((definition) =>
    definition.ref?.url === url
    && stringProp(record(definition.document), 'url') === url
  );
  return {
    ...(definitions.length === 1
      ? { version: stringProp(record(definitions[0]?.document), 'version') }
      : {}),
    matches: definitions.length,
  };
}

function compatibleVersionFailure(
  compatibleVersions: string | undefined,
  targetVersion: string | undefined,
): string | undefined {
  if (compatibleVersions === undefined) return undefined;
  if (!validRange(compatibleVersions)) return 'target-version-range-invalid';
  if (!targetVersion || !valid(targetVersion)) return 'target-version-not-semver';
  return satisfies(targetVersion, compatibleVersions, { includePrerelease: true })
    ? undefined
    : 'target-version-incompatible';
}

function perLocaleDiagnostics(context: AppGraphContext): {
  diagnostics: AppGraphDiagnostic[];
  tuples: LocaleTupleRecord[];
} {
  const refs = localeRefs(context);
  const diagnostics: AppGraphDiagnostic[] = [];
  const tuples: LocaleTupleRecord[] = [];

  for (const locale of handlesByKind(context.handles, 'locale')) {
    const document = record(locale.document);
    const refUrl = typeof locale.ref?.url === 'string' ? locale.ref.url : undefined;
    const matchingRefs = refs.filter((ref) => ref.url === refUrl);
    const documentLocale = stringProp(document, 'locale');
    const refLocale = matchingRefs.length === 1 ? matchingRefs[0]?.locale : undefined;
    if (
      !refUrl
      || matchingRefs.length !== 1
      || !documentLocale
      || !refLocale
      || normalizeLocaleTag(documentLocale) !== normalizeLocaleTag(refLocale)
    ) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-LOCALE-REF',
        `Loaded Locale '${locale.slot}' does not match exactly one App Manifest Locale reference by URL and normalized locale.`,
        locale,
        '/locale',
        {
          reason: 'reference-document-mismatch',
          refUrl,
          referenceMatches: matchingRefs.length,
          referenceLocale: refLocale,
          documentLocale,
        },
        matchingRefs.map((ref) =>
          diagnosticSourceForHandle(context.manifest, `/locales/${ref.index}`)
        ),
      ));
    }

    const target = record(ownProp(document, 'target'));
    const kind = stringProp(target, 'kind');
    const url = stringProp(target, 'url');
    const compatibleVersions = stringProp(target, 'compatibleVersions');
    if (!kind || !url) continue;
    const resolvedTarget = targetArtifact(context, kind, url);
    const versionFailure = compatibleVersionFailure(
      compatibleVersions,
      resolvedTarget.version,
    );
    if (resolvedTarget.matches !== 1 || versionFailure) {
      diagnostics.push(diagnostic(
        'APP-GRAPH-LOCALE-TARGET',
        `Locale '${locale.slot}' target '${kind}:${url}' does not resolve compatibly in the loaded app graph.`,
        locale,
        '/target',
        {
          reason: resolvedTarget.matches !== 1 ? 'target-unresolved' : versionFailure,
          targetKind: kind,
          targetUrl: url,
          targetMatches: resolvedTarget.matches,
          compatibleVersions,
          targetVersion: resolvedTarget.version,
        },
      ));
    }

    if (documentLocale) {
      const normalizedLocale = normalizeLocaleTag(documentLocale);
      tuples.push({
        handle: locale,
        kind,
        url,
        locale: normalizedLocale,
        key: `${kind}\u0000${url}\u0000${normalizedLocale}`,
      });
    }
  }
  return { diagnostics, tuples };
}

function duplicateTupleDiagnostics(tuples: readonly LocaleTupleRecord[]): AppGraphDiagnostic[] {
  const tuplesByKey = new Map<string, LocaleTupleRecord[]>();
  for (const tuple of tuples) {
    tuplesByKey.set(tuple.key, [...(tuplesByKey.get(tuple.key) ?? []), tuple]);
  }
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const matches of tuplesByKey.values()) {
    if (matches.length < 2) continue;
    const first = matches[0]!;
    diagnostics.push(diagnostic(
      'APP-GRAPH-LOCALE-DUPLICATE',
      `More than one loaded Locale declares target '${first.kind}:${first.url}' and locale '${first.locale}'.`,
      first.handle,
      '/target',
      {
        reason: 'duplicate-normalized-target-locale',
        targetKind: first.kind,
        targetUrl: first.url,
        locale: first.locale,
        slots: matches.map((match) => match.handle.slot).sort(),
      },
      matches.slice(1).map((match) => diagnosticSourceForHandle(match.handle, '/target')),
    ));
  }
  return diagnostics;
}

export function validateLocaleAssociations(context: AppGraphContext): AppGraphDiagnostic[] {
  if (stringProp(manifestRecord(context), '$formspecBundle') !== '2.4') return [];
  const perLocale = perLocaleDiagnostics(context);
  return [
    ...duplicateRefDiagnostics(context),
    ...perLocale.diagnostics,
    ...duplicateTupleDiagnostics(perLocale.tuples),
  ];
}
