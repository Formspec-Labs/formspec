/** @filedesc Pairs response instances and catalog sources with upstream Definitions for Rust validation. */

import { exactDefinitionResolution } from './data-sources.js';
import type { AppGraphDocumentLinter, AppGraphDocumentLintContext } from './document-lint.js';
import { diagnosticSourceForHandle } from './report.js';
import { escapeJsonPointerToken, handlesByKind, ownProp, record, recordArray, stringProp, type JsonRecord } from './surface-widgets.js';
import type { AppGraphContext, AppGraphDiagnostic, ResolvedArtifactHandle } from './types.js';

function definitionsForUrl(context: { handles: readonly ResolvedArtifactHandle[] }, url: string | undefined): ResolvedArtifactHandle[] {
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
  projectionConsumer: AppGraphDocumentLintContext['projectionConsumer'],
  upstream: ResolvedArtifactHandle[],
): AppGraphDiagnostic[] {
  const { instanceProjectionDiagnostics } = lint(source, {
    upstreamDefinitions: upstream.map((handle) => handle.document),
    projectionConsumer,
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

function catalogConsumers(
  context: { handles: readonly ResolvedArtifactHandle[] },
  catalog: ResolvedArtifactHandle,
  source: JsonRecord,
): Array<AppGraphDocumentLintContext['projectionConsumer']> {
  const catalogRef = catalog.ref?.url;
  const sourceRef = stringProp(source, 'id');
  if (!catalogRef || !sourceRef) return [null];
  const forms = new Map<ResolvedArtifactHandle, boolean>();
  let widget = false;
  const matchesSource = (binding: unknown) =>
    stringProp(record(binding), 'catalogRef') === catalogRef && stringProp(record(binding), 'sourceRef') === sourceRef;
  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const route of recordArray(ownProp(record(surface.document), 'routes'))) {
      for (const slot of recordArray(ownProp(route, 'slots'))) {
        const binding = record(ownProp(slot, 'binding'));
        const type = stringProp(slot, 'slotType');
        if (type === 'definition-form' && matchesSource(ownProp(binding, 'initialData'))) {
          for (const definition of definitionsForUrl(context, stringProp(binding, 'definitionRef'))) {
            const initialData = record(ownProp(binding, 'initialData'));
            const mapped = ownProp(initialData, 'mappingRef') !== undefined;
            // One direct binding is enough to check the receiving fields.
            forms.set(definition, mapped && (forms.get(definition) ?? true));
          }
        }
        if (type === 'module-widget' && Object.values(record(ownProp(binding, 'dataBindings')) ?? {}).some(matchesSource)) {
          widget = true;
        }
      }
    }
  }
  const consumers: Array<AppGraphDocumentLintContext['projectionConsumer']> = Array.from(
    forms, ([form, mapped]) => ({ kind: 'prefill', definition: form.document, mapped }),
  );
  if (widget || forms.size === 0) consumers.push(null);
  return consumers;
}

function isDraft(source: JsonRecord): boolean {
  return stringProp(record(ownProp(source, 'runtime')), 'delivery') === 'draft';
}

function projectionSources(handle: ResolvedArtifactHandle, handles: readonly ResolvedArtifactHandle[]): Array<{ source: JsonRecord; pointer: string; name?: string }> {
  if (handle.status !== 'loaded') return [];
  const document = record(handle.document);
  if (handle.artifactKind === 'definition') {
    const instances = record(ownProp(document, 'instances'));
    return Object.entries(instances ?? {}).flatMap(([name, value]) => {
      const source = record(value);
      return source && Object.prototype.hasOwnProperty.call(source, 'response')
        ? [{ source, name, pointer: `/instances/${escapeJsonPointerToken(name)}` }]
        : [];
    });
  }
  if (handle.artifactKind !== 'dataSources') return [];
  const sources = ownProp(document, 'sources');
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((value, index) => {
    const source = record(value);
    if (!source || stringProp(source, 'kind') !== 'definition-response') return [];
    // A schema-less draft still delivers fields to a directly bound form.
    if (isDraft(source) && ownProp(source, 'schema') === undefined &&
        !catalogConsumers({ handles }, handle, source).some(consumer => consumer?.kind === 'prefill' && !consumer.mapped)) return [];
    return [{ source, pointer: `/sources/${index}` }];
  });
}

export function missingResponseProjectionChecks(handles: readonly ResolvedArtifactHandle[]): AppGraphDiagnostic[] {
  return handles.flatMap((handle) => {
    const first = projectionSources(handle, handles)[0];
    return first ? [missingProjectionCheck(handle, first.pointer)] : [];
  });
}

export function responseProjectionDiagnostics(
  lint: AppGraphDocumentLinter,
  context: AppGraphContext,
  handle: ResolvedArtifactHandle,
): AppGraphDiagnostic[] {
  return projectionSources(handle, context.handles).flatMap(({ source, pointer, name }) => {
    if (name !== undefined) {
      const upstream = definitionsForUrl(context, targetUrl(record(ownProp(source, 'response'))));
      return projectionDiagnostics(lint, handle, pointer, source, { kind: 'instance', definition: handle.document, name }, upstream);
    }
    let upstream: ResolvedArtifactHandle[];
    if (isDraft(source)) {
      const ref = stringProp(source, 'definitionRef');
      const resolved = ref === undefined ? undefined : exactDefinitionResolution(context, ref).definition;
      if (!resolved) return [];
      upstream = [resolved];
    } else {
      upstream = definitionsForUrl(context, targetUrl(record(ownProp(source, 'responseSelection'))));
    }
    const seen = new Set<string>();
    return catalogConsumers(context, handle, source).flatMap((consumer) =>
      projectionDiagnostics(lint, handle, pointer, source, consumer, upstream).filter((finding) => {
        const identity = JSON.stringify([
          finding.code, finding.primarySource?.jsonPointer, finding.details?.upstreamVersion, finding.message,
        ]);
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      }));
  });
}
