/** @filedesc Build the trace record for each published Definition from the admitted bundle. */
import type { AppGraphReportProducerResult } from './producer.js';
import type { AppGraphSourcePointer, AppGraphValidationReport } from './types.js';
import { artifactResolutionGraphInput } from './artifact-resolver.js';
import { RENDERED_NEED_TRACE_CODES } from './rendered-need-trace.js';
import { createAppGraphReport } from './report.js';
import { record, stringProp } from './surface-widgets.js';
import { routeTargets } from './component-routes.js';
import { renderingSlots } from './surface-definition-slots.js';

export interface DefinitionPublicationReportsOptions {
  /**
   * Retain each Definition's scoped `renderedNeedTrace.nodes` array instead of emitting the
   * compact publication proof (`nodes: []`, `inventory: 'omitted'`, `nodeCount`).
   *
   * Defaults to `false` so per-Definition publication payloads remain bounded while preserving
   * `status`, canonical `definitions`/`locales`/`components` digests, phases, diagnostics,
   * schema results, and evidence results.
   */
  includeNodes?: boolean;
}

/**
 * Retains the admission evidence from the whole bundle, with each form's bound trace proof
 * and its redundant-anchor warnings. Emits a compact publication proof (`nodes: []`,
 * `inventory: 'omitted'`, `nodeCount`) by default; pass `{ includeNodes: true }` to retain
 * scoped per-node inventory entries. A refused graph produces no publication records.
 */
export function definitionPublicationReports(
  { report, artifactResolutionReport }: AppGraphReportProducerResult,
  options: DefinitionPublicationReportsOptions = {},
): AppGraphValidationReport[] {
  const trace = report.renderedNeedTrace;
  if (!trace || !report.ok || report.diagnostics.some(diagnostic => diagnostic.severity === 'error')) return [];
  const includeNodes = options.includeNodes === true;
  const { handles } = artifactResolutionGraphInput(artifactResolutionReport);
  return trace.definitions.map(definition => {
    const documentSlots = new Set<string>();
    const mounts: { surface?: string; route?: string; slot?: string }[] = [];
    const surfacePointers = new Map<string, Set<string>>();
    const localeUrls = new Set(definition.locales.map(locale => locale.url));
    const componentUrls = new Set(definition.components.map(component => component.url));
    for (const handle of handles) {
      if (handle.status !== 'loaded') continue;
      const document = record(handle.document);
      const url = stringProp(document, 'url');
      if ((handle.artifactKind === 'definition' && url === definition.url && document?.version === definition.version)
        || (handle.artifactKind === 'locale' && url && localeUrls.has(url))
        || (handle.artifactKind === 'component' && url && componentUrls.has(url))
        || (handle.artifactKind === 'references' && record(document?.targetDefinition)?.url === definition.url)) {
        documentSlots.add(handle.slot);
      }
      if (handle.artifactKind !== 'surface') continue;
      const pointers = new Set<string>();
      for (const slot of renderingSlots(handle, definition.url)) {
        const routePointer = `/routes/${slot.route.index}`;
        mounts.push({ surface: handle.ref?.url, route: stringProp(slot.route.route, 'id'), slot: slot.slotId });
        pointers.add('');
        pointers.add(routePointer);
        pointers.add(`${routePointer}/navigation`);
        pointers.add(`${routePointer}/slots/${slot.slotIndex}`);
      }
      surfacePointers.set(handle.slot, pointers);
    }
    for (const handle of handles) {
      if (handle.artifactKind !== 'component' || handle.status !== 'loaded') continue;
      if (routeTargets(handle.document).some(target => mounts.some(mount =>
        target.surface?.url === mount.surface && target.route === mount.route
        && (target.slot === undefined || target.slot === mount.slot)))) documentSlots.add(handle.slot);
    }
    const includes = (source?: AppGraphSourcePointer) => source?.artifactSlot !== undefined
      && (documentSlots.has(source.artifactSlot)
        || surfacePointers.get(source.artifactSlot)?.has(source.jsonPointer ?? ''));
    const scopedNodes = trace.nodes.filter(node => includes(node.source));
    const renderedNeedTrace = trace.status === 'not-applicable'
      ? { status: trace.status, definitions: [definition], nodes: [] }
      : includeNodes
        ? {
            status: trace.status,
            definitions: [definition],
            nodes: scopedNodes,
            inventory: 'full' as const,
            nodeCount: scopedNodes.length,
          }
        : {
            status: trace.status,
            definitions: [definition],
            nodes: [],
            inventory: 'omitted' as const,
            nodeCount: scopedNodes.length,
          };
    return createAppGraphReport({
      artifactCount: report.summary.artifacts,
      loadedArtifactCount: report.summary.loadedArtifacts,
      schemaResults: report.schemaResults,
      evidenceResults: report.evidenceResults,
      phases: report.phases,
      support: report.support,
      diagnostics: report.diagnostics.filter(diagnostic =>
        diagnostic.code !== RENDERED_NEED_TRACE_CODES.redundant || includes(diagnostic.primarySource)),
      renderedNeedTrace,
    });
  });
}
