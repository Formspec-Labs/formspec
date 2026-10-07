/** @filedesc Lossless frozen Response review with qualified labels and owned attachment previews. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import canonicalize from "canonicalize";
import {
  snapshotFiniteJson,
  type FiniteJsonValue,
} from "@formspec-org/surface";
import type { FormDefinition, FormResponse } from "@formspec-org/types";
import { Heading, nextLevel } from "../heading.js";
import type { SurfaceWidget, SurfaceWidgetProps } from "../widget-api.js";
import { WidgetEmptyState } from "./empty-state.js";

export const RESPONSE_REVIEW_COPY_KEYS = [
  "heading",
  "pending",
  "beforeSign",
  "beforeSubmit",
  "responseId",
  "draftVersion",
  "locale",
  "signatures",
  "additionalAnswers",
  "emptyString",
  "nullValue",
  "trueValue",
  "falseValue",
  "emptyArray",
  "emptyObject",
  "attachmentPending",
  "attachmentUnavailable",
  "attachmentFailed",
  "attachmentPreview",
  "attachmentDetails",
  "retry",
  "unavailable",
] as const;
export type ResponseReviewCopy = Readonly<
  Record<(typeof RESPONSE_REVIEW_COPY_KEYS)[number], string>
>;
export interface ResponseReviewPresentation {
  responseHash: string;
  definitionUrl: string;
  definitionVersion: string;
  locale: string;
  actorRef: string;
  draft: { id: string; version: number };
  phase: "before-sign" | "before-submit";
  /** Captured public field/group metadata for this exact snapshot, never live engine values. */
  fields: Readonly<
    Record<
      string,
      { label: string; options?: readonly { value: string; label: string }[] }
    >
  >;
}
export interface ResponseReviewData {
  definition: FormDefinition;
  response: FormResponse;
  presentation: ResponseReviewPresentation;
}
export interface ResponseReviewState {
  status: "pending" | "ready" | "unavailable";
  responseHash: string;
  /** Hash of all captured Definition, Response and presentation inputs. Absent until admitted. */
  contextIdentity?: string;
  actorRef: string;
  draft: Readonly<{ id: string; version: number }>;
  locale: string;
  phase: ResponseReviewPresentation["phase"];
}
export interface ResponseReviewAttachmentRequest extends ResponseReviewData {
  path: string;
  descriptor: FiniteJsonValue;
}
export interface ResponseReviewOptions {
  /** Inject the maintained integrity-canonical handoff producer; no raw-JCS fallback. */
  canonicalResponseHandoffBytes?: (
    response: unknown
  ) => Uint8Array<ArrayBuffer>;
  /** Host checks private ownership/authorization and returns the exact descriptor's bytes. */
  readAttachment?: (
    request: ResponseReviewAttachmentRequest,
    options: { signal: AbortSignal }
  ) => Promise<Blob>;
  /** Presentation availability only; does not establish human review or signing authority. */
  onReviewState?: (state: ResponseReviewState) => void;
}
export interface ResponseReviewProps
  extends SurfaceWidgetProps,
    ResponseReviewOptions {}

type Obj = Record<string, unknown>;
const object = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const own = (v: Obj, key: string) =>
  Object.prototype.hasOwnProperty.call(v, key);
const hash = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

/** Full RFC 8785 JCS/SHA-256 identity. This is not an authored-signature profile or crypto verification. */
export async function responseReviewHash(value: unknown): Promise<string> {
  const snapshot = snapshotFiniteJson(value);
  assertUnicode(snapshot);
  const bytes = new TextEncoder().encode(canonicalize(snapshot)!);
  return sha256(bytes);
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

/** Bare SHA-256 hex of the complete Response under the maintained handoff profile. */
export async function responseReviewHandoffHash(
  response: unknown,
  produce: ResponseReviewOptions["canonicalResponseHandoffBytes"]
): Promise<string> {
  if (!produce) throw Error("Response handoff byte producer unavailable");
  const snapshot = snapshotFiniteJson(response);
  assertUnicode(snapshot);
  const bytes = produce(snapshot);
  if (!(bytes instanceof Uint8Array) || bytes.length === 0)
    throw Error("Invalid Response handoff bytes");
  return sha256(new Uint8Array(bytes));
}

// Reuse SigningContent's scalar admission rule: check Unicode, never normalize it.
function assertUnicode(value: FiniteJsonValue): void {
  if (typeof value === "string") {
    if (
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
        value
      )
    )
      throw Error("Invalid Unicode in review identity");
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      assertUnicode(key);
      assertUnicode(child);
    }
  }
}

type ReviewNode =
  | {
      kind: "value";
      path: string;
      label: string;
      value: FiniteJsonValue;
      attachment: boolean;
      options?: readonly { value: string; label: string }[];
    }
  | { kind: "group"; path: string; label: string; children: ReviewNode[] };
type Capture = {
  headingLevel: SurfaceWidgetProps["headingLevel"];
  data: ResponseReviewData;
  copy: ResponseReviewCopy;
  nodes: ReviewNode[];
  attachments: string[];
  identity: string;
};

function capture(props: SurfaceWidgetProps): Capture | undefined {
  try {
    // Reject accessors/cycles before reading values; detach everything the display can consume.
    const data = snapshotFiniteJson(
      props.data
    ) as unknown as ResponseReviewData;
    const config = snapshotFiniteJson(props.config) as unknown as Obj;
    const { definition: d, response: r, presentation: p } = data;
    if (
      !object(d) ||
      d.$formspec !== "1.0" ||
      !text(d.url) ||
      !text(d.version) ||
      !Array.isArray(d.items) ||
      !object(r) ||
      r.$formspecResponse !== "1.0" ||
      !text(r.id) ||
      !object(r.data) ||
      !["in-progress", "completed", "amended"].includes(r.status) ||
      !object(p) ||
      d.url !== r.definitionUrl ||
      d.version !== r.definitionVersion ||
      p.definitionUrl !== d.url ||
      p.definitionVersion !== d.version ||
      !hash(p.responseHash) ||
      !text(p.locale) ||
      !text(p.actorRef) ||
      !object(p.draft) ||
      !text(p.draft.id) ||
      !Number.isSafeInteger(p.draft.version) ||
      p.draft.version < 0 ||
      !object(p.fields) ||
      !["before-sign", "before-submit"].includes(p.phase) ||
      !object(r.displayedLocale) ||
      r.displayedLocale.locale !== p.locale ||
      (p.phase === "before-submit" &&
        (!Array.isArray(r.authoredSignatures) ||
          r.authoredSignatures.length === 0))
    )
      return undefined;
    for (const m of Object.values(p.fields)) {
      if (
        !object(m) ||
        !text(m.label) ||
        (m.options !== undefined &&
          (!Array.isArray(m.options) ||
            m.options.some(
              (o) => !object(o) || !text(o.value) || !text(o.label)
            )))
      )
        return undefined;
    }
    if (!object(config.copy)) return undefined;
    const locales = Object.keys(config.copy).filter(
      (k) => k.toLowerCase() === p.locale.toLowerCase()
    );
    if (locales.length !== 1) return undefined;
    const c = config.copy[locales[0]!];
    if (!object(c) || !RESPONSE_REVIEW_COPY_KEYS.every((k) => text(c[k])))
      return undefined;
    const copy = c as unknown as ResponseReviewCopy;
    const attachments: string[] = [];
    const nodes = walk(
      d.items as unknown as Obj[],
      r.data as Obj,
      "",
      p,
      copy,
      attachments
    );
    return {
      headingLevel: props.headingLevel,
      data,
      copy,
      nodes,
      attachments,
      identity: canonicalize({
        data,
        config,
        headingLevel: props.headingLevel,
      })!,
    };
  } catch {
    return undefined;
  }
}

function walk(
  items: Obj[],
  values: Obj,
  prefix: string,
  p: ResponseReviewPresentation,
  copy: ResponseReviewCopy,
  attachments: string[]
): ReviewNode[] {
  const nodes: ReviewNode[] = [];
  const consumed = new Set<string>();
  const keys = new Set<string>();
  for (const item of items) {
    if (
      !object(item) ||
      !text(item.key) ||
      keys.has(item.key) ||
      !["group", "field", "display"].includes(String(item.type))
    )
      throw Error("Invalid Definition item");
    keys.add(item.key);
    if (!own(values, item.key)) continue;
    const path = prefix ? `${prefix}.${item.key}` : item.key;
    const value = values[item.key] as FiniteJsonValue;
    const metadata = own(p.fields as unknown as Obj, path)
      ? p.fields[path]
      : undefined;
    if (!metadata) throw Error("Missing captured label");
    consumed.add(item.key);
    if (item.type === "group" && Array.isArray(item.children)) {
      if (
        Array.isArray(value) &&
        item.repeatable === true &&
        value.every(object)
      ) {
        nodes.push({
          kind: "group",
          path,
          label: metadata.label,
          children: value.map((row, i) => ({
            kind: "group",
            path: `${path}[${i}]`,
            label: `${metadata.label} ${i + 1}`,
            children: walk(
              item.children as Obj[],
              row as Obj,
              `${path}[${i}]`,
              p,
              copy,
              attachments
            ),
          })),
        });
        // An empty repeated group is still a recorded value.
        if (!value.length)
          nodes.push({
            kind: "value",
            path: `${path}:empty`,
            label: metadata.label,
            value: value as unknown as FiniteJsonValue,
            attachment: false,
          });
      } else if (object(value) && item.repeatable !== true) {
        const children = walk(
          item.children as Obj[],
          value,
          path,
          p,
          copy,
          attachments
        );
        nodes.push(
          children.length
            ? { kind: "group", path, label: metadata.label, children }
            : {
                kind: "value",
                path,
                label: metadata.label,
                value,
                attachment: false,
              }
        );
      } else
        nodes.push({
          kind: "value",
          path,
          label: metadata.label,
          value,
          attachment: false,
        });
    } else {
      const attachment = item.dataType === "attachment";
      if (attachment)
        attachments.push(
          ...(Array.isArray(value) && value.length
            ? value.map((_, i) => `${path}[${i}]`)
            : [path])
        );
      nodes.push({
        kind: "value",
        path,
        label: metadata.label,
        value,
        attachment,
        ...(metadata.options ? { options: metadata.options } : {}),
      });
    }
  }
  for (const key of Object.keys(values))
    if (!consumed.has(key)) {
      const path = prefix ? `${prefix}.${key}` : key;
      nodes.push({
        kind: "value",
        path,
        label: `${copy.additionalAnswers}: ${JSON.stringify(key)}`,
        value: values[key] as FiniteJsonValue,
        attachment: false,
      });
    }
  return nodes;
}

function Value({
  node,
  copy,
}: {
  node: Extract<ReviewNode, { kind: "value" }>;
  copy: ResponseReviewCopy;
}) {
  const v = node.value;
  if (v === null) return <>{copy.nullValue}</>;
  if (typeof v === "boolean")
    return <>{v ? copy.trueValue : copy.falseValue}</>;
  if (v === "") return <>{copy.emptyString}</>;
  if (Array.isArray(v) && !v.length) return <>{copy.emptyArray}</>;
  if (object(v) && !Object.keys(v).length) return <>{copy.emptyObject}</>;
  if (typeof v === "string") {
    const option = node.options?.filter((o) => o.value === v);
    return (
      <>
        {option?.length === 1 ? (
          <>
            {option[0]!.label}{" "}
            <span className="fs-response-review-code">({v})</span>
          </>
        ) : (
          v
        )}
      </>
    );
  }
  if (Array.isArray(v) && node.options)
    return (
      <>
        <ul>
          {v.map((entry, i) => {
            const option = node.options?.filter((o) => o.value === entry);
            return (
              <li key={i}>
                {option?.length === 1
                  ? `${option[0]!.label} (${String(entry)})`
                  : JSON.stringify(entry)}
              </li>
            );
          })}
        </ul>
        <pre className="fs-response-review-json">
          {JSON.stringify(v, null, 2)}
        </pre>
      </>
    );
  // JSON preserves all keys, values, array order and scalar types without string coercion.
  return (
    <pre className="fs-response-review-json">{JSON.stringify(v, null, 2)}</pre>
  );
}

type PreviewStatus = "pending" | "ready" | "unavailable";
const raster = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
function byteMedia(bytes: Uint8Array): string | undefined {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return undefined;
}
async function verifiedPreview(blob: Blob, descriptor: unknown): Promise<void> {
  if (!object(descriptor)) throw Error("Descriptor missing");
  const mime = descriptor.contentType ?? descriptor.mimeType;
  if (
    !text(mime) ||
    !raster.has(mime) ||
    (descriptor.contentType !== undefined &&
      descriptor.mimeType !== undefined &&
      descriptor.contentType !== descriptor.mimeType) ||
    !Number.isSafeInteger(descriptor.size) ||
    (descriptor.size as number) < 0 ||
    blob.size !== descriptor.size ||
    typeof descriptor.hash !== "string" ||
    !/^sha256:[a-f0-9]{64}$/.test(descriptor.hash) ||
    blob.type !== mime
  )
    throw Error("Unqualified attachment");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (byteMedia(bytes) !== mime) throw Error("Media does not match bytes");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
  if (`sha256:${hex}` !== descriptor.hash) throw Error("Digest mismatch");
}

function Attachment({
  capture: c,
  node,
  read,
  onStatus,
}: {
  capture: Capture;
  node: Extract<ReviewNode, { kind: "value" }>;
  read: ResponseReviewOptions["readAttachment"];
  onStatus: (path: string, status: PreviewStatus) => void;
}) {
  const descriptors = Array.isArray(node.value) ? node.value : [node.value];
  useEffect(() => {
    if (!descriptors.length) onStatus(node.path, "unavailable");
  }, [node.path, descriptors.length, onStatus]);
  return (
    <>
      {!descriptors.length ? (
        <p role="status">{c.copy.attachmentUnavailable}</p>
      ) : null}
      {descriptors.map((descriptor, i) => (
        <AttachmentPreview
          key={i}
          capture={c}
          descriptor={descriptor}
          path={Array.isArray(node.value) ? `${node.path}[${i}]` : node.path}
          label={node.label}
          read={read}
          onStatus={onStatus}
        />
      ))}
      <details>
        <summary>{c.copy.attachmentDetails}</summary>
        <Value node={node} copy={c.copy} />
      </details>
    </>
  );
}
function AttachmentPreview({
  capture: c,
  descriptor,
  path,
  label,
  read,
  onStatus,
}: {
  capture: Capture;
  descriptor: FiniteJsonValue;
  path: string;
  label: string;
  read: ResponseReviewOptions["readAttachment"];
  onStatus: (path: string, status: PreviewStatus) => void;
}) {
  const [view, setView] = useState<{
    url?: string;
    state: "pending" | "loaded" | "ready" | "failed" | "unavailable";
  }>({ state: "pending" });
  const activeUrl = useRef<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let url: string | undefined;
    setView({ state: read ? "pending" : "unavailable" });
    onStatus(path, read ? "pending" : "unavailable");
    if (read)
      void (async () => {
        try {
          const blob = await read(
            { ...c.data, path, descriptor },
            { signal: controller.signal }
          );
          if (!active) return;
          await verifiedPreview(blob, descriptor);
          if (!active) return;
          url = URL.createObjectURL(blob);
          activeUrl.current = url;
          setView({ state: "loaded", url });
        } catch {
          if (active) {
            setView({ state: "failed" });
            onStatus(path, "unavailable");
          }
        }
      })();
    return () => {
      active = false;
      activeUrl.current = undefined;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [c.identity, descriptor, path, read, onStatus, attempt]);
  return (
    <figure className="fs-response-review-attachment">
      {view.url ? (
        <img
          src={view.url}
          alt={`${c.copy.attachmentPreview}: ${label}`}
          onLoad={() => {
            if (!view.url || activeUrl.current !== view.url) return;
            setView((v) => ({ ...v, state: "ready" }));
            onStatus(path, "ready");
          }}
          onError={() => {
            if (!view.url || activeUrl.current !== view.url) return;
            setView((v) => ({ ...v, state: "failed" }));
            onStatus(path, "unavailable");
          }}
        />
      ) : null}
      {read && view.state === "failed" ? (
        <button type="button" onClick={() => setAttempt((n) => n + 1)}>
          {c.copy.retry}
        </button>
      ) : null}
      {view.state !== "ready" ? (
        <figcaption role="status">
          {view.state === "failed"
            ? c.copy.attachmentFailed
            : view.state === "unavailable"
            ? c.copy.attachmentUnavailable
            : c.copy.attachmentPending}
        </figcaption>
      ) : null}
    </figure>
  );
}

function ReviewBody({
  capture: c,
  options,
}: {
  capture: Capture;
  options: ResponseReviewOptions;
}) {
  const [admitted, setAdmitted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [identity, setIdentity] = useState<string>();
  const [previews, setPreviews] = useState<Record<string, PreviewStatus>>({});
  const { presentation: p, response: r } = c.data;
  const report = useCallback(
    (status: ResponseReviewState["status"], contextIdentity?: string) =>
      options.onReviewState?.({
        status,
        responseHash: p.responseHash,
        actorRef: p.actorRef,
        draft: p.draft,
        locale: p.locale,
        phase: p.phase,
        ...(contextIdentity ? { contextIdentity } : {}),
      }),
    [options.onReviewState, p]
  );
  const onStatus = useCallback(
    (path: string, status: PreviewStatus) =>
      setPreviews((previous) => ({ ...previous, [path]: status })),
    []
  );
  useEffect(() => {
    let active = true;
    report("pending");
    void Promise.all([
      responseReviewHandoffHash(r, options.canonicalResponseHandoffBytes),
      responseReviewHash(c.data),
    ])
      .then(([actual, id]) => {
        if (!active) return;
        if (actual !== p.responseHash) {
          setFailed(true);
          report("unavailable");
          return;
        }
        setIdentity(id);
        setAdmitted(true);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          report("unavailable");
        }
      });
    return () => {
      active = false;
      report("unavailable");
    };
  }, [c.identity, report]);
  useEffect(() => {
    if (!admitted || !identity) return;
    const statuses = c.attachments.map((path) => previews[path] ?? "pending");
    report(
      statuses.includes("unavailable")
        ? "unavailable"
        : statuses.includes("pending")
        ? "pending"
        : "ready",
      identity
    );
  }, [admitted, identity, previews, report, c]);
  if (!admitted)
    return (
      <WidgetEmptyState>
        {failed ? c.copy.unavailable : c.copy.pending}
      </WidgetEmptyState>
    );
  const render = (
    nodes: ReviewNode[],
    level: SurfaceWidgetProps["headingLevel"]
  ): ReactNode =>
    nodes.map((node) =>
      node.kind === "group" ? (
        <section key={node.path} className="fs-response-review-group">
          <Heading level={level}>{node.label}</Heading>
          {render(node.children, nextLevel(level))}
        </section>
      ) : (
        <dl
          key={node.path}
          className="fs-response-review-row"
          data-response-path={node.path}
        >
          <dt>{node.label}</dt>
          <dd>
            {node.attachment ? (
              <Attachment
                capture={c}
                node={node}
                read={options.readAttachment}
                onStatus={onStatus}
              />
            ) : (
              <Value node={node} copy={c.copy} />
            )}
          </dd>
        </dl>
      )
    );
  return (
    <section
      className="fs-response-review"
      aria-label={c.copy.heading}
      lang={p.locale}
    >
      <Heading level={c.headingLevel}>{c.copy.heading}</Heading>
      <p className="fs-response-review-intro">
        {p.phase === "before-sign" ? c.copy.beforeSign : c.copy.beforeSubmit}
      </p>
      <dl className="fs-response-review-context">
        <div>
          <dt>{c.copy.responseId}</dt>
          <dd>{r.id}</dd>
        </div>
        <div>
          <dt>{c.copy.draftVersion}</dt>
          <dd>{p.draft.version}</dd>
        </div>
        <div>
          <dt>{c.copy.locale}</dt>
          <dd>{p.locale}</dd>
        </div>
        <div>
          <dt>{c.copy.signatures}</dt>
          <dd>{r.authoredSignatures?.length ?? 0}</dd>
        </div>
      </dl>
      {render(c.nodes, nextLevel(c.headingLevel))}
    </section>
  );
}
function unavailableCopy(props: SurfaceWidgetProps): string | undefined {
  try {
    const input = snapshotFiniteJson({
      data: props.data,
      config: props.config,
    }) as unknown as { data: Obj; config: Obj };
    const p = input.data.presentation;
    const copies = input.config.copy;
    if (!object(p) || !text(p.locale) || !object(copies)) return undefined;
    const matches = Object.keys(copies).filter(
      (k) => k.toLowerCase() === String(p.locale).toLowerCase()
    );
    const copy = matches.length === 1 ? copies[matches[0]!] : undefined;
    return object(copy) && text(copy.unavailable)
      ? copy.unavailable
      : undefined;
  } catch {
    return undefined;
  }
}

let nextReviewGeneration = 0;
export function ResponseReview(props: ResponseReviewProps) {
  const c = capture(props);
  // Stable detached capture prevents a new snapshot object from restarting every preview render.
  const stable = useMemo(() => c, [c?.identity]);
  const generation = useMemo(
    () => ++nextReviewGeneration,
    [
      c?.identity,
      props.readAttachment,
      props.onReviewState,
      props.canonicalResponseHandoffBytes,
    ]
  );
  if (!stable)
    return <WidgetEmptyState>{unavailableCopy(props)}</WidgetEmptyState>;
  return (
    <ReviewBody
      key={generation}
      capture={stable}
      options={{
        ...(props.canonicalResponseHandoffBytes
          ? {
              canonicalResponseHandoffBytes:
                props.canonicalResponseHandoffBytes,
            }
          : {}),
        ...(props.readAttachment
          ? { readAttachment: props.readAttachment }
          : {}),
        ...(props.onReviewState ? { onReviewState: props.onReviewState } : {}),
      }}
    />
  );
}
export function createResponseReviewWidget(
  options: ResponseReviewOptions = {}
): SurfaceWidget {
  return (props) => <ResponseReview {...props} {...options} />;
}
export const RESPONSE_REVIEW_DELIVERY_CONTRACT_ID =
  "@formspec-org/surface-react/ResponseReview@0.1";
export const RESPONSE_REVIEW_RENDERED_CONFIG_NODES = [
  { pointerPattern: "", kind: "response-review" },
  { pointerPattern: "/copy/*", kind: "response-review-copy" },
] as const;
export const RESPONSE_REVIEW_CONFIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["copy"],
  properties: {
    copy: {
      type: "object",
      minProperties: 1,
      propertyNames: { pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$" },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: RESPONSE_REVIEW_COPY_KEYS,
        properties: {
          ...Object.fromEntries(
            RESPONSE_REVIEW_COPY_KEYS.map((k) => [
              k,
              { type: "string", minLength: 1 },
            ])
          ),
          "x-generation": { type: "object" },
        },
      },
    },
    "x-generation": { type: "object" },
  },
} as const;
export const RESPONSE_REVIEW_WIDGET_SHAPE = {
  widgetName: "ResponseReview",
  props: RESPONSE_REVIEW_CONFIG_SCHEMA,
  dataInputs: ["definition", "response", "presentation"].map((name) => ({
    name,
    required: true,
  })),
  childrenPolicy: "none",
  deliveryContractId: RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
  renderedConfigNodes: RESPONSE_REVIEW_RENDERED_CONFIG_NODES,
} as const;

/** Schema for the separately qualified presentation input; not renderer-selected authority. */
export const RESPONSE_REVIEW_PRESENTATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "responseHash",
    "definitionUrl",
    "definitionVersion",
    "locale",
    "actorRef",
    "draft",
    "phase",
    "fields",
  ],
  properties: {
    responseHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    definitionUrl: { type: "string", minLength: 1 },
    definitionVersion: { type: "string", minLength: 1 },
    locale: { type: "string", minLength: 1 },
    actorRef: { type: "string", minLength: 1 },
    draft: {
      type: "object",
      additionalProperties: false,
      required: ["id", "version"],
      properties: {
        id: { type: "string", minLength: 1 },
        version: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
    },
    phase: { enum: ["before-sign", "before-submit"] },
    fields: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          label: { type: "string", minLength: 1 },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["value", "label"],
              properties: {
                value: { type: "string", minLength: 1 },
                label: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Presentation availability only; ready must identify the complete captured input set. */
export const RESPONSE_REVIEW_STATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "responseHash", "actorRef", "draft", "locale", "phase"],
  properties: {
    status: { enum: ["pending", "ready", "unavailable"] },
    contextIdentity: { type: "string", pattern: "^[a-f0-9]{64}$" },
    responseHash: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.responseHash,
    actorRef: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.actorRef,
    draft: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.draft,
    locale: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.locale,
    phase: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.phase,
  },
  allOf: [
    {
      if: { properties: { status: { const: "ready" } }, required: ["status"] },
      then: { required: ["contextIdentity"] },
    },
  ],
} as const;
