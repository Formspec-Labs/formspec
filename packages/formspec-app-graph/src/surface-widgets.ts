/** @filedesc Shared extraction for qualified Surface module-widget bindings. */

import type {
  AppGraphContext,
  ResolvedArtifactHandle,
} from './types.js';
import {
  resolveWidgetContribution,
  type WidgetContributionEntry,
} from './widget-contribution.js';

export type JsonRecord = Record<string, unknown>;

export interface RegistryWidgetEntry extends WidgetContributionEntry {
  registry: ResolvedArtifactHandle;
  entryIndex: number;
  widgetShape?: unknown;
  [key: string]: unknown;
}

export interface SurfaceWidgetSlot {
  surface: ResolvedArtifactHandle;
  surfaceRef?: string;
  route: JsonRecord;
  routeIndex: number;
  routeId?: string;
  slot: JsonRecord;
  slotIndex: number;
  slotId?: string;
  binding: JsonRecord;
  moduleId: string;
  widgetName: string;
}

export function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

export function stringProp(value: JsonRecord | undefined, key: string): string | undefined {
  const candidate = ownProp(value, key);
  return typeof candidate === 'string' ? candidate : undefined;
}

export function ownProp(value: JsonRecord | undefined, key: string): unknown {
  return value && Object.prototype.hasOwnProperty.call(value, key)
    ? value[key]
    : undefined;
}

export function recordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  const items: JsonRecord[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) continue;
    const item = record(value[index]);
    if (item) items.push(item);
  }
  return items;
}

export function handlesByKind(
  handles: readonly ResolvedArtifactHandle[],
  artifactKind: string,
): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}

export function registryWidgetEntries(context: AppGraphContext): RegistryWidgetEntry[] {
  return handlesByKind(context.handles, 'registry').flatMap((registry) =>
    recordArray(ownProp(record(registry.document), 'entries')).flatMap((entry, entryIndex) => {
      const name = stringProp(entry, 'name');
      const category = stringProp(entry, 'category');
      if (!name || !category) return [];
      const contributesValue = ownProp(entry, 'contributes');
      const contributes = Array.isArray(contributesValue)
        ? contributesValue.filter((value): value is string => typeof value === 'string')
        : undefined;
      return [{
        ...entry,
        name,
        category,
        ...(contributes ? { contributes } : {}),
        registry,
        entryIndex,
      }];
    })
  );
}

export function surfaceWidgetSlots(surface: ResolvedArtifactHandle): SurfaceWidgetSlot[] {
  const surfaceRef = typeof surface.ref?.url === 'string' ? surface.ref.url : undefined;
  return recordArray(ownProp(record(surface.document), 'routes')).flatMap((route, routeIndex) =>
    recordArray(ownProp(route, 'slots')).flatMap((slot, slotIndex) => {
      if (stringProp(slot, 'slotType') !== 'module-widget') return [];
      const binding = record(ownProp(slot, 'binding'));
      const moduleId = stringProp(binding, 'moduleId');
      const widgetName = stringProp(binding, 'widgetName');
      if (!binding || !moduleId || !widgetName) return [];
      return [{
        surface,
        ...(surfaceRef ? { surfaceRef } : {}),
        route,
        routeIndex,
        ...(stringProp(route, 'id') ? { routeId: stringProp(route, 'id') } : {}),
        slot,
        slotIndex,
        ...(stringProp(slot, 'id') ? { slotId: stringProp(slot, 'id') } : {}),
        binding,
        moduleId,
        widgetName,
      }];
    })
  );
}

export function resolvedWidgetContribution(
  context: AppGraphContext,
  widget: Pick<SurfaceWidgetSlot, 'moduleId' | 'widgetName'>,
): RegistryWidgetEntry | undefined {
  return resolvedWidgetContributionFromEntries(widget, registryWidgetEntries(context));
}

export function resolvedWidgetContributionFromEntries(
  widget: Pick<SurfaceWidgetSlot, 'moduleId' | 'widgetName'>,
  entries: readonly RegistryWidgetEntry[],
): RegistryWidgetEntry | undefined {
  return resolveWidgetContribution(
    { moduleId: widget.moduleId, widgetName: widget.widgetName },
    entries,
  );
}

export function moduleIsAdmitted(context: AppGraphContext, moduleId: string): boolean {
  return context.moduleResolution?.modules.some(
    (entry) => entry.ref.id === moduleId && entry.status === 'admitted',
  ) ?? false;
}

export function widgetShape(entry: RegistryWidgetEntry | undefined): JsonRecord | undefined {
  return record(ownProp(entry, 'widgetShape'));
}

export function escapeJsonPointerToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}
