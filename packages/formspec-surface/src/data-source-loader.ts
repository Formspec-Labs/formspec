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
  WidgetDataInput,
} from "@formspec-org/types";
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
  sessionGeneration?: string | number | undefined;
}

export interface DataSourceLoadRequest {
  descriptor: DataSourceDescriptor;
  context: DataSourceActiveContext;
}

export type DataSourceLoadResult =
  | {
      status: Extract<DataSourceLoadState, "loaded">;
      value: unknown;
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
    };

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
      diagnostics: readonly SurfaceDiagnostic[];
    }
  | {
      status: "unavailable";
      failures: readonly WidgetDataInputFailure[];
      diagnostics: readonly SurfaceDiagnostic[];
    };

export interface LoadWidgetDataInputsRequest {
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

    let authorization: DataSourceAuthorizationResult;
    try {
      authorization = await request.authorize({
        descriptor: input.descriptor,
        context: request.context,
      });
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

    if (!request.loader) {
      const failure = runtimeFailure(
        input,
        "load-failed",
        "the host supplied no DataSourceLoader"
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
      loaded = await request.loader({
        descriptor: input.descriptor,
        context: request.context,
      });
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
      input.descriptor.source.runtime.failureMode !== "stale-ok"
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

    const schema = input.descriptor.source.schema;
    if (schema !== undefined) {
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
            descriptor: input.descriptor,
            context: request.context,
            schema,
            value: loaded.value,
          });
        } catch (error) {
          validation = { valid: false, reason: errorText(error) };
        }
      }
      if (!validation.valid) {
        const failure = runtimeFailure(
          input,
          "payload-invalid",
          validation.reason ?? "payload validation failed"
        );
        if (!input.required && failure.failureMode === "degraded-widget") {
          degradedInputs.push(failure);
        } else {
          failures.push(failure);
        }
        continue;
      }
    }

    // The name came from a Registry declaration. `own` prevents a malformed
    // declaration named `__proto__` from mutating the result object.
    if (!own(data, input.name)) {
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
