/** @filedesc Renderer delivery contracts for Registry widgets: the one comparison, host selection, and graph check. */

import type { AppGraphContext, AppGraphDiagnostic } from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import {
  handlesByKind,
  ownProp,
  record,
  registryWidgetEntries,
  resolvedWidgetContributionFromEntries,
  stringProp,
  surfaceWidgetSlots,
} from './surface-widgets.js';

export interface WidgetRenderedConfigNodeContract {
  pointerPattern: string;
  kind: string;
}

/** What a renderer publishes for one widget (registry.schema.json `widgetShape.deliveryContractId`). */
export interface WidgetRuntimeContract {
  deliveryContractId: string;
  registryEntryVersion: string;
  renderedConfigNodes: readonly WidgetRenderedConfigNodeContract[];
}

export type WidgetRuntimeContractMismatchReason =
  | 'runtime-contract-missing'
  | 'registry-entry-version-mismatch'
  | 'delivery-contract-id-mismatch'
  | 'rendered-config-inventory-mismatch';

/** The Registry fields a delivery contract is compared against. */
export interface WidgetRuntimeContractEntry {
  version?: unknown;
  widgetShape?: unknown;
}

function normalizedRenderedConfigNodes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized: string[] = [];
  for (const rawNode of value) {
    const node = record(rawNode);
    if (typeof node?.pointerPattern !== 'string' || typeof node.kind !== 'string') {
      return undefined;
    }
    normalized.push(`${node.pointerPattern}\u0000${node.kind}`);
  }
  return normalized.sort();
}

/**
 * Why a delivered contract does not implement a Registry widget entry; empty
 * when it does, or when the entry declares no runtime contract. The runtime
 * resolver (`@formspec-org/surface` `createWidgetRegistry`) and the authoring
 * check {@link validateHostWidgetContracts} both call this, so a refusal reads
 * the same at authoring and at publication.
 */
export function widgetContractMismatchReasons(
  entry: WidgetRuntimeContractEntry,
  contract: WidgetRuntimeContract | undefined,
): WidgetRuntimeContractMismatchReason[] {
  const shape = record(entry.widgetShape);
  const deliveryContractId = shape?.deliveryContractId;
  const renderedConfigNodes = shape?.renderedConfigNodes;
  const declaresRuntimeContract =
    deliveryContractId !== undefined || renderedConfigNodes !== undefined;
  if (!declaresRuntimeContract) return [];
  if (!contract) return ['runtime-contract-missing'];

  const reasons: WidgetRuntimeContractMismatchReason[] = [];
  if (entry.version !== contract.registryEntryVersion) {
    reasons.push('registry-entry-version-mismatch');
  }
  if (
    typeof deliveryContractId !== 'string'
    || deliveryContractId !== contract.deliveryContractId
  ) {
    reasons.push('delivery-contract-id-mismatch');
  }
  const declaredNodes = normalizedRenderedConfigNodes(renderedConfigNodes);
  const deliveredNodes = normalizedRenderedConfigNodes(contract.renderedConfigNodes);
  if (
    declaredNodes === undefined
    || deliveredNodes === undefined
    || declaredNodes.length !== deliveredNodes.length
    || declaredNodes.some((node, index) => node !== deliveredNodes[index])
  ) {
    reasons.push('rendered-config-inventory-mismatch');
  }
  return reasons;
}

/** `widgetShape.widgetName` → every contract variant the host can deliver for it. */
export type HostWidgetContractSet = Readonly<Record<string, readonly WidgetRuntimeContract[]>>;

/**
 * The widget contracts a deployment host ships, as data. `modules` names hosts'
 * per-module sets; every other admitted module gets `anyModule`. A host that
 * lists no variant for a widget does not supply that widget at all.
 */
export interface HostWidgetContracts {
  anyModule?: HostWidgetContractSet;
  modules?: Readonly<Record<string, HostWidgetContractSet>>;
}

/**
 * Each widget's distinct contracts across the module variants a host can build
 * (one per supported version option). Variants keep first-seen order.
 */
export function hostWidgetContractSet(
  moduleContracts: readonly Readonly<Record<string, WidgetRuntimeContract>>[],
): HostWidgetContractSet {
  const set: Record<string, WidgetRuntimeContract[]> = {};
  for (const contracts of moduleContracts) {
    for (const [widgetName, contract] of Object.entries(contracts)) {
      const variants = (set[widgetName] ??= []);
      if (!variants.some((known) => widgetContractMismatchReasons(contractAsEntry(known), contract).length === 0)) {
        variants.push(contract);
      }
    }
  }
  return set;
}

function contractAsEntry(contract: WidgetRuntimeContract): WidgetRuntimeContractEntry {
  return {
    version: contract.registryEntryVersion,
    widgetShape: {
      deliveryContractId: contract.deliveryContractId,
      renderedConfigNodes: contract.renderedConfigNodes,
    },
  };
}

/** The variants the host delivers for one binding; undefined when the host does not supply the widget. */
export function hostWidgetContractVariants(
  host: HostWidgetContracts,
  key: { moduleId: string; widgetName: string },
): readonly WidgetRuntimeContract[] | undefined {
  const moduleSet = ownProp(host.modules, key.moduleId) as HostWidgetContractSet | undefined;
  const variants = ownProp(moduleSet ?? host.anyModule, key.widgetName);
  return Array.isArray(variants) && variants.length > 0 ? variants : undefined;
}

/**
 * The variant the host delivers for an entry: the first that implements it,
 * else the first with the fewest mismatch reasons, so the refusal names the
 * smallest gap. Publication selects with this too.
 */
export function selectHostWidgetContract(
  variants: readonly WidgetRuntimeContract[],
  entry: WidgetRuntimeContractEntry | undefined,
): WidgetRuntimeContract {
  let best = variants[0]!;
  if (entry === undefined) return best;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const variant of variants) {
    const count = widgetContractMismatchReasons(entry, variant).length;
    if (count < bestCount) {
      best = variant;
      bestCount = count;
    }
    if (count === 0) break;
  }
  return best;
}

export const HOST_WIDGET_CONTRACT_CODES = {
  unimplemented: 'WIDGET-UNIMPLEMENTED',
  mismatch: 'WIDGET-DELIVERY-CONTRACT-MISMATCH',
} as const;

/**
 * Authoring-time half of the module-widget delivery check: every Surface
 * `module-widget` binding must resolve to a host-shipped contract the Registry
 * entry matches. Runs only when the request carries `hostWidgetContracts`; a
 * caller with no deployment host has nothing to check against.
 */
export function validateHostWidgetContracts(context: AppGraphContext): AppGraphDiagnostic[] {
  const host = context.hostWidgetContracts;
  if (host === undefined) return [];
  const entries = registryWidgetEntries(context);
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const widget of surfaceWidgetSlots(surface)) {
      const entry = resolvedWidgetContributionFromEntries(widget, entries);
      const variants = hostWidgetContractVariants(host, widget);
      const pointer = `/routes/${widget.routeIndex}/slots/${widget.slotIndex}/binding`;
      const details = {
        surfaceRef: widget.surfaceRef,
        routeId: widget.routeId,
        slotId: widget.slotId,
        moduleId: widget.moduleId,
        widgetName: widget.widgetName,
        ...(entry ? { contributionName: entry.name } : {}),
      };
      if (variants === undefined) {
        diagnostics.push({
          code: HOST_WIDGET_CONTRACT_CODES.unimplemented,
          severity: 'error',
          phase: 'cross-artifact',
          origin: 'app-graph-validator',
          message: `The deployment host supplies no widget "${widget.widgetName}" for module "${widget.moduleId}", so publication cannot render this binding.`,
          primarySource: diagnosticSourceForHandle(surface, pointer),
          details,
        });
        continue;
      }
      if (entry === undefined) continue;
      const reasons = widgetContractMismatchReasons(entry, selectHostWidgetContract(variants, entry));
      if (reasons.length === 0) continue;
      const entryPointer = `/entries/${entry.entryIndex}`;
      diagnostics.push({
        code: HOST_WIDGET_CONTRACT_CODES.mismatch,
        severity: 'error',
        phase: 'cross-artifact',
        origin: 'app-graph-validator',
        message: `Registry contribution "${entry.name}" (version ${String(ownProp(record(entry), 'version'))}) does not match any contract the deployment host ships for "${widget.moduleId}/${widget.widgetName}": ${reasons.join(', ')}.`,
        primarySource: diagnosticSourceForHandle(entry.registry, entryPointer),
        relatedSources: [diagnosticSourceForHandle(surface, pointer)],
        details: {
          ...details,
          reasons,
          shippedVersions: variants.map((variant) => variant.registryEntryVersion),
          deliveryContractId: stringProp(record(entry.widgetShape), 'deliveryContractId'),
        },
      });
    }
  }
  return diagnostics;
}
