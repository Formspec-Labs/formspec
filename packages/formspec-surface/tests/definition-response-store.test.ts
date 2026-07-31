/** @filedesc Tests for the preview/test-only Definition Response store. */
import { describe, expect, it, vi } from "vitest";
import type {
  DataSource,
  DataSourcesDocument,
  FormResponse,
} from "@formspec-org/types";
import {
  createPreviewDefinitionResponseStore,
  type DataSourceCatalogHandle,
  type DataSourceLoadResult,
  type DefinitionResponseSourceBinding,
} from "../src/index.js";

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
    definitionRef: DEFINITION_REF,
    definitionVersion: DEFINITION_VERSION,
    responseSelection: {
      status: "completed",
      cardinality: "latest",
      orderBy: "authored-desc",
      tieBreak: "response-id-asc",
      partitionBy: "definition",
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
      recordId: "response-b",
      value: { organizationName: "Catalog A" },
    });
    expect(store.overlay(BINDING_B, freshBaseline)).toBe(freshBaseline);
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

  it("refuses mismatched Definition versions and Response statuses", () => {
    const store = createPreviewDefinitionResponseStore([catalog(CATALOG_A)]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "wrong-version",
        response: response({ definitionVersion: "2.0.0" }),
      })
    ).toEqual({ status: "refused", reason: "response-version-mismatch" });
    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "wrong-status",
        response: response({ status: "in-progress" }),
      })
    ).toEqual({ status: "refused", reason: "response-status-mismatch" });
    expect(store.overlay(BINDING_A, freshBaseline)).toBe(freshBaseline);
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
      recordId: "response-b",
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
      recordId: "response-b",
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
    expect(store.overlay(BINDING_A, freshBaseline)).toBe(freshBaseline);
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
      recordId: "response-a",
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
    "2026-07-31T14:00:00-00:00",
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
      reason:
        "Definition Response selection is ambiguous because candidates share the same authored instant and Response id.",
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
      recordId: "response-b",
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

  it("does not admit draft or incomplete Definition Response source declarations", () => {
    const draft = definitionResponseSource({
      runtime: {
        ...definitionResponseSource().runtime,
        delivery: "draft",
        cache: { mode: "draft" },
      },
    });
    const incomplete = {
      ...definitionResponseSource(),
      definitionVersion: undefined,
    } as unknown as DataSource;
    const store = createPreviewDefinitionResponseStore([
      catalog(CATALOG_A, [draft]),
      catalog(CATALOG_B, [incomplete]),
    ]);

    expect(
      store.record({
        binding: BINDING_A,
        invocationId: "draft",
        response: response(),
      })
    ).toEqual({ status: "refused", reason: "source-unavailable" });
    expect(
      store.record({
        binding: BINDING_B,
        invocationId: "incomplete",
        response: response(),
      })
    ).toEqual({ status: "refused", reason: "source-unavailable" });
  });
});
