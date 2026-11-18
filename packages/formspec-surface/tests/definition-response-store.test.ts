/** @filedesc Tests for the preview/test-only Definition Response store. */
import { canonicalJsonBytes, canonicalResponseHandoffBytes } from "@formspec-org/integrity-canonical";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  initFormspecEngine, initFormspecEngineTools, isValidResponseAuthored, responseSubjectId, selectResponses,
} from "@formspec-org/engine";
import type {
  DataSource,
  DataSourcesDocument,
  FormDefinition,
  FormResponse,
} from "@formspec-org/types";
import {
  createPreviewDefinitionResponseStore as createStore,
  loadDefinitionFormInitialData,
  planDefinitionFormInitialData,
  type PreviewDefinitionResponseStoreOptions,
  type DataSourceCatalogHandle,
  type DataSourceLoadResult,
  type DefinitionResponseSourceBinding,
} from "../src/index.js";

beforeAll(async () => {
  await initFormspecEngine();
  await initFormspecEngineTools();
});

function createPreviewDefinitionResponseStore(
  catalogs: readonly DataSourceCatalogHandle[],
  options: Partial<PreviewDefinitionResponseStoreOptions> = {},
) {
  return createStore(catalogs, {
    selectResponses,
    isValidResponseAuthored,
    selectionContext: () => ({ upstreamSubject: null }),
    ...options,
  });
}

const CATALOG_A = "https://example.test/data-sources/a";
const CATALOG_B = "https://example.test/data-sources/b";
const SOURCE_REF = "response:organization";
const DEFINITION_REF = "https://example.test/definitions/organization";
const DEFINITION_VERSION = "1.2.0";
const BINDING_A: DefinitionResponseSourceBinding = {
  catalogRef: CATALOG_A,
  sourceRef: SOURCE_REF,
};
const BINDING_B: DefinitionResponseSourceBinding = {
  catalogRef: CATALOG_B,
  sourceRef: SOURCE_REF,
};

function definitionResponseSource(
  overrides: Partial<DataSource> = {}
): DataSource {
  return {
    id: SOURCE_REF,
    kind: "definition-response",
    responseSelection: {
      definition: { url: DEFINITION_REF, compatibleVersions: "^1.2.0" },
      subject: [],
      status: "completed",
      cardinality: "latest",
      pin: "none",
    },
    owner: "host",
    scope: "session",
    availability: { level: "app" },
    runtime: {
      delivery: "snapshot",
      cache: { mode: "snapshot" },
      authorizationBoundary: "host",
      failureMode: "block-render",
      provenance: {
        kind: "definition-response",
        source: "preview response memory",
      },
    },
    ...overrides,
  } as DataSource;
}

function catalog(
  catalogRef: string,
  sources: DataSource[] = [definitionResponseSource()]
): DataSourceCatalogHandle {
  return {
    catalogRef,
    document: {
      $formspecDataSources: "1.0",
      id: catalogRef,
      version: "1.0.0",
      sources: sources as DataSourcesDocument["sources"],
    },
  };
}

function response(overrides: Partial<FormResponse> = {}): FormResponse {
  return {
    $formspecResponse: "1.0",
    definitionUrl: DEFINITION_REF,
    definitionVersion: DEFINITION_VERSION,
    status: "completed",
    data: { organizationName: "Acme" },
    authored: "2026-07-31T14:00:00Z",
    id: "response-b",
    ...overrides,
  };
}

const freshBaseline: DataSourceLoadResult = {
  status: "loaded",
  freshness: "fresh",
  value: { organizationName: "Baseline" },
};

describe("createPreviewDefinitionResponseStore", () => {
  it("uses route and consumer subject keys and reports native selection evidence", async () => {
    const subjectType = "urn:example:organization-year";
    const source = definitionResponseSource({
      responseSelection: {
        definition: { url: DEFINITION_REF },
        subject: [
          { key: "year", op: "eq", from: { routeParam: "year" }, offset: -1 },
          { key: "year", op: "eq", from: { subject: "year" } },
        ],
        status: "current",
        whenNone: "empty",
        cardinality: "latest",
        pin: "none",
      },
    });
    const handle = catalog(CATALOG_A, [source]);
    const store = createPreviewDefinitionResponseStore([handle], {
      selectionContext: () => ({
        upstreamSubject: { type: subjectType, keys: { year: { dataType: "integer" } } },
      }),
    });
    const keys = { year: 2026 };
    const subject = { type: subjectType, keys, id: responseSubjectId(subjectType, keys) };
    for (const status of ["in-progress", "completed"] as const) {
      store.record({
        binding: BINDING_A,
        invocationId: status,
        response: response({ id: status, status, subject, data: { status } }),
      });
    }
    const request = {
      descriptor: { ...BINDING_A, catalog: handle.document, source },
      context: {
        surfaceId: "preview", routeId: "report", slotId: "summary",
        params: { year: "2027" }, subject: { type: subjectType, keys },
      },
    };
    const loader = store.wrapLoader(() => freshBaseline);
    await expect(loader(request)).resolves.toEqual({
      ...BINDING_A,
      status: "loaded",
      freshness: "fresh",
      value: { status: "in-progress" },
      records: [{ responseId: "in-progress", definitionVersion: DEFINITION_VERSION }],
      valueDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      none: false,
    });
    await expect(loader({
      ...request, context: { ...request.context, params: { year: "2028" } },
    })).resolves.toMatchObject({ status: "loaded", value: null, records: [], none: true });
    await expect(loader({
      ...request, context: { ...request.context, params: { year: "+2027" } },
    })).resolves.toEqual({ ...BINDING_A, status: "unavailable", reason: "Definition Response selection is unavailable." });
  });

  it("delivers selected data through the Definition form prefill entry point", async () => {
    const handle = catalog(CATALOG_A);
    const store = createPreviewDefinitionResponseStore([handle]);
    const definition = {
      $formspec: "1.0", url: DEFINITION_REF, version: DEFINITION_VERSION,
      title: "Organization", items: [],
    } satisfies FormDefinition;
    const context = { surfaceId: "preview", routeId: "edit", slotId: "organization", params: {} };
    const plan = planDefinitionFormInitialData({
      binding: BINDING_A, definition, definitionRef: DEFINITION_REF,
      context, catalogs: [handle], mappings: [],
    });
    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") throw new Error(plan.reason);
    store.record({ binding: BINDING_A, invocationId: "prefill", response: response() });
    const delivered = await loadDefinitionFormInitialData({
      plan, definition, definitionRef: DEFINITION_REF, context,
      authorize: () => ({ status: "authorized" }),
      loader: store.wrapLoader(() => freshBaseline),
      site: context,
    });
    expect(delivered).toMatchObject({
      status: "ready",
      data: { organizationName: "Acme" },
      selection: {
        records: [{ responseId: "response-b", definitionVersion: DEFINITION_VERSION }],
        valueDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        none: false,
      },
    });
  });

  it("does not report a stale delivery of the same id as the winner", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    expect(store.record({
      binding: BINDING_A, invocationId: "new", response: response(),
    })).toEqual({ status: "recorded", selected: true });
    expect(store.record({
      binding: BINDING_A, invocationId: "old",
      response: response({ authored: "2026-07-30T14:00:00Z" }),
    })).toEqual({ status: "recorded", selected: false });
  });

  it("isolates records by the exact catalogRef and sourceRef pair", () => {
    const store = createPreviewDefinitionResponseStore([
      catalog(CATALOG_A),
      catalog(CATALOG_B),
    ]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "invocation-a",
        response: response({ data: { organizationName: "Catalog A" } }),
      })
    ).toEqual({ status: "recorded", selected: true });

    expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
      status: "loaded",
      freshness: "fresh",
      records: [{ responseId: "response-b", definitionVersion: DEFINITION_VERSION, responseHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }],
      valueDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      none: false,
      ...BINDING_A,
      value: { organizationName: "Catalog A" },
    });
    expect(store.overlay(BINDING_B, freshBaseline)).toEqual({
      ...BINDING_B, status: "unavailable", reason: "Definition Response selection is unavailable.",
    });
    expect(
      store.record({
        binding: BINDING_B,
        invocationId: "invocation-a",
        response: response({ data: { organizationName: "Catalog B" } }),
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(store.overlay(BINDING_B, freshBaseline)).toMatchObject({
      value: { organizationName: "Catalog B" },
    });
    expect(
      store.record({
        binding: {
          catalogRef: "https://example.test/data-sources/unmanifested",
          sourceRef: SOURCE_REF,
        },
        invocationId: "invocation-missing",
        response: response(),
      })
    ).toEqual({ status: "refused", reason: "source-unavailable" });
  });

  it("excludes records outside the selection version or status policy", () => {
    // Catalog deliveries are recorded first. The Rust selector filters them at read time.
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "wrong-version",
        response: response({ definitionVersion: "2.0.0" }),
      })
    ).toEqual({ status: "recorded", selected: false });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "wrong-status",
        response: response({ status: "in-progress" }),
      })
    ).toEqual({ status: "recorded", selected: false });
    expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
      ...BINDING_A, status: "unavailable", reason: "Definition Response selection is unavailable.",
    });
  });

  it("deduplicates only an exact replay within one exact source", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    const delivered = response({ data: { organizationName: "First" } });

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "same-invocation",
        response: delivered,
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "same-invocation",
        response: structuredClone(delivered),
      })
    ).toEqual({ status: "duplicate" });
    expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
      value: { organizationName: "First" },
    });
  });

  it("refuses one invocation id reused with different Response bytes", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "conflicting-invocation",
        response: response({ data: { organizationName: "Accepted" } }),
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "conflicting-invocation",
        response: response({ data: { organizationName: "Conflicting" } }),
      })
    ).toEqual({
      status: "refused",
      reason: "invocation-payload-conflict",
    });
    expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
      value: { organizationName: "Accepted" },
    });
  });

  it("keeps a detached finite-JSON snapshot across producer and consumer mutation", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    const submittedData = {
      organizationName: "Original",
      settings: {
        enabled: true,
        threshold: 2.5,
        labels: ["one", null],
      },
    };
    const submittedResponse = response({ data: submittedData });

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "snapshot",
        response: submittedResponse,
      })
    ).toEqual({ status: "recorded", selected: true });

    submittedData.organizationName = "Producer mutation";
    submittedData.settings.enabled = false;
    submittedData.settings.labels[0] = "producer";

    const first = store.overlay(BINDING_A, freshBaseline);
    expect(first).toEqual({
      status: "loaded",
      freshness: "fresh",
      records: [{ responseId: "response-b", definitionVersion: DEFINITION_VERSION, responseHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }],
      valueDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      none: false,
      ...BINDING_A,
      value: {
        organizationName: "Original",
        settings: {
          enabled: true,
          threshold: 2.5,
          labels: ["one", null],
        },
      },
    });
    if (first.status !== "loaded") throw new Error("snapshot was not loaded");
    const firstValue = first.value as {
      organizationName: string;
      settings: {
        enabled: boolean;
        threshold: number;
        labels: Array<string | null>;
      };
    };
    firstValue.organizationName = "Consumer mutation";
    firstValue.settings.enabled = false;
    firstValue.settings.labels[0] = "consumer";

    const second = store.overlay(BINDING_A, freshBaseline);
    expect(second).toEqual({
      status: "loaded",
      freshness: "fresh",
      records: [{ responseId: "response-b", definitionVersion: DEFINITION_VERSION, responseHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }],
      valueDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      none: false,
      ...BINDING_A,
      value: {
        organizationName: "Original",
        settings: {
          enabled: true,
          threshold: 2.5,
          labels: ["one", null],
        },
      },
    });
    if (second.status !== "loaded") throw new Error("snapshot was not loaded");
    const secondValue = second.value as typeof firstValue;
    expect(typeof secondValue.organizationName).toBe("string");
    expect(typeof secondValue.settings.enabled).toBe("boolean");
    expect(typeof secondValue.settings.threshold).toBe("number");
    expect(Array.isArray(secondValue.settings.labels)).toBe(true);
    expect(secondValue.settings.labels[1]).toBeNull();
  });

  it("refuses Response data that cannot be safely snapshotted as finite JSON", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let getterRead = false;
    const accessorData: Record<string, unknown> = {};
    Object.defineProperty(accessorData, "value", {
      enumerable: true,
      get: () => {
        getterRead = true;
        return "unsafe";
      },
    });

    for (const [invocationId, data] of [
      ["non-finite", { amount: Number.NaN }],
      ["cyclic", cyclic],
      ["accessor", accessorData],
    ] as const) {
      expect(
        store.record({
          binding: BINDING_A,
          invocationId,
          response: response({ data }),
        })
      ).toEqual({
        status: "refused",
        reason: "response-data-not-finite-json",
      });
    }
    expect(getterRead).toBe(false);
    expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
      ...BINDING_A, status: "unavailable", reason: "Definition Response selection is unavailable.",
    });
  });

  it("reports the selected Response id instead of an older delivered record", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "newer-b",
        response: response({
          id: "response-b",
          data: { organizationName: "Newer B" },
        }),
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "older-a",
        response: response({
          authored: "2026-07-30T14:00:00Z",
          id: "response-a",
          data: { organizationName: "Older A" },
        }),
      })
    ).toEqual({ status: "recorded", selected: false });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "newer-a",
        response: response({
          id: "response-a",
          data: { organizationName: "Newer A" },
        }),
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
      records: [{ responseId: "response-a" }],
      value: { organizationName: "Newer A" },
    });
  });

  it.each([
    "2026-02-30T14:00:00Z",
    "2025-02-29T14:00:00Z",
    "2026-07-31 14:00:00Z",
    "2026-07-31T14:00:00",
    "2026-07-31T24:00:00Z",
    "2026-07-31T14:00:00+24:00",
  ])("refuses non-instant authored timestamp %s", (authored) => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: authored,
        response: response({ authored }),
      })
    ).toEqual({
      status: "refused",
      reason: "response-authored-invalid",
    });
  });

  it("admits the RFC 3339 unknown-local-offset spelling of UTC", () => {
    // -00:00 still locates the instant in UTC. The Rust validator accepts it.
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    expect(store.record({
      binding: BINDING_A,
      invocationId: "utc",
      response: response({ authored: "2026-07-31T14:00:00-00:00" }),
    })).toEqual({ status: "recorded", selected: true });
  });

  it("orders valid RFC 3339 instants beyond millisecond precision", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    store.record({
      binding: BINDING_A,
      invocationId: "fraction-one",
      response: response({
        authored: "2026-07-31T14:00:00.0000001Z",
        id: "response-a",
        data: { organizationName: "Earlier fraction" },
      }),
    });
    store.record({
      binding: BINDING_A,
      invocationId: "fraction-two",
      response: response({
        authored: "2026-07-31T10:00:00.0000002-04:00",
        id: "response-b",
        data: { organizationName: "Later fraction" },
      }),
    });

    expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
      value: { organizationName: "Later fraction" },
    });
  });

  it("orders equal instants by unsigned UTF-8 bytes rather than UTF-16 code units", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);

    store.record({
      binding: BINDING_A,
      invocationId: "astral-id",
      response: response({
        id: "response-😀",
        data: { organizationName: "Astral" },
      }),
    });
    store.record({
      binding: BINDING_A,
      invocationId: "bmp-id",
      response: response({
        id: "response-\uE000",
        data: { organizationName: "BMP" },
      }),
    });

    // UTF-16 would place the astral character first because its high
    // surrogate is below U+E000. Unsigned UTF-8 correctly places U+E000 first.
    expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
      value: { organizationName: "BMP" },
    });
  });

  it("makes a fresh source unavailable when distinct deliveries are selection-identical", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "first-delivery",
        response: response({ data: { organizationName: "First" } }),
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "second-delivery",
        response: response({ data: { organizationName: "Second" } }),
      })
    ).toEqual({ status: "recorded", selected: false });
    expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
      status: "unavailable",
      ...BINDING_A,
      reason: "Definition Response selection is unavailable.",
    });
  });

  it("never overrides unavailable or stale baselines and preserves fresh delivery", async () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);
    store.record({
      binding: BINDING_A,
      invocationId: "accepted",
      response: response({ data: { organizationName: "Stored" } }),
    });
    const unavailable: DataSourceLoadResult = {
      status: "unavailable",
      reason: "offline",
    };
    const stale: DataSourceLoadResult = {
      status: "loaded",
      freshness: "stale",
      value: { organizationName: "Cached" },
    };

    expect(store.overlay(BINDING_A, unavailable)).toBe(unavailable);
    expect(store.overlay(BINDING_A, stale)).toBe(stale);
    expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
      status: "loaded",
      freshness: "fresh",
      records: [{ responseId: "response-b", definitionVersion: DEFINITION_VERSION, responseHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) }],
      valueDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      none: false,
      ...BINDING_A,
      value: { organizationName: "Stored" },
    });

    const baselineLoader = vi.fn(async () => freshBaseline);
    const wrapped = store.wrapLoader(baselineLoader);
    await expect(
      wrapped({
        descriptor: {
          catalogRef: CATALOG_A,
          sourceRef: SOURCE_REF,
          catalog: catalog(CATALOG_A).document,
          source: definitionResponseSource(),
        },
        context: {
          surfaceId: "preview",
          routeId: "dashboard",
          slotId: "summary",
          moduleId: "x-preview",
          widgetName: "Summary",
          params: {},
        },
      })
    ).resolves.toMatchObject({
      status: "loaded",
      freshness: "fresh",
      value: { organizationName: "Stored" },
    });
    expect(baselineLoader).toHaveBeenCalledOnce();
  });

  it("delivers an admitted current-session draft without inventing a baseline adapter", async () => {
    const { responseSelection: _selection, ...base } = definitionResponseSource();
    const draft = {
      ...base,
      definitionRef: DEFINITION_REF,
      runtime: {
        ...base.runtime,
        delivery: "draft",
        cache: { mode: "draft" },
      },
    } as DataSource;
    const store = createPreviewDefinitionResponseStore([
      catalog(CATALOG_A, [draft]),
    ]);
    const unavailable: DataSourceLoadResult = {
      status: "unavailable",
      reason: "No host adapter is needed for a current-session draft.",
    };

    expect(store.overlay(BINDING_A, unavailable)).toEqual({
      ...BINDING_A,
      status: "unavailable",
      reason: "No current-session Definition Response draft is available.",
    });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "draft",
        response: response({ status: "in-progress" }),
      })
    ).toEqual({ status: "recorded", selected: true });
    expect(store.overlay(BINDING_A, unavailable)).toEqual({
      ...BINDING_A,
      status: "loaded",
      freshness: "fresh",
      recordId: "response-b",
      value: { organizationName: "Acme" },
    });

    const baselineLoader = vi.fn(async () => unavailable);
    await expect(
      store.wrapLoader(baselineLoader)({
        descriptor: {
          catalogRef: CATALOG_A,
          sourceRef: SOURCE_REF,
          catalog: catalog(CATALOG_A, [draft]).document,
          source: draft,
        },
        context: {
          surfaceId: "public",
          routeId: "review",
          slotId: "draft-review",
          moduleId: "x-preview",
          widgetName: "StructuredPanel",
          params: {},
        },
      })
    ).resolves.toMatchObject({
      status: "loaded",
      value: { organizationName: "Acme" },
    });
  });

  it("does not admit incomplete non-draft Definition Response declarations", () => {
    const { responseSelection: _selection, ...incomplete } = definitionResponseSource();
    const store = createPreviewDefinitionResponseStore([
      catalog(CATALOG_B, [incomplete]),
    ]);

    expect(
      store.record({
        binding: BINDING_B,
        invocationId: "incomplete",
        response: response(),
      })
    ).toEqual({ status: "refused", reason: "source-unavailable" });
  });
});

it("qualifies the projected value and hashes the complete selected record", () => {
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [
    definitionResponseSource({ schema: { type: "object", properties: { organizationName: {} } } }),
  ])]);
  const filed = response({
    definitionVersion: "1.3.0",
    data: { organizationName: "Acme", privateAnswer: "do not project" },
  });
  expect(store.record({ binding: BINDING_A, invocationId: "new-version", response: filed }))
    .toEqual({ status: "recorded", selected: true });
  const value = { organizationName: "Acme" };
  const expectedHandoff = createHash("sha256").update(canonicalResponseHandoffBytes(filed)).digest("hex");
  const expectedValue = createHash("sha256").update("formspec.instance.value.v1\0")
    .update(canonicalJsonBytes(value)).digest("hex");
  expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
    ...BINDING_A, status: "loaded", freshness: "fresh", value,
    records: [{ responseId: filed.id, definitionVersion: filed.definitionVersion, responseHash: "sha256:" + expectedHandoff }],
    valueDigest: "sha256:" + expectedValue, none: false,
  });
});

it("limits each list record to the declared item properties", () => {
  const base = definitionResponseSource();
  const source = definitionResponseSource({
    responseSelection: { ...base.responseSelection!, cardinality: "latest-per-subject" },
    schema: { type: "array", items: { type: "object", properties: { organizationName: {} } } },
  });
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])]);
  for (const [id, organizationName] of [["response-a", "Acme"], ["response-b", "Baker"]] as const) {
    const result = store.record({
      binding: BINDING_A,
      invocationId: id,
      implicitSubjectId: id,
      response: response({ id, data: { organizationName, privateAnswer: id } }),
    });
    expect(result).toEqual({ status: "recorded", selected: true });
  }
  const value = [{ organizationName: "Acme" }, { organizationName: "Baker" }];
  const digest = createHash("sha256").update("formspec.instance.value.v1\0")
    .update(canonicalJsonBytes(value)).digest("hex");
  expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
    status: "loaded", value, valueDigest: "sha256:" + digest, none: false,
  });
});

it("refuses a Mapping even when the host supplies its expected input projection", () => {
  const base = definitionResponseSource();
  const mappingUrl = "urn:example:organization-mapping";
  const source = definitionResponseSource({
    responseSelection: { ...base.responseSelection!, mapping: mappingUrl },
    schema: { type: "object", properties: { name: {} } },
  });
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])], {
    selectionContext: () => ({
      upstreamSubject: null,
      projection: ["organizationName"],
      mapping: {
        reference: { url: mappingUrl, digest: `sha256:${"a".repeat(64)}` },
        document: { rules: [{ sourcePath: "organizationName", targetPath: "name", transform: "preserve" }] },
      },
    }),
  });
  // Keep catalog reads unavailable until Rust can prove the Mapping's input and output shapes (fs-fea7).
  expect(store.record({ binding: BINDING_A, invocationId: "mapped", response: response() }))
    .toEqual({ status: "recorded", selected: false });
  expect(store.overlay(BINDING_A, freshBaseline)).toMatchObject({
    status: "unavailable",
  });
});

it("refuses a Mapping that requests an undeclared answer through the host context", () => {
  const base = definitionResponseSource();
  const mappingUrl = "urn:example:organization-mapping";
  const source = definitionResponseSource({
    responseSelection: { ...base.responseSelection!, mapping: mappingUrl },
    schema: { type: "object", properties: { name: {} } },
  });
  const selectionContext = () => ({
    upstreamSubject: null,
    projection: ["privateAnswer"],
    mapping: {
      reference: { url: mappingUrl, digest: `sha256:${"a".repeat(64)}` },
      document: { rules: [{ sourcePath: "privateAnswer", targetPath: "name", transform: "preserve" }] },
    },
  });
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])], { selectionContext });
  store.record({
    binding: BINDING_A,
    invocationId: "mapped-private-answer",
    response: response({ data: { organizationName: "Acme", privateAnswer: "private" } }),
  });
  expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
    ...BINDING_A, status: "unavailable", reason: "Definition Response selection is unavailable.",
  });
});

it("evaluates route selectors against recorded deliveries", () => {
  const base = definitionResponseSource();
  const source = definitionResponseSource({
    responseSelection: { ...base.responseSelection!,
      subject: [{ key: "year", op: "eq", from: { routeParam: "year" } }] },
  });
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])]);
  expect(store.record({ binding: BINDING_A, invocationId: "unscoped", response: response() }))
    .toEqual({ status: "recorded", selected: false });
  expect(store.overlay(BINDING_A, freshBaseline)).toEqual({
    ...BINDING_A,
    status: "unavailable",
    reason: "Definition Response selection is unavailable.",
  });
});

it("resolves a fresh empty bucket synchronously according to whenNone", () => {
  const source = definitionResponseSource();
  source.responseSelection!.whenNone = "empty";
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])]);
  const result = store.overlay(BINDING_A, freshBaseline);
  expect(result).toMatchObject({
    ...BINDING_A, status: "loaded", freshness: "fresh", records: [], none: true,
  });
  expect(result).not.toHaveProperty("recordId");
});

it("returns unavailable when the upstream Definition is missing, even with whenNone empty", () => {
  const source = definitionResponseSource();
  source.responseSelection!.whenNone = "empty";
  const selectionContext = vi.fn(() => undefined);
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])], { selectionContext });
  const unavailable = {
    ...BINDING_A, status: "unavailable", reason: "Definition Response selection is unavailable.",
  };
  expect(store.overlay(BINDING_A, freshBaseline)).toEqual(unavailable);
  expect(store.record({ binding: BINDING_A, invocationId: "unknown-definition", response: response() }))
    .toEqual({ status: "recorded", selected: false });
  expect(store.overlay(BINDING_A, freshBaseline)).toEqual(unavailable);
});

it.each([
  ['1.3.0-rc.1', '^1.2.0'],
  ['2026-plan-edition', undefined],
])('admits version %s under the selector range %s', (version, range) => {
  const base = definitionResponseSource();
  const source = definitionResponseSource({
    responseSelection: { ...base.responseSelection!, definition: {
      url: DEFINITION_REF, ...(range === undefined ? {} : { compatibleVersions: range }),
    } },
  });
  const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A, [source])]);
  expect(store.record({ binding: BINDING_A, invocationId: 'version-policy', response: response({
    definitionVersion: version!,
  }) })).toMatchObject({ status: 'recorded' });
});
