/**
 * @filedesc Canonical runtime delivery for Data Sources 1.0.
 *
 * A Data Sources document declares where a value comes from and how consumers
 * must treat failure. It does not fetch the value. This module supplies the
 * one framework-neutral port hosts implement, plus the ordered checks a
 * Surface widget must pass before it receives a named input:
 *
 * availability -> host authorization -> load -> payload validation.
 *
 * The loader receives an already-qualified descriptor. It never discovers a
 * catalog by filename, a source by unqualified id, or a value from widget
 * configuration.
 */
import type {
  DataSource,
  DataSourceFreshness,
  DataSourceLoadState,
  DataSourcesDocument,
  ResolvedInstanceRecord,
  ResponseSelection,
  ResponseSelectionDelivery,
  Sha256Digest,
  WidgetDataInput,
} from "@formspec-org/types";
import { satisfies } from "semver";
import {
  surfaceDiagnostic,
  type SurfaceDiagnostic,
  type SurfaceDiagnosticSite,
} from "./diagnostics.js";

/** A loaded catalog together with the exact App Manifest URL that admitted it. */
export interface DataSourceCatalogHandle {
  catalogRef: string;
  document: DataSourcesDocument;
}

/** The exact `(catalogRef, sourceRef)` pair a Surface binding resolved. */
export interface DataSourceDescriptor {
  catalogRef: string;
  sourceRef: string;
  catalog: DataSourcesDocument;
  source: DataSource;
}

/**
 * Runtime context available at the use site. `sessionGeneration` is an opaque
 * host/shell generation marker, not identity or authorization evidence.
 */
export interface DataSourceActiveContext {
  surfaceId: string;
  surfaceRef?: string | undefined;
  routeId: string;
  slotId: string;
  /** Present for a `definition-form` consumer; exact loaded Definition URL. */
  definitionRef?: string | undefined;
  /** Present for a module-widget consumer. */
  moduleId?: string | undefined;
  /** Present for a module-widget consumer. */
  widgetName?: string | undefined;
  params: Readonly<Record<string, string>>;
  /** Typed keys of the consuming filing unit, when available. */
  subject?: DataSourceSubject | undefined;
  sessionGeneration?: string | number | undefined;
}

export interface DataSourceSubject {
  type: string;
  keys: Readonly<Record<string, string | number>>;
}

export interface DataSourceLoadRequest {
  descriptor: DataSourceDescriptor;
  context: DataSourceActiveContext;
  responseSelection?: ResponseSelection | undefined;
  pin?: ResponseSelectionDelivery | undefined;
}

export interface DataSourceSelectionEvidence {
  records: readonly ResolvedInstanceRecord[];
  valueDigest: Sha256Digest;
  none: boolean;
  newer?: { responseId: string; responseHash: Sha256Digest } | undefined;
}

export type DataSourceLoadResult =
  | {
      status: Extract<DataSourceLoadState, "loaded">;
      value: unknown;
      catalogRef?: string | undefined;
      sourceRef?: string | undefined;
      records?: DataSourceSelectionEvidence["records"] | undefined;
      valueDigest?: Sha256Digest | undefined;
      none?: boolean | undefined;
      newer?: DataSourceSelectionEvidence["newer"] | undefined;
      /** Loaders must state staleness; the shell never infers it from time. */
      freshness: DataSourceFreshness;
      /**
       * Owner-produced identity of the selected record, when the source has
       * record identity. A consumer must never infer this from its request.
       */
      recordId?: string | undefined;
      /** Owner-produced record revision, kept separate from data and identity. */
      revision?: string | number | undefined;
    }
  | {
      status: Extract<DataSourceLoadState, "unavailable">;
      reason: string;
      catalogRef?: string | undefined;
      sourceRef?: string | undefined;
    };

export function isCatalogResponseSource(source: DataSource): boolean {
  return source.kind === "definition-response" && source.runtime.delivery !== "draft";
}

/** The shared selector applies to catalog reads, while draft uses the session. */
export function catalogResponseSelection(source: DataSource): ResponseSelection | undefined {
  if (!isCatalogResponseSource(source)) return undefined;
  const selection = source.responseSelection;
  if (typeof selection?.definition?.url !== "string" || !selection.definition.url
    || !Array.isArray(selection.subject)
    || (selection.status !== "completed" && selection.status !== "current")
    || (selection.cardinality !== "latest" && selection.cardinality !== "latest-per-subject")
    || (selection.pin !== "none" && selection.pin !== "at-open")) return undefined;
  return selection;
}

export function responseDefinitionVersionAdmitted(
  selection: ResponseSelection,
  version: string,
): boolean {
  const range = selection.definition.compatibleVersions;
  return typeof version === "string" && version.length > 0
    && (range === undefined || satisfies(version, range, { includePrerelease: true }));
}

export function dataSourceLoadRequest(
  descriptor: DataSourceDescriptor,
  context: DataSourceActiveContext
): DataSourceLoadRequest {
  const responseSelection = catalogResponseSelection(descriptor.source);
  return { descriptor, context, ...(responseSelection === undefined ? {} : { responseSelection }) };
}

export function dataSourceSelectionInputIssue(request: DataSourceLoadRequest): string | undefined {
  if (!isCatalogResponseSource(request.descriptor.source)) return undefined;
  if (!request.responseSelection) return "the source has no valid Response selection";
  for (const predicate of request.responseSelection.subject) {
    const from = predicate?.from;
    if (!from || Object.keys(from).length !== 1) return "a Response predicate has an invalid input";
    if (typeof from.routeParam === "string"
      && own(request.context.params, from.routeParam)
      && typeof request.context.params[from.routeParam] === "string") continue;
    const keys = request.context.subject?.keys;
    if (typeof from.subject === "string" && keys && own(keys, from.subject)) {
      const value = keys[from.subject];
      if (typeof value === "string" || Number.isSafeInteger(value)) continue;
    }
    return "a Response predicate has no valid route parameter or subject key";
  }
  return undefined;
}

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/u;

export function readDataSourceSelection(
  descriptor: DataSourceDescriptor,
  loaded: Extract<DataSourceLoadResult, { status: "loaded" }>
): DataSourceSelectionEvidence | undefined {
  const responseSelection = catalogResponseSelection(descriptor.source);
  const { records, valueDigest, none, newer } = loaded;
  const value = loaded.value;
  if (!responseSelection
    || loaded.catalogRef !== descriptor.catalogRef || loaded.sourceRef !== descriptor.sourceRef
    || (loaded.freshness !== "fresh" && loaded.freshness !== "stale")
    || own(loaded, "recordId")
    || !Array.isArray(records) || typeof valueDigest !== "string" || !SHA256_DIGEST.test(valueDigest)
    || typeof none !== "boolean"
    || (none && (records.length !== 0 || responseSelection.whenNone !== "empty" || loaded.value !== null))
    || (!none && (records.length === 0
      || (responseSelection.cardinality === "latest" && records.length !== 1)
      || (responseSelection.mapping === undefined && (responseSelection.cardinality === "latest"
        ? value === null || typeof value !== "object" || Array.isArray(value)
        : !Array.isArray(value) || value.length !== records.length))))
    || records.some(record => !record || typeof record.responseId !== "string" || !record.responseId
      || !responseDefinitionVersionAdmitted(responseSelection, record.definitionVersion)
      || (record.responseHash === undefined
        ? responseSelection.status === "completed"
        : typeof record.responseHash !== "string" || !SHA256_DIGEST.test(record.responseHash)))
    || (newer !== undefined && (none || responseSelection.pin !== "at-open"
      || !newer || typeof newer.responseId !== "string" || !newer.responseId
      || typeof newer.responseHash !== "string" || !SHA256_DIGEST.test(newer.responseHash)))) {
    return undefined;
  }
  return {
    records: Object.freeze(records.map(record => Object.freeze({ ...record }))),
    valueDigest,
    none,
    ...(newer === undefined ? {} : { newer: Object.freeze({ ...newer }) }),
  };
}

/** The sole payload-loading port. Authorization is deliberately not folded in. */
export type DataSourceLoader = (
  request: DataSourceLoadRequest
) => DataSourceLoadResult | Promise<DataSourceLoadResult>;

export type DataSourceAuthorizationResult =
  | { status: "authorized" }
  | { status: "refused"; reason?: string | undefined };

/**
 * Coarse admission at the boundary named by
 * `source.runtime.authorizationBoundary`. Fine-grained policy stays in the
 * host's authorization engine; this port carries only its verdict.
 */
export type DataSourceAuthorizer = (
  request: DataSourceLoadRequest
) => DataSourceAuthorizationResult | Promise<DataSourceAuthorizationResult>;

export type DataSourcePayloadValidationResult =
  | { valid: true }
  | { valid: false; reason?: string | undefined };

/** Host JSON-Schema validator for a source that declares `source.schema`. */
export type DataSourcePayloadValidator = (
  request: DataSourceLoadRequest & {
    schema: object;
    value: unknown;
  }
) =>
  | DataSourcePayloadValidationResult
  | Promise<DataSourcePayloadValidationResult>;

/**
 * A declared Registry input after exact Surface/Data Sources resolution.
 * Malformed or incomplete graphs remain representable so the runtime can fail
 * closed and report them even when validation was bypassed.
 */
export type WidgetDataInputPlan =
  | {
      name: string;
      required: boolean;
      status: "ready";
      descriptor: DataSourceDescriptor;
    }
  | {
      name: string;
      required: boolean;
      status: "unbound" | "unresolved" | "unavailable";
      reason: string;
      descriptor?: DataSourceDescriptor | undefined;
    };

export type WidgetDataFailureReason =
  | "unbound"
  | "unresolved"
  | "unavailable"
  | "unauthorized"
  | "load-failed"
  | "stale-disallowed"
  | "payload-invalid";

export interface WidgetDataInputFailure {
  inputName: string;
  required: boolean;
  reason: WidgetDataFailureReason;
  message: string;
  failureMode?: DataSource["runtime"]["failureMode"] | undefined;
}

export type WidgetDataDelivery =
  | {
      status: "ready";
      /** Frozen, named input map. Unbound optional inputs are absent. */
      data: Readonly<Record<string, unknown>>;
      /** Optional `degraded-widget` failures omitted from `data`. */
      degradedInputs: readonly WidgetDataInputFailure[];
      selections?: Readonly<Record<string, DataSourceSelectionEvidence>> | undefined;
      diagnostics: readonly SurfaceDiagnostic[];
    }
  | {
      status: "unavailable";
      failures: readonly WidgetDataInputFailure[];
      diagnostics: readonly SurfaceDiagnostic[];
    };

export interface LoadWidgetDataInputsRequest {
  /** A roster used to report outstanding work requires current membership. */
  requireFresh?: boolean;
  inputs: readonly WidgetDataInputPlan[];
  context: DataSourceActiveContext;
  loader?: DataSourceLoader | undefined;
  authorize?: DataSourceAuthorizer | undefined;
  validatePayload?: DataSourcePayloadValidator | undefined;
  site: SurfaceDiagnosticSite;
}

function own(record: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Resolve only an exact manifested catalog URL and an exact source id within
 * it. Repeated matches are ambiguous and resolve to nothing.
 */
export function resolveDataSourceDescriptor(
  catalogs: readonly DataSourceCatalogHandle[],
  binding: { catalogRef: string; sourceRef: string }
): DataSourceDescriptor | undefined {
  const catalogMatches = catalogs.filter(
    (candidate) => candidate.catalogRef === binding.catalogRef
  );
  if (catalogMatches.length !== 1) return undefined;
  const handle = catalogMatches[0];
  if (!handle) return undefined;
  const sourceMatches = handle.document.sources.filter(
    (source) => source.id === binding.sourceRef
  );
  if (sourceMatches.length !== 1) return undefined;
  const source = sourceMatches[0];
  if (!source) return undefined;
  return {
    catalogRef: binding.catalogRef,
    sourceRef: binding.sourceRef,
    catalog: handle.document,
    source,
  };
}

/**
 * Data Sources §5 availability at a module-widget use site.
 * Definition-only availability never covers a widget.
 */
export function dataSourceAvailableToWidget(
  descriptor: DataSourceDescriptor,
  context: DataSourceActiveContext
): boolean {
  const availability = descriptor.source.availability;
  switch (availability.level) {
    case "app":
      return true;
    case "definition":
      return false;
    case "surface":
      return (
        context.surfaceRef !== undefined &&
        availability.surfaceRef === context.surfaceRef
      );
    case "route":
      return (
        context.surfaceRef !== undefined &&
        availability.surfaceRef === context.surfaceRef &&
        availability.routeRef === context.routeId
      );
    case "slot":
      return (
        context.surfaceRef !== undefined &&
        availability.surfaceRef === context.surfaceRef &&
        availability.routeRef === context.routeId &&
        availability.slotId === context.slotId
      );
    case "module":
      return availability.moduleId === context.moduleId;
  }
}

function planFailure(
  input: WidgetDataInputPlan
): WidgetDataInputFailure | undefined {
  if (input.status === "ready") return undefined;
  const reason: WidgetDataFailureReason =
    input.status === "unbound"
      ? "unbound"
      : input.status === "unresolved"
      ? "unresolved"
      : "unavailable";
  return {
    inputName: input.name,
    required: input.required,
    reason,
    message: input.reason,
    ...(input.descriptor
      ? { failureMode: input.descriptor.source.runtime.failureMode }
      : {}),
  };
}

function runtimeFailure(
  input: Extract<WidgetDataInputPlan, { status: "ready" }>,
  reason: WidgetDataFailureReason,
  message: string
): WidgetDataInputFailure {
  return {
    inputName: input.name,
    required: input.required,
    reason,
    message,
    failureMode: input.descriptor.source.runtime.failureMode,
  };
}

function diagnosticForFailure(
  failure: WidgetDataInputFailure,
  site: SurfaceDiagnosticSite
): SurfaceDiagnostic {
  return surfaceDiagnostic(
    "WIDGET-DATA-REQUIRED-UNAVAILABLE",
    `Required widget input "${failure.inputName}" is unavailable: ${failure.message}`,
    site,
    {
      inputName: failure.inputName,
      reason: failure.reason,
      ...(failure.failureMode ? { failureMode: failure.failureMode } : {}),
    }
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Load every declared input in Registry order. No partial object reaches the
 * widget unless every required input succeeds. `degraded-widget` may omit a
 * failed optional input; no other failure mode manufactures a success value.
 */
export async function loadWidgetDataInputs(
  request: LoadWidgetDataInputsRequest
): Promise<WidgetDataDelivery> {
  const data: Record<string, unknown> = {};
  const selections = new Map<string, DataSourceSelectionEvidence>();
  const failures: WidgetDataInputFailure[] = [];
  const degradedInputs: WidgetDataInputFailure[] = [];

  for (const input of request.inputs) {
    if (input.status !== "ready") {
      const plannedFailure = planFailure(input);
      if (!plannedFailure) continue;
      if (input.required) {
        failures.push(plannedFailure);
      } else if (plannedFailure.failureMode === "degraded-widget") {
        degradedInputs.push(plannedFailure);
      } else if (input.status !== "unbound") {
        failures.push(plannedFailure);
      }
      continue;
    }

    if (!dataSourceAvailableToWidget(input.descriptor, request.context)) {
      const failure = runtimeFailure(
        input,
        "unavailable",
        "its availability selector does not cover this widget"
      );
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    if (!request.authorize) {
      const failure = runtimeFailure(
        input,
        "unauthorized",
        "the host supplied no authorization decision"
      );
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    const loadRequest = dataSourceLoadRequest(input.descriptor, request.context);
    let authorization: DataSourceAuthorizationResult;
    try {
      authorization = await request.authorize(loadRequest);
    } catch (error) {
      authorization = { status: "refused", reason: errorText(error) };
    }
    if (authorization.status !== "authorized") {
      const failure = runtimeFailure(
        input,
        "unauthorized",
        authorization.reason ?? "the host refused access"
      );
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    const selectionIssue = dataSourceSelectionInputIssue(loadRequest);
    if (selectionIssue || !request.loader) {
      const failure = runtimeFailure(
        input,
        selectionIssue ? "unavailable" : "load-failed",
        selectionIssue ?? "the host supplied no DataSourceLoader"
      );
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    let loaded: DataSourceLoadResult;
    try {
      loaded = await request.loader(loadRequest);
    } catch (error) {
      const failure = runtimeFailure(input, "load-failed", errorText(error));
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }
    if (loaded.status !== "loaded") {
      const failure = runtimeFailure(input, "unavailable", loaded.reason);
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    if (
      loaded.freshness === "stale" &&
      (request.requireFresh || input.descriptor.source.runtime.failureMode !== "stale-ok")
    ) {
      const failure = runtimeFailure(
        input,
        "stale-disallowed",
        "the loader returned stale data and the catalog does not allow it"
      );
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    const source = input.descriptor.source;
    const selection = readDataSourceSelection(input.descriptor, loaded);
    let invalid = isCatalogResponseSource(source) && !selection ? "the loader omitted or returned invalid selection evidence" : undefined;
    const schema = source.schema;
    if (!invalid && schema !== undefined && !selection?.none) {
      let validation: DataSourcePayloadValidationResult;
      if (!request.validatePayload) {
        validation = {
          valid: false,
          reason:
            "the source declares a payload schema and the host supplied no validator",
        };
      } else {
        try {
          validation = await request.validatePayload({
            ...loadRequest,
            schema,
            value: loaded.value,
          });
        } catch (error) {
          validation = { valid: false, reason: errorText(error) };
        }
      }
      if (!validation.valid) invalid = validation.reason ?? "payload validation failed";
    }
    if (invalid) {
      const failure = runtimeFailure(input, "payload-invalid", invalid);
      if (!input.required && failure.failureMode === "degraded-widget") {
        degradedInputs.push(failure);
      } else {
        failures.push(failure);
      }
      continue;
    }

    // The name came from a Registry declaration. `own` prevents a malformed
    // declaration named `__proto__` from mutating the result object.
    if (!own(data, input.name)) {
      if (selection) selections.set(input.name, selection);
      Object.defineProperty(data, input.name, {
        value: loaded.value,
        enumerable: true,
        configurable: false,
        writable: false,
      });
    }
  }

  const requiredFailures = failures.filter((failure) => failure.required);
  const diagnostics = requiredFailures.map((failure) =>
    diagnosticForFailure(failure, request.site)
  );
  if (failures.length > 0) {
    return {
      status: "unavailable",
      failures,
      diagnostics,
    };
  }

  return {
    status: "ready",
    data: Object.freeze(data),
    degradedInputs,
    ...(selections.size === 0 ? {} : { selections: Object.freeze(Object.fromEntries(selections)) }),
    diagnostics,
  };
}

export interface DocumentResourceReadRequest extends DataSourceLoadRequest {
  /** Exact provenance pointer from the Data Sources document. */
  url: string;
}

export type DocumentResourceReader = (
  request: DocumentResourceReadRequest
) => DataSourceLoadResult | Promise<DataSourceLoadResult>;

/**
 * Production bridge for the `document-resource` URL family. The host injects
 * its HTTP client so origin policy, credentials, telemetry, and retries remain
 * host concerns. Non-HTTP provenance and other source families fail closed.
 */
export function createDocumentResourceDataSourceLoader(
  read: DocumentResourceReader
): DataSourceLoader {
  return async (request) => {
    if (request.descriptor.source.kind !== "document-resource") {
      return {
        status: "unavailable",
        reason: `unsupported source kind "${request.descriptor.source.kind}"`,
      };
    }
    const url = request.descriptor.source.runtime.provenance.source;
    if (!/^https?:\/\//u.test(url)) {
      return {
        status: "unavailable",
        reason: "document-resource provenance is not an HTTP(S) URL",
      };
    }
    return read({ ...request, url });
  };
}

/** Keep the generated declaration visible in API docs without duplicating it. */
export type DeclaredWidgetDataInput = WidgetDataInput;
