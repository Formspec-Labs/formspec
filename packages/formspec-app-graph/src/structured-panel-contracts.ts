/** @filedesc Cross-artifact semantic lint for the generic StructuredPanel widget. */

import type {
  AppGraphContext,
  AppGraphDiagnostic,
  AppGraphSourcePointer,
  ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';
import { NEED_ANCHOR } from './needs-coverage.js';
import {
  escapeJsonPointerToken,
  handlesByKind,
  ownProp,
  record,
  recordArray,
  registryWidgetEntries,
  resolvedWidgetContributionFromEntries,
  stringProp,
  surfaceWidgetSlots,
  widgetShape,
  type JsonRecord,
  type SurfaceWidgetSlot,
} from './surface-widgets.js';

const STRUCTURED_PANEL_DELIVERY_CONTRACT_ID =
  '@formspec-org/surface-react/StructuredPanel@0.1';
const SAFE_PATH_PART = /^[a-zA-Z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);
const ARRAY_ITEM = Symbol('array-item');

type SchemaStep = string | typeof ARRAY_ITEM;
type SchemaResult = 'possible' | 'impossible' | 'unknown';
type ExpectedValue = 'array' | 'number' | 'object' | 'scalar' | 'value';

export const STRUCTURED_PANEL_CONTRACT_CODES = {
  duplicateBlockId: 'STRUCTURED-PANEL-BLOCK-ID-DUPLICATE',
  duplicateKeyValueItemId: 'STRUCTURED-PANEL-KEY-VALUE-ITEM-ID-DUPLICATE',
  duplicateTableColumnId: 'STRUCTURED-PANEL-TABLE-COLUMN-ID-DUPLICATE',
  duplicateActionOutput: 'STRUCTURED-PANEL-ACTION-OUTPUT-DUPLICATE',
  actionUnbound: 'STRUCTURED-PANEL-ACTION-UNBOUND',
  actionLabelNonLiteral: 'STRUCTURED-PANEL-ACTION-LABEL-NON-LITERAL',
  actionConfirmationInvalid: 'STRUCTURED-PANEL-ACTION-CONFIRMATION-INVALID',
  dataPathImpossible: 'STRUCTURED-PANEL-DATA-PATH-IMPOSSIBLE',
} as const;

const CONFIRMATION_LABELS = ['heading', 'body', 'confirmLabel', 'cancelLabel'] as const;

interface BoundSchema {
  schema: unknown;
  rootSchema: unknown;
  source: AppGraphSourcePointer;
  catalogRef: string;
  sourceRef: string;
}

interface PathEvaluation {
  result: SchemaResult;
  source?: BoundSchema;
  reason?: string;
}

function panelPointer(widget: SurfaceWidgetSlot, suffix = ''): string {
  return `/routes/${widget.routeIndex}/slots/${widget.slotIndex}/binding/config${suffix}`;
}

function panelDiagnostic(
  widget: SurfaceWidgetSlot,
  code: string,
  pointer: string,
  message: string,
  reason: string,
  details: JsonRecord = {},
  relatedSources: AppGraphSourcePointer[] = [],
): AppGraphDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource: diagnosticSourceForHandle(widget.surface, pointer),
    ...(relatedSources.length > 0 ? { relatedSources } : {}),
    details: {
      reason,
      surfaceRef: widget.surfaceRef,
      routeId: widget.routeId,
      slotId: widget.slotId,
      moduleId: widget.moduleId,
      widgetName: widget.widgetName,
      ...details,
    },
  };
}

function isStructuredPanel(
  widget: SurfaceWidgetSlot,
  contribution: ReturnType<typeof resolvedWidgetContributionFromEntries>,
): boolean {
  const deliveryContractId = stringProp(widgetShape(contribution), 'deliveryContractId');
  if (deliveryContractId === STRUCTURED_PANEL_DELIVERY_CONTRACT_ID) return true;
  // Keep pre-delivery-contract bundles lintable. A declared, different
  // delivery contract wins over the conventional legacy names.
  return deliveryContractId === undefined
    && (widget.widgetName === 'StructuredPanel' || widget.widgetName === 'x-structured-panel');
}

function duplicateStringDiagnostics(
  widget: SurfaceWidgetSlot,
  values: readonly JsonRecord[],
  property: string,
  basePointer: string,
  code: string,
  label: string,
): AppGraphDiagnostic[] {
  const firstByValue = new Map<string, number>();
  const diagnostics: AppGraphDiagnostic[] = [];
  values.forEach((value, index) => {
    const identity = stringProp(value, property);
    if (!identity) return;
    const firstIndex = firstByValue.get(identity);
    if (firstIndex === undefined) {
      firstByValue.set(identity, index);
      return;
    }
    const firstPointer = `${basePointer}/${firstIndex}/${escapeJsonPointerToken(property)}`;
    const duplicatePointer = `${basePointer}/${index}/${escapeJsonPointerToken(property)}`;
    diagnostics.push(panelDiagnostic(
      widget,
      code,
      duplicatePointer,
      `StructuredPanel ${label} '${identity}' is declared more than once.`,
      'duplicate-identity',
      {
        identity,
        firstIndex,
        duplicateIndex: index,
      },
      [diagnosticSourceForHandle(widget.surface, firstPointer)],
    ));
  });
  return diagnostics;
}

function duplicateConfigDiagnostics(
  widget: SurfaceWidgetSlot,
  config: JsonRecord,
): AppGraphDiagnostic[] {
  const blocks = recordArray(ownProp(config, 'blocks'));
  const diagnostics = duplicateStringDiagnostics(
    widget,
    blocks,
    'id',
    panelPointer(widget, '/blocks'),
    STRUCTURED_PANEL_CONTRACT_CODES.duplicateBlockId,
    'block id',
  );

  blocks.forEach((block, blockIndex) => {
    if (stringProp(block, 'type') === 'key-value') {
      diagnostics.push(...duplicateStringDiagnostics(
        widget,
        recordArray(ownProp(block, 'items')),
        'id',
        panelPointer(widget, `/blocks/${blockIndex}/items`),
        STRUCTURED_PANEL_CONTRACT_CODES.duplicateKeyValueItemId,
        `key-value item id in block '${stringProp(block, 'id') ?? blockIndex}'`,
      ));
    }
    if (stringProp(block, 'type') === 'table') {
      diagnostics.push(...duplicateStringDiagnostics(
        widget,
        recordArray(ownProp(block, 'columns')),
        'id',
        panelPointer(widget, `/blocks/${blockIndex}/columns`),
        STRUCTURED_PANEL_CONTRACT_CODES.duplicateTableColumnId,
        `table column id in block '${stringProp(block, 'id') ?? blockIndex}'`,
      ));
    }
  });

  diagnostics.push(...duplicateStringDiagnostics(
    widget,
    recordArray(ownProp(config, 'actions')),
    'outputName',
    panelPointer(widget, '/actions'),
    STRUCTURED_PANEL_CONTRACT_CODES.duplicateActionOutput,
    'action output',
  ));
  return diagnostics;
}

interface ResolvedResponseAction {
  handle: ResolvedArtifactHandle;
  action: JsonRecord;
  actionIndex: number;
}

function responseActions(
  context: AppGraphContext,
  actionRef: string,
): ResolvedResponseAction[] {
  return handlesByKind(context.handles, 'responseActions').flatMap((handle) =>
    recordArray(ownProp(record(handle.document), 'actions')).flatMap((action, actionIndex) =>
      stringProp(action, 'id') === actionRef
        ? [{ handle, action, actionIndex }]
        : []
    )
  );
}

function actionDiagnostics(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  config: JsonRecord,
): AppGraphDiagnostic[] {
  const configuredActions = [
    ...recordArray(ownProp(config, 'actions')).map((action, index) => ({
      action,
      pointer: panelPointer(widget, `/actions/${index}/outputName`),
      actionIndex: index,
    })),
    ...recordArray(ownProp(config, 'blocks')).flatMap((block, blockIndex) => {
      if (stringProp(block, 'type') !== 'table') return [];
      const action = record(ownProp(block, 'rowAction'));
      return action
        ? [{
            action,
            pointer: panelPointer(
              widget,
              `/blocks/${blockIndex}/rowAction/outputName`,
            ),
            actionIndex: blockIndex,
          }]
        : [];
    }),
  ];
  const bindings = record(ownProp(widget.binding, 'actionBindings'));
  const diagnostics: AppGraphDiagnostic[] = [];

  configuredActions.forEach(({ action, pointer: outputPointer, actionIndex }) => {
    const outputName = stringProp(action, 'outputName');
    if (!outputName) return;
    if (!bindings || !Object.prototype.hasOwnProperty.call(bindings, outputName)) {
      diagnostics.push(panelDiagnostic(
        widget,
        STRUCTURED_PANEL_CONTRACT_CODES.actionUnbound,
        outputPointer,
        `StructuredPanel action output '${outputName}' has no Surface action binding and cannot render.`,
        'configured-action-unbound',
        { outputName, actionIndex },
      ));
      return;
    }

    const actionRef = stringProp(record(ownProp(bindings, outputName)), 'actionRef');
    if (!actionRef) return;
    const matches = responseActions(context, actionRef);
    // Surface widget action lint owns missing or ambiguous action references.
    if (matches.length !== 1) return;
    const resolved = matches[0]!;
    const label = record(ownProp(resolved.action, 'label'));
    const literal = stringProp(label, 'literal');
    if (literal !== undefined && literal.length > 0) return;

    const labelPointer = `/actions/${resolved.actionIndex}/label`;
    diagnostics.push(panelDiagnostic(
      widget,
      STRUCTURED_PANEL_CONTRACT_CODES.actionLabelNonLiteral,
      outputPointer,
      `StructuredPanel action output '${outputName}' resolves to action '${actionRef}', but that action has no non-empty literal label.`,
      stringProp(label, 'ref') !== undefined
        ? 'locale-label-not-renderable'
        : 'literal-label-missing',
      { outputName, actionIndex, actionRef },
      [diagnosticSourceForHandle(resolved.handle, labelPointer)],
    ));
  });
  return diagnostics;
}

/**
 * The renderer withholds a row action whose declared confirmation lacks any
 * label or its own Need anchor, so an author's permissive props schema cannot
 * hide the missing confirmation until run time.
 */
function confirmationDiagnostics(
  widget: SurfaceWidgetSlot,
  config: JsonRecord,
): AppGraphDiagnostic[] {
  return recordArray(ownProp(config, 'blocks')).flatMap((block, blockIndex) => {
    if (stringProp(block, 'type') !== 'table') return [];
    const rowAction = record(ownProp(block, 'rowAction'));
    const declared = ownProp(rowAction, 'confirmation');
    if (declared === undefined) return [];
    const confirmation = record(declared);
    const anchors = ownProp(record(ownProp(confirmation, 'x-generation')), 'anchors');
    const missing: string[] = CONFIRMATION_LABELS.filter((label) =>
      (stringProp(confirmation, label) ?? '').length === 0
    );
    if (
      !Array.isArray(anchors)
      || !anchors.some((anchor) => typeof anchor === 'string' && NEED_ANCHOR.test(anchor))
    ) {
      missing.push('x-generation.anchors');
    }
    if (missing.length === 0) return [];
    return [panelDiagnostic(
      widget,
      STRUCTURED_PANEL_CONTRACT_CODES.actionConfirmationInvalid,
      panelPointer(widget, `/blocks/${blockIndex}/rowAction/confirmation`),
      `StructuredPanel row action confirmation in block '${stringProp(block, 'id') ?? blockIndex}' is missing ${missing.join(', ')}; the renderer withholds the action.`,
      'confirmation-not-admissible',
      { blockIndex, missing },
    )];
  });
}

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

function localSchemaRef(root: unknown, ref: string): unknown {
  if (ref === '#') return root;
  if (!ref.startsWith('#/')) return undefined;
  let current = root;
  for (const rawToken of ref.slice(2).split('/')) {
    const value = record(current);
    if (!value) return undefined;
    const token = decodePointerToken(rawToken);
    if (!Object.prototype.hasOwnProperty.call(value, token)) return undefined;
    current = value[token];
  }
  return current;
}

function conjunction(results: readonly SchemaResult[]): SchemaResult {
  if (results.includes('impossible')) return 'impossible';
  if (results.length > 0 && results.every((result) => result === 'possible')) {
    return 'possible';
  }
  return 'unknown';
}

function alternative(results: readonly SchemaResult[]): SchemaResult {
  if (results.includes('possible')) return 'possible';
  if (results.length > 0 && results.every((result) => result === 'impossible')) {
    return 'impossible';
  }
  return 'unknown';
}

function explicitTypes(schema: JsonRecord): string[] | undefined {
  if (typeof schema.type === 'string') return [schema.type];
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((value): value is string => typeof value === 'string');
    return types.length > 0 ? types : undefined;
  }
  return undefined;
}

function valueMatchesExpected(value: unknown, expected: ExpectedValue): boolean {
  if (expected === 'value') return true;
  if (expected === 'array') return Array.isArray(value);
  if (expected === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (expected === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return (
    typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
  );
}

function typeMatchesExpected(type: string, expected: ExpectedValue): boolean {
  if (expected === 'value') return true;
  if (expected === 'array') return type === 'array';
  if (expected === 'object') return type === 'object';
  if (expected === 'number') return type === 'number' || type === 'integer';
  return ['string', 'boolean', 'number', 'integer'].includes(type);
}

function terminalSchemaResult(schema: JsonRecord, expected: ExpectedValue): SchemaResult {
  if (expected === 'value') return 'possible';
  const types = explicitTypes(schema);
  if (types) {
    return types.some((type) => typeMatchesExpected(type, expected))
      ? 'possible'
      : 'impossible';
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return valueMatchesExpected(schema.const, expected) ? 'possible' : 'impossible';
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.some((value) => valueMatchesExpected(value, expected))
      ? 'possible'
      : 'impossible';
  }
  return 'unknown';
}

function patternSchemas(schema: JsonRecord, property: string): unknown[] {
  const patterns = record(schema.patternProperties);
  if (!patterns) return [];
  return Object.entries(patterns).flatMap(([pattern, child]) => {
    try {
      return new RegExp(pattern).test(property) ? [child] : [];
    } catch {
      // Executable-schema lint owns invalid regular expressions.
      return [];
    }
  });
}

function directSchemaResult(
  schema: JsonRecord,
  steps: readonly SchemaStep[],
  expected: ExpectedValue,
  root: unknown,
  seen: ReadonlySet<string>,
): SchemaResult {
  if (steps.length === 0) return terminalSchemaResult(schema, expected);
  const [step, ...rest] = steps;
  const types = explicitTypes(schema);

  if (step === ARRAY_ITEM) {
    if (types && !types.includes('array')) return 'impossible';
    if (schema.maxItems === 0) return 'impossible';

    const alternatives: SchemaResult[] = [];
    if (Array.isArray(schema.prefixItems)) {
      alternatives.push(...schema.prefixItems.map((item) =>
        schemaResult(item, rest, expected, root, seen)
      ));
    }
    if (schema.items === false) {
      return alternatives.length > 0 ? alternative(alternatives) : 'impossible';
    }
    if (schema.items !== undefined) {
      alternatives.push(schemaResult(schema.items, rest, expected, root, seen));
      return alternative(alternatives);
    }
    return alternatives.length > 0
      ? alternative([...alternatives, 'unknown'])
      : 'unknown';
  }

  if (types && !types.includes('object')) return 'impossible';
  const properties = record(schema.properties);
  if (properties && Object.prototype.hasOwnProperty.call(properties, step)) {
    return schemaResult(properties[step], rest, expected, root, seen);
  }

  const matches = patternSchemas(schema, step);
  if (matches.length > 0) {
    return conjunction(matches.map((child) =>
      schemaResult(child, rest, expected, root, seen)
    ));
  }

  if (schema.additionalProperties === false) return 'impossible';
  if (schema.additionalProperties !== undefined) {
    return schemaResult(schema.additionalProperties, rest, expected, root, seen);
  }
  return 'unknown';
}

function schemaResult(
  schema: unknown,
  steps: readonly SchemaStep[],
  expected: ExpectedValue,
  root: unknown,
  seen: ReadonlySet<string> = new Set(),
): SchemaResult {
  if (schema === false) return 'impossible';
  if (schema === true) return 'unknown';
  const value = record(schema);
  if (!value) return 'unknown';

  const constraints: SchemaResult[] = [
    directSchemaResult(value, steps, expected, root, seen),
  ];

  const ref = stringProp(value, '$ref');
  if (ref) {
    const seenKey = `${ref}\u0000${steps.map((step) => (
      step === ARRAY_ITEM ? '[]' : step
    )).join('.')}\u0000${expected}`;
    if (seen.has(seenKey)) {
      constraints.push('unknown');
    } else {
      const target = localSchemaRef(root, ref);
      if (target === undefined) {
        constraints.push('unknown');
      } else {
        constraints.push(schemaResult(
          target,
          steps,
          expected,
          root,
          new Set([...seen, seenKey]),
        ));
      }
    }
  }

  if (Array.isArray(value.allOf)) {
    constraints.push(...value.allOf.map((branch) =>
      schemaResult(branch, steps, expected, root, seen)
    ));
  }
  if (Array.isArray(value.anyOf)) {
    constraints.push(alternative(value.anyOf.map((branch) =>
      schemaResult(branch, steps, expected, root, seen)
    )));
  }
  if (Array.isArray(value.oneOf)) {
    constraints.push(alternative(value.oneOf.map((branch) =>
      schemaResult(branch, steps, expected, root, seen)
    )));
  }
  return conjunction(constraints);
}

function pathParts(path: string): string[] | undefined {
  if (path.length === 0) return undefined;
  const parts = path.split('.');
  return parts.every((part) =>
    SAFE_PATH_PART.test(part) && !UNSAFE_PATH_PARTS.has(part)
  )
    ? parts
    : undefined;
}

function exactBoundSchema(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  inputName: string,
): BoundSchema | undefined {
  const bindings = record(ownProp(widget.binding, 'dataBindings'));
  const binding = record(ownProp(bindings, inputName));
  const catalogRef = stringProp(binding, 'catalogRef');
  const sourceRef = stringProp(binding, 'sourceRef');
  if (!catalogRef || !sourceRef) return undefined;

  const catalogs = handlesByKind(context.handles, 'dataSources').filter((handle) =>
    handle.ref?.url === catalogRef
    && stringProp(record(handle.document), 'id') === catalogRef
  );
  if (catalogs.length !== 1) return undefined;
  const catalog = catalogs[0]!;
  const sources = recordArray(ownProp(record(catalog.document), 'sources'))
    .map((source, sourceIndex) => ({ source, sourceIndex }))
    .filter(({ source }) => stringProp(source, 'id') === sourceRef);
  if (sources.length !== 1) return undefined;
  const match = sources[0]!;
  if (!Object.prototype.hasOwnProperty.call(match.source, 'schema')) return undefined;
  return {
    schema: match.source.schema,
    rootSchema: match.source.schema,
    source: diagnosticSourceForHandle(catalog, `/sources/${match.sourceIndex}/schema`),
    catalogRef,
    sourceRef,
  };
}

function evaluateDataPath(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  path: string,
  suffix: readonly SchemaStep[],
  expected: ExpectedValue,
): PathEvaluation {
  const parts = pathParts(path);
  if (!parts) {
    return { result: 'impossible', reason: 'unsafe-or-invalid-path-syntax' };
  }
  const [inputName, ...sourceParts] = parts;
  const bindings = record(ownProp(widget.binding, 'dataBindings'));
  if (!bindings || !Object.prototype.hasOwnProperty.call(bindings, inputName!)) {
    return { result: 'impossible', reason: 'data-input-unbound' };
  }
  const source = exactBoundSchema(context, widget, inputName!);
  if (!source) return { result: 'unknown' };
  return {
    result: schemaResult(
      source.schema,
      [...sourceParts, ...suffix],
      expected,
      source.rootSchema,
    ),
    source,
    reason: 'bound-source-schema-excludes-path',
  };
}

function impossiblePathDiagnostic(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  pointer: string,
  path: string,
  suffix: readonly SchemaStep[],
  expected: ExpectedValue,
  usage: string,
): AppGraphDiagnostic[] {
  const result = evaluateDataPath(context, widget, path, suffix, expected);
  if (result.result !== 'impossible') return [];
  return [panelDiagnostic(
    widget,
    STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
    pointer,
    `StructuredPanel ${usage} path '${path}' cannot produce a renderable value from its exact bound Data Source schema.`,
    result.reason ?? 'bound-source-schema-excludes-path',
    {
      path,
      expected,
      usage,
      ...(result.source
        ? {
          catalogRef: result.source.catalogRef,
          sourceRef: result.source.sourceRef,
        }
        : {}),
    },
    result.source ? [result.source.source] : [],
  )];
}

function dataPathDiagnostics(
  context: AppGraphContext,
  widget: SurfaceWidgetSlot,
  config: JsonRecord,
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const blocks = recordArray(ownProp(config, 'blocks'));
  const emptyWhen = record(ownProp(config, 'emptyWhen'));
  const emptyInput = stringProp(emptyWhen, 'inputName');
  const emptyPath = stringProp(emptyWhen, 'path');
  if (emptyInput) {
    const selectedPath = emptyPath ? `${emptyInput}.${emptyPath}` : emptyInput;
    diagnostics.push(...impossiblePathDiagnostic(
      context,
      widget,
      panelPointer(widget, `/emptyWhen/${emptyPath ? 'path' : 'inputName'}`),
      selectedPath,
      [],
      'value',
      'empty selector',
    ));
  }

  recordArray(ownProp(config, 'actions')).forEach((action, actionIndex) => {
    const payload = record(ownProp(action, 'payload'));
    if (!payload) return;
    Object.entries(payload).forEach(([name, candidate]) => {
      const path = stringProp(record(candidate), 'path');
      if (path === undefined || path === '') return;
      diagnostics.push(...impossiblePathDiagnostic(
        context,
        widget,
        panelPointer(
          widget,
          `/actions/${actionIndex}/payload/${escapeJsonPointerToken(name)}/path`,
        ),
        path,
        [],
        'value',
        'action payload',
      ));
    });
  });

  blocks.forEach((block, blockIndex) => {
    const type = stringProp(block, 'type');
    const path = stringProp(block, 'path');
    const pathPointer = panelPointer(widget, `/blocks/${blockIndex}/path`);

    if (path && (type === 'metric' || type === 'key-value')) {
      diagnostics.push(...impossiblePathDiagnostic(
        context,
        widget,
        pathPointer,
        path,
        [],
        'scalar',
        `${type} block`,
      ));
    }
    if (path && type === 'progress') {
      diagnostics.push(...impossiblePathDiagnostic(
        context,
        widget,
        pathPointer,
        path,
        [],
        'number',
        'progress block',
      ));
      const maxPath = stringProp(block, 'maxPath');
      if (maxPath) {
        diagnostics.push(...impossiblePathDiagnostic(
          context,
          widget,
          panelPointer(widget, `/blocks/${blockIndex}/maxPath`),
          maxPath,
          [],
          'number',
          'progress maximum',
        ));
      }
    }

    if (type === 'key-value') {
      recordArray(ownProp(block, 'items')).forEach((item, itemIndex) => {
        const itemPath = stringProp(item, 'path');
        if (!itemPath) return;
        diagnostics.push(...impossiblePathDiagnostic(
          context,
          widget,
          panelPointer(widget, `/blocks/${blockIndex}/items/${itemIndex}/path`),
          itemPath,
          [],
          'scalar',
          'key-value item',
        ));
      });
    }

    if (path && type === 'list') {
      const itemPath = stringProp(block, 'itemPath');
      const itemSuffix: SchemaStep[] = [ARRAY_ITEM];
      if (itemPath) {
        const parts = pathParts(itemPath);
        if (!parts) {
          diagnostics.push(...impossiblePathDiagnostic(
            context,
            widget,
            panelPointer(widget, `/blocks/${blockIndex}/itemPath`),
            `${path}.${itemPath}`,
            [],
            'scalar',
            'list item',
          ));
          return;
        }
        itemSuffix.push(...parts);
      }
      diagnostics.push(...impossiblePathDiagnostic(
        context,
        widget,
        itemPath
          ? panelPointer(widget, `/blocks/${blockIndex}/itemPath`)
          : pathPointer,
        path,
        itemSuffix,
        'scalar',
        'list item',
      ));
    }

    if (path && type === 'table') {
      const rowCheck = impossiblePathDiagnostic(
        context,
        widget,
        pathPointer,
        path,
        [ARRAY_ITEM],
        'object',
        'table row',
      );
      diagnostics.push(...rowCheck);
      if (rowCheck.length > 0) return;

      recordArray(ownProp(block, 'columns')).forEach((column, columnIndex) => {
        const columnPath = stringProp(column, 'path');
        if (!columnPath) return;
        const parts = pathParts(columnPath);
        if (!parts) {
          diagnostics.push(panelDiagnostic(
            widget,
            STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
            panelPointer(widget, `/blocks/${blockIndex}/columns/${columnIndex}/path`),
            `StructuredPanel table column path '${columnPath}' uses syntax the renderer cannot read.`,
            'unsafe-or-invalid-path-syntax',
            { path: columnPath, usage: 'table column' },
          ));
          return;
        }
        diagnostics.push(...impossiblePathDiagnostic(
          context,
          widget,
          panelPointer(widget, `/blocks/${blockIndex}/columns/${columnIndex}/path`),
          path,
          [ARRAY_ITEM, ...parts],
          'scalar',
          'table column',
        ));
      });

      const rowAction = record(ownProp(block, 'rowAction'));
      const rowPayload = record(ownProp(rowAction, 'payload'));
      if (rowPayload) {
        Object.entries(rowPayload).forEach(([name, candidate]) => {
          const rowPath = stringProp(record(candidate), 'path');
          if (rowPath === undefined || rowPath === '') return;
          const parts = pathParts(rowPath);
          const pointer = panelPointer(
            widget,
            `/blocks/${blockIndex}/rowAction/payload/${escapeJsonPointerToken(name)}/path`,
          );
          if (!parts) {
            diagnostics.push(panelDiagnostic(
              widget,
              STRUCTURED_PANEL_CONTRACT_CODES.dataPathImpossible,
              pointer,
              `StructuredPanel table row action path '${rowPath}' uses syntax the renderer cannot read.`,
              'unsafe-or-invalid-path-syntax',
              { path: rowPath, usage: 'table row action' },
            ));
            return;
          }
          diagnostics.push(...impossiblePathDiagnostic(
            context,
            widget,
            pointer,
            path,
            [ARRAY_ITEM, ...parts],
            'value',
            'table row action',
          ));
        });
      }
    }
  });

  return diagnostics;
}

/**
 * Validate authored StructuredPanel configuration against the exact Surface
 * bindings and loaded Data Source and Response Actions documents.
 *
 * Runtime payload absence remains a runtime diagnostic. This pass reports only
 * authored collisions and render failures proven by the loaded graph.
 */
export function validateStructuredPanelContracts(
  context: AppGraphContext,
): AppGraphDiagnostic[] {
  const entries = registryWidgetEntries(context);
  const diagnostics: AppGraphDiagnostic[] = [];
  for (const surface of handlesByKind(context.handles, 'surface')) {
    for (const widget of surfaceWidgetSlots(surface)) {
      const contribution = resolvedWidgetContributionFromEntries(widget, entries);
      if (!contribution || !isStructuredPanel(widget, contribution)) continue;
      const config = record(ownProp(widget.binding, 'config'));
      if (!config) continue;
      diagnostics.push(
        ...duplicateConfigDiagnostics(widget, config),
        ...actionDiagnostics(context, widget, config),
        ...confirmationDiagnostics(widget, config),
        ...dataPathDiagnostics(context, widget, config),
      );
    }
  }
  return diagnostics;
}
