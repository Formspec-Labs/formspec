/** @filedesc In-memory Definition Response deliveries for previews and tests. */
import { snapshotFiniteJson, canonicalFiniteJson } from "./finite-json.js";
import type {
  DataSource,
  FormResponse,
  ResponseSelection,
  ResponseSelectionContext,
  ResponseSelectionOutcome,
  ResponseSelectionRecord,
  SelectResponses,
} from "@formspec-org/types";
import { catalogResponseSelection } from "./data-source-loader.js";
import type {
  DataSourceActiveContext,
  DataSourceCatalogHandle,
  DataSourceLoader,
  DataSourceLoadResult,
} from "./data-source-loader.js";

/** An exact source identity within one manifested Data Sources catalog. */
export interface DefinitionResponseSourceBinding {
  catalogRef: string;
  sourceRef: string;
}

export type DefinitionResponseRecordRefusalReason =
  | "source-unavailable"
  | "invocation-id-missing"
  | "invocation-payload-conflict"
  | "response-definition-mismatch"
  | "response-status-mismatch"
  | "response-id-missing"
  | "response-authored-invalid"
  | "response-data-not-finite-json";

export type DefinitionResponseRecordResult =
  | {
      status: "recorded";
      /** Whether this delivery is among the selected Responses for this read. */
      selected: boolean;
    }
  | { status: "duplicate" }
  | { status: "refused"; reason: DefinitionResponseRecordRefusalReason };

type ReadInputs = Pick<DataSourceActiveContext, "params" | "subject">;

export interface RecordDefinitionResponseInput {
  binding: DefinitionResponseSourceBinding;
  /** Stable action-effect delivery identity within the exact source. */
  invocationId: string;
  response: FormResponse;
  context?: ReadInputs;
  /** Host-owned respondent identity for a subjectless catalog delivery. */
  implicitSubjectId?: string;
}

export interface PreviewDefinitionResponseStoreOptions {
  /** Use the initialized engine's tools WebAssembly selector. */
  selectResponses: SelectResponses;
  /** Use the engine's Response timestamp check at delivery admission. */
  isValidResponseAuthored(authored: string): boolean;
  /** Supply facts for a known upstream Definition, or undefined when it is unavailable. */
  selectionContext(
    binding: DefinitionResponseSourceBinding,
    selection: ResponseSelection,
    inputs?: ReadInputs,
  ): Pick<ResponseSelectionContext, "upstreamSubject" | "dispositions" | "pin"> | undefined;
}

/** Overlays observed preview deliveries on the host's fresh baseline. */
export interface PreviewDefinitionResponseStore {
  record(input: RecordDefinitionResponseInput): DefinitionResponseRecordResult;
  overlay(
    binding: DefinitionResponseSourceBinding,
    baseline: DataSourceLoadResult,
    inputs?: ReadInputs,
  ): DataSourceLoadResult;
  wrapLoader(baselineLoader: DataSourceLoader): DataSourceLoader;
}

interface SourceBucket {
  source: DataSource;
  selection: ResponseSelection;
  draft: boolean;
  invocationFingerprints: Map<string, string>;
  responses: ResponseSelectionRecord[];
}

function sourceBucket(source: DataSource): SourceBucket | undefined {
  if (source.kind !== "definition-response") return undefined;
  const draft = source.runtime.delivery === "draft";
  let selection: ResponseSelection;
  if (draft) {
    // Session draft delivery has its own admission rule. Rust still orders its records.
    if (typeof source.definitionRef !== "string" || !source.definitionRef
      || source.runtime.cache.mode !== "draft" || Object.hasOwn(source, "responseSelection")) return undefined;
    selection = {
      definition: { url: source.definitionRef },
      subject: [],
      status: "current",
      cardinality: "latest",
      pin: "none",
    };
  } else {
    const declared = catalogResponseSelection(source);
    if (source.definitionRef !== undefined || !declared) return undefined;
    selection = declared;
  }
  return { source, draft, selection, invocationFingerprints: new Map(), responses: [] };
}

function catalogProjection(
  schema: DataSource["schema"],
  cardinality: ResponseSelection["cardinality"],
): string[] | undefined {
  const shape = schema as { properties?: unknown; items?: { properties?: unknown } } | undefined;
  const properties = cardinality === "latest-per-subject" ? shape?.items?.properties : shape?.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    return Object.keys(properties);
  }
  return undefined;
}

function admittedBuckets(
  catalogs: readonly DataSourceCatalogHandle[],
): Map<string, Map<string, SourceBucket>> {
  const buckets = new Map<string, Map<string, SourceBucket>>();
  const duplicateCatalogs = new Set<string>();
  for (const { catalogRef, document } of catalogs) {
    if (buckets.has(catalogRef)) {
      duplicateCatalogs.add(catalogRef);
      continue;
    }
    const sources = new Map<string, SourceBucket>();
    const seen = new Set<string>();
    for (const source of document.sources) {
      if (seen.has(source.id)) {
        sources.delete(source.id);
      } else {
        seen.add(source.id);
        const bucket = sourceBucket(source);
        if (bucket) sources.set(source.id, bucket);
      }
    }
    buckets.set(catalogRef, sources);
  }
  for (const catalogRef of duplicateCatalogs) buckets.delete(catalogRef);
  return buckets;
}

/** Create an isolated in-memory store for an already admitted preview catalog. */
export function createPreviewDefinitionResponseStore(
  catalogs: readonly DataSourceCatalogHandle[],
  options: PreviewDefinitionResponseStoreOptions,
): PreviewDefinitionResponseStore {
  const buckets = admittedBuckets(catalogs);
  const bucketFor = (binding: DefinitionResponseSourceBinding) =>
    buckets.get(binding.catalogRef)?.get(binding.sourceRef);

  function read(
    binding: DefinitionResponseSourceBinding,
    bucket: SourceBucket,
    inputs?: ReadInputs,
    includeInputPositions = false,
  ): ResponseSelectionOutcome {
    const { source, draft, selection, responses } = bucket;
    // Mapping-backed reads require the projection check tracked in fs-fea7.
    if (selection.mapping !== undefined) return { status: "unavailable" };
    try {
      const context = options.selectionContext(binding, selection, inputs);
      if (context?.upstreamSubject === undefined) return { status: "unavailable" };
      const { upstreamSubject, dispositions, pin } = context;
      const projection = draft ? undefined : catalogProjection(source.schema, selection.cardinality);
      return options.selectResponses(responses, selection, {
        upstreamSubject,
        ...(dispositions !== undefined && { dispositions }),
        ...(pin !== undefined && { pin }),
        ...(projection !== undefined && { projection }),
        scope: binding.catalogRef,
        authorized: true,
        source: "catalog",
        includeInputPositions,
        ...(inputs && { routeParams: inputs.params }),
        ...(inputs?.subject && { consumerSubject: inputs.subject.keys }),
      });
    } catch {
      return { status: "unavailable" };
    }
  }

  function record(input: RecordDefinitionResponseInput): DefinitionResponseRecordResult {
    const bucket = bucketFor(input.binding);
    if (!bucket) return { status: "refused", reason: "source-unavailable" };
    if (!input.invocationId) return { status: "refused", reason: "invocation-id-missing" };

    const implicitSubjectId = bucket.draft ? input.binding.sourceRef : input.implicitSubjectId;
    let response: FormResponse;
    let fingerprint: string;
    try {
      const snapshot = snapshotFiniteJson(input.response, true);
      response = snapshot as FormResponse;
      if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
        throw new TypeError("Response data must be an object");
      }
      fingerprint = canonicalFiniteJson([snapshot, implicitSubjectId ?? null]);
    } catch {
      return { status: "refused", reason: "response-data-not-finite-json" };
    }
    if (response.definitionUrl !== bucket.selection.definition.url) {
      return { status: "refused", reason: "response-definition-mismatch" };
    }
    if (bucket.draft && response.status !== "in-progress") {
      return { status: "refused", reason: "response-status-mismatch" };
    }
    if (typeof response.id !== "string" || !response.id) {
      return { status: "refused", reason: "response-id-missing" };
    }
    if (typeof response.authored !== "string" || !options.isValidResponseAuthored(response.authored)) {
      return { status: "refused", reason: "response-authored-invalid" };
    }
    const prior = bucket.invocationFingerprints.get(input.invocationId);
    if (prior !== undefined) {
      return prior === fingerprint
        ? { status: "duplicate" }
        : { status: "refused", reason: "invocation-payload-conflict" };
    }

    const position = bucket.responses.length;
    bucket.responses.push({
      scope: input.binding.catalogRef,
      response,
      ...(implicitSubjectId && { implicitSubjectId }),
    });
    bucket.invocationFingerprints.set(input.invocationId, fingerprint);
    const result = read(input.binding, bucket, input.context, true);
    return {
      status: "recorded",
      selected: result.status === "available" && result.inputPositions?.includes(position) === true,
    };
  }

  function overlay(
    { catalogRef, sourceRef }: DefinitionResponseSourceBinding,
    baseline: DataSourceLoadResult,
    inputs?: ReadInputs,
  ): DataSourceLoadResult {
    const binding = { catalogRef, sourceRef };
    const bucket = bucketFor(binding);
    if (!bucket || (!bucket.draft && (baseline.status !== "loaded" || baseline.freshness !== "fresh"))) {
      return baseline;
    }
    const result = read(binding, bucket, inputs);
    if (result.status === "unavailable") {
      return {
        ...binding,
        status: "unavailable",
        reason: bucket.draft
          ? "No current-session Definition Response draft is available."
          : "Definition Response selection is unavailable.",
      };
    }
    if (bucket.draft) {
      return {
        ...binding,
        status: "loaded",
        freshness: "fresh",
        recordId: result.records[0]?.responseId,
        value: result.value,
      };
    }
    const { value, records, valueDigest, none, newer } = result;
    return { ...binding, status: "loaded", freshness: "fresh", value, records, valueDigest, none, ...(newer && { newer }) };
  }

  const wrapLoader = (baselineLoader: DataSourceLoader): DataSourceLoader => async (request) =>
    overlay(request.descriptor, await baselineLoader(request), request.context);

  return Object.freeze({ record, overlay, wrapLoader });
}
