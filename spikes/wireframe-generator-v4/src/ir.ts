/** @filedesc Layer 2: project per-route Components into a renderer-neutral wireframe IR. */

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
    slotType?: string;
    sourceModule?: string;
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

function componentExtensions(n: ComponentNode): Record<string, unknown> {
  return (n.extensions as Record<string, unknown> | undefined) ?? {};
}

function generation(n: ComponentNode): Record<string, unknown> {
  return (n["x-generation"] as Record<string, unknown> | undefined) ?? {};
}

function sourceModule(n: ComponentNode): string | undefined {
  const ref = generation(n).sourceModule as { id?: string } | undefined;
  return ref?.id;
}

function widget(n: ComponentNode): Record<string, unknown> | undefined {
  return componentExtensions(n)["x-formspec-widget"] as Record<string, unknown> | undefined;
}

function surface(n: ComponentNode): Record<string, unknown> | undefined {
  return componentExtensions(n)["x-formspec-surface"] as Record<string, unknown> | undefined;
}

function field(n: ComponentNode): Record<string, unknown> | undefined {
  return componentExtensions(n)["x-formspec-field"] as Record<string, unknown> | undefined;
}

function action(n: ComponentNode): Record<string, unknown> | undefined {
  return componentExtensions(n)["x-formspec-action"] as Record<string, unknown> | undefined;
}

function ai(n: ComponentNode): NonNullable<NonNullable<WireframeNode["meta"]>["ai"]> | undefined {
  const direct = componentExtensions(n)["x-formspec-ai"] as NonNullable<NonNullable<WireframeNode["meta"]>["ai"]> | undefined;
  const widgetPayload = widget(n)?.payload as Record<string, unknown> | undefined;
  const payloadAi = widgetPayload?.ai as NonNullable<NonNullable<WireframeNode["meta"]>["ai"]> | undefined;
  return direct ?? payloadAi;
}

function lineage(n: ComponentNode): Pick<NonNullable<WireframeNode["meta"]>, "unitRef" | "taskRefs" | "slotType" | "sourceModule"> {
  return {
    unitRef: n.unitRef as string | undefined,
    taskRefs: n.taskRefs as string[] | undefined,
    slotType: surface(n)?.slotType as string | undefined,
    sourceModule: sourceModule(n),
  };
}

function mapChildren(n: ComponentNode): WireframeNode[] | undefined {
  const children = n.children as ComponentNode[] | undefined;
  return children?.map(mapNode);
}

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

export function mapNode(n: ComponentNode): WireframeNode {
  const comp = n.component;
  const ln = lineage(n);
  const w = widget(n);
  const surf = surface(n);
  const aiHint = ai(n);

  if (comp === "Card" && w?.kind) {
    const kind = w.kind as string;
    const title = (w.title as string | undefined) ?? (n.title as string | undefined);
    const payload = (w.payload ?? {}) as Record<string, unknown>;
    const metaCommon: WireframeNode["meta"] = { ...ln, ai: aiHint };

    switch (kind) {
      case "x-formspec-conversation-thread":
        return { kind: "conversation", label: title, attrs: { messages: payload.messages ?? [] }, meta: metaCommon };
      case "x-formspec-document-viewer-document":
        return {
          kind: "document-viewer",
          label: title,
          attrs: {
            docTitle: payload.docTitle ?? "Document",
            pages: payload.pages ?? 0,
            annotations: payload.annotations ?? [],
          },
          meta: metaCommon,
        };
      case "x-formspec-presentation-result-list":
        return { kind: "result-list", label: title, attrs: { rows: payload.rows ?? [] }, meta: metaCommon };
      case "x-formspec-presentation-gallery":
        return { kind: "gallery", label: title, attrs: { cards: payload.cards ?? [] }, meta: metaCommon };
      case "x-formspec-presentation-shell":
        return {
          kind: "shell-marker",
          label: title,
          attrs: {
            appName: payload.appName ?? "",
            appTagline: payload.appTagline ?? null,
            nav: payload.nav ?? [],
          },
          meta: metaCommon,
        };
      case "x-formspec-presentation-helper":
        return { kind: "panel", label: title, attrs: { helper: payload.helper ?? [] }, meta: metaCommon };
      case "x-formspec-surface-embed":
        return {
          kind: "callout",
          label: title,
          attrs: { severity: "info", routeRef: payload.routeRef },
          meta: metaCommon,
        };
      default:
        return { kind: "unknown", label: `${kind}: ${title ?? ""}`, attrs: payload, meta: metaCommon };
    }
  }

  if (comp === "Grid" && surf?.kind === "three-pane") {
    return { kind: "three-pane", meta: ln, children: mapChildren(n) };
  }

  if (comp === "Stack" && surf?.pane) {
    const pane = surf.pane as string;
    return { kind: "pane", label: pane, attrs: { pane }, meta: ln, children: mapChildren(n) };
  }

  if (comp === "Section") {
    return {
      kind: "section",
      label: n.title as string | undefined,
      attrs: { description: n.description },
      meta: { ...ln, ai: aiHint },
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
    const a = action(n);
    return {
      kind: "button",
      label: (a?.labelText as string | undefined) ?? (n.actionRef as string),
      meta: {
        ...ln,
        actionRef: n.actionRef as string,
        intent: a?.intent as string | undefined,
        role: a?.role as string | undefined,
      },
    };
  }
  if (comp === "ConditionalGroup") {
    return { kind: "conditional", label: n.when as string, meta: ln, children: mapChildren(n) };
  }
  if (FIELD_WIDGETS.has(comp)) {
    const f = field(n) ?? {};
    return {
      kind: "field",
      label: (f.label as string | undefined) ?? (n.bind as string),
      meta: {
        ...ln,
        bind: n.bind as string,
        widget: comp,
        required: f.required as boolean | undefined,
        calculated: f.calculated as boolean | undefined,
        readonly: f.readonly as boolean | undefined,
        relevantWhen: f.relevantWhen as string | undefined,
        hint: f.hint as string | undefined,
        prefix: f.prefix as string | undefined,
        suffix: f.suffix as string | undefined,
        ai: aiHint,
      },
    };
  }
  if (CHOICE_WIDGETS.has(comp)) {
    const f = field(n) ?? {};
    return {
      kind: "field-choice",
      label: (f.label as string | undefined) ?? (n.bind as string),
      meta: {
        ...ln,
        bind: n.bind as string,
        widget: comp,
        required: f.required as boolean | undefined,
        calculated: f.calculated as boolean | undefined,
        relevantWhen: f.relevantWhen as string | undefined,
        hint: f.hint as string | undefined,
        options: f.options as { value: string; label: string }[] | undefined,
        ai: aiHint,
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
