/** @filedesc Opt-in strict validation from every authored render node to an adopted, current Need. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphHostEvidenceDocument,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import { NEED_ANCHOR } from './needs-coverage.js';
import {
  registryWidgetEntries,
  resolvedWidgetContributionFromEntries,
  widgetShape,
  type RegistryWidgetEntry,
} from './surface-widgets.js';

type JsonRecord = Record<string, unknown>;

const NEEDS_DOCUMENT_VERSION = '1.0';
const CONFIG_POINTER_PATTERN = /^(?:|\/(?:\*|(?:[^~/]|~[01])+)(?:\/(?:\*|(?:[^~/]|~[01])+))*)$/;

export const RENDERED_NEED_TRACE_CODES = {
  needsUnpaired: 'APP-GRAPH-RENDERED-NEEDS-UNPAIRED',
  missing: 'APP-GRAPH-RENDERED-NEED-MISSING',
  unresolved: 'APP-GRAPH-RENDERED-NEED-UNRESOLVED',
  nonAdopted: 'APP-GRAPH-RENDERED-NEED-NON-ADOPTED',
  stale: 'APP-GRAPH-RENDERED-NEED-STALE',
  scopeUnknown: 'APP-GRAPH-RENDERED-NODE-SCOPE-UNKNOWN',
  inventoryInvalid: 'APP-GRAPH-RENDERED-NODE-INVENTORY-INVALID',
  navigationImplicit: 'APP-GRAPH-RENDERED-NAVIGATION-IMPLICIT',
} as const;

interface PairedNeed {
  id: string;
  status?: string;
  revision?: number;
  source: AppGraphSourcePointer;
}

interface AnchorCandidate {
  raw: unknown;
  pointer: string;
}

export interface RenderedNeedTraceAnchor {
  readonly raw: string;
  readonly needId: string;
  readonly revision: number;
  readonly pointer: string;
}

export interface RenderedNeedTraceInvalidAnchor {
  readonly raw: unknown;
  readonly pointer: string;
  readonly reason: 'need-anchor-not-string' | 'need-anchor-malformed';
}

export interface RenderedNeedTraceTypedNeedRef {
  readonly needId: string;
  readonly pointer: string;
  readonly description?: string;
}

export interface RenderedNeedTraceCollectionFailure {
  readonly code: string;
  readonly message: string;
  readonly reason: string;
  readonly details?: Readonly<JsonRecord>;
  readonly relatedSources?: readonly AppGraphSourcePointer[];
}

/**
 * One authored node whose own content can render in a normal product view.
 *
 * `anchors` contains only canonical, direct `need:<id>@<revision>` links.
 * `invalidAnchors` preserves explicit but malformed links for the strict
 * validator. Neither list includes a parent or sibling node's generation data.
 */
export interface RenderedNeedTraceNode {
  readonly source: AppGraphSourcePointer;
  readonly kind: string;
  readonly pointer: string;
  readonly label: string;
  readonly anchors: readonly RenderedNeedTraceAnchor[];
  readonly invalidAnchors: readonly RenderedNeedTraceInvalidAnchor[];
  readonly typedNeedRefs?: readonly RenderedNeedTraceTypedNeedRef[];
  readonly failure?: RenderedNeedTraceCollectionFailure;
}

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function stringProp(value: JsonRecord | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function pairedNeedsDocuments(context: AppGraphContext): AppGraphHostEvidenceDocument[] {
  return (context.hostEvidence?.needsDocuments ?? []).filter(
    (evidence) => record(evidence.document)?.$formspecNeeds === NEEDS_DOCUMENT_VERSION,
  );
}

function pairedNeeds(
  paired: readonly AppGraphHostEvidenceDocument[],
): { byId: Map<string, PairedNeed[]>; roots: AppGraphSourcePointer[] } {
  const byId = new Map<string, PairedNeed[]>();
  const roots: AppGraphSourcePointer[] = [];

  paired.forEach((evidence, evidenceIndex) => {
    const artifactSlot = `hostEvidence.needsDocuments[${evidenceIndex}]`;
    roots.push({
      artifactSlot,
      source: evidence.source,
      jsonPointer: '/needs',
    });
    const needs = record(evidence.document)?.needs;
    if (!Array.isArray(needs)) return;
    needs.forEach((rawNeed, needIndex) => {
      const need = record(rawNeed);
      const id = stringProp(need, 'id');
      if (!id) return;
      const entry: PairedNeed = {
        id,
        status: stringProp(need, 'status'),
        revision: typeof need?.revision === 'number' ? need.revision : undefined,
        source: {
          artifactSlot,
          source: evidence.source,
          jsonPointer: `/needs/${needIndex}`,
        },
      };
      byId.set(id, [...(byId.get(id) ?? []), entry]);
    });
  });

  return { byId, roots };
}

function directGenerationAnchors(node: JsonRecord, pointer: string): AnchorCandidate[] {
  return generationObjectAnchors(node['x-generation'], `${pointer}/x-generation`);
}

function generationObjectAnchors(
  generationValue: unknown,
  generationPointer: string,
): AnchorCandidate[] {
  const generation = record(generationValue);
  const anchors = generation?.anchors;
  if (!Array.isArray(anchors)) return [];
  return anchors.flatMap((raw, index): AnchorCandidate[] =>
    typeof raw === 'string' && raw.startsWith('need:')
      ? [{ raw, pointer: `${generationPointer}/anchors/${index}` }]
      : []
  );
}

function directConfigAnchors(node: JsonRecord, pointer: string): AnchorCandidate[] {
  const anchors = directGenerationAnchors(node, pointer);
  if (Object.prototype.hasOwnProperty.call(node, 'needAnchor')) {
    anchors.push({
      raw: node.needAnchor,
      pointer: `${pointer}/needAnchor`,
    });
  }
  if (Object.prototype.hasOwnProperty.call(node, 'needAnchors')) {
    if (Array.isArray(node.needAnchors)) {
      node.needAnchors.forEach((raw, index) => {
        anchors.push({
          raw,
          pointer: `${pointer}/needAnchors/${index}`,
        });
      });
    } else {
      anchors.push({
        raw: node.needAnchors,
        pointer: `${pointer}/needAnchors`,
      });
    }
  }
  return anchors;
}

function sourceIdentity(handle: ResolvedArtifactHandle): AppGraphSourcePointer {
  return {
    artifactSlot: handle.slot,
    artifactKind: handle.artifactKind,
    source: handle.source,
    ref: handle.ref ? { ...handle.ref } : undefined,
  };
}

function classifiedAnchors(candidates: readonly AnchorCandidate[]): {
  anchors: RenderedNeedTraceAnchor[];
  invalidAnchors: RenderedNeedTraceInvalidAnchor[];
} {
  const anchors: RenderedNeedTraceAnchor[] = [];
  const invalidAnchors: RenderedNeedTraceInvalidAnchor[] = [];
  for (const candidate of candidates) {
    if (typeof candidate.raw !== 'string') {
      invalidAnchors.push({
        raw: candidate.raw,
        pointer: candidate.pointer,
        reason: 'need-anchor-not-string',
      });
      continue;
    }
    const parsed = NEED_ANCHOR.exec(candidate.raw);
    if (!parsed) {
      invalidAnchors.push({
        raw: candidate.raw,
        pointer: candidate.pointer,
        reason: 'need-anchor-malformed',
      });
      continue;
    }
    anchors.push({
      raw: candidate.raw,
      needId: parsed[1]!,
      revision: Number(parsed[2]),
      pointer: candidate.pointer,
    });
  }
  return { anchors, invalidAnchors };
}

function nodeLabel(node: JsonRecord, fallback: string): string {
  return stringProp(node, 'id')
    ?? stringProp(node, 'key')
    ?? stringProp(node, 'component')
    ?? stringProp(node, 'title')
    ?? stringProp(node, 'label')
    ?? stringProp(node, 'header')
    ?? stringProp(node, 'text')
    ?? stringProp(node, 'content')
    ?? stringProp(node, 'value')
    ?? stringProp(node, 'outputName')
    ?? fallback;
}

function generationNode(
  handle: ResolvedArtifactHandle,
  kind: string,
  pointer: string,
  node: JsonRecord,
  fallback: string,
): RenderedNeedTraceNode {
  const { anchors, invalidAnchors } = classifiedAnchors(
    directGenerationAnchors(node, pointer),
  );
  return {
    source: sourceIdentity(handle),
    kind,
    pointer,
    label: nodeLabel(node, fallback),
    anchors,
    invalidAnchors,
  };
}

function siblingGenerationNode(
  handle: ResolvedArtifactHandle,
  kind: string,
  pointer: string,
  node: JsonRecord,
  fallback: string,
  generationValue: unknown,
  generationPointer: string,
): RenderedNeedTraceNode {
  const { anchors, invalidAnchors } = classifiedAnchors(
    generationObjectAnchors(generationValue, generationPointer),
  );
  return {
    source: sourceIdentity(handle),
    kind,
    pointer,
    label: nodeLabel(node, fallback),
    anchors,
    invalidAnchors,
  };
}

function registrySource(entry: RegistryWidgetEntry): AppGraphSourcePointer {
  return diagnosticSourceForHandle(
    entry.registry,
    `/entries/${entry.entryIndex}/widgetShape/renderedConfigNodes`,
  );
}

function failedInventoryNode(
  handle: ResolvedArtifactHandle,
  kind: string,
  pointer: string,
  label: string,
  code: string,
  message: string,
  reason: string,
  relatedSources: AppGraphSourcePointer[] = [],
  details: JsonRecord = {},
): RenderedNeedTraceNode {
  return {
    source: sourceIdentity(handle),
    kind,
    pointer,
    label,
    anchors: [],
    invalidAnchors: [],
    failure: {
      code,
      message,
      reason,
      details,
      relatedSources,
    },
  };
}

function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

interface ConfigMatch {
  value: unknown;
  pointer: string;
}

function configMatches(
  config: JsonRecord,
  configPointer: string,
  pointerPattern: string,
): ConfigMatch[] {
  if (pointerPattern === '') return [{ value: config, pointer: configPointer }];
  if (!pointerPattern.startsWith('/')) return [];
  const segments = pointerPattern.slice(1).split('/').map(decodePointerSegment);
  let frontier: ConfigMatch[] = [{ value: config, pointer: configPointer }];
  for (const segment of segments) {
    const next: ConfigMatch[] = [];
    for (const match of frontier) {
      if (segment === '*') {
        if (Array.isArray(match.value)) {
          match.value.forEach((value, index) => {
            next.push({ value, pointer: `${match.pointer}/${index}` });
          });
        } else {
          const object = record(match.value);
          if (!object) continue;
          Object.keys(object).sort().forEach((key) => {
            next.push({
              value: object[key],
              pointer: `${match.pointer}/${escapePointerSegment(key)}`,
            });
          });
        }
        continue;
      }
      const object = record(match.value);
      if (object && Object.prototype.hasOwnProperty.call(object, segment)) {
        next.push({
          value: object[segment],
          pointer: `${match.pointer}/${escapePointerSegment(segment)}`,
        });
      } else if (Array.isArray(match.value) && /^[0-9]+$/.test(segment)) {
        const index = Number(segment);
        if (Object.prototype.hasOwnProperty.call(match.value, index)) {
          next.push({ value: match.value[index], pointer: `${match.pointer}/${index}` });
        }
      }
    }
    frontier = next;
  }
  return frontier;
}

function inventoriedConfigTraceNodes(
  handle: ResolvedArtifactHandle,
  binding: JsonRecord,
  config: JsonRecord,
  pointer: string,
  entries: readonly RegistryWidgetEntry[],
): RenderedNeedTraceNode[] {
  const moduleId = stringProp(binding, 'moduleId');
  const widgetName = stringProp(binding, 'widgetName');
  const label = `${moduleId ?? '<missing-module>'}/${widgetName ?? '<missing-widget>'}`;
  const contribution = moduleId && widgetName
    ? resolvedWidgetContributionFromEntries({ moduleId, widgetName }, entries)
    : undefined;
  if (!contribution) {
    return [failedInventoryNode(
      handle,
      'module-widget-config',
      pointer,
      label,
      RENDERED_NEED_TRACE_CODES.scopeUnknown,
      `Rendered widget '${label}' has no uniquely resolved Registry contribution, so its visible config-node scope cannot be proven.`,
      'widget-registry-contribution-unresolved',
      [],
      { moduleId, widgetName },
    )];
  }

  const shape = widgetShape(contribution);
  const inventory = shape?.renderedConfigNodes;
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return [failedInventoryNode(
      handle,
      'module-widget-config',
      pointer,
      label,
      RENDERED_NEED_TRACE_CODES.scopeUnknown,
      `Registry widget '${label}' does not declare widgetShape.renderedConfigNodes, so strict validation cannot know which config objects render.`,
      'rendered-config-inventory-missing',
      [registrySource(contribution)],
      { moduleId, widgetName, contributionName: contribution.name },
    )];
  }
  if (!stringProp(shape, 'deliveryContractId')) {
    return [failedInventoryNode(
      handle,
      'module-widget-config',
      pointer,
      label,
      RENDERED_NEED_TRACE_CODES.scopeUnknown,
      `Registry widget '${label}' does not identify the renderer delivery contract that owns its rendered-node inventory.`,
      'renderer-delivery-contract-missing',
      [registrySource(contribution)],
      { moduleId, widgetName, contributionName: contribution.name },
    )];
  }

  const out: RenderedNeedTraceNode[] = [];
  const claimedPointers = new Map<string, string>();
  const patternCounts = new Map<string, number>();
  for (const rawEntry of inventory) {
    const entry = record(rawEntry);
    const pointerPattern = stringProp(entry, 'pointerPattern');
    const kind = stringProp(entry, 'kind');
    if (!entry || pointerPattern === undefined || !kind) {
      return [failedInventoryNode(
        handle,
        'module-widget-config',
        pointer,
        label,
        RENDERED_NEED_TRACE_CODES.inventoryInvalid,
        `Registry widget '${label}' has an invalid renderedConfigNodes entry.`,
        'rendered-config-inventory-entry-invalid',
        [registrySource(contribution)],
        { moduleId, widgetName },
      )];
    }
    if (!CONFIG_POINTER_PATTERN.test(pointerPattern)) {
      return [failedInventoryNode(
        handle,
        'module-widget-config',
        pointer,
        label,
        RENDERED_NEED_TRACE_CODES.inventoryInvalid,
        `Registry widget '${label}' declares invalid rendered config pointer pattern '${pointerPattern}'.`,
        'rendered-config-inventory-pattern-invalid',
        [registrySource(contribution)],
        { moduleId, widgetName, pointerPattern },
      )];
    }
    patternCounts.set(pointerPattern, (patternCounts.get(pointerPattern) ?? 0) + 1);
    for (const match of configMatches(config, pointer, pointerPattern)) {
      const object = record(match.value);
      if (!object) {
        return [failedInventoryNode(
          handle,
          'module-widget-config',
          match.pointer,
          label,
          RENDERED_NEED_TRACE_CODES.inventoryInvalid,
          `Registry widget '${label}' inventory pattern '${pointerPattern}' matched a non-object value that cannot carry a direct Need trace.`,
          'rendered-config-inventory-match-not-object',
          [registrySource(contribution)],
          { moduleId, widgetName, pointerPattern },
        )];
      }
      const priorKind = claimedPointers.get(match.pointer);
      if (priorKind !== undefined) {
        return [failedInventoryNode(
          handle,
          'module-widget-config',
          match.pointer,
          label,
          RENDERED_NEED_TRACE_CODES.inventoryInvalid,
          `Registry widget '${label}' inventory claims config pointer '${match.pointer}' more than once.`,
          'rendered-config-inventory-overlap',
          [registrySource(contribution)],
          { moduleId, widgetName, pointerPattern, priorKind, kind },
        )];
      }
      claimedPointers.set(match.pointer, kind);
      const { anchors, invalidAnchors } = classifiedAnchors(
        directConfigAnchors(object, match.pointer),
      );
      out.push({
        source: sourceIdentity(handle),
        kind,
        pointer: match.pointer,
        label: nodeLabel(object, match.pointer),
        anchors,
        invalidAnchors,
      });
    }
  }
  const duplicatePattern = [...patternCounts].find(([, count]) => count > 1)?.[0];
  if (duplicatePattern !== undefined) {
    return [failedInventoryNode(
      handle,
      'module-widget-config',
      pointer,
      label,
      RENDERED_NEED_TRACE_CODES.inventoryInvalid,
      `Registry widget '${label}' declares rendered config pattern '${duplicatePattern}' more than once.`,
      'rendered-config-inventory-pattern-duplicate',
      [registrySource(contribution)],
      { moduleId, widgetName, pointerPattern: duplicatePattern },
    )];
  }
  return out;
}

function surfaceNodes(
  handle: ResolvedArtifactHandle,
  entries: readonly RegistryWidgetEntry[],
): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  if (!document) return [];
  const out: RenderedNeedTraceNode[] = [
    generationNode(
      handle,
      'surface-document',
      '',
      document,
      stringProp(document, 'title') ?? stringProp(document, 'id') ?? 'Surface',
    ),
  ];
  const routes = document.routes;
  if (!Array.isArray(routes)) return out;

  routes.forEach((rawRoute, routeIndex) => {
    const route = record(rawRoute);
    if (!route) return;
    const routePointer = `/routes/${routeIndex}`;
    out.push(generationNode(handle, 'surface-route', routePointer, route, `routes[${routeIndex}]`));

    const navigation = record(route.navigation);
    if (navigation) {
      out.push(generationNode(
        handle,
        'surface-route-navigation',
        `${routePointer}/navigation`,
        navigation,
        `${nodeLabel(route, `routes[${routeIndex}]`)} navigation`,
      ));
    } else if (!navigation) {
      out.push(failedInventoryNode(
        handle,
        'surface-route-navigation',
        `${routePointer}/navigation`,
        `${nodeLabel(route, `routes[${routeIndex}]`)} implicit navigation`,
        RENDERED_NEED_TRACE_CODES.navigationImplicit,
        `Route '${nodeLabel(route, `routes[${routeIndex}]`)}' would render an implicit navigation label. Author an explicit navigation object with its own Need trace or set navigation.visible to false.`,
        'implicit-navigation-derived-from-route',
      ));
    }

    if (Array.isArray(route.slots)) {
      route.slots.forEach((rawSlot, slotIndex) => {
        const slot = record(rawSlot);
        if (!slot) return;
        const slotPointer = `${routePointer}/slots/${slotIndex}`;
        out.push(generationNode(handle, 'surface-slot', slotPointer, slot, `slots[${slotIndex}]`));

        const binding = record(slot.binding);
        if (stringProp(slot, 'slotType') === 'static-content' && binding) {
          out.push(generationNode(
            handle,
            'surface-static-content',
            `${slotPointer}/binding`,
            binding,
            `${nodeLabel(slot, `slots[${slotIndex}]`)} content`,
          ));
        }
        if (stringProp(slot, 'slotType') !== 'module-widget') return;
        const dataBindings = record(binding?.dataBindings);
        if (dataBindings) {
          Object.keys(dataBindings).sort().forEach((inputName) => {
            const dataBinding = record(dataBindings[inputName]);
            if (!dataBinding) return;
            out.push(generationNode(
              handle,
              'surface-widget-data-binding',
              `${slotPointer}/binding/dataBindings/${escapePointerSegment(inputName)}`,
              dataBinding,
              inputName,
            ));
          });
        }
        const actionBindings = record(binding?.actionBindings);
        if (actionBindings) {
          Object.keys(actionBindings).sort().forEach((outputName) => {
            const actionBinding = record(actionBindings[outputName]);
            if (!actionBinding) return;
            out.push(generationNode(
              handle,
              'surface-widget-action-binding',
              `${slotPointer}/binding/actionBindings/${escapePointerSegment(outputName)}`,
              actionBinding,
              outputName,
            ));
          });
        }
        const config = record(binding?.config);
        if (binding && config) {
          const configPointer = `${slotPointer}/binding/config`;
          out.push(...inventoriedConfigTraceNodes(
            handle,
            binding,
            config,
            configPointer,
            entries,
          ));
        }
      });
    }

    if (Array.isArray(route.transitions)) {
      route.transitions.forEach((rawTransition, transitionIndex) => {
        const transition = record(rawTransition);
        if (!transition) return;
        out.push(generationNode(
          handle,
          'surface-transition',
          `${routePointer}/transitions/${transitionIndex}`,
          transition,
          `transitions[${transitionIndex}]`,
        ));
      });
    }
  });

  return out;
}

function appManifestNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  if (!document || stringProp(document, 'title') === undefined) return [];
  return [generationNode(
    handle,
    'app-manifest-title',
    '',
    document,
    stringProp(document, 'title') ?? 'App title',
  )];
}

function collectDefinitionItems(
  handle: ResolvedArtifactHandle,
  items: unknown,
  pointer: string,
  out: RenderedNeedTraceNode[],
): void {
  if (!Array.isArray(items)) return;
  items.forEach((rawItem, index) => {
    const item = record(rawItem);
    if (!item) return;
    const itemPointer = `${pointer}/${index}`;
    out.push(generationNode(handle, 'definition-item', itemPointer, item, `items[${index}]`));
    if (Array.isArray(item.options)) {
      item.options.forEach((rawOption, optionIndex) => {
        const option = record(rawOption);
        if (!option) return;
        out.push(generationNode(
          handle,
          'definition-option',
          `${itemPointer}/options/${optionIndex}`,
          option,
          `options[${optionIndex}]`,
        ));
      });
    }
    collectDefinitionItems(handle, item.children, `${itemPointer}/children`, out);
  });
}

function definitionNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  if (!document) return [];
  const out: RenderedNeedTraceNode[] = [
    generationNode(
      handle,
      'definition-document',
      '',
      document,
      stringProp(document, 'title') ?? 'Definition',
    ),
  ];
  collectDefinitionItems(handle, document.items, '/items', out);
  if (Array.isArray(document.binds)) {
    document.binds.forEach((rawBind, bindIndex) => {
      const bind = record(rawBind);
      if (!bind) return;
      out.push(generationNode(
        handle,
        'definition-bind',
        `/binds/${bindIndex}`,
        bind,
        stringProp(bind, 'path') ?? `binds[${bindIndex}]`,
      ));
    });
  }
  if (Array.isArray(document.shapes)) {
    document.shapes.forEach((rawShape, shapeIndex) => {
      const shape = record(rawShape);
      if (!shape) return;
      out.push(generationNode(
        handle,
        'definition-shape',
        `/shapes/${shapeIndex}`,
        shape,
        `shapes[${shapeIndex}]`,
      ));
    });
  }
  const optionSets = record(document.optionSets);
  if (optionSets) {
    for (const setName of Object.keys(optionSets).sort()) {
      const optionSet = record(optionSets[setName]);
      if (!optionSet || !Array.isArray(optionSet.options)) continue;
      optionSet.options.forEach((rawOption, optionIndex) => {
        const option = record(rawOption);
        if (!option) return;
        out.push(generationNode(
          handle,
          'definition-option',
          `/optionSets/${escapePointerSegment(setName)}/options/${optionIndex}`,
          option,
          `${setName}.options[${optionIndex}]`,
        ));
      });
    }
  }
  return out;
}

function themeNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  if (!document) return [];
  return [generationNode(
    handle,
    'theme-document',
    '',
    document,
    stringProp(document, 'name') ?? stringProp(document, 'title') ?? 'Theme',
  )];
}

function responseActionNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const out: RenderedNeedTraceNode[] = [];
  const actions = record(handle.document)?.actions;
  if (!Array.isArray(actions)) return out;
  actions.forEach((rawAction, actionIndex) => {
    const action = record(rawAction);
    if (!action) return;
    out.push(generationNode(
      handle,
      'response-action',
      `/actions/${actionIndex}`,
      action,
      `actions[${actionIndex}]`,
    ));
  });
  return out;
}

function referenceNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  const references = document?.references;
  const referenceDefs = record(document?.referenceDefs);
  if (!Array.isArray(references)) return [];

  return references.flatMap((rawReference, referenceIndex): RenderedNeedTraceNode[] => {
    const reference = record(rawReference);
    if (!reference) return [];
    const pointer = `/references/${referenceIndex}`;
    const ref = stringProp(reference, '$ref');
    const key = ref?.match(/^#\/referenceDefs\/([a-zA-Z][a-zA-Z0-9_-]*)$/)?.[1];
    const base = key === undefined ? undefined : record(referenceDefs?.[key]);
    const resolved = base === undefined ? reference : { ...base, ...reference };
    const audience = stringProp(resolved, 'audience');
    if (audience !== 'human' && audience !== 'both') return [];

    const { anchors, invalidAnchors } = classifiedAnchors(
      directGenerationAnchors(reference, pointer),
    );
    return [{
      source: sourceIdentity(handle),
      kind: 'reference-entry',
      pointer,
      label: nodeLabel(resolved, `references[${referenceIndex}]`),
      anchors,
      invalidAnchors,
    }];
  });
}

function dataSourceNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const sources = record(handle.document)?.sources;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((rawSource, sourceIndex): RenderedNeedTraceNode[] => {
    const source = record(rawSource);
    if (!source) return [];
    return [generationNode(
      handle,
      'data-source',
      `/sources/${sourceIndex}`,
      source,
      `sources[${sourceIndex}]`,
    )];
  });
}

function previewScenarioNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  if (!document || document.$formspecSurfaceScenario !== '0.1') return [];

  const out: RenderedNeedTraceNode[] = [
    generationNode(
      handle,
      'surface-preview-scenario',
      '',
      document,
      'Surface preview scenario',
    ),
  ];

  const routeParams = record(document.routeParams);
  if (routeParams) {
    out.push(siblingGenerationNode(
      handle,
      'surface-preview-route-params',
      '/routeParams',
      routeParams,
      'route parameters',
      document.routeParamsGeneration,
      '/routeParamsGeneration',
    ));
  }

  const profiles = record(document.profiles);
  if (profiles) {
    Object.keys(profiles).sort().forEach((profileName) => {
      const profile = record(profiles[profileName]);
      if (!profile || !Array.isArray(profile.sources)) return;
      profile.sources.forEach((rawOutcome, outcomeIndex) => {
        const outcome = record(rawOutcome);
        if (!outcome) return;
        const outcomePointer = (
          `/profiles/${escapePointerSegment(profileName)}/sources/${outcomeIndex}`
        );
        const catalogRef = stringProp(outcome, 'catalogRef');
        const sourceRef = stringProp(outcome, 'sourceRef');
        out.push(generationNode(
          handle,
          'surface-preview-source-outcome',
          outcomePointer,
          outcome,
          `${catalogRef ?? '<missing-catalog>'}#${sourceRef ?? '<missing-source>'}`,
        ));
      });
    });
  }

  const actions = record(document.actions);
  const defaultOutcome = record(actions?.default);
  if (defaultOutcome) {
    out.push(generationNode(
      handle,
      'surface-preview-action-outcome',
      '/actions/default',
      defaultOutcome,
      'default action outcome',
    ));
  }
  const byAction = record(actions?.byAction);
  if (byAction) {
    Object.keys(byAction).sort().forEach((actionId) => {
      const outcome = record(byAction[actionId]);
      if (!outcome) return;
      out.push(generationNode(
        handle,
        'surface-preview-action-outcome',
        `/actions/byAction/${escapePointerSegment(actionId)}`,
        outcome,
        actionId,
      ));
    });
  }

  return out;
}

function collectComponentNodes(
  handle: ResolvedArtifactHandle,
  value: unknown,
  pointer: string,
  out: RenderedNeedTraceNode[],
): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectComponentNodes(handle, child, `${pointer}/${index}`, out));
    return;
  }
  const object = record(value);
  if (!object) return;

  if (typeof object.component === 'string') {
    out.push(generationNode(handle, 'component-node', pointer, object, object.component));
    if (object.component === 'Summary' && Array.isArray(object.items)) {
      object.items.forEach((rawItem, index) => {
        const item = record(rawItem);
        if (!item) return;
        out.push(generationNode(
          handle,
          'component-summary-item',
          `${pointer}/items/${index}`,
          item,
          `Summary.items[${index}]`,
        ));
      });
    }
    if (object.component === 'DataTable' && Array.isArray(object.columns)) {
      object.columns.forEach((rawColumn, index) => {
        const column = record(rawColumn);
        if (!column) return;
        out.push(generationNode(
          handle,
          'component-data-table-column',
          `${pointer}/columns/${index}`,
          column,
          `DataTable.columns[${index}]`,
        ));
      });
    }
    if (object.component === 'Tabs' && Array.isArray(object.tabLabels)) {
      const labelGeneration = Array.isArray(object.tabLabelGeneration)
        ? object.tabLabelGeneration
        : [];
      object.tabLabels.forEach((rawLabel, index) => {
        const { anchors, invalidAnchors } = classifiedAnchors(
          generationObjectAnchors(
            labelGeneration[index],
            `${pointer}/tabLabelGeneration/${index}`,
          ),
        );
        out.push({
          source: sourceIdentity(handle),
          kind: 'component-tab-label',
          pointer: `${pointer}/tabLabels/${index}`,
          label: typeof rawLabel === 'string' ? rawLabel : `Tabs.tabLabels[${index}]`,
          anchors,
          invalidAnchors,
        });
      });
    }
  }
  for (const [key, child] of Object.entries(object)) {
    collectComponentNodes(handle, child, `${pointer}/${escapePointerSegment(key)}`, out);
  }
}

function componentNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const out: RenderedNeedTraceNode[] = [];
  collectComponentNodes(handle, handle.document, '', out);
  return out;
}

function localeNodes(handle: ResolvedArtifactHandle): RenderedNeedTraceNode[] {
  const document = record(handle.document);
  const strings = record(document?.strings);
  const stringGeneration = record(document?.stringGeneration);
  if (!strings) return [];
  return Object.keys(strings).sort().map((key) => {
    const { anchors, invalidAnchors } = classifiedAnchors(
      generationObjectAnchors(
      stringGeneration?.[key],
      `/stringGeneration/${escapePointerSegment(key)}`,
      ),
    );
    return {
      source: sourceIdentity(handle),
      kind: 'locale-string',
      pointer: `/strings/${escapePointerSegment(key)}`,
      label: key,
      anchors,
      invalidAnchors,
    };
  });
}

function handleUrl(handle: ResolvedArtifactHandle): string | undefined {
  return stringProp(record(handle.ref), 'url')
    ?? stringProp(record(handle.identity), 'url')
    ?? stringProp(record(handle.document), 'url');
}

function mountedExperienceUnitIds(
  context: AppGraphContext,
  experience: ResolvedArtifactHandle,
): Set<string> {
  const experiences = context.handles.filter((handle) =>
    handle.artifactKind === 'experience' && handle.status === 'loaded'
  );
  const experienceUrl = handleUrl(experience);
  const experienceId = stringProp(record(experience.identity), 'id')
    ?? stringProp(record(experience.document), 'id');
  const mounted = new Set<string>();
  for (const surface of context.handles.filter((handle) =>
    handle.artifactKind === 'surface' && handle.status === 'loaded'
  )) {
    const routes = record(surface.document)?.routes;
    if (!Array.isArray(routes)) continue;
    for (const rawRoute of routes) {
      const slots = record(rawRoute)?.slots;
      if (!Array.isArray(slots)) continue;
      for (const rawSlot of slots) {
        const slot = record(rawSlot);
        if (stringProp(slot, 'slotType') !== 'experience-unit') continue;
        const binding = record(slot?.binding);
        const unitRef = stringProp(binding, 'unitRef');
        const experienceRef = stringProp(binding, 'experienceRef');
        if (!unitRef) continue;
        if (
          experienceRef === undefined
            ? experiences.length === 1
            : experienceRef === experienceUrl || experienceRef === experienceId
        ) {
          mounted.add(unitRef);
        }
      }
    }
  }
  return mounted;
}

function experienceUnitTitleNodes(
  context: AppGraphContext,
  handle: ResolvedArtifactHandle,
): RenderedNeedTraceNode[] {
  const units = record(handle.document)?.units;
  if (!Array.isArray(units)) return [];
  const mounted = mountedExperienceUnitIds(context, handle);
  return units.flatMap((rawUnit, unitIndex): RenderedNeedTraceNode[] => {
    const unit = record(rawUnit);
    const unitId = stringProp(unit, 'id');
    const title = stringProp(unit, 'title');
    if (!unit || !unitId || title === undefined || !mounted.has(unitId)) return [];
    const typedNeedRefs = Array.isArray(unit.needRefs)
      ? unit.needRefs.flatMap((rawRef, refIndex): RenderedNeedTraceTypedNeedRef[] => {
          const ref = record(rawRef);
          const needId = stringProp(ref, 'id');
          if (!needId) return [];
          const description = stringProp(ref, 'description');
          return [{
            needId,
            pointer: `/units/${unitIndex}/needRefs/${refIndex}/id`,
            ...(description === undefined ? {} : { description }),
          }];
        })
      : [];
    return [{
      source: sourceIdentity(handle),
      kind: 'experience-unit-title',
      pointer: `/units/${unitIndex}/title`,
      label: title,
      anchors: [],
      invalidAnchors: [],
      typedNeedRefs,
    }];
  });
}

/**
 * Enumerate every authored node that can render in the normal product.
 *
 * This is the authoritative inventory used by strict rendered-Need validation.
 * Consumers may inspect it for review or reporting, but must not infer anchors
 * from a parent, sibling, mounted slot, or related Experience unit.
 *
 * Preview scenarios are supplied separately because they are preview-only
 * inputs, not App Manifest members. Pass loaded handles whose documents use
 * `$formspecSurfaceScenario: "0.1"` to preserve exact source identity.
 */
export function collectRenderedNeedTraceNodes(
  context: AppGraphContext,
  previewScenarios: readonly ResolvedArtifactHandle[] = [],
): readonly RenderedNeedTraceNode[] {
  const registryEntries = registryWidgetEntries(context);
  const handles = context.handles.some((handle) => handle === context.manifest)
    ? context.handles
    : [context.manifest, ...context.handles];
  const graphNodes = handles.flatMap((handle): RenderedNeedTraceNode[] => {
    if (handle.status !== 'loaded' || handle.document === undefined) return [];
    switch (handle.artifactKind) {
      case 'appManifest':
        return appManifestNodes(handle);
      case 'surface':
        return surfaceNodes(handle, registryEntries);
      case 'definition':
        return definitionNodes(handle);
      case 'theme':
        return themeNodes(handle);
      case 'responseActions':
        return responseActionNodes(handle);
      case 'references':
        return referenceNodes(handle);
      case 'dataSources':
        return dataSourceNodes(handle);
      case 'component':
        return componentNodes(handle);
      case 'locale':
        return localeNodes(handle);
      case 'experience':
        return experienceUnitTitleNodes(context, handle);
      default:
        return [];
    }
  });
  const scenarioNodes = previewScenarios.flatMap((handle): RenderedNeedTraceNode[] => {
    if (handle.status !== 'loaded' || handle.document === undefined) return [];
    return previewScenarioNodes(handle);
  });
  return [...graphNodes, ...scenarioNodes];
}

function traceDiagnostic(
  code: string,
  message: string,
  node: RenderedNeedTraceNode,
  jsonPointer: string,
  reason: string,
  details: JsonRecord,
  relatedSources: readonly AppGraphSourcePointer[],
): AppGraphDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource: {
      ...node.source,
      jsonPointer,
    },
    relatedSources: [...relatedSources],
    details: {
      reason,
      renderedNodeKind: node.kind,
      renderedNodeLabel: node.label,
      renderedNodePointer: node.pointer,
      ...details,
    },
  };
}

function validateNode(
  node: RenderedNeedTraceNode,
  needsById: ReadonlyMap<string, PairedNeed[]>,
  needsRoots: AppGraphSourcePointer[],
): AppGraphDiagnostic[] {
  if (node.failure) {
    return [traceDiagnostic(
      node.failure.code,
      node.failure.message,
      node,
      node.pointer,
      node.failure.reason,
      node.failure.details ?? {},
      node.failure.relatedSources ?? [],
    )];
  }
  if (
    node.anchors.length === 0
    && node.invalidAnchors.length === 0
    && (node.typedNeedRefs?.length ?? 0) === 0
  ) {
    return [traceDiagnostic(
      RENDERED_NEED_TRACE_CODES.missing,
      node.kind === 'experience-unit-title'
        ? `Rendered ${node.kind} '${node.label}' has no direct typed Need reference.`
        : `Rendered ${node.kind} '${node.label}' has no direct need:<id>@<revision> anchor.`,
      node,
      node.pointer,
      node.kind === 'experience-unit-title'
        ? 'direct-typed-need-ref-missing'
        : 'direct-need-anchor-missing',
      {},
      needsRoots,
    )];
  }

  const diagnostics: AppGraphDiagnostic[] = [];
  for (const invalid of node.invalidAnchors) {
    diagnostics.push(traceDiagnostic(
      RENDERED_NEED_TRACE_CODES.unresolved,
      invalid.reason === 'need-anchor-not-string'
        ? `Rendered ${node.kind} '${node.label}' declares a Need anchor that is not a string.`
        : `Rendered ${node.kind} '${node.label}' declares malformed Need anchor '${String(invalid.raw)}'; expected need:<id>@<revision>.`,
      node,
      invalid.pointer,
      invalid.reason,
      { anchor: invalid.raw },
      needsRoots,
    ));
  }

  for (const anchor of node.anchors) {
    const needId = anchor.needId;
    const anchoredRevision = anchor.revision;
    const matches = needsById.get(needId) ?? [];
    if (matches.length !== 1) {
      diagnostics.push(traceDiagnostic(
        RENDERED_NEED_TRACE_CODES.unresolved,
        matches.length === 0
          ? `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' does not resolve in the paired Needs Document.`
          : `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' is ambiguous across paired Needs Documents.`,
        node,
        anchor.pointer,
        matches.length === 0 ? 'need-id-unresolved' : 'need-id-ambiguous',
        {
          anchor: anchor.raw,
          needId,
          anchoredRevision,
          matchCount: matches.length,
          knownNeedIds: [...needsById.keys()].sort(),
        },
        matches.length > 0 ? matches.map((match) => match.source) : needsRoots,
      ));
      continue;
    }

    const need = matches[0]!;
    if (need.status !== 'adopted') {
      diagnostics.push(traceDiagnostic(
        RENDERED_NEED_TRACE_CODES.nonAdopted,
        `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' resolves to status '${need.status ?? '<absent>'}', not 'adopted'.`,
        node,
        anchor.pointer,
        'need-not-adopted',
        {
          anchor: anchor.raw,
          needId,
          needStatus: need.status,
        },
        [need.source],
      ));
    }
    if (need.revision !== anchoredRevision) {
      diagnostics.push(traceDiagnostic(
        RENDERED_NEED_TRACE_CODES.stale,
        `Rendered ${node.kind} '${node.label}' Need anchor '${anchor.raw}' does not pin the current revision '${need.revision ?? '<absent>'}'.`,
        node,
        anchor.pointer,
        'need-revision-not-current',
        {
          anchor: anchor.raw,
          needId,
          anchoredRevision,
          currentRevision: need.revision,
          direction: need.revision === undefined
            ? 'unknown'
            : anchoredRevision < need.revision
              ? 'older'
              : 'future',
        },
        [need.source],
      ));
    }
  }

  for (const needRef of node.typedNeedRefs ?? []) {
    const matches = needsById.get(needRef.needId) ?? [];
    if (matches.length !== 1) {
      diagnostics.push(traceDiagnostic(
        RENDERED_NEED_TRACE_CODES.unresolved,
        matches.length === 0
          ? `Rendered ${node.kind} '${node.label}' typed Need reference '${needRef.needId}' does not resolve in the paired Needs Document.`
          : `Rendered ${node.kind} '${node.label}' typed Need reference '${needRef.needId}' is ambiguous across paired Needs Documents.`,
        node,
        needRef.pointer,
        matches.length === 0 ? 'need-id-unresolved' : 'need-id-ambiguous',
        {
          needId: needRef.needId,
          matchCount: matches.length,
          knownNeedIds: [...needsById.keys()].sort(),
        },
        matches.length > 0 ? matches.map((match) => match.source) : needsRoots,
      ));
      continue;
    }
    const need = matches[0]!;
    if (need.status !== 'adopted') {
      diagnostics.push(traceDiagnostic(
        RENDERED_NEED_TRACE_CODES.nonAdopted,
        `Rendered ${node.kind} '${node.label}' typed Need reference '${needRef.needId}' resolves to status '${need.status ?? '<absent>'}', not 'adopted'.`,
        node,
        needRef.pointer,
        'need-not-adopted',
        {
          needId: needRef.needId,
          needStatus: need.status,
        },
        [need.source],
      ));
    }
  }
  return diagnostics;
}

/**
 * Strict data-only authoring profile.
 *
 * The caller must pair at least one valid Needs 1.0 document, and every authored
 * node that directly controls product rendering must carry its own
 * `need:<id>@<revision>` trace. A parent node's anchor never covers a child.
 * The target must be unambiguous, adopted, and pinned to its current revision.
 *
 * This validator is intentionally not part of AppGraph's built-in set. General
 * Needs coverage remains report-only; callers opt into this error-severity
 * profile through `crossArtifactValidators`.
 */
export function validateRenderedNeedTrace(
  context: AppGraphContext,
  previewScenarios: readonly ResolvedArtifactHandle[] = [],
): AppGraphDiagnostic[] {
  const paired = pairedNeedsDocuments(context);
  if (paired.length === 0) {
    const nodes = collectRenderedNeedTraceNodes(context, previewScenarios);
    const first = nodes[0];
    if (!first) return [];
    return [traceDiagnostic(
      RENDERED_NEED_TRACE_CODES.needsUnpaired,
      `Strict rendered-Need validation found ${nodes.length} rendered node${nodes.length === 1 ? '' : 's'} but no paired Needs 1.0 document.`,
      first,
      first.pointer,
      'needs-document-unpaired',
      { renderedNodeCount: nodes.length },
      [],
    )];
  }

  const { byId, roots } = pairedNeeds(paired);
  return collectRenderedNeedTraceNodes(context, previewScenarios)
    .flatMap((node) => validateNode(node, byId, roots));
}
