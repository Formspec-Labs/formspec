/** @filedesc Layer 1: project Definition + Experience + Response Actions + Surface into per-route Component documents. Knows Formspec; does not know HTML. Spike metadata travels in `x-generation.spike` because `additionalProperties:true` on x-generation is the only schema-tolerated extension slot on Component nodes. */

import type {
  Definition,
  DefItem,
  DefBind,
  Experience,
  ExpUnit,
  ResponseActions,
  RaAction,
  Surface,
  SurfaceRoute,
  ComponentDoc,
  ComponentNode,
  DefinitionIndex,
  IndexedItem,
  MultiRouteBundle,
} from "./types.js";

const GENERATOR_ID = "formspec-wireframe-generator-spike@0.2.0";

// ---------- Definition indexing ----------

export function indexDefinition(def: Definition): DefinitionIndex {
  const byPath = new Map<string, IndexedItem>();
  function walk(item: DefItem, parentPath: string): void {
    const myPath = parentPath ? `${parentPath}.${item.key}` : item.key;
    byPath.set(myPath, { path: myPath, item, isRepeat: !!item.repeatable, binds: [] });
    const childParent = item.repeatable ? `${myPath}[*]` : myPath;
    for (const child of item.children ?? []) walk(child, childParent);
  }
  for (const top of def.items) walk(top, "");

  const bindsByPath = new Map<string, DefBind[]>();
  for (const bind of def.binds ?? []) {
    const arr = bindsByPath.get(bind.path) ?? [];
    arr.push(bind);
    bindsByPath.set(bind.path, arr);
    const indexed = byPath.get(bind.path);
    if (indexed) indexed.binds.push(bind);
  }
  return { byPath, bindsByPath };
}

function bindMeta(binds: DefBind[]) {
  let required = false;
  let relevantWhen: string | undefined;
  let calculated = false;
  let readonly = false;
  for (const b of binds) {
    if (b.required === true || b.required === "true") required = true;
    else if (typeof b.required === "string" && b.required.length > 0) {
      required = true;
      relevantWhen = relevantWhen ?? `required-when: ${b.required}`;
    }
    if (b.relevant) relevantWhen = relevantWhen ? `${relevantWhen}; relevant: ${b.relevant}` : `relevant: ${b.relevant}`;
    if (b.calculate) calculated = true;
    if (b.readonly === true || b.readonly === "true") readonly = true;
  }
  return { required, relevantWhen, calculated, readonly };
}

// ---------- Widget selection ----------

function widgetFor(item: DefItem, def: Definition): string {
  const hint = item.presentation?.widgetHint;
  if (hint) return hint;
  if (item.type === "display") return "Text";
  if (item.type === "group") return "Section";
  switch (item.dataType) {
    case "string":
    case "text":
      return "TextInput";
    case "integer":
      return "NumberInput";
    case "decimal":
      return item.prefix === "$" ? "MoneyInput" : "NumberInput";
    case "money":
      return "MoneyInput";
    case "boolean":
      return "Toggle";
    case "date":
    case "dateTime":
    case "time":
      return "DatePicker";
    case "choice": {
      const opts = item.options ?? def.optionSets?.[item.optionSet ?? ""]?.options ?? [];
      return opts.length <= 4 ? "RadioGroup" : "Select";
    }
    case "multiChoice":
      return "CheckboxGroup";
    case "attachment":
      return /sign/i.test(item.label ?? "") ? "Signature" : "FileUpload";
    default:
      return "TextInput";
  }
}

// ---------- Anchor sanitization ----------

const ALLOWED_ANCHOR_PREFIXES = /^(item|unit|task|action|concept):/;

function sanitizeAnchors(anchors: string[]): string[] {
  return anchors.filter((a) => ALLOWED_ANCHOR_PREFIXES.test(a));
}

// ---------- x-generation builder (spike metadata goes here) ----------

type SpikePayload = Record<string, unknown>;

function xgen(
  unit: ExpUnit | null,
  strategy: string,
  anchors: string[],
  routeId: string,
  spike: SpikePayload = {},
) {
  return {
    source: unit ? `unit:${unit.id}` : `route:${routeId}`,
    strategy,
    generatedBy: GENERATOR_ID,
    anchors: sanitizeAnchors(anchors),
    spike: { ...spike, route: routeId },
  };
}

// ---------- Field emission ----------

function emitField(
  pathRef: string,
  def: Definition,
  index: DefinitionIndex,
  unit: ExpUnit,
  routeId: string,
): ComponentNode {
  const indexed = index.byPath.get(pathRef);
  if (!indexed) {
    return {
      component: "Text",
      text: `(unresolved itemRef: ${pathRef})`,
      unitRef: unit.id,
      taskRefs: unit.taskRefs ?? [],
      "x-generation": xgen(unit, "unresolved-itemref", [`unit:${unit.id}`], routeId, { unresolved: pathRef }),
    };
  }
  const { item } = indexed;
  const meta = bindMeta(indexed.binds);

  if (item.type === "display") {
    return {
      component: "Text",
      text: item.label ?? "",
      unitRef: unit.id,
      taskRefs: unit.taskRefs ?? [],
      "x-generation": xgen(unit, "display", [`unit:${unit.id}`, `item:${pathRef}`], routeId),
    };
  }

  const widget = widgetFor(item, def);
  const fieldMeta: SpikePayload = {
    label: item.label,
    hint: item.hint,
    required: meta.required,
    calculated: meta.calculated,
    readonly: meta.readonly,
    relevantWhen: meta.relevantWhen,
    prefix: item.prefix,
    suffix: item.suffix,
    widget,
  };
  if (item.dataType === "choice" || item.dataType === "multiChoice") {
    fieldMeta.options = item.options ?? def.optionSets?.[item.optionSet ?? ""]?.options ?? [];
  }
  const node: ComponentNode = {
    component: widget,
    bind: pathRef,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    "x-generation": xgen(unit, `field-${widget}`, [`unit:${unit.id}`, `item:${pathRef}`], routeId, { meta: fieldMeta }),
  };
  return node;
}

// ---------- Unit emitters ----------

function emitActionButton(ref: { id: string; role?: string }, actions: RaAction[], unit: ExpUnit, routeId: string): ComponentNode {
  const action = actions.find((a) => a.id === ref.id);
  return {
    component: "ActionButton",
    actionRef: ref.id,
    label: { literal: action?.label ?? ref.id },
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    "x-generation": xgen(unit, "action-button", [`unit:${unit.id}`, `action:${ref.id}`], routeId, {
      role: ref.role ?? "primary",
      intent: action?.intent ?? "(unresolved)",
      // Carry the unwrapped label here too for the renderer (it doesn't read locale).
      labelText: action?.label ?? ref.id,
    }),
  };
}

function emitDataEntryUnit(unit: ExpUnit, def: Definition, index: DefinitionIndex, actions: RaAction[], routeId: string): ComponentNode {
  const fields = (unit.itemRefs ?? []).map((r) => emitField(r.path, def, index, unit, routeId));
  const buttons = (unit.actionRefs ?? []).map((ref) => emitActionButton(ref, actions, unit, routeId));
  const ai = unit.extensions?.["x-spike-ai"] as Record<string, unknown> | undefined;
  return {
    component: "Section",
    title: unit.title ?? unit.id,
    description: unit.description,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    "x-generation": xgen(unit, "unit-data-entry", [`unit:${unit.id}`], routeId, {
      unitKind: unit.kind,
      actor: unit.actorRef ?? null,
      ai: ai ?? null,
    }),
    children: [...fields, ...buttons],
  };
}

function emitConfirmationUnit(unit: ExpUnit, actions: RaAction[], routeId: string): ComponentNode {
  const buttons = (unit.actionRefs ?? []).map((ref) => emitActionButton(ref, actions, unit, routeId));
  return {
    component: "Section",
    title: unit.title ?? unit.id,
    description: unit.description,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    "x-generation": xgen(unit, "unit-confirmation", [`unit:${unit.id}`], routeId, { unitKind: unit.kind }),
    children: buttons,
  };
}

function emitReviewUnit(unit: ExpUnit, routeId: string): ComponentNode {
  const ai = unit.extensions?.["x-spike-ai"] as Record<string, unknown> | undefined;
  return {
    component: "Section",
    title: unit.title ?? unit.id,
    description: unit.description,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    "x-generation": xgen(unit, "unit-review", [`unit:${unit.id}`], routeId, { unitKind: unit.kind, ai: ai ?? null }),
    children: [{ component: "Summary", text: unit.description ?? "Read-only review surface." }],
  };
}

/** x-spike-kind units: payload moves into x-generation.spike, host node is a plain Card. */
function emitXSpikeUnit(unit: ExpUnit, routeId: string): ComponentNode {
  const kind = unit.extensions?.["x-spike-kind"] as string | undefined;
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(unit.extensions ?? {})) {
    if (k === "x-spike-kind") continue;
    payload[k.replace(/^x-spike-/, "")] = v;
  }
  return {
    component: "Card",
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    "x-generation": xgen(unit, `unit-${kind ?? "unknown"}`, [`unit:${unit.id}`], routeId, {
      kind: kind ?? "unknown",
      title: unit.title ?? unit.id,
      payload,
      unitKind: unit.kind,
    }),
  };
}

function emitUnit(unit: ExpUnit, def: Definition, index: DefinitionIndex, actions: RaAction[], routeId: string): ComponentNode {
  const xKind = unit.extensions?.["x-spike-kind"];
  if (xKind) return emitXSpikeUnit(unit, routeId);

  switch (unit.kind) {
    case "data-entry":
    case "evidence-collection":
    case "attestation":
      return emitDataEntryUnit(unit, def, index, actions, routeId);
    case "confirmation":
      return emitConfirmationUnit(unit, actions, routeId);
    default:
      return emitReviewUnit(unit, routeId);
  }
}

// ---------- Route composition ----------

function findUnit(exp: Experience, id: string): ExpUnit | null {
  return exp.units.find((u) => u.id === id) ?? null;
}

function emitRouteTree(
  route: SurfaceRoute,
  surface: Surface,
  def: Definition,
  index: DefinitionIndex,
  exp: Experience,
  ra: ResponseActions,
): ComponentNode {
  const layout = route.layout ?? "shell-with-main";
  const slots = route.slots ?? {};

  const composeSlot = (slotName: "left" | "main" | "right" | "main-footer"): ComponentNode[] => {
    const unitIds = slots[slotName] ?? [];
    return unitIds
      .map((id) => findUnit(exp, id))
      .filter((u): u is ExpUnit => !!u)
      .map((u) => emitUnit(u, def, index, ra.actions, route.id));
  };

  const shellUnit = route.shellUnitRef ? findUnit(exp, route.shellUnitRef) : null;
  const shellMarker: ComponentNode | null = shellUnit
    ? {
        component: "Card",
        unitRef: shellUnit.id,
        taskRefs: shellUnit.taskRefs ?? [],
        "x-generation": xgen(shellUnit, "shell-marker", [`unit:${shellUnit.id}`], route.id, {
          kind: "x-shell-marker",
          title: shellUnit.title ?? shellUnit.id,
          appName: surface.appName,
          appTagline: surface.appTagline ?? null,
          nav: surface.nav ?? [],
        }),
      }
    : null;

  const leftChildren = composeSlot("left");
  const mainChildren = [...composeSlot("main"), ...composeSlot("main-footer")];
  const rightChildren = composeSlot("right");

  if (layout === "shell-with-main") {
    return {
      component: "Stack",
      "x-generation": xgen(null, "route-shell-with-main", [], route.id, {
        routeId: route.id,
        path: route.path,
        label: route.label ?? route.id,
        layout,
      }),
      children: [...(shellMarker ? [shellMarker] : []), ...mainChildren],
    };
  }

  return {
    component: "Stack",
    "x-generation": xgen(null, "route-shell-with-three-pane", [], route.id, {
      routeId: route.id,
      path: route.path,
      label: route.label ?? route.id,
      layout,
    }),
    children: [
      ...(shellMarker ? [shellMarker] : []),
      {
        component: "Grid",
        columns: ["260px", "1fr", "320px"],
        "x-generation": xgen(null, "three-pane-grid", [], route.id, { kind: "x-three-pane" }),
        children: [
          {
            component: "Stack",
            "x-generation": xgen(null, "pane", [], route.id, { pane: "left" }),
            children: leftChildren,
          },
          {
            component: "Stack",
            "x-generation": xgen(null, "pane", [], route.id, { pane: "main" }),
            children: mainChildren,
          },
          {
            component: "Stack",
            "x-generation": xgen(null, "pane", [], route.id, { pane: "right" }),
            children: rightChildren,
          },
        ],
      } as ComponentNode,
    ],
  };
}

// ---------- Top-level ----------

export function generateBundle(
  def: Definition,
  exp: Experience,
  ra: ResponseActions,
  surface: Surface,
): MultiRouteBundle {
  const index = indexDefinition(def);
  const routes = surface.routes.map((route) => {
    const tree = emitRouteTree(route, surface, def, index, exp, ra);
    const doc: ComponentDoc = {
      $formspecComponent: "1.1",
      version: "1.0.0",
      name: `lexassist-${route.id}`,
      title: `${surface.appName} — ${route.label ?? route.id}`,
      targetDefinition: {
        url: def.url,
        compatibleVersions: `>=${def.version} <${nextMajor(def.version)}`,
      },
      tree,
    };
    return {
      id: route.id,
      path: route.path,
      label: route.label ?? route.id,
      default: !!route.default,
      layout: route.layout ?? "shell-with-main",
      doc,
    };
  });
  if (!routes.some((r) => r.default)) routes[0].default = true;
  return { appName: surface.appName, appTagline: surface.appTagline, nav: surface.nav ?? [], routes };
}

function nextMajor(v: string): string {
  const [maj] = v.split(".");
  return `${Number(maj) + 1}.0.0`;
}
