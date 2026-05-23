/** @filedesc Layer 2: project Component (per-route) into a generic WireframeNode tree, then assemble the multi-route WireframeApp. Spike metadata is read from `x-generation.spike` (the only schema-tolerated extension slot on Component nodes). Layer 3 must not depend on Formspec types. */

import type { ComponentNode, MultiRouteBundle } from "./types.js";

export type WireframeKind =
  | "root"
  | "section"
  | "stack"
  | "row"
  | "card"
  | "panel"
  | "heading"
  | "text"
  | "divider"
  | "field"
  | "field-choice"
  | "button"
  | "summary"
  | "validation-summary"
  | "callout"
  | "conditional"
  | "conversation"
  | "document-viewer"
  | "result-list"
  | "gallery"
  | "shell-marker"
  | "three-pane"
  | "pane"
  | "unknown";

export type WireframeNode = {
  kind: WireframeKind;
  label?: string;
  attrs?: Record<string, unknown>;
  meta?: {
    bind?: string;
    actionRef?: string;
    unitRef?: string;
    taskRefs?: string[];
    required?: boolean;
    calculated?: boolean;
    readonly?: boolean;
    relevantWhen?: string;
    intent?: string;
    role?: string;
    widget?: string;
    options?: { value: string; label: string }[];
    hint?: string;
    prefix?: string;
    suffix?: string;
    ai?: { fillable?: boolean; providerHint?: string | null; prompt?: string | null };
    routeId?: string;
  };
  children?: WireframeNode[];
};

export type WireframeApp = {
  appName: string;
  appTagline?: string;
  nav: { label: string; path: string }[];
  routes: {
    id: string;
    path: string;
    label: string;
    default: boolean;
    layout: string;
    root: WireframeNode;
  }[];
};

// ---------- Helpers ----------

function xgen(n: ComponentNode): Record<string, unknown> | undefined {
  return n["x-generation"] as Record<string, unknown> | undefined;
}
function spike(n: ComponentNode): Record<string, unknown> {
  return (xgen(n)?.["spike"] as Record<string, unknown> | undefined) ?? {};
}
type AiHint = NonNullable<NonNullable<WireframeNode["meta"]>["ai"]>;

function spikeAi(n: ComponentNode): AiHint | undefined {
  const a = spike(n)["ai"] as AiHint | null | undefined;
  return a ?? undefined;
}
function lineage(n: ComponentNode): Pick<NonNullable<WireframeNode["meta"]>, "unitRef" | "taskRefs"> {
  return {
    unitRef: n.unitRef as string | undefined,
    taskRefs: n.taskRefs as string[] | undefined,
  };
}
function mapChildren(n: ComponentNode): WireframeNode[] | undefined {
  const c = n.children as ComponentNode[] | undefined;
  if (!c) return undefined;
  return c.map(mapNode);
}

// ---------- Widget categorisation ----------

const FIELD_WIDGETS = new Set([
  "TextInput",
  "NumberInput",
  "MoneyInput",
  "DatePicker",
  "Toggle",
  "Slider",
  "Rating",
  "Signature",
  "FileUpload",
]);

const CHOICE_WIDGETS = new Set(["RadioGroup", "Select", "CheckboxGroup"]);

// ---------- Mapping ----------

export function mapNode(n: ComponentNode): WireframeNode {
  const comp = n.component;
  const ln = lineage(n);
  const s = spike(n);
  const ai = spikeAi(n);

  // x-spike-kind Card nodes
  if (comp === "Card" && s["kind"]) {
    const kind = s["kind"] as string;
    const title = s["title"] as string | undefined;
    const payload = (s["payload"] ?? {}) as Record<string, unknown>;
    const payloadAi = payload["ai"] as
      | { fillable?: boolean; providerHint?: string | null; prompt?: string | null }
      | undefined;
    const metaCommon: WireframeNode["meta"] = { ...ln, ai: ai ?? payloadAi };

    switch (kind) {
      case "x-conversation":
        return { kind: "conversation", label: title, attrs: { messages: payload["messages"] ?? [] }, meta: metaCommon };
      case "x-document-viewer":
        return {
          kind: "document-viewer",
          label: title,
          attrs: {
            docTitle: payload["docTitle"] ?? "Document",
            pages: payload["pages"] ?? 0,
            annotations: payload["annotations"] ?? [],
          },
          meta: metaCommon,
        };
      case "x-result-list":
        return { kind: "result-list", label: title, attrs: { rows: payload["rows"] ?? [] }, meta: metaCommon };
      case "x-gallery":
        return { kind: "gallery", label: title, attrs: { cards: payload["cards"] ?? [] }, meta: metaCommon };
      case "x-shell-marker":
        return {
          kind: "shell-marker",
          label: title,
          attrs: {
            appName: s["appName"] ?? "",
            appTagline: s["appTagline"] ?? null,
            nav: s["nav"] ?? [],
          },
          meta: metaCommon,
        };
      case "x-shell":
        return {
          kind: "panel",
          label: title,
          attrs: { helper: payload["helper"] ?? [] },
          meta: metaCommon,
        };
      default:
        return { kind: "unknown", label: `${kind}: ${title ?? ""}`, meta: metaCommon };
    }
  }

  // three-pane Grid
  if (comp === "Grid" && s["kind"] === "x-three-pane") {
    return { kind: "three-pane", meta: ln, children: mapChildren(n) };
  }

  // pane Stack
  if (comp === "Stack" && s["pane"]) {
    const pane = s["pane"] as string;
    return { kind: "pane", label: pane, attrs: { pane }, meta: ln, children: mapChildren(n) };
  }

  // Standard Formspec components
  if (comp === "Section") {
    return {
      kind: "section",
      label: n.title as string | undefined,
      attrs: { description: n.description },
      meta: { ...ln, ai: ai },
      children: mapChildren(n),
    };
  }
  if (comp === "Stack") return { kind: "stack", meta: ln, children: mapChildren(n) };
  if (comp === "Card") return { kind: "card", meta: ln, children: mapChildren(n) };
  if (comp === "Grid") return { kind: "row", meta: ln, children: mapChildren(n) };
  if (comp === "Heading") return { kind: "heading", label: n.text as string, attrs: { level: n.level ?? 3 }, meta: ln };
  if (comp === "Text") return { kind: "text", label: n.text as string, meta: ln };
  if (comp === "Divider") return { kind: "divider", meta: ln };
  if (comp === "ValidationSummary") return { kind: "validation-summary", meta: ln };
  if (comp === "Summary") return { kind: "summary", label: n.text as string, meta: ln };
  if (comp === "ActionButton") {
    const labelText = (s["labelText"] as string | undefined) ?? (n.actionRef as string);
    return {
      kind: "button",
      label: labelText,
      meta: {
        ...ln,
        actionRef: n.actionRef as string,
        intent: s["intent"] as string | undefined,
        role: s["role"] as string | undefined,
      },
    };
  }
  if (comp === "ConditionalGroup") {
    return { kind: "conditional", label: n.when as string, meta: ln, children: mapChildren(n) };
  }
  if (FIELD_WIDGETS.has(comp)) {
    const m = (s["meta"] ?? {}) as Record<string, unknown>;
    return {
      kind: "field",
      label: (m["label"] as string) ?? (n.bind as string),
      meta: {
        ...ln,
        bind: n.bind as string,
        widget: comp,
        required: m["required"] as boolean | undefined,
        calculated: m["calculated"] as boolean | undefined,
        readonly: m["readonly"] as boolean | undefined,
        relevantWhen: m["relevantWhen"] as string | undefined,
        hint: m["hint"] as string | undefined,
        prefix: m["prefix"] as string | undefined,
        suffix: m["suffix"] as string | undefined,
      },
    };
  }
  if (CHOICE_WIDGETS.has(comp)) {
    const m = (s["meta"] ?? {}) as Record<string, unknown>;
    const options = m["options"] as { value: string; label: string }[] | undefined;
    return {
      kind: "field-choice",
      label: (m["label"] as string) ?? (n.bind as string),
      meta: {
        ...ln,
        bind: n.bind as string,
        widget: comp,
        required: m["required"] as boolean | undefined,
        calculated: m["calculated"] as boolean | undefined,
        relevantWhen: m["relevantWhen"] as string | undefined,
        hint: m["hint"] as string | undefined,
        options,
      },
    };
  }

  return { kind: "unknown", label: comp, meta: ln, children: mapChildren(n) };
}

export function bundleToApp(bundle: MultiRouteBundle): WireframeApp {
  return {
    appName: bundle.appName,
    appTagline: bundle.appTagline,
    nav: bundle.nav,
    routes: bundle.routes.map((r) => ({
      id: r.id,
      path: r.path,
      label: r.label,
      default: r.default,
      layout: r.layout,
      root: mapNode(r.doc.tree),
    })),
  };
}
