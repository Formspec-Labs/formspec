/** @filedesc Pairs response instances and catalog sources with upstream Definitions for Rust validation. */

import { exactDefinitionResolution } from './data-sources.js';
import type { AppGraphDocumentLinter } from './document-lint.js';
import { diagnosticSourceForHandle } from './report.js';
import { escapeJsonPointerToken, handlesByKind, ownProp, record, recordArray, stringProp, type JsonRecord } from './surface-widgets.js';
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';

function definitionsForUrl(context: AppGraphContext, url: string | undefined): ResolvedArtifactHandle[] {
  if (url === undefined) return [];
  return handlesByKind(context.handles, 'definition').filter((handle) =>
    handle.ref?.url === url && stringProp(record(handle.document), 'url') === url);
}

function targetUrl(selection: JsonRecord | undefined): string | undefined {
  return stringProp(record(ownProp(selection, 'definition')), 'url');
}

function missingProjectionCheck(handle: ResolvedArtifactHandle, pointer: string): AppGraphDiagnostic {
  return {
    code: 'APP-GRAPH-PROJECTION-CHECK-MISSING',
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message: 'Response projection validation requires an injected engine projection check.',
    primarySource: diagnosticSourceForHandle(handle, pointer),
  };
}

function projectionDiagnostics(
  lint: AppGraphDocumentLinter,
  consumer: ResolvedArtifactHandle,
  pointer: string,
  source: JsonRecord,
  consumerSubject: unknown,
  upstream: ResolvedArtifactHandle[],
): AppGraphDiagnostic[] {
  const { instanceProjectionDiagnostics } = lint(source, {
    upstreamDefinitions: upstream.map((handle) => handle.document),
    consumerSubject,
  });
  if (!instanceProjectionDiagnostics) {
    return [missingProjectionCheck(consumer, pointer)];
  }
  return instanceProjectionDiagnostics.map((finding) => {
    const identified = finding.upstreamVersion === null ? [] : upstream.filter((handle) =>
      stringProp(record(handle.document), 'version') === finding.upstreamVersion);
    const upstreamPointer = finding.jsonPointer.startsWith('/schema') ? '/items' : '';
    return {
      code: finding.code,
      severity: 'error',
      phase: 'cross-artifact',
      origin: 'x-formspec-lint',
      message: finding.message,
      primarySource: diagnosticSourceForHandle(consumer, `${pointer}${finding.jsonPointer}`),
      relatedSources: identified.map((handle) => diagnosticSourceForHandle(handle, upstreamPointer)),
      details: { upstreamVersion: finding.upstreamVersion },
    };
  });
}

function catalogConsumerSubjects(
  context: AppGraphContext,
  catalog: ResolvedArtifactHandle,
  source: JsonRecord,
  selection: JsonRecord | undefined,
): unknown[] {
  const catalogRef = catalog.ref?.url;
  const sourceRef = stringProp(source, 'id');
  const readsSubject = recordArray(ownProp(selection, 'subject')).some((predicate) =>
    stringProp(record(ownProp(predicate, 'from')), 'subject') !== undefined);
  if (!readsSubject || !catalogRef || !sourceRef) return [null];

  const subjects = new Set<unknown>();
  const matchesSource = (binding: unknown) =>
    stringProp(record(binding), 'catalogRef') === catalogRef && stringProp(record(binding), 'sourceRef') === sourceRef;
  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const route of recordArray(ownProp(record(surface.document), 'routes'))) {
      for (const slot of recordArray(ownProp(route, 'slots'))) {
        const binding = record(ownProp(slot, 'binding'));
        const type = stringProp(slot, 'slotType');
        if (type === 'definition-form' && matchesSource(ownProp(binding, 'initialData'))) {
          for (const definition of definitionsForUrl(context, stringProp(binding, 'definitionRef'))) {
            subjects.add(ownProp(record(definition.document), 'subject') ?? null);
          }
        }
        if (type === 'module-widget' && Object.values(record(ownProp(binding, 'dataBindings')) ?? {}).some(matchesSource)) {
          subjects.add(null);
        }
      }
    }
  }
  return subjects.size > 0 ? [...subjects] : [null];
}

function isDraft(source: JsonRecord): boolean {
  return stringProp(record(ownProp(source, 'runtime')), 'delivery') === 'draft';
}

function projectionSources(handle: ResolvedArtifactHandle): Array<{ source: JsonRecord; pointer: string }> {
  if (handle.status !== 'loaded') return [];
  const document = record(handle.document);
  if (handle.artifactKind === 'definition') {
    const instances = record(ownProp(document, 'instances'));
    return Object.entries(instances ?? {}).flatMap(([name, value]) => {
      const source = record(value);
      return source && Object.prototype.hasOwnProperty.call(source, 'response')
        ? [{ source, pointer: `/instances/${escapeJsonPointerToken(name)}` }]
        : [];
    });
  }
  if (handle.artifactKind !== 'dataSources') return [];
  const sources = ownProp(document, 'sources');
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((value, index) => {
    const source = record(value);
    if (!source || stringProp(source, 'kind') !== 'definition-response') return [];
    // An unprojected session draft has no schema or selection to check.
    if (isDraft(source) && ownProp(source, 'schema') === undefined) return [];
    return [{ source, pointer: `/sources/${index}` }];
  });
}

export function missingResponseProjectionChecks(handles: readonly ResolvedArtifactHandle[]): AppGraphDiagnostic[] {
  return handles.flatMap((handle) => {
    const first = projectionSources(handle)[0];
    return first ? [missingProjectionCheck(handle, first.pointer)] : [];
  });
}

export function responseProjectionDiagnostics(
  lint: AppGraphDocumentLinter,
  context: AppGraphContext,
  handle: ResolvedArtifactHandle,
): AppGraphDiagnostic[] {
  return projectionSources(handle).flatMap(({ source, pointer }) => {
    if (handle.artifactKind === 'definition') {
      const subject = ownProp(record(handle.document), 'subject') ?? null;
      const upstream = definitionsForUrl(context, targetUrl(record(ownProp(source, 'response'))));
      return projectionDiagnostics(lint, handle, pointer, source, subject, upstream);
    }
    if (isDraft(source)) {
      const ref = stringProp(source, 'definitionRef');
      // Availability validation already reports unresolved or ambiguous draft Definitions.
      const definition = ref === undefined ? undefined : exactDefinitionResolution(context, ref).definition;
      return definition ? projectionDiagnostics(lint, handle, pointer, source, null, [definition]) : [];
    }
    const selection = record(ownProp(source, 'responseSelection'));
    const upstream = definitionsForUrl(context, targetUrl(selection));
    const seen = new Set<string>();
    return catalogConsumerSubjects(context, handle, source, selection).flatMap((subject) =>
      projectionDiagnostics(lint, handle, pointer, source, subject, upstream).filter((finding) => {
        const identity = JSON.stringify([
          finding.code, finding.primarySource?.jsonPointer, finding.details?.upstreamVersion,
        ]);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      }));
  });
}
