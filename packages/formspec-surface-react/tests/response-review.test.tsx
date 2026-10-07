/** @filedesc Frozen Response review values, locale identity, and authorized preview lifecycle. */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi } from "vitest";
import {
  ResponseReview,
  createResponseReviewWidget,
  responseReviewHash,
} from "../src/widgets/response-review.js";
import type { SurfaceWidgetProps } from "../src/widget-api.js";

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
        responseHash: await responseReviewHash(response),
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
  d.presentation.responseHash = await responseReviewHash(d.response);
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
    d.presentation.responseHash = await responseReviewHash(d.response);
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
    d.presentation.responseHash = await responseReviewHash(d.response);
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
      d.presentation.responseHash = await responseReviewHash(d.response);
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
  expect(shape.actionOutputs).toEqual([]);
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
