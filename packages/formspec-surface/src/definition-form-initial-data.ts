/**
 * @filedesc Qualified initial-data loading for `definition-form` slots.
 *
 * Surface authors name one exact Data Source. Runtime delivery follows the
 * same availability -> authorization -> load -> schema-validation order as
 * widget data. A Mapping document is resolved by App Manifest handle and runs
 * only when the authored binding names it; mapping rules never live here.
 */
import type {
  FormDefinition,
  MappingDocument,
} from '@formspec-org/types';
import { satisfies, valid, validRange } from 'semver';
import {
  resolveDataSourceDescriptor,
  type DataSourceActiveContext,
  type DataSourceAuthorizer,
  type DataSourceCatalogHandle,
  type DataSourceDescriptor,
  type DataSourceLoader,
  type DataSourcePayloadValidator,
} from './data-source-loader.js';
import {
  surfaceDiagnostic,
  type SurfaceDiagnostic,
  type SurfaceDiagnosticSite,
} from './diagnostics.js';

/** The authored, exact Data Source identity for one form's initial data. */
export interface DefinitionFormInitialDataBinding {
  catalogRef: string;
  sourceRef: string;
  /** App Manifest `mappings[].handle`; never an inline rule set or URL guess. */
  mappingRef?: string | undefined;
}

/** One manifested Mapping document paired with its author-chosen handle. */
export interface MappingDocumentHandle {
  mappingRef: string;
  artifactRef: string;
  document: MappingDocument;
}

export type DefinitionFormInitialDataPlan =
  | {
      status: 'ready';
      binding: DefinitionFormInitialDataBinding;
      descriptor: DataSourceDescriptor;
      mapping?: MappingDocumentHandle | undefined;
    }
  | {
      status: 'unresolved' | 'unavailable';
      reason: string;
      binding?: DefinitionFormInitialDataBinding | undefined;
    };

export interface PlanDefinitionFormInitialDataInput {
  binding: unknown;
  definition: FormDefinition;
  definitionRef: string;
  catalogs: readonly DataSourceCatalogHandle[];
  mappings: readonly MappingDocumentHandle[];
  context: Pick<
    DataSourceActiveContext,
    'surfaceRef' | 'routeId' | 'slotId'
  >;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBinding(value: unknown): DefinitionFormInitialDataBinding | undefined {
  if (!isRecord(value)) return undefined;
  const catalogRef = value.catalogRef;
  const sourceRef = value.sourceRef;
  const mappingRef = value.mappingRef;
  if (
    typeof catalogRef !== 'string' ||
    catalogRef.length === 0 ||
    typeof sourceRef !== 'string' ||
    sourceRef.length === 0 ||
    (mappingRef !== undefined &&
      (typeof mappingRef !== 'string' || mappingRef.length === 0))
  ) {
    return undefined;
  }
  return {
    catalogRef,
    sourceRef,
    ...(typeof mappingRef === 'string' ? { mappingRef } : {}),
  };
}

/** Recheck source availability for a Definition form, not for a widget. */
export function dataSourceAvailableToDefinitionForm(
  descriptor: DataSourceDescriptor,
  input: {
    definitionRef: string;
    surfaceRef?: string | undefined;
    routeId: string;
    slotId: string;
  },
): boolean {
  const availability = descriptor.source.availability;
  switch (availability.level) {
    case 'app':
      return true;
    case 'definition':
      return availability.definitionRef === input.definitionRef;
    case 'surface':
      return (
        input.surfaceRef !== undefined &&
        availability.surfaceRef === input.surfaceRef
      );
    case 'route':
      return (
        input.surfaceRef !== undefined &&
        availability.surfaceRef === input.surfaceRef &&
        availability.routeRef === input.routeId
      );
    case 'slot':
      return (
        input.surfaceRef !== undefined &&
        availability.surfaceRef === input.surfaceRef &&
        availability.routeRef === input.routeId &&
        availability.slotId === input.slotId
      );
    case 'module':
      return false;
  }
}

/**
 * Resolve an authored initial-data binding without filename, catalog-order, or
 * unqualified source fallbacks.
 */
export function planDefinitionFormInitialData(
  input: PlanDefinitionFormInitialDataInput,
): DefinitionFormInitialDataPlan {
  const binding = parseBinding(input.binding);
  if (!binding) {
    return {
      status: 'unresolved',
      reason:
        'The form initial-data binding must name one catalogRef and sourceRef.',
    };
  }

  const descriptor = resolveDataSourceDescriptor(input.catalogs, binding);
  if (!descriptor) {
    return {
      status: 'unresolved',
      binding,
      reason: `The exact Data Source (${binding.catalogRef}, ${binding.sourceRef}) does not resolve once.`,
    };
  }

  if (
    !dataSourceAvailableToDefinitionForm(descriptor, {
      definitionRef: input.definitionRef,
      surfaceRef: input.context.surfaceRef,
      routeId: input.context.routeId,
      slotId: input.context.slotId,
    })
  ) {
    return {
      status: 'unavailable',
      binding,
      reason: 'The Data Source availability selector does not cover this form.',
    };
  }

  if (binding.mappingRef === undefined) {
    if (
      descriptor.source.kind === 'definition-response' &&
      descriptor.source.definitionRef !== input.definitionRef
    ) {
      return {
        status: 'unavailable',
        binding,
        reason:
          'A direct Definition Response source must target the form Definition.',
      };
    }
    if (
      descriptor.source.kind === 'definition-response' &&
      descriptor.source.runtime.delivery !== 'draft' &&
      descriptor.source.definitionVersion !== input.definition.version
    ) {
      return {
        status: 'unavailable',
        binding,
        reason:
          'A direct Definition Response source must select the form Definition version.',
      };
    }
    return { status: 'ready', binding, descriptor };
  }

  const mappingMatches = input.mappings.filter(
    (candidate) => candidate.mappingRef === binding.mappingRef,
  );
  if (mappingMatches.length !== 1 || !mappingMatches[0]) {
    return {
      status: 'unresolved',
      binding,
      reason: `Mapping handle "${binding.mappingRef}" does not resolve once.`,
    };
  }
  const mapping = mappingMatches[0];
  if (mapping.document.definitionRef !== input.definitionRef) {
    return {
      status: 'unavailable',
      binding,
      reason: `Mapping handle "${binding.mappingRef}" targets a different Definition.`,
    };
  }
  if (
    valid(input.definition.version) === null ||
    validRange(mapping.document.definitionVersion) === null ||
    !satisfies(input.definition.version, mapping.document.definitionVersion)
  ) {
    return {
      status: 'unavailable',
      binding,
      reason: `Mapping handle "${binding.mappingRef}" does not admit Definition version ${input.definition.version}.`,
    };
  }
  if (
    mapping.document.direction !== 'reverse' &&
    mapping.document.direction !== 'both'
  ) {
    return {
      status: 'unavailable',
      binding,
      reason: `Mapping handle "${binding.mappingRef}" does not admit reverse execution.`,
    };
  }
  return { status: 'ready', binding, descriptor, mapping };
}

export type DefinitionFormInitialDataFailureReason =
  | 'unresolved'
  | 'unavailable'
  | 'unauthorized'
  | 'load-failed'
  | 'stale-disallowed'
  | 'record-id-missing'
  | 'payload-invalid'
  | 'mapping-failed'
  | 'payload-not-object';

/** Data and record identity stay separate; no field is packed into another. */
export type DefinitionFormInitialDataDelivery =
  | {
      status: 'ready';
      data: Readonly<Record<string, unknown>>;
      freshness: 'fresh' | 'stale';
      recordId?: string | undefined;
      generation?: string | number | undefined;
      revision?: string | number | undefined;
      diagnostics: readonly SurfaceDiagnostic[];
    }
  | {
      status: 'unavailable';
      reason: DefinitionFormInitialDataFailureReason;
      diagnostics: readonly SurfaceDiagnostic[];
    };

export type DefinitionFormInitialDataMappingResult =
  | { status: 'mapped'; data: unknown }
  | { status: 'unavailable'; reason?: string | undefined };

export type DefinitionFormInitialDataMapper = (input: {
  mapping: MappingDocument;
  definition: FormDefinition;
  value: unknown;
}) =>
  | DefinitionFormInitialDataMappingResult
  | Promise<DefinitionFormInitialDataMappingResult>;

export interface LoadDefinitionFormInitialDataInput {
  plan: Extract<DefinitionFormInitialDataPlan, { status: 'ready' }>;
  definition: FormDefinition;
  definitionRef: string;
  context: DataSourceActiveContext;
  loader?: DataSourceLoader | undefined;
  authorize?: DataSourceAuthorizer | undefined;
  validatePayload?: DataSourcePayloadValidator | undefined;
  map?: DefinitionFormInitialDataMapper | undefined;
  site: SurfaceDiagnosticSite;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailable(
  reason: DefinitionFormInitialDataFailureReason,
  message: string,
  site: SurfaceDiagnosticSite,
): DefinitionFormInitialDataDelivery {
  return {
    status: 'unavailable',
    reason,
    diagnostics: [
      surfaceDiagnostic(
        'DEFINITION-FORM-DATA-UNAVAILABLE',
        `The form's initial data is unavailable: ${message}`,
        site,
        { reason },
      ),
    ],
  };
}

/**
 * Deliver initial form data through one ordered, fail-closed path.
 *
 * For a direct `definition-response` source, `loaded.value` is already
 * `Response.data` under Data Sources 1.0. This function never hydrates the
 * enclosing Form Response object or mixes record metadata into field data.
 */
export async function loadDefinitionFormInitialData(
  input: LoadDefinitionFormInitialDataInput,
): Promise<DefinitionFormInitialDataDelivery> {
  const { descriptor } = input.plan;
  if (
    !dataSourceAvailableToDefinitionForm(descriptor, {
      definitionRef: input.definitionRef,
      surfaceRef: input.context.surfaceRef,
      routeId: input.context.routeId,
      slotId: input.context.slotId,
    })
  ) {
    return unavailable(
      'unavailable',
      'its availability selector does not cover this form',
      input.site,
    );
  }

  if (!input.authorize) {
    return unavailable(
      'unauthorized',
      'the host supplied no authorization decision',
      input.site,
    );
  }
  let authorization;
  try {
    authorization = await input.authorize({
      descriptor,
      context: input.context,
    });
  } catch (error) {
    return unavailable('unauthorized', errorText(error), input.site);
  }
  if (authorization.status !== 'authorized') {
    return unavailable(
      'unauthorized',
      authorization.reason ?? 'the host refused access',
      input.site,
    );
  }

  if (!input.loader) {
    return unavailable(
      'load-failed',
      'the host supplied no DataSourceLoader',
      input.site,
    );
  }
  let loaded;
  try {
    loaded = await input.loader({ descriptor, context: input.context });
  } catch (error) {
    return unavailable('load-failed', errorText(error), input.site);
  }
  if (loaded.status !== 'loaded') {
    return unavailable('unavailable', loaded.reason, input.site);
  }
  if (
    loaded.freshness === 'stale' &&
    descriptor.source.runtime.failureMode !== 'stale-ok'
  ) {
    return unavailable(
      'stale-disallowed',
      'the loader returned stale data and this source does not admit it',
      input.site,
    );
  }
  if (
    descriptor.source.kind === 'definition-response' &&
    descriptor.source.runtime.delivery !== 'draft' &&
    (typeof loaded.recordId !== 'string' || loaded.recordId.length === 0)
  ) {
    return unavailable(
      'record-id-missing',
      'the selected Definition Response omitted its owner-produced recordId',
      input.site,
    );
  }

  const schema = descriptor.source.schema;
  if (schema !== undefined) {
    if (!input.validatePayload) {
      return unavailable(
        'payload-invalid',
        'the source declares a schema and the host supplied no validator',
        input.site,
      );
    }
    let validation;
    try {
      validation = await input.validatePayload({
        descriptor,
        context: input.context,
        schema,
        value: loaded.value,
      });
    } catch (error) {
      return unavailable('payload-invalid', errorText(error), input.site);
    }
    if (!validation.valid) {
      return unavailable(
        'payload-invalid',
        validation.reason ?? 'payload validation failed',
        input.site,
      );
    }
  }

  let data: unknown = loaded.value;
  if (input.plan.mapping) {
    if (!input.map) {
      return unavailable(
        'mapping-failed',
        'the binding names a Mapping but no Mapping DSL executor is available',
        input.site,
      );
    }
    let mapped;
    try {
      mapped = await input.map({
        mapping: input.plan.mapping.document,
        definition: input.definition,
        value: loaded.value,
      });
    } catch (error) {
      return unavailable('mapping-failed', errorText(error), input.site);
    }
    if (mapped.status !== 'mapped') {
      return unavailable(
        'mapping-failed',
        mapped.reason ?? 'Mapping DSL execution failed',
        input.site,
      );
    }
    data = mapped.data;
  }

  if (!isRecord(data)) {
    return unavailable(
      'payload-not-object',
      'the delivered value is not Definition-shaped object data',
      input.site,
    );
  }

  return {
    status: 'ready',
    data: Object.freeze({ ...data }),
    freshness: loaded.freshness,
    ...(loaded.recordId === undefined ? {} : { recordId: loaded.recordId }),
    ...(input.context.sessionGeneration === undefined
      ? {}
      : { generation: input.context.sessionGeneration }),
    ...(loaded.revision === undefined ? {} : { revision: loaded.revision }),
    diagnostics: [],
  };
}
