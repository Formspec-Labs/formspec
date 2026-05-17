/**
 * @filedesc Canonical command payload map — one entry per builtin command type.
 *
 * This file defines the exact payload shape for each command in builtinHandlers.
 * It was initially seeded from handler `payload as {...}` casts but is now the
 * **source of truth** for compile-time dispatch safety.
 *
 * A compile-time sync proof in `handlers/index.ts` enforces that every key here
 * matches a handler key and vice versa. If you add a new handler, add its entry
 * here first — the build will tell you if the keys diverge.
 */

import type {
  FormItem,
  FormShape,
  FormVariable,
  FormOption,
  FormInstance,
  ProjectBundle,
  TargetSchema,
} from '@formspec-org/types';
import type { ScreenerDocument } from './types.js';

export interface ProjectCommandMap {
  'theme.setToken': { key: string; value: unknown };
  'theme.setTokens': { tokens: Record<string, unknown> };
  'theme.setDefaults': { property: string; value: unknown };
  'theme.addSelector': { match: unknown; apply: unknown; insertIndex?: number };
  'theme.setSelector': { index: number; match?: unknown; apply?: unknown };
  'theme.deleteSelector': { index: number };
  'theme.reorderSelector': { index: number; direction: 'up' | 'down' };
  'theme.setItemOverride': { itemKey: string; property: string; value: unknown };
  'theme.deleteItemOverride': { itemKey: string };
  'theme.setItemStyle': { itemKey: string; property: string; value: unknown };
  'theme.setItemWidgetConfig': { itemKey: string; property: string; value: unknown };
  'theme.setItemAccessibility': { itemKey: string; property: string; value: unknown };
  'theme.setBreakpoint': { name: string; minWidth: number | null };
  'theme.setStylesheets': { urls: string[] };
  'theme.setDocumentProperty': { property: string; value: unknown };
  'theme.setExtension': { key: string; value: unknown };
  'theme.setTargetCompatibility': { compatibleVersions: string };
  'screener.setDocument': ScreenerDocument;
  'screener.remove': Record<string, unknown>;
  'screener.setMetadata': Record<string, unknown>;
  'screener.addItem': Record<string, unknown>;
  'screener.deleteItem': { key: string };
  'screener.setItemProperty': { key: string; property: string; value: unknown };
  'screener.reorderItem': { index: number; direction: 'up' | 'down' };
  'screener.setBind': { path: string; properties: Record<string, unknown> };
  'screener.addPhase': { id: string; strategy: string; label?: string; insertIndex?: number };
  'screener.removePhase': { phaseId: string };
  'screener.reorderPhase': { phaseId: string; direction: 'up' | 'down' };
  'screener.setPhaseProperty': { phaseId: string; property: string; value: unknown };
  'screener.addRoute': { phaseId: string; route: Record<string, unknown>; insertIndex?: number };
  'screener.setRouteProperty': { phaseId: string; index: number; property: string; value: unknown; };
  'screener.deleteRoute': { phaseId: string; index: number };
  'screener.reorderRoute': { phaseId: string; index: number; direction: 'up' | 'down' };
  'screener.setAvailability': { from?: string | null; until?: string | null };
  'screener.setResultValidity': { duration: string | null };
  'project.import': Partial<ProjectBundle>;
  'project.importSubform': { definition: Record<string, unknown>; targetGroupPath?: string; keyPrefix?: string; };
  'project.loadRegistry': { registry: Record<string, unknown> };
  'project.removeRegistry': { url: string };
  'project.publish': { version: string; summary?: string };
  'mapping.create': { id: string; targetSchema?: TargetSchema };
  'mapping.delete': { id: string };
  'mapping.rename': { oldId: string; newId: string };
  'mapping.select': { id: string };
  'mapping.setProperty': { mappingId?: string; property: string; value: unknown };
  'mapping.setTargetSchema': { mappingId?: string; property: string; value: unknown };
  'mapping.addRule': { mappingId?: string; sourcePath?: string; targetPath?: string; transform?: string; insertIndex?: number };
  'mapping.setRule': { mappingId?: string; index: number; property: string; value: unknown };
  'mapping.deleteRule': { mappingId?: string; index: number };
  'mapping.clearRules': { mappingId?: string };
  'mapping.reorderRule': { mappingId?: string; index: number; direction: 'up' | 'down' };
  'mapping.setAdapter': { mappingId?: string; format: string; config: unknown };
  'mapping.setDefaults': { mappingId?: string; defaults: Record<string, unknown> };
  'mapping.autoGenerateRules': { mappingId?: string; scopePath?: string; priority?: number; replace?: boolean };
  'mapping.setExtension': { mappingId?: string; key: string; value: unknown };
  'mapping.setRuleExtension': { mappingId?: string; index: number; key: string; value: unknown };
  'mapping.addInnerRule': { mappingId?: string; ruleIndex: number; sourcePath?: string; targetPath?: string; transform?: string; insertIndex?: number; };
  'mapping.setInnerRule': { mappingId?: string; ruleIndex: number; innerIndex: number; property: string; value: unknown; };
  'mapping.deleteInnerRule': { mappingId?: string; ruleIndex: number; innerIndex: number };
  'mapping.reorderInnerRule': { mappingId?: string; ruleIndex: number; innerIndex: number; direction: 'up' | 'down'; };
  'locale.load': { document: Record<string, unknown> };
  'locale.remove': { localeId: string };
  'locale.select': { localeId: string };
  'locale.setString': { localeId?: string; key: string; value: string | null };
  'locale.setStrings': { localeId?: string; strings: Record<string, string> };
  'locale.removeString': { localeId?: string; key: string };
  'locale.setMetadata': { localeId?: string; property: string; value: unknown };
  'locale.setFallback': { localeId?: string; fallback: string | null };
  'definition.addVariable': Record<string, unknown>;
  'definition.setVariable': { name: string; property: string; value: unknown };
  'definition.deleteVariable': { name: string };
  'definition.addShape': Record<string, unknown>;
  'definition.setShapeProperty': { id: string; property: string; value: unknown };
  'definition.setShapeComposition': { id: string; mode: string; refs?: string[]; ref?: string };
  'definition.renameShape': { id: string; newId: string };
  'definition.deleteShape': { id: string };
  'definition.setDefinitionProperty': { property: string; value: unknown };
  'definition.setFormPresentation': { property: string; value: unknown };
  'definition.setGroupRef': { path: string; ref: string | null; keyPrefix?: string };
  'definition.setOptionSet': { name: string; options?: unknown[]; source?: string };
  'definition.setOptionSetProperty': { name: string; property: string; value: unknown };
  'definition.deleteOptionSet': { name: string };
  'definition.promoteToOptionSet': { path: string; name: string };
  'definition.addMigration': { fromVersion: string; description?: string };
  'definition.deleteMigration': { fromVersion: string };
  'definition.setMigrationProperty': { fromVersion: string; property: string; value: unknown; };
  'definition.addFieldMapRule': { fromVersion: string; source: string; target: string | null; transform: string; expression?: string; insertIndex?: number; };
  'definition.setFieldMapRule': { fromVersion: string; index: number; property: string; value: unknown; };
  'definition.deleteFieldMapRule': { fromVersion: string; index: number };
  'definition.setMigrationDefaults': { fromVersion: string; defaults: Record<string, unknown> };
  'definition.setFormTitle': { title: string };
  'definition.addItem': Record<string, unknown>;
  'definition.deleteItem': { path: string };
  'definition.renameItem': { path: string; newKey: string };
  'definition.moveItem': { sourcePath: string; targetParentPath?: string; targetIndex?: number; };
  'definition.reorderItem': { path: string; direction: 'up' | 'down' };
  'definition.duplicateItem': { path: string };
  'definition.addInstance': Record<string, unknown>;
  'definition.setInstance': { name: string; property: string; value: unknown };
  'definition.renameInstance': { name: string; newName: string };
  'definition.deleteInstance': { name: string };
  'definition.setBind': { path: string; properties: Record<string, unknown>; };
  'definition.setItemProperty': { path: string; property: string; value: unknown };
  'definition.setFieldDataType': { path: string; dataType: NonNullable<FormItem['dataType']>; };
  'definition.setFieldOptions': { path: string; options: unknown };
  'definition.setItemExtension': { path: string; extension: string; value: unknown };
  'component.reconcileFromDefinition': Record<string, never>;
  'component.addNode': { parent: { bind?: string; nodeId?: string }; insertIndex?: number; component: string; bind?: string; props?: Record<string, unknown>; };
  'component.deleteNode': { node: { bind?: string; nodeId?: string } };
  'component.moveNode': { source: { bind?: string; nodeId?: string }; targetParent: { bind?: string; nodeId?: string }; targetIndex?: number; };
  'component.reorderNode': { node: { bind?: string; nodeId?: string }; direction: 'up' | 'down'; };
  'component.duplicateNode': { node: { bind?: string; nodeId?: string } };
  'component.wrapNode': { node: { bind?: string; nodeId?: string }; wrapper: { component: string; props?: Record<string, unknown> }; };
  'component.wrapSiblingNodes': { nodes: Array<{ bind?: string; nodeId?: string }>; wrapper: { component: string; props?: Record<string, unknown> }; };
  'component.unwrapNode': { node: { bind?: string; nodeId?: string } };
  'component.setNodeProperty': { node: { bind?: string; nodeId?: string }; property: string; value: unknown; };
  'component.setNodeType': { node: { bind?: string; nodeId?: string }; component: string; preserveProps?: boolean; };
  'component.setNodeStyle': { node: { bind?: string; nodeId?: string }; property: string; value: unknown; };
  'component.setNodeAccessibility': { node: { bind?: string; nodeId?: string }; property: string; value: unknown; };
  'component.spliceArrayProp': { node: { bind?: string; nodeId?: string }; property: string; index: number; deleteCount: number; insert?: unknown[]; };
  'component.setFieldWidget': { fieldKey: string; widget: string };
  'component.setResponsiveOverride': { node: { bind?: string; nodeId?: string }; breakpoint: string; patch: unknown; };
  'component.setGroupRepeatable': { groupKey: string; repeatable: boolean };
  'component.setGroupDisplayMode': { groupKey: string; mode: string };
  'component.setGroupDataTable': { groupKey: string; config: unknown };
  'component.registerCustom': { name: string; params: unknown; tree: unknown };
  'component.updateCustom': { name: string; params?: unknown; tree?: unknown };
  'component.deleteCustom': { name: string };
  'component.renameCustom': { name: string; newName: string };
  'component.setToken': { key: string; value: unknown };
  'component.setBreakpoint': { name: string; minWidth: number | null };
  'component.setDocumentProperty': { property: string; value: unknown };
}
