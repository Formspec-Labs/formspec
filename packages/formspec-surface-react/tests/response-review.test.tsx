/** @filedesc Frozen Response review values, locale identity, and authorized preview lifecycle. */
import React, { act } from "react";
import canonicalize from "canonicalize";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import {
  ResponseReview,
  createResponseReviewWidget,
  responseReviewHash,
  responseReviewHandoffHash,
} from "../src/widgets/response-review.js";
import type { SurfaceWidgetProps } from "../src/widget-api.js";

// Test double only; actual maintained integrity-canonical producer is qualified by replay.
const handoffBytes = (response: unknown) =>
  new TextEncoder().encode(
    `formspec.response.handoff.v1\0${canonicalize(response)}`
  );
const handoffHash = (response: unknown) =>
  responseReviewHandoffHash(response, handoffBytes);

const copy = {
  heading: "Review your answers",
  pending: "Preparing response review…",
  beforeSign: "Review these answers before signing.",
  beforeSubmit: "Review the signed answers before submitting.",
  responseId: "Response",
  draftVersion: "Draft version",
  locale: "Language",
  signatures: "Signatures recorded",
  additionalAnswers: "Additional answers",
  emptyString: "Empty text",
  nullValue: "No value",
  trueValue: "True",
  falseValue: "False",
  emptyArray: "Empty list",
  emptyObject: "Empty object",
  attachmentPending: "Loading attachment preview…",
  attachmentUnavailable: "Attachment preview is unavailable.",
  attachmentFailed: "Attachment preview could not be verified.",
  attachmentPreview: "Attachment preview",
  attachmentDetails: "Attachment details",
  retry: "Retry attachment preview",
  unavailable: "This response cannot be reviewed.",
};
async function props(): Promise<SurfaceWidgetProps> {
  const definition = {
    $formspec: "1.0",
    url: "urn:review",
    version: "1.0.0",
    items: [
      { key: "name", type: "field", dataType: "string", label: "Name" },
      {
        key: "people",
        type: "group",
        repeatable: true,
        children: [
          {
            key: "answer",
            type: "field",
            dataType: "boolean",
            label: "Answer",
          },
        ],
      },
      { key: "choice", type: "field", dataType: "choice", label: "Choice" },
    ],
  };
  const response = {
    $formspecResponse: "1.0",
    id: "response-1",
    definitionUrl: definition.url,
    definitionVersion: definition.version,
    status: "completed",
    authored: "2026-10-06T12:00:00Z",
    displayedLocale: { locale: "en" },
    data: {
      name: "Retained Name",
      people: [{ answer: false, extra: "retained extra" }, { answer: true }],
      choice: "saved-code",
      extra: { zero: 0, empty: "", nil: null },
    },
    extensions: { "x-keep": { value: 1 } },
  };
  return {
    moduleId: "x-starter",
    widgetName: "ResponseReview",
    slot: { id: "review" },
    route: { surfaceId: "surface", routeId: "review", params: {} },
    headingLevel: 2,
    admitsTenantTheme: false,
    config: { copy: { en: copy } },
    data: {
      definition,
      response,
      presentation: {
        responseHash: await handoffHash(response),
        definitionUrl: definition.url,
        definitionVersion: definition.version,
        locale: "en",
        actorRef: "actor-1",
        draft: { id: "draft-1", version: 7 },
        phase: "before-sign",
        fields: {
          name: { label: "Localized name" },
          people: { label: "People" },
          "people[0].answer": { label: "First answer" },
          "people[1].answer": { label: "Second answer" },
          choice: {
            label: "Saved choice",
            options: [{ value: "saved-code", label: "Saved label" }],
          },
        },
      },
    },
    emitAction: vi.fn(),
  };
}
async function mount(
  p: SurfaceWidgetProps,
  options: Parameters<typeof createResponseReviewWidget>[0] = {}
) {
  const states: Array<{ status: string }> = [];
  const Widget = createResponseReviewWidget({
    canonicalResponseHandoffBytes: handoffBytes,
    ...options,
    onReviewState(state) {
      states.push(state);
      options.onReviewState?.(state);
    },
  });
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<Widget {...p} />);
    await new Promise((r) => setTimeout(r, 10));
  });
  const settled = async () =>
    vi.waitFor(async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1));
      });
      expect(
        !states.length ||
          states.at(-1)?.status === "unavailable" ||
          el.querySelector(".fs-response-review")
      ).toBeTruthy();
    });
  await settled();
  return {
    el,
    async rerender(next: SurfaceWidgetProps) {
      await act(async () => {
        root.render(<Widget {...next} />);
        await new Promise((r) => setTimeout(r, 1));
      });
      await settled();
    },
    unmount() {
      act(() => root.unmount());
      el.remove();
    },
  };
}
describe("ResponseReview", () => {
  it("reviews the exact retained values, groups/repeats and additional data without editable controls", async () => {
    const p = await props();
    const original = JSON.stringify(p.data);
    const report = vi.fn();
    const view = await mount(p, { onReviewState: report });
    expect(view.el.textContent).toContain("Localized name");
    expect(view.el.textContent).toContain("Retained Name");
    expect(view.el.textContent).toContain("First answer");
    expect(view.el.textContent).toContain("False");
    expect(view.el.textContent).toContain("Second answer");
    expect(view.el.textContent).toContain("retained extra");
    expect(view.el.textContent).toContain('"zero": 0');
    expect(view.el.textContent).toContain('"nil": null');
    expect(view.el.textContent).toContain("Saved label");
    expect(view.el.textContent).toContain("saved-code");
    expect(view.el.querySelector("input,select,textarea,button")).toBeNull();
    expect(p.emitAction).not.toHaveBeenCalled();
    expect(JSON.stringify(p.data)).toBe(original);
    expect(report.mock.calls.at(-1)?.[0].status).toBe("ready");
    view.unmount();
  });
});

async function withPhoto(p: SurfaceWidgetProps) {
  const bytes = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR0UAAAAASUVORK5CYII=",
      "base64"
    )
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  const descriptor = {
    kind: "attachment-ref",
    uri: "urn:owned:photo",
    url: "urn:owned:photo",
    hash: `sha256:${hex}`,
    size: bytes.length,
    mimeType: "image/png",
    contentType: "image/png",
    filename: "saved.png",
    extra: "retain descriptor",
  };
  const d = p.data as any;
  d.definition.items.push({
    key: "photo",
    type: "field",
    dataType: "attachment",
  });
  d.response.data.photo = descriptor;
  d.presentation.fields.photo = { label: "Saved photo" };
  d.presentation.responseHash = await handoffHash(d.response);
  const { Blob: NodeBlob } = await import("node:buffer");
  return {
    descriptor,
    blob: new NodeBlob([bytes], { type: "image/png" }) as unknown as Blob,
  };
}
describe("ResponseReview admission and preview lifecycle", () => {
  it.each([
    "pins",
    "locale",
    "hash",
    "metadata",
    "missing-displayed-locale",
    "signature",
  ])("refuses %s drift", async (kind) => {
    const p = await props();
    const d = p.data as any;
    if (kind === "pins") d.definition.version = "2.0.0";
    if (kind === "locale") d.presentation.locale = "es";
    if (kind === "hash") d.response.data.name = "changed";
    if (kind === "metadata") delete d.presentation.fields.name;
    if (kind === "missing-displayed-locale") delete d.response.displayedLocale;
    if (kind === "signature") d.presentation.phase = "before-submit";
    const report = vi.fn();
    const view = await mount(p, { onReviewState: report });
    expect(view.el.querySelector(".fs-response-review-row")).toBeNull();
    expect(report.mock.calls.some(([v]) => v.status === "ready")).toBe(false);
    view.unmount();
  });
  it("refuses accessors without executing them", async () => {
    const p = await props();
    const getter = vi.fn();
    Object.defineProperty((p.data.response as any).data, "sensitive", {
      enumerable: true,
      get: getter,
    });
    const view = await mount(p);
    expect(view.el.querySelector(".fs-response-review-row")).toBeNull();
    expect(getter).not.toHaveBeenCalled();
    view.unmount();
  });
  it("uses captured locale labels and keeps additional data with safe prototype keys", async () => {
    const p = await props();
    const d = p.data as any;
    d.response.displayedLocale.locale = "es";
    d.presentation.locale = "es";
    d.presentation.fields.name.label = "Nombre retenido";
    p.config = { copy: { es: { ...copy, heading: "Revisar respuestas" } } };
    d.response.data.name = "<script>retained text</script>";
    Object.defineProperty(d.response.data, "__proto__", {
      enumerable: true,
      value: { unchanged: true },
    });
    d.presentation.responseHash = await handoffHash(d.response);
    const view = await mount(p);
    expect(view.el.textContent).toContain("Nombre retenido");
    expect(view.el.textContent).toContain("<script>retained text</script>");
    expect(view.el.textContent).toContain("__proto__");
    expect(view.el.querySelector("script")).toBeNull();
    expect(view.el.querySelector("section[lang=es]")).not.toBeNull();
    view.unmount();
  });
  it("displays recorded signed data directly with retained extensions and signature count", async () => {
    const p = await props();
    const d = p.data as any;
    d.presentation.phase = "before-submit";
    d.response.authoredSignatures = [{ signatureId: "sig-1", opaque: "kept" }];
    d.response.data.name = "Signed saved answer";
    d.presentation.responseHash = await handoffHash(d.response);
    const before = JSON.stringify(d.response);
    const view = await mount(p);
    expect(view.el.textContent).toContain(copy.beforeSubmit);
    expect(view.el.textContent).toContain("Signed saved answer");
    expect(JSON.stringify(d.response)).toBe(before);
    view.unmount();
  });
  it("checks bytes then waits for decoded image before ready and revokes its URL", async () => {
    const p = await props();
    const { descriptor, blob } = await withPhoto(p);
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:review-1");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const read = vi.fn(async () => blob);
    const report = vi.fn();
    const view = await mount(p, {
      readAttachment: read,
      onReviewState: report,
    });
    expect(read).toHaveBeenCalledTimes(1);
    const request = read.mock.calls[0]![0] as any;
    expect(request.path).toBe("photo");
    expect(request.descriptor).toEqual(descriptor);
    expect(Object.isFrozen(request.descriptor)).toBe(true);
    expect(Object.isFrozen(request.response.data)).toBe(true);
    expect(read.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1));
      });
      expect(view.el.querySelector("img")).not.toBeNull();
    });
    expect(view.el.querySelector("img")?.getAttribute("src")).toBe(
      "blob:review-1"
    );
    expect(report.mock.calls.at(-1)?.[0].status).toBe("pending");
    act(() => view.el.querySelector("img")!.dispatchEvent(new Event("load")));
    expect(report.mock.calls.at(-1)?.[0].status).toBe("ready");
    expect(view.el.textContent).toContain("retain descriptor");
    view.unmount();
    expect(revoke).toHaveBeenCalledWith("blob:review-1");
    expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
    create.mockRestore();
    revoke.mockRestore();
  });
  it.each(["no-reader", "rejection", "hash", "size", "media", "decode"])(
    "keeps preview unavailable for %s",
    async (kind) => {
      const p = await props();
      const { blob } = await withPhoto(p);
      const d = p.data as any;
      if (kind === "hash")
        d.response.data.photo.hash = "sha256:" + "a".repeat(64);
      if (kind === "size") d.response.data.photo.size++;
      if (kind === "media")
        d.response.data.photo.contentType = d.response.data.photo.mimeType =
          "image/jpeg";
      d.presentation.responseHash = await handoffHash(d.response);
      const report = vi.fn();
      const create = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:failed-preview");
      const revoke = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
      const view = await mount(p, {
        onReviewState: report,
        ...(kind === "no-reader"
          ? {}
          : {
              readAttachment: async () => {
                if (kind === "rejection") throw Error("private auth denial");
                return blob;
              },
            }),
      });
      if (kind === "decode") {
        await vi.waitFor(async () => {
          await act(async () => {
            await new Promise((r) => setTimeout(r, 1));
          });
          expect(view.el.querySelector("img")).not.toBeNull();
        });
        act(() =>
          view.el.querySelector("img")!.dispatchEvent(new Event("error"))
        );
      }
      await vi.waitFor(async () => {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 1));
        });
        expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
      });
      expect(report.mock.calls.some(([v]) => v.status === "ready")).toBe(false);
      expect(view.el.textContent).toContain(
        kind === "no-reader"
          ? copy.attachmentUnavailable
          : copy.attachmentFailed
      );
      expect(view.el.textContent).not.toContain("private auth denial");
      view.unmount();
      create.mockRestore();
      revoke.mockRestore();
    }
  );
  it("aborts old reads and cannot admit stale phase/actor/revision outcomes", async () => {
    const p = await props();
    const { blob } = await withPhoto(p);
    let resolve!: (blob: Blob) => void;
    const read = vi.fn(
      () =>
        new Promise<Blob>((r) => {
          resolve = r;
        })
    );
    const report = vi.fn();
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:stale");
    const view = await mount(p, {
      readAttachment: read,
      onReviewState: report,
    });
    const oldSignal = read.mock.calls[0]![1].signal;
    const next = await props();
    (next.data.presentation as any).actorRef = "actor-2";
    (next.data.presentation as any).draft.version = 8;
    await view.rerender(next);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => {
      resolve(blob);
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(create).not.toHaveBeenCalled();
    expect(report.mock.calls.at(-1)?.[0]).toMatchObject({
      status: "ready",
      actorRef: "actor-2",
      draft: { version: 8 },
    });
    expect(
      report.mock.calls.filter(
        ([v]) => v.status === "ready" && v.actorRef === "actor-1"
      )
    ).toHaveLength(0);
    view.unmount();
    create.mockRestore();
  });
  it("holds a detached immutable display when source objects mutate without rerender", async () => {
    const p = await props();
    const view = await mount(p);
    (p.data.response as any).data.name = "later live answer";
    expect(view.el.textContent).toContain("Retained Name");
    expect(view.el.textContent).not.toContain("later live answer");
    await view.rerender(p);
    expect(view.el.querySelector(".fs-response-review-row")).toBeNull();
    view.unmount();
  });
});

describe("review replacement and canonical identities", () => {
  it.each([
    "\ud800",
    "\udc00",
    { ["\ud800"]: "value" },
    { nested: ["\udc00"] },
  ])("rejects invalid Unicode before JCS hashing", async (value) => {
    await expect(responseReviewHash(value)).rejects.toThrow("Unicode");
  });
  it("preserves valid Unicode pairs and equivalent object key order", async () => {
    expect(await responseReviewHash({ emoji: "😀", value: 0 })).toBe(
      await responseReviewHash({ value: 0, emoji: "😀" })
    );
  });
  it("invalidates ready previews when injected reader/report callbacks change on the same snapshot", async () => {
    const p = await props();
    const { blob } = await withPhoto(p);
    const create = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:callback-review");
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const oldReport = vi.fn();
    const options: any = {
      canonicalResponseHandoffBytes: handoffBytes,
      readAttachment: async () => blob,
      onReviewState: oldReport,
    };
    const el = document.createElement("div");
    document.body.append(el);
    const root = createRoot(el);
    const view = {
      el,
      async rerender(next: SurfaceWidgetProps) {
        await act(async () => {
          root.render(<ResponseReview {...next} {...options} />);
          await new Promise((r) => setTimeout(r, 1));
        });
      },
      unmount() {
        act(() => root.unmount());
        el.remove();
      },
    };
    await view.rerender(p);
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1));
      });
      expect(view.el.querySelector("img")).not.toBeNull();
    });
    const oldImage = view.el.querySelector("img")!;
    act(() => oldImage.dispatchEvent(new Event("load")));
    expect(oldReport.mock.calls.at(-1)?.[0].status).toBe("ready");
    let finish!: (b: Blob) => void;
    const nextReport = vi.fn();
    options.readAttachment = () =>
      new Promise<Blob>((r) => {
        finish = r;
      });
    options.onReviewState = nextReport;
    await view.rerender(p);
    expect(nextReport.mock.calls.some(([v]) => v.status === "ready")).toBe(
      false
    );
    expect(revoke).toHaveBeenCalledWith("blob:callback-review");
    act(() => oldImage.dispatchEvent(new Event("load")));
    expect(nextReport.mock.calls.some(([v]) => v.status === "ready")).toBe(
      false
    );
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1));
      });
      expect(typeof finish).toBe("function");
    });
    await act(async () => {
      finish(blob);
      await new Promise((r) => setTimeout(r, 1));
    });
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1));
      });
      expect(view.el.querySelector("img")).not.toBeNull();
    });
    expect(nextReport.mock.calls.some(([v]) => v.status === "ready")).toBe(
      false
    );
    act(() => view.el.querySelector("img")!.dispatchEvent(new Event("load")));
    expect(nextReport.mock.calls.at(-1)?.[0].status).toBe("ready");
    view.unmount();
    create.mockRestore();
    revoke.mockRestore();
  });
});

it("retries only the same captured descriptor and keeps availability false until decode", async () => {
  const p = await props();
  const { blob } = await withPhoto(p);
  const report = vi.fn();
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:retry");
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const read = vi
    .fn()
    .mockRejectedValueOnce(Error("denied"))
    .mockResolvedValueOnce(blob);
  const view = await mount(p, { readAttachment: read, onReviewState: report });
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(view.el.querySelector("button")?.textContent).toBe(copy.retry);
  });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
  act(() => view.el.querySelector("button")!.click());
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(view.el.querySelector("img")).not.toBeNull();
  });
  expect(read.mock.calls[1]![0].descriptor).toEqual(
    read.mock.calls[0]![0].descriptor
  );
  expect(report.mock.calls.at(-1)?.[0].status).toBe("pending");
  act(() => view.el.querySelector("img")!.dispatchEvent(new Event("load")));
  expect(report.mock.calls.at(-1)?.[0].status).toBe("ready");
  view.unmount();
  create.mockRestore();
  revoke.mockRestore();
});

it("publishes exact module/local source schemas with closed authored copy and ready identity", async () => {
  const {
    RESPONSE_REVIEW_WIDGET_SHAPE: shape,
    RESPONSE_REVIEW_CONFIG_SCHEMA: config,
    RESPONSE_REVIEW_PRESENTATION_SCHEMA: presentation,
    RESPONSE_REVIEW_STATE_SCHEMA: state,
    starterWidgetModule,
    SIGNING_CEREMONY_REVIEW_SCHEMA: review,
  } = await import("../src/widgets/index.js");
  const { default: Ajv } = await import("ajv/dist/2020.js");
  const ajv = new Ajv({ strict: false });
  const p = await props();
  expect(shape.dataInputs.map((i) => i.name)).toEqual([
    "definition",
    "response",
    "presentation",
  ]);
  expect(shape).not.toHaveProperty("actionOutputs");
  expect(
    starterWidgetModule("x-starter", { responseReview: {} }).contracts
      ?.ResponseReview?.deliveryContractId
  ).toBe(shape.deliveryContractId);
  expect(ajv.compile(config)(p.config)).toBe(true);
  expect(ajv.compile(presentation)(p.data.presentation)).toBe(true);
  const d = p.data.presentation as any;
  const ready = {
    status: "ready",
    responseHash: d.responseHash,
    actorRef: d.actorRef,
    draft: d.draft,
    locale: d.locale,
    phase: d.phase,
  };
  const validate = ajv.compile(state);
  expect(validate(ready)).toBe(false);
  expect(validate({ ...ready, contextIdentity: "a".repeat(64) })).toBe(true);
  expect(validate({ ...ready, status: "pending" })).toBe(true);
  expect(
    ajv.compile(review)({
      contextIdentity: "a".repeat(64),
      state: { ...ready, contextIdentity: "a".repeat(64) },
    })
  ).toBe(true);
});

it("admits the published no-action widget shape through canonical Registry and the module profile", async () => {
  const { RESPONSE_REVIEW_WIDGET_SHAPE: shape } = await import(
    "../src/widgets/index.js"
  );
  const { resolveModules, moduleResolverInputFromAppGraph } = await import(
    "@formspec-org/app-graph"
  );
  const { default: Ajv } = await import("ajv/dist/2020.js");
  const { default: addFormats } = await import("ajv-formats");
  const { default: registrySchema } = await import(
    "../../../schemas/registry.schema.json"
  );
  const { default: common } = await import(
    "../../../schemas/common.schema.json"
  );
  const ajv = new Ajv({ strict: false });
  addFormats(ajv);
  ajv.addSchema(common);
  ajv.addSchema(registrySchema);
  const validate = ajv.compile({
    $ref: registrySchema.$id + "#/$defs/RegistryEntry/properties/widgetShape",
  });
  expect(validate(shape), JSON.stringify(validate.errors)).toBe(true);
  expect(validate({ ...shape, actionOutputs: [] })).toBe(false);
  const widgetEntry = {
    name: "x-response-review",
    category: "widget",
    version: "0.1.0",
    status: "stable",
    description: "Display the retained frozen Response.",
    compatibility: { formspecVersion: ">=1.0.0 <2.0.0" },
    widgetShape: shape,
  };
  const document = {
    $formspecRegistry: "1.1",
    publisher: { name: "Shared widget test" },
    published: "2026-10-06T12:00:00Z",
    entries: [
      {
        name: "x-starter",
        category: "module",
        version: "0.1.0",
        status: "stable",
        description: "Shared starter module.",
        compatibility: { formspecVersion: ">=1.0.0 <2.0.0" },
        contributes: ["x-response-review"],
      },
      widgetEntry,
    ],
  };
  const validateRegistry = ajv.getSchema(registrySchema.$id)!;
  expect(
    validateRegistry(document),
    JSON.stringify(validateRegistry.errors)
  ).toBe(true);
  expect(
    validateRegistry({
      ...document,
      entries: [
        { ...widgetEntry, widgetShape: { ...shape, actionOutputs: [] } },
      ],
    })
  ).toBe(false);
  const p = await props();
  const manifest = {
    slot: "app",
    artifactKind: "appManifest" as const,
    status: "loaded" as const,
    source: "memory://app",
    document: {
      $formspecApp: "1.0",
      version: "1.0.0",
      modules: [{ id: "x-starter", version: "0.1.0" }],
    },
  };
  const surface = {
    slot: "surfaces[0]",
    artifactKind: "surface" as const,
    status: "loaded" as const,
    source: "memory://surface",
    document: {
      $formspecSurface: "0.2",
      id: "review",
      entry: "review",
      routes: [
        {
          id: "review",
          path: "/",
          slots: [
            {
              id: "review",
              slotType: "module-widget",
              binding: {
                moduleId: "x-starter",
                widgetName: "ResponseReview",
                config: p.config,
              },
            },
          ],
        },
      ],
    },
  };
  const registry = {
    slot: "registries[0]",
    artifactKind: "registry" as const,
    status: "loaded" as const,
    source: "memory://registry",
    document,
  };
  const result = resolveModules(
    moduleResolverInputFromAppGraph({ manifest, handles: [surface, registry] })
  );
  expect(result.ok, JSON.stringify(result)).toBe(true);
});

it("requires the fixed handoff producer and refuses a raw JCS response hash", async () => {
  const p = await props();
  const report = vi.fn();
  expect(await handoffHash(p.data.response)).not.toBe(
    await responseReviewHash(p.data.response)
  );
  const raw = structuredClone({ ...p, emitAction: undefined });
  raw.emitAction = p.emitAction;
  (raw.data.presentation as any).responseHash = await responseReviewHash(
    raw.data.response
  );
  const wrong = await mount(raw, { onReviewState: report });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
  wrong.unmount();
  report.mockClear();
  const missing = await mount(p, {
    canonicalResponseHandoffBytes: undefined,
    onReviewState: report,
  });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
  missing.unmount();
  const ok = await mount(p, { onReviewState: report });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("ready");
  expect(report.mock.calls.at(-1)?.[0].responseHash).toBe(
    (p.data.presentation as any).responseHash
  );
  expect(report.mock.calls.at(-1)?.[0].contextIdentity).toBe(
    await responseReviewHash(p.data)
  );
  ok.unmount();
});

it("refuses unavailable or invalid handoff bytes without substituting another profile", async () => {
  for (const produce of [
    () => {
      throw Error("missing producer");
    },
    () => new Uint8Array(),
    () => "wrong" as any,
  ]) {
    const p = await props();
    const report = vi.fn();
    const v = await mount(p, {
      canonicalResponseHandoffBytes: produce,
      onReviewState: report,
    });
    expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
    v.unmount();
  }
  const p = await props();
  const supplied = vi.fn(handoffBytes);
  const digest = await responseReviewHandoffHash(p.data.response, supplied);
  expect(digest).toBe((p.data.presentation as any).responseHash);
  expect(supplied.mock.calls[0]![0]).toEqual(p.data.response);
  expect(supplied.mock.calls[0]![0]).not.toBe(p.data.response);
  expect(Object.isFrozen(supplied.mock.calls[0]![0])).toBe(true);
});

it("invalidates ready review when the handoff producer is replaced", async () => {
  const p = await props();
  const report = vi.fn();
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <ResponseReview
        {...p}
        canonicalResponseHandoffBytes={handoffBytes}
        onReviewState={report}
      />
    );
    await new Promise((r) => setTimeout(r, 10));
  });
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(report.mock.calls.at(-1)?.[0].status).toBe("ready");
  });
  await act(async () => {
    root.render(
      <ResponseReview
        {...p}
        canonicalResponseHandoffBytes={() => {
          throw Error("replacement unavailable");
        }}
        onReviewState={report}
      />
    );
    await new Promise((r) => setTimeout(r, 10));
  });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
  expect(el.querySelector(".fs-response-review")).toBeNull();
  act(() => root.unmount());
  el.remove();
});

it("discards a late handoff digest after producer replacement", async () => {
  const p = await props();
  const report = vi.fn();
  let finish!: (value: ArrayBuffer) => void;
  const delayed = vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const el = document.createElement("div");
  document.body.append(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <ResponseReview
        {...p}
        canonicalResponseHandoffBytes={handoffBytes}
        onReviewState={report}
      />
    );
    await new Promise((r) => setTimeout(r, 1));
  });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("pending");
  await act(async () => {
    root.render(
      <ResponseReview
        {...p}
        canonicalResponseHandoffBytes={() => {
          throw Error("replaced");
        }}
        onReviewState={report}
      />
    );
    await new Promise((r) => setTimeout(r, 1));
  });
  expect(report.mock.calls.at(-1)?.[0].status).toBe("unavailable");
  await act(async () => {
    finish(
      Uint8Array.from(
        (p.data.presentation as any).responseHash.match(/../g)!,
        (x: string) => parseInt(x, 16)
      ).buffer
    );
    await new Promise((r) => setTimeout(r, 1));
  });
  expect(report.mock.calls.some(([state]) => state.status === "ready")).toBe(
    false
  );
  act(() => root.unmount());
  el.remove();
  delayed.mockRestore();
});


async function acceptedProps() {
  const p = await props();
  p.widgetName = "AcceptedResponseReview";
  const d = p.data as any;
  const { actorRef: _actor, draft: _draft, ...common } = d.presentation;
  d.presentation = { ...common, phase: "accepted-record", handoffId: "handoff-actual-1" };
  (p.config.copy as any).en = { ...copy, acceptedRecord: "Review the accepted record." };
  return p;
}

describe("accepted-record ResponseReview", () => {
  it("preserves existing custom signing reuse without accepted callbacks", async () => {
    const p = await props(); p.widgetName = 'custom-review';
    const accepted = vi.fn(), signing = vi.fn();
    const view = await mount(p, { onAcceptedReviewState: accepted, onReviewState: signing });
    await vi.waitFor(() => expect(signing.mock.calls.at(-1)?.[0].status).toBe('ready'));
    expect(accepted).not.toHaveBeenCalled(); view.unmount();
  });
  it.each(['ResponseReview', 'x-response-review', 'custom-review'])("refuses accepted data under %s before hashing or ports", async widgetName => {
    const p = await acceptedProps(); p.widgetName = widgetName;
    const hash = vi.fn(handoffBytes), read = vi.fn(), accepted = vi.fn(), signing = vi.fn();
    const view = await mount(p, { canonicalResponseHandoffBytes: hash, readAcceptedAttachment: read, onAcceptedReviewState: accepted, onReviewState: signing });
    expect(hash).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
    expect(accepted).not.toHaveBeenCalled(); expect(signing).not.toHaveBeenCalled(); view.unmount();
  });
  it.each(['AcceptedResponseReview', 'x-accepted-response-review'])("refuses signing data under %s before hashing or ports", async widgetName => {
    const p = await props(); p.widgetName = widgetName;
    const hash = vi.fn(handoffBytes), accepted = vi.fn(), signing = vi.fn();
    const view = await mount(p, { canonicalResponseHandoffBytes: hash, onAcceptedReviewState: accepted, onReviewState: signing });
    expect(hash).not.toHaveBeenCalled(); expect(accepted).not.toHaveBeenCalled(); expect(signing).not.toHaveBeenCalled(); view.unmount();
  });
  it("reuses lossless frozen values and reports only accepted availability without draft/signing authority", async () => {
    const p = await acceptedProps(), original = JSON.stringify(p.data);
    const accepted = vi.fn(), signing = vi.fn();
    const view = await mount(p, { onAcceptedReviewState: accepted, onReviewState: signing });
    await vi.waitFor(() => expect(accepted.mock.calls.at(-1)?.[0].status).toBe("ready"));
    expect(view.el.textContent).toContain("Review the accepted record.");
    expect(view.el.textContent).toContain("Retained Name");
    expect(view.el.textContent).toContain("Saved label");
    expect(view.el.textContent).toContain("retained extra");
    expect(view.el.textContent).not.toContain("Draft version");
    expect(view.el.querySelector("input,select,textarea,button")).toBeNull();
    expect(accepted.mock.calls.at(-1)?.[0]).toMatchObject({ phase: "accepted-record", handoffId: "handoff-actual-1", contextIdentity: await responseReviewHash(p.data) });
    expect(accepted.mock.calls.at(-1)?.[0]).not.toHaveProperty("actorRef");
    expect(accepted.mock.calls.at(-1)?.[0]).not.toHaveProperty("draft");
    expect(JSON.stringify(p.data)).toBe(original);
    view.unmount();
    expect(accepted.mock.calls.at(-1)?.[0].status).toBe("unavailable");
    expect(signing).not.toHaveBeenCalled();
  });

  it.each(["draft", "actor", "unknown", "handoff", "copy", "inline"])("refuses %s accepted-input drift without synthetic defaults", async kind => {
    const p = await acceptedProps(), d = p.data as any;
    if (kind === "draft") d.presentation.draft = { id: "invented", version: 0 };
    if (kind === "actor") d.presentation.actorRef = "invented";
    if (kind === "unknown") d.presentation.recordRevision = 1;
    if (kind === "handoff") delete d.presentation.handoffId;
    if (kind === "copy") delete (p.config.copy as any).en.acceptedRecord;
    if (kind === "inline") delete d.response.displayedLocale;
    const accepted = vi.fn(), signing = vi.fn();
    const view = await mount(p, { onAcceptedReviewState: accepted, onReviewState: signing });
    expect(view.el.querySelector(".fs-response-review")).toBeNull();
    expect(view.el.textContent).toContain(copy.unavailable);
    expect(accepted.mock.calls.some(([v]) => v.status === "ready")).toBe(false);
    expect(signing).not.toHaveBeenCalled();view.unmount();
  });

  it("never falls back to an applicant attachment reader when the accepted port is missing", async () => {
    const p = await acceptedProps();await withPhoto(p);
    const applicant = vi.fn(), accepted = vi.fn();
    const view = await mount(p, { readAttachment: applicant, onAcceptedReviewState: accepted });
    await vi.waitFor(() => expect(accepted.mock.calls.at(-1)?.[0].status).toBe("unavailable"));
    expect(applicant).not.toHaveBeenCalled();
    expect(view.el.querySelector("img")).toBeNull();view.unmount();
  });

  it("uses only the accepted reader and admits its bytes before publishing ready", async () => {
    const p = await acceptedProps(), { blob } = await withPhoto(p);
    const accepted = vi.fn(), signing = vi.fn(), applicant = vi.fn();
    const read = vi.fn(async () => blob);
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:accepted");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const view = await mount(p, { readAcceptedAttachment: read, readAttachment: applicant, onAcceptedReviewState: accepted, onReviewState: signing });
    await vi.waitFor(() => expect(view.el.querySelector("img")).not.toBeNull());
    expect(read.mock.calls[0]![0]).toMatchObject({ path: "photo", presentation: { handoffId: "handoff-actual-1", phase: "accepted-record" } });
    expect(accepted.mock.calls.at(-1)?.[0].status).toBe("pending");
    act(() => view.el.querySelector("img")!.dispatchEvent(new Event("load")));
    expect(accepted.mock.calls.at(-1)?.[0].status).toBe("ready");
    expect(applicant).not.toHaveBeenCalled();expect(signing).not.toHaveBeenCalled();
    view.unmount();expect(revoke).toHaveBeenCalledWith("blob:accepted");create.mockRestore();revoke.mockRestore();
  });

  it("aborts accepted work and ignores late bytes when replacement switches to signing", async () => {
    const p = await acceptedProps(), { blob } = await withPhoto(p);
    let finish!: (blob: Blob) => void;
    const read = vi.fn(() => new Promise<Blob>(r => { finish = r; }));
    const accepted = vi.fn(), signing = vi.fn();
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late-accepted");
    const view = await mount(p, { readAcceptedAttachment: read, onAcceptedReviewState: accepted, onReviewState: signing });
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    const signal = read.mock.calls[0]![1].signal;
    await view.rerender(await props());
    expect(signal.aborted).toBe(true);
    await act(async () => { finish(blob);await new Promise(r => setTimeout(r, 5)); });
    expect(create).not.toHaveBeenCalled();
    expect(accepted.mock.calls.some(([v]) => v.status === "ready")).toBe(false);
    expect(accepted.mock.calls.at(-1)?.[0].status).toBe("unavailable");
    expect(signing.mock.calls.at(-1)?.[0]).toMatchObject({ status: "ready", phase: "before-sign", draft: { id: "draft-1" } });
    view.unmount();create.mockRestore();
  });

  it("publishes closed accepted schemas while legacy signing schemas and copy stay narrow", async () => {
    const metadata = await import("../src/widget-metadata.js");
    const { default: Ajv } = await import("ajv/dist/2020.js");const ajv = new Ajv({ strict: false });
    const p = await acceptedProps(), d = p.data as any;
    expect(ajv.compile(metadata.RESPONSE_REVIEW_CONFIG_SCHEMA)((await props()).config)).toBe(true);
    const validate = ajv.compile(metadata.ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA);
    expect(validate(d.presentation)).toBe(true);
    expect(validate({ ...d.presentation, actorRef: "invented" })).toBe(false);
    expect(validate({ ...d.presentation, draft: { id: "invented", version: 0 } })).toBe(false);
    expect(ajv.compile(metadata.RESPONSE_REVIEW_PRESENTATION_SCHEMA)(d.presentation)).toBe(false);
    const state = { status: "ready", responseHash: d.presentation.responseHash, locale: "en", phase: "accepted-record", handoffId: d.presentation.handoffId };
    const qualified = { ...state, contextIdentity: "a".repeat(64) };
    expect(ajv.compile(metadata.ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA)(state)).toBe(false);
    expect(ajv.compile(metadata.ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA)(qualified)).toBe(true);
    expect(ajv.compile(metadata.RESPONSE_REVIEW_STATE_SCHEMA)(qualified)).toBe(false);
    expect(ajv.compile(metadata.SIGNING_CEREMONY_REVIEW_SCHEMA)({ contextIdentity: "a".repeat(64), state: qualified })).toBe(false);
    expect(metadata.RESPONSE_REVIEW_WIDGET_SHAPE).not.toHaveProperty("actionOutputs");
  });
});


it("keeps accepted recorded Spanish labels/options separate from host chrome", async () => {
  const p = await acceptedProps(), d = p.data as any;
  d.response.displayedLocale.locale = "es";d.presentation.locale = "es";
  d.presentation.fields.name.label = "Nombre original";
  d.presentation.fields.choice.options[0].label = "Opción original";
  d.presentation.responseHash = await handoffHash(d.response);
  p.config.copy = { es: { ...copy, heading: "Registro aceptado", acceptedRecord: "Revise el registro aceptado." } };
  const accepted = vi.fn();const view = await mount(p, { onAcceptedReviewState: accepted });
  await vi.waitFor(() => expect(accepted.mock.calls.at(-1)?.[0].status).toBe("ready"));
  expect(view.el.querySelector(".fs-response-review")?.getAttribute("lang")).toBe("es");
  expect(view.el.textContent).toContain("Nombre original");expect(view.el.textContent).toContain("Opción original");
  expect(view.el.textContent).toContain("Revise el registro aceptado.");view.unmount();
});

it("withdraws accepted readiness and aborts late media when the authorized host unmounts", async () => {
  const p = await acceptedProps(), { blob } = await withPhoto(p);
  let finish!: (blob: Blob) => void;
  const read = vi.fn(() => new Promise<Blob>(resolve => { finish = resolve; }));
  const accepted = vi.fn(), applicant = vi.fn();
  const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:withdrawn");
  const view = await mount(p, { readAcceptedAttachment: read, onAcceptedReviewState: accepted, onReviewState: applicant });
  await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(1));
  const signal = read.mock.calls[0]![1].signal;view.unmount();
  expect(signal.aborted).toBe(true);expect(accepted.mock.calls.at(-1)?.[0].status).toBe("unavailable");
  await act(async () => { finish(blob);await new Promise(resolve => setTimeout(resolve, 5)); });
  expect(create).not.toHaveBeenCalled();expect(applicant).not.toHaveBeenCalled();
  expect(accepted.mock.calls.some(([state]) => state.status === "ready")).toBe(false);create.mockRestore();
});

it("refuses accepted bytes with a descriptor hash mismatch", async () => {
  const p = await acceptedProps(), { blob } = await withPhoto(p), d = p.data as any;
  d.response.data.photo.hash = `sha256:${"f".repeat(64)}`;
  d.presentation.responseHash = await handoffHash(d.response);
  const accepted = vi.fn();const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invalid");
  const view = await mount(p, { readAcceptedAttachment: async () => blob, onAcceptedReviewState: accepted });
  await vi.waitFor(() => expect(accepted.mock.calls.at(-1)?.[0].status).toBe("unavailable"));
  expect(view.el.textContent).toContain(copy.attachmentFailed);expect(create).not.toHaveBeenCalled();
  view.unmount();create.mockRestore();
});
