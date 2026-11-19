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
import type { Explanation } from "@formspec-org/types";
import { isQualifiedDraftReview } from '../internal/draft-review-qualification.js';
import {
  canonicalFiniteJson,
  snapshotFiniteJson,
  type FiniteJsonValue,
} from "@formspec-org/surface";
import { Heading, nextLevel } from "../heading.js";
import type { SurfaceWidget, SurfaceWidgetProps } from "../widget-api.js";
import { WidgetEmptyState } from "./empty-state.js";

import {
  RESPONSE_REVIEW_COPY_KEYS,
  ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA,
  ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA,
  ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011,
  ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011,
  type ResponseReviewCopy,
  type ResponseReviewPresentationInput as ResponseReviewPresentation,
  type ResponseReviewInput as ResponseReviewData,
  type ResponseReviewAttachmentRequest,
  type AcceptedResponseReviewAttachmentInput,
  type ResponseReviewState,
  type ResponseReviewOptions,
  type ResponseReviewProps,
} from './response-review-metadata.js';
export * from './response-review-metadata.js';
import { createAcceptedReviewFieldSelection, resolveAcceptedResponseReviewFieldSelection, type AcceptedReviewFieldSelection, type AcceptedResponseReviewFieldSelectionPolicy } from './response-review-selection.js';

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
      dataType?: string;
      currency?: string;
      prefix?: string;
      suffix?: string;
      precision?: number;
      calculatedReadonly?: boolean;
    }
  | { kind: "group"; path: string; label: string; children: ReviewNode[] };

type BindHint = {
  readonly?: boolean;
  calculate?: boolean;
};

function collectBindHints(definition: Obj): Map<string, BindHint> {
  const hints = new Map<string, BindHint>();
  const binds = definition.binds;
  if (!Array.isArray(binds)) return hints;
  for (const bind of binds) {
    if (!object(bind) || !text(bind.path)) continue;
    const isReadonly = bind.readonly !== undefined && bind.readonly !== false && bind.readonly !== "false";
    const isCalculate = bind.calculate !== undefined && bind.calculate !== "";
    if (!isReadonly && !isCalculate) continue;
    const prev = hints.get(bind.path);
    hints.set(bind.path, {
      readonly: Boolean(prev?.readonly || isReadonly),
      calculate: Boolean(prev?.calculate || isCalculate),
    });
  }
  return hints;
}

function isMoneyObject(value: unknown): value is { amount: string | number; currency: string } {
  if (!object(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !own(value, "amount") || !own(value, "currency")) return false;
  const { amount, currency } = value;
  const validAmount =
    (typeof amount === "number" && Number.isFinite(amount)) ||
    (typeof amount === "string" && amount.trim().length > 0 && Number.isFinite(Number(amount.trim())));
  return validAmount && typeof currency === "string" && /^[A-Z]{3}$/.test(currency);
}

function formatMoneyValue(amount: string | number, currency: string, locale: string): string {
  const raw = typeof amount === "number" ? amount : Number(amount.trim());
  if (!Number.isFinite(raw)) return `${currency} ${String(amount)}`;
  const hasFraction = !Number.isInteger(raw);
  try {
    return new Intl.NumberFormat(locale || "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(raw);
  } catch {
    return `${currency} ${raw.toLocaleString(locale || "en-US")}`;
  }
}

function formatDateValue(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    return value;
  }
  if (!locale || /^en\b/i.test(locale)) {
    return `${month}/${day}/${year}`;
  }
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(parsed);
  } catch {
    return `${month}/${day}/${year}`;
  }
}

function formatNumericValue(
  value: number,
  node: Extract<ReviewNode, { kind: "value" }>,
  locale: string
): string {
  if (node.currency || node.prefix === "$") {
    return formatMoneyValue(value, node.currency ?? "USD", locale);
  }
  const effectiveLocale = locale || "en-US";
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(effectiveLocale, {
      maximumFractionDigits: node.precision ?? 4,
    }).format(value);
  } catch {
    formatted = String(value);
  }
  const inferredPercent =
    !node.suffix &&
    node.dataType === "decimal" &&
    /(?:\(%|\bpercentage\b|%)/i.test(node.label);
  const suffix = node.suffix ?? (inferredPercent ? "%" : undefined);
  const prefix = node.prefix ?? "";
  if (suffix) {
    const glue = suffix === "%" || suffix.startsWith(" ") ? "" : " ";
    return `${prefix}${formatted}${glue}${suffix}`;
  }
  return `${prefix}${formatted}`;
}

function isEmptyReviewValue(value: FiniteJsonValue): boolean {
  return (
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0) ||
    (object(value) && Object.keys(value).length === 0)
  );
}

function filterEmptyReviewNodes(nodes: readonly ReviewNode[]): {
  answered: ReviewNode[];
  unansweredCount: number;
  hasConcreteAnswer: boolean;
} {
  let unansweredCount = 0;
  let hasConcreteAnswer = false;
  const pendingCalculated: ReviewNode[] = [];
  const entries: Array<{ node: ReviewNode; calculatedEmpty?: boolean }> = [];

  for (const node of nodes) {
    if (node.kind === "value") {
      if (isEmptyReviewValue(node.value)) {
        if (node.calculatedReadonly) {
          pendingCalculated.push(node);
          entries.push({ node, calculatedEmpty: true });
        } else {
          unansweredCount += 1;
        }
      } else {
        hasConcreteAnswer = true;
        entries.push({ node });
      }
    } else {
      const childResult = filterEmptyReviewNodes(node.children);
      unansweredCount += childResult.unansweredCount;
      if (childResult.hasConcreteAnswer && childResult.answered.length > 0) {
        hasConcreteAnswer = true;
        entries.push({ node: { ...node, children: childResult.answered } });
      }
    }
  }

  if (!hasConcreteAnswer) {
    unansweredCount += pendingCalculated.length;
    return { answered: [], unansweredCount, hasConcreteAnswer: false };
  }
  return {
    answered: entries.map((entry) => entry.node),
    unansweredCount,
    hasConcreteAnswer: true,
  };
}
type Capture = {
  headingLevel: SurfaceWidgetProps["headingLevel"];
  data: ResponseReviewData;
  copy: ResponseReviewCopy & { acceptedRecord?: string };
  nodes: ReviewNode[];
  explanations: Explanation[];
  attachments: string[];
  identity: string;
};

function capture(props: SurfaceWidgetProps, acceptedSelectionProfile?: 'legacy' | 'selected'): Capture | undefined {
  try {
    // Reject accessors/cycles before reading values; detach everything the display can consume.
    const dataSnapshot = snapshotFiniteJson(props.data);
    const configSnapshot = snapshotFiniteJson(props.config);
    const data = dataSnapshot as unknown as ResponseReviewData;
    const config = configSnapshot as unknown as Obj;
    const { definition: d, response: r, presentation: p } = data;
    const acceptedAlias = props.widgetName === "AcceptedResponseReview" || props.widgetName === "x-accepted-response-review";
    if (!object(p) || acceptedAlias !== (p.phase === "accepted-record")) return undefined;
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
      !text(p.locale) ||
      !object(p.fields)
    )
      return undefined;
    if (p.phase === 'draft-review') {
      if (!isQualifiedDraftReview(props.data) || !['in-progress', 'completed', 'amended'].includes(r.status) || !text(p.revision)) return undefined;
    } else if (
      !['before-sign', 'before-submit', 'accepted-record'].includes(p.phase) ||
      p.definitionUrl !== d.url || p.definitionVersion !== d.version || !hash(p.responseHash) ||
      !object(r.displayedLocale) || r.displayedLocale.locale !== p.locale ||
      (p.phase === 'before-submit' && (!Array.isArray(r.authoredSignatures) || r.authoredSignatures.length === 0))
    ) return undefined;
    const selected = own(config, 'fieldSelection');
    if ((acceptedSelectionProfile === 'selected' && !selected) ||
      (acceptedSelectionProfile === 'legacy' && selected)) return undefined;
    let selection: AcceptedReviewFieldSelection | undefined;
    let permittedPaths: Set<string> | undefined;
    if (selected) {
      if (p.phase !== 'accepted-record' || !own(p, 'fieldSelection')) return undefined;
      const policy = config.fieldSelection as unknown as AcceptedResponseReviewFieldSelectionPolicy;
      const expected = resolveAcceptedResponseReviewFieldSelection(d, r, policy);
      if (canonicalize(expected) !== canonicalize((p as unknown as Obj).fieldSelection)) return undefined;
      permittedPaths = new Set(expected.permittedPaths);
      selection = createAcceptedReviewFieldSelection(d.items, policy.fieldPaths);
    } else if (own(p, 'fieldSelection')) return undefined;
    if (p.phase === "accepted-record") {
      const task = own(p, "taskSign");
      const schema = selected
        ? (task ? ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011 : ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA_V011)
        : (task ? ACCEPTED_TASK_RESPONSE_REVIEW_PRESENTATION_SCHEMA : ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA);
      if (Object.keys(p).some(key => !own(schema.properties, key))) return undefined;
      if (task) {
        if (!object(p.taskSign) || Object.keys(p.taskSign).some(key => key !== "recordRef" && key !== "recordHash") ||
          typeof p.taskSign.recordHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(p.taskSign.recordHash) ||
          p.taskSign.recordRef !== `urn:formspec:task-draft-sign:${p.taskSign.recordHash}` ||
          !Array.isArray(r.authoredSignatures) || r.authoredSignatures.length === 0) return undefined;
      } else if (!text(p.handoffId)) return undefined;
    } else if (p.phase !== 'draft-review' && (
      !text(p.actorRef) || !object(p.draft) || !text(p.draft.id) ||
      !Number.isSafeInteger(p.draft.version) || p.draft.version < 0 || (own(p, "handoffId") || own(p, "taskSign"))
    )) return undefined;
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
    if (p.phase === "accepted-record" && !text(c.acceptedRecord)) return undefined;
    const copy = c as unknown as ResponseReviewCopy & { acceptedRecord?: string };
    const attachments: string[] = [];
    const bindHints = collectBindHints(d as unknown as Obj);
    const nodes = walk(
      d.items as unknown as Obj[],
      r.data as Obj,
      "",
      p,
      copy,
      attachments,
      selection,
      bindHints
    );
    const explanations = p.phase === 'accepted-record' ? (r.explanations ?? []).filter(entry => {
      if (!object(entry) || !object(entry.author) || !text(entry.author.id) || !text(entry.recorded) ||
          (entry.author.name !== undefined && typeof entry.author.name !== 'string')) {
        throw Error("Invalid recorded explanation stamp");
      }
      let paths: string[];
      if ('group' in entry) {
        if (entry.group !== true || !text(entry.code) || !Array.isArray(entry.paths) ||
            !entry.paths.length || !entry.paths.every(text) ||
            (entry.partyRef !== undefined && !text(entry.partyRef))) throw Error("Invalid acknowledgement");
        paths = entry.paths;
      } else {
        if (!text(entry.shapeId) || !text(entry.path) ||
            (entry.text !== undefined && typeof entry.text !== 'string')) throw Error("Invalid explanation");
        paths = [entry.path];
      }
      if (selection) {
        const authorized = paths.every(path => {
          if (path === '#' || path.includes('*')) return false;
          if (permittedPaths!.has(path)) return true;
          try { return selection.includes(path); } catch { return false; }
        });
        if (!authorized) return false;
      }
      if (!paths.every(path => path === '#' || own(p.fields as unknown as Obj, path))) {
        throw Error("Missing recorded explanation label");
      }
      return true;
    }) : [];
    return {
      explanations,
      headingLevel: props.headingLevel,
      data,
      copy,
      nodes,
      attachments,
      identity: canonicalFiniteJson({ data: dataSnapshot, config: configSnapshot, headingLevel: props.headingLevel }),
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
  attachments: string[],
  selection?: AcceptedReviewFieldSelection,
  bindHints?: Map<string, BindHint>
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
    if (selection && !(item.type === 'field' && selection.includes(path)) &&
      !(item.type === 'group' && selection.contains(path))) continue;
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
          children: value.flatMap((row, i) => selection && !selection.contains(`${path}[${i}]`) ? [] : [{
            kind: "group" as const,
            path: `${path}[${i}]`,
            label: `${metadata.label} ${i + 1}`,
            children: walk(
              item.children as Obj[],
              row as Obj,
              `${path}[${i}]`,
              p,
              copy,
              attachments,
              selection,
              bindHints
            ),
          }]).filter(row => !selection || row.children.length > 0),
        });
        // An empty repeated group is still a recorded value.
        if (!value.length && !selection)
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
          attachments,
          selection,
          bindHints
        );
        if (selection && !children.length) continue;
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
      } else if (selection) throw Error("Invalid selected review group");
      else
        nodes.push({
          kind: "value",
          path,
          label: metadata.label,
          value,
          attachment: false,
        });
    } else {
      // Empty recorded values have no file to preview. Preserve their value
      // display without introducing an attachment readiness requirement.
      const empty = value === null || value === "" || (Array.isArray(value) && !value.length);
      const attachment = item.dataType === "attachment" && !empty;
      if (attachment)
        attachments.push(
          ...(Array.isArray(value) && value.length
            ? value.map((_, i) => `${path}[${i}]`)
            : [path])
        );
      const templatePath = path.replace(/\[\d+\]/g, "");
      const bindHint = bindHints?.get(path) ?? bindHints?.get(templatePath);
      const itemReadonly =
        item.readonly !== undefined && item.readonly !== false && item.readonly !== "false";
      const itemCalculate = item.calculate !== undefined && item.calculate !== "";
      const calculatedReadonly = Boolean(
        itemCalculate || bindHint?.calculate || (itemReadonly || bindHint?.readonly)
      );
      const presentationObj = object(item.presentation) ? item.presentation : undefined;
      const currency =
        text(item.currency)
          ? item.currency
          : presentationObj && text(presentationObj.currency)
            ? presentationObj.currency
            : undefined;
      const prefixText =
        text(item.prefix)
          ? item.prefix
          : presentationObj && text(presentationObj.prefix)
            ? presentationObj.prefix
            : undefined;
      const suffixText =
        text(item.suffix)
          ? item.suffix
          : presentationObj && text(presentationObj.suffix)
            ? presentationObj.suffix
            : presentationObj && text(presentationObj.unit)
              ? presentationObj.unit
              : text(item.unit)
                ? item.unit
                : undefined;
      const precision = typeof item.precision === "number" && Number.isInteger(item.precision) && item.precision >= 0
        ? item.precision
        : undefined;
      nodes.push({
        kind: "value",
        path,
        label: metadata.label,
        value,
        attachment,
        ...(metadata.options ? { options: metadata.options } : {}),
        ...(text(item.dataType) ? { dataType: item.dataType } : {}),
        ...(currency ? { currency } : {}),
        ...(prefixText ? { prefix: prefixText } : {}),
        ...(suffixText ? { suffix: suffixText } : {}),
        ...(precision !== undefined ? { precision } : {}),
        ...(calculatedReadonly ? { calculatedReadonly: true } : {}),
      });
    }
  }
  for (const key of Object.keys(values))
    if (!selection && !consumed.has(key)) {
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
  phase,
  locale,
}: {
  node: Extract<ReviewNode, { kind: "value" }>;
  copy: ResponseReviewCopy;
  phase?: ResponseReviewPresentation["phase"];
  locale?: string;
}) {
  const v = node.value;
  const isDraftReview = phase === "draft-review";
  if (v === null) {
    if (isDraftReview && node.calculatedReadonly) {
      return <span className="fs-response-review-calculated-empty">—</span>;
    }
    return <>{copy.nullValue}</>;
  }
  if (typeof v === "boolean")
    return <>{v ? copy.trueValue : copy.falseValue}</>;
  if (v === "") {
    if (isDraftReview && node.calculatedReadonly) {
      return <span className="fs-response-review-calculated-empty">—</span>;
    }
    return <>{copy.emptyString}</>;
  }
  if (Array.isArray(v) && !v.length) return <>{copy.emptyArray}</>;
  if (object(v) && !Object.keys(v).length) return <>{copy.emptyObject}</>;
  if (isMoneyObject(v)) {
    return (
      <span className="fs-response-review-number">
        {formatMoneyValue(v.amount, v.currency, locale ?? "en-US")}
      </span>
    );
  }
  if (typeof v === "number" && isDraftReview) {
    return (
      <span className="fs-response-review-number">
        {formatNumericValue(v, node, locale ?? "en-US")}
      </span>
    );
  }
  if (typeof v === "string") {
    const option = node.options?.filter((o) => o.value === v);
    if (option?.length === 1) {
      if (isDraftReview) return <>{option[0]!.label}</>;
      return (
        <>
          {option[0]!.label}{" "}
          <span className="fs-response-review-code">({v})</span>
        </>
      );
    }
    if (isDraftReview && node.dataType === "date") {
      return <>{formatDateValue(v, locale ?? "en-US")}</>;
    }
    return <>{v}</>;
  }
  if (Array.isArray(v) && node.options)
    return (
      <ul className="fs-response-review-list">
        {v.map((entry, i) => {
          const option = node.options?.filter((o) => o.value === entry);
          return (
            <li key={i}>
              {option?.length === 1
                ? isDraftReview
                  ? option[0]!.label
                  : `${option[0]!.label} (${String(entry)})`
                : isDraftReview && typeof entry === "string"
                  ? entry
                  : JSON.stringify(entry)}
            </li>
          );
        })}
      </ul>
    );
  // JSON preserves all keys, values, array order and scalar types without string coercion.
  return (
    <pre className="fs-response-review-json fs-surface-review__structured">{JSON.stringify(v, null, 2)}</pre>
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

type ReviewAttachmentRequest = ResponseReviewAttachmentRequest | AcceptedResponseReviewAttachmentInput;
type ReviewAttachmentReader = (request: ReviewAttachmentRequest, options: { signal: AbortSignal }) => Promise<Blob>;
function acceptedAttachment(request: ReviewAttachmentRequest): request is AcceptedResponseReviewAttachmentInput {
  return request.presentation.phase === "accepted-record";
}

function Attachment({
  capture: c,
  node,
  read,
  onStatus,
}: {
  capture: Capture;
  node: Extract<ReviewNode, { kind: "value" }>;
  read: ReviewAttachmentReader | undefined;
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
        <Value node={node} copy={c.copy} phase={c.data.presentation.phase} locale={c.data.presentation.locale} />
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
  read: ReviewAttachmentReader | undefined;
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
    if (read && c.data.presentation.phase !== 'draft-review') {
      const request = { ...c.data, path, descriptor } as ReviewAttachmentRequest;
      void (async () => {
        try {
          const blob = await read(
            request,
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
    }
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
  const { presentation: p, response: r } = c.data;
  const isDraftReview = p.phase === "draft-review";
  const [admitted, setAdmitted] = useState(isDraftReview);
  const [failed, setFailed] = useState(false);
  const [identity, setIdentity] = useState<string>();
  const [previews, setPreviews] = useState<Record<string, PreviewStatus>>({});
  const [showUnanswered, setShowUnanswered] = useState(false);
  const filtered = useMemo(
    () => (isDraftReview
      ? filterEmptyReviewNodes(c.nodes)
      : { answered: c.nodes, unansweredCount: 0, hasConcreteAnswer: true }),
    [isDraftReview, c.nodes]
  );
  const report = useCallback(
    (status: ResponseReviewState["status"], contextIdentity?: string) => {
      if (p.phase === 'draft-review') return;
      const common = { status, responseHash: p.responseHash, locale: p.locale,
        ...(contextIdentity ? { contextIdentity } : {}) };
      if (p.phase === "accepted-record") {
        options.onAcceptedReviewState?.(p.taskSign
          ? { ...common, phase: p.phase, taskSign: p.taskSign }
          : { ...common, phase: p.phase, handoffId: p.handoffId });
      } else {
        options.onReviewState?.({ ...common, phase: p.phase, actorRef: p.actorRef, draft: p.draft });
      }
    },
    [options.onReviewState, options.onAcceptedReviewState, p]
  );
  const readAttachment = useMemo<ReviewAttachmentReader | undefined>(() => {
    if (p.phase === 'draft-review') return undefined;
    if (p.phase === "accepted-record") {
      const read = options.readAcceptedAttachment;
      return read ? (request, context) => acceptedAttachment(request)
        ? read(request, context) : Promise.reject(Error("Review branch mismatch")) : undefined;
    }
    const read = options.readAttachment;
    return read ? (request, context) => !acceptedAttachment(request)
      ? read(request, context) : Promise.reject(Error("Review branch mismatch")) : undefined;
  }, [p.phase, options.readAttachment, options.readAcceptedAttachment]);
  const onStatus = useCallback(
    (path: string, status: PreviewStatus) =>
      setPreviews((previous) => ({ ...previous, [path]: status })),
    []
  );
  useEffect(() => {
    if (p.phase === 'draft-review') return;
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
  const instances = new Map<string, ReactNode[]>();
  const groups: ReactNode[] = [];
  for (const entry of c.explanations) {
    const stamp = <>{entry.author.name ?? entry.author.id} · <time dateTime={entry.recorded}>{entry.recorded}</time></>;
    if ('group' in entry) {
      const count = entry.paths.length;
      const summaryLabel = `${count} ${count === 1 ? 'question' : 'questions'} left unanswered (${entry.code})`;
      groups.push(<details key={JSON.stringify([entry.code, entry.partyRef])} data-explanation-code={entry.code}>
        <summary>{summaryLabel} — accepted by {entry.author.name ?? entry.author.id} at <time dateTime={entry.recorded}>{entry.recorded}</time></summary>
        <ul>{entry.paths.map(path => <li key={path}>{path === '#' ? c.copy.heading : p.fields[path]!.label}</li>)}</ul>
      </details>);
    } else {
      const notes = instances.get(entry.path) ?? [];
      notes.push(<p key={entry.shapeId}>{entry.text && <>{entry.text} · </>}{stamp}</p>);
      instances.set(entry.path, notes);
    }
  }
  function notesFor(path: string) {
    const notes = instances.get(path);
    instances.delete(path);
    return notes;
  }
  const displayedNodes = isDraftReview && !showUnanswered ? filtered.answered : c.nodes;
  const signatureCount = r.authoredSignatures?.length ?? 0;
  const showContext = !isDraftReview || signatureCount > 0;
  const showRecordDetails = !isDraftReview || (r.status !== "in-progress" && text(r.id));

  const render = (
    nodes: ReviewNode[],
    level: SurfaceWidgetProps["headingLevel"]
  ): ReactNode =>
    nodes.map((node) =>
      node.kind === "group" ? (
        <section key={node.path} className="fs-response-review-group">
          <Heading level={level}>{node.label}</Heading>
          {notesFor(node.path)}
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
                read={readAttachment}
                onStatus={onStatus}
              />
            ) : (
              <Value node={node} copy={c.copy} phase={p.phase} locale={p.locale} />
            )}
            {notesFor(node.path)}
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
      {!isDraftReview && <p className="fs-response-review-intro">
        {p.phase === "accepted-record" ? c.copy.acceptedRecord
          : p.phase === "before-sign" ? c.copy.beforeSign : c.copy.beforeSubmit}
      </p>}
      {showContext && (
        <dl className="fs-response-review-context fs-response-review__meta">
          {p.phase !== "accepted-record" && !isDraftReview ? <div>
            <dt>{c.copy.draftVersion}</dt>
            <dd>{p.draft.version}</dd>
          </div> : null}
          {!isDraftReview && (
            <div>
              <dt>{c.copy.locale}</dt>
              <dd>{p.locale}</dd>
            </div>
          )}
          <div>
            <dt>{c.copy.signatures}</dt>
            <dd>{signatureCount}</dd>
          </div>
        </dl>
      )}
      {isDraftReview && filtered.unansweredCount > 0 && (
        <div className="fs-response-review-controls">
          <button
            type="button"
            className="fs-response-review-toggle"
            aria-expanded={showUnanswered}
            onClick={() => setShowUnanswered((current) => !current)}
          >
            {showUnanswered
              ? `Hide ${filtered.unansweredCount} unanswered ${filtered.unansweredCount === 1 ? "item" : "items"}`
              : `Show ${filtered.unansweredCount} unanswered ${filtered.unansweredCount === 1 ? "item" : "items"}`}
          </button>
        </div>
      )}
      {displayedNodes.length > 0 ? (
        render(displayedNodes, nextLevel(c.headingLevel))
      ) : (
        isDraftReview && (
          <p className="fs-response-review-empty">No answers recorded yet.</p>
        )
      )}
      {[...instances].map(([path, notes]) => <div key={path}>
        <strong>{path === '#' ? c.copy.heading : p.fields[path]!.label}</strong>{notes}
      </div>)}
      {groups}
      {showRecordDetails && (
        <details className="fs-response-review-record-details">
          <summary>{c.copy.responseId}</summary>
          <p>{r.id}</p>
        </details>
      )}
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
function ProfiledResponseReview(props: ResponseReviewProps & { acceptedSelectionProfile: 'legacy' | 'selected' | undefined }) {
  const c = capture(props, props.acceptedSelectionProfile);
  // Stable detached capture prevents a new snapshot object from restarting every preview render.
  const stable = useMemo(() => c, [c?.identity]);
  const generation = useMemo(
    () => ++nextReviewGeneration,
    [
      c?.identity,
      props.readAttachment,
      props.readAcceptedAttachment,
      props.onAcceptedReviewState,
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
        ...(props.readAcceptedAttachment ? { readAcceptedAttachment: props.readAcceptedAttachment } : {}),
        ...(props.onAcceptedReviewState ? { onAcceptedReviewState: props.onAcceptedReviewState } : {}),
      }}
    />
  );
}
export function ResponseReview(props: ResponseReviewProps) {
  return <ProfiledResponseReview {...props} acceptedSelectionProfile={undefined} />;
}
export function createResponseReviewWidget(
  options: ResponseReviewOptions = {},
  /** Deployment profile admission; grants no access or signing authority. */
  acceptedSelectionProfile?: 'legacy' | 'selected',
): SurfaceWidget {
  return (props) => <ProfiledResponseReview {...props} {...options} acceptedSelectionProfile={acceptedSelectionProfile} />;
}
