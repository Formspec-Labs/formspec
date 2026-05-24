/** @filedesc Layer 1: project ADR-0150 substrate artifacts into per-route Component documents. */

import type {
  ComponentDoc,
  ComponentNode,
  DefBind,
  Definition,
  DefinitionIndex,
  DefItem,
  ExpUnit,
  Experience,
  GeneratorInputs,
  IndexedItem,
  JsonObject,
  ModuleRef,
  MultiRouteBundle,
  RaAction,
  ResponseActions,
  Surface,
  SurfaceRoute,
  SurfaceSlotEntry,
  SurfaceSlotType,
} from "./types.js";

const GENERATOR_ID = "formspec-wireframe-generator-spike-v2@0.1.0";
const GENERATED_AT = "2026-05-23T00:00:00Z";
const DEFAULT_MODULE_VERSION = "^0.1.0";

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

// ---------- Schema-compatible Component helpers ----------

const ALLOWED_ANCHOR_PREFIXES = /^(item|unit|task|action|concept):/;

function sanitizeAnchors(anchors: string[]): string[] {
  return anchors.filter((a) => ALLOWED_ANCHOR_PREFIXES.test(a));
}

function moduleRef(id: string, version = DEFAULT_MODULE_VERSION): ModuleRef {
  return { id, version };
}

function moduleForKind(kind: string | undefined): ModuleRef | undefined {
  if (!kind) return undefined;
  if (kind.startsWith("x-formspec-presentation-")) return moduleRef("x-formspec-presentation");
  if (kind.startsWith("x-formspec-conversation-")) return moduleRef("x-formspec-conversation");
  if (kind.startsWith("x-formspec-document-viewer-")) return moduleRef("x-formspec-document-viewer");
  if (kind.startsWith("x-formspec-surface-")) return moduleRef("x-formspec-surface");
  if (kind.startsWith("x-formspec-ai-")) return moduleRef("x-formspec-ai-runtime");
  return undefined;
}

function xgen(
  source: string,
  strategy: string,
  anchors: string[],
  sourceModule?: ModuleRef,
): Record<string, unknown> {
  return {
    source,
    strategy,
    generatedBy: GENERATOR_ID,
    generatedAt: GENERATED_AT,
    anchors: sanitizeAnchors(anchors),
    ...(sourceModule ? { sourceModule } : {}),
  };
}

function ext(...objects: Array<JsonObject | undefined>): JsonObject | undefined {
  const out: JsonObject = {};
  for (const obj of objects) {
    if (!obj) continue;
    Object.assign(out, obj);
  }
  return Object.keys(out).length ? out : undefined;
}

function idFor(routeId: string, ...parts: Array<string | undefined>): string {
  return [routeId, ...parts.filter(Boolean)]
    .join("_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^([^a-zA-Z])/, "n_$1");
}

function definitionKey(def: Definition): string {
  if (def.name) return def.name;
  return def.url.replace(/^.*\//, "");
}

function labelText(label: RaAction["label"] | undefined, fallback: string): string {
  if (!label) return fallback;
  if ("literal" in label) return label.literal;
  return label.ref;
}

// ---------- Widget selection ----------

function widgetFor(item: DefItem, def: Definition): string {
  const hint = item.presentation?.widgetHint;
  if (hint) return hint;
  if (item.type === "display") return "Text";
  if (item.type === "group") return "Section";
  switch (item.dataType) {
    case "string":
      return "TextInput";
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

// ---------- Artifact lookup ----------

type DefinitionBag = {
  definitions: Definition[];
  byName: Map<string, Definition>;
  byUrl: Map<string, Definition>;
  indexes: Map<string, DefinitionIndex>;
};

function buildDefinitionBag(definitions: Definition[]): DefinitionBag {
  const byName = new Map<string, Definition>();
  const byUrl = new Map<string, Definition>();
  const indexes = new Map<string, DefinitionIndex>();
  for (const def of definitions) {
    byName.set(definitionKey(def), def);
    byUrl.set(def.url, def);
    indexes.set(def.url, indexDefinition(def));
  }
  return { definitions, byName, byUrl, indexes };
}

function findDefinition(bag: DefinitionBag, ref: string): Definition {
  const def = bag.byName.get(ref) ?? bag.byUrl.get(ref);
  if (!def) throw new Error(`Surface references unknown Definition '${ref}'`);
  return def;
}

function actionsFor(actionsByDefinition: Map<string, ResponseActions>, def: Definition): RaAction[] {
  return actionsByDefinition.get(def.url)?.actions ?? [];
}

function findUnit(exp: Experience, id: string): ExpUnit {
  const unit = (exp.units ?? []).find((u) => u.id === id);
  if (!unit) throw new Error(`Surface references unknown Experience Unit '${id}'`);
  return unit;
}

// ---------- Field and action emission ----------

function emitField(pathRef: string, def: Definition, index: DefinitionIndex, unit: ExpUnit, routeId: string): ComponentNode {
  const indexed = index.byPath.get(pathRef);
  if (!indexed) {
    return {
      component: "Text",
      id: idFor(routeId, unit.id, "unresolved", pathRef),
      text: `(unresolved itemRef: ${pathRef})`,
      unitRef: unit.id,
      taskRefs: unit.taskRefs ?? [],
      extensions: {
        "x-formspec-field": { unresolved: pathRef },
      },
      "x-generation": xgen(`unit:${unit.id}`, "unresolved-itemref", [`unit:${unit.id}`]),
    };
  }

  const { item } = indexed;
  const meta = bindMeta(indexed.binds);
  const widget = widgetFor(item, def);
  const fieldExtension: JsonObject = {
    label: item.label,
    hint: item.hint,
    required: meta.required,
    calculated: meta.calculated,
    readonly: meta.readonly,
    relevantWhen: meta.relevantWhen,
    prefix: item.prefix,
    suffix: item.suffix,
    widget,
    definitionUrl: def.url,
  };
  if (item.dataType === "choice" || item.dataType === "multiChoice") {
    fieldExtension.options = item.options ?? def.optionSets?.[item.optionSet ?? ""]?.options ?? [];
  }

  return {
    component: widget,
    id: idFor(routeId, unit.id, pathRef),
    bind: pathRef,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    extensions: ext(
      { "x-formspec-field": fieldExtension },
      item.extensions,
      unit.extensions?.["x-formspec-ai"] ? { "x-formspec-ai": unit.extensions["x-formspec-ai"] as JsonObject } : undefined,
    ),
    "x-generation": xgen(`unit:${unit.id}`, `field-${widget}`, [`unit:${unit.id}`, `item:${pathRef}`], moduleRef("x-formspec-core-task", "^1.0.0")),
  };
}

function emitActionButton(
  ref: { id: string; role?: string },
  actions: RaAction[],
  unit: ExpUnit,
  routeId: string,
  def: Definition,
): ComponentNode {
  const action = actions.find((a) => a.id === ref.id);
  const text = labelText(action?.label, ref.id);
  return {
    component: "ActionButton",
    id: idFor(routeId, unit.id, ref.id),
    actionRef: ref.id,
    label: { literal: text },
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    extensions: {
      "x-formspec-action": {
        role: ref.role ?? "primary",
        intent: action?.intent ?? "(unresolved)",
        labelText: text,
        targetDefinition: def.url,
      },
    },
    "x-generation": xgen(`unit:${unit.id}`, "action-button", [`unit:${unit.id}`, `action:${ref.id}`], moduleRef("x-formspec-core-actions", "^1.0.0")),
  };
}

function emitDataEntryUnit(
  unit: ExpUnit,
  def: Definition,
  index: DefinitionIndex,
  actions: RaAction[],
  routeId: string,
  slotType: SurfaceSlotType,
): ComponentNode {
  const fields = (unit.itemRefs ?? []).map((r) => emitField(r.path, def, index, unit, routeId));
  const buttons = (unit.actionRefs ?? []).map((ref) => emitActionButton(ref, actions, unit, routeId, def));
  return {
    component: "Section",
    id: idFor(routeId, unit.id, "section"),
    title: unit.title ?? unit.id,
    description: unit.description,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    extensions: ext(
      {
        "x-formspec-surface": {
          slotType,
          definitionRef: definitionKey(def),
          definitionUrl: def.url,
        },
      },
      unit.extensions?.["x-formspec-ai"] ? { "x-formspec-ai": unit.extensions["x-formspec-ai"] as JsonObject } : undefined,
    ),
    "x-generation": xgen(`unit:${unit.id}`, "definition-form-unit", [`unit:${unit.id}`], moduleRef("x-formspec-core-task", "^1.0.0")),
    children: [...fields, ...buttons],
  };
}

// ---------- Non-form unit and slot emission ----------

type WidgetExtension = {
  kind?: string;
  title?: string;
  payload?: JsonObject;
};

function widgetExtensionFromUnit(unit: ExpUnit): Required<WidgetExtension> {
  const widget = (unit.extensions?.["x-formspec-widget"] as WidgetExtension | undefined) ?? {};
  const kind = widget.kind ?? unit.kind.replace(/-unit$/, "");
  return {
    kind,
    title: widget.title ?? unit.title ?? unit.id,
    payload: widget.payload ?? {},
  };
}

function emitWidgetUnit(unit: ExpUnit, routeId: string, slotType: SurfaceSlotType): ComponentNode {
  const widget = widgetExtensionFromUnit(unit);
  return {
    component: "Card",
    id: idFor(routeId, unit.id, "widget"),
    title: widget.title,
    unitRef: unit.id,
    taskRefs: unit.taskRefs ?? [],
    extensions: {
      "x-formspec-surface": { slotType },
      "x-formspec-widget": { ...widget, slotType },
    },
    "x-generation": xgen(`unit:${unit.id}`, "module-widget-unit", [`unit:${unit.id}`], moduleForKind(widget.kind)),
  };
}

function emitStaticContent(routeId: string, slotName: string, slotIndex: number, entry: SurfaceSlotEntry): ComponentNode {
  return {
    component: "Section",
    id: idFor(routeId, slotName, String(slotIndex), "static"),
    title: entry.content?.heading ?? entry.title ?? "Static content",
    extensions: {
      "x-formspec-surface": { slotType: entry.type },
    },
    "x-generation": xgen(`surface:${routeId}`, "static-content", [], moduleRef("x-formspec-surface")),
    children: entry.content?.body
      ? [
          {
            component: "Text",
            id: idFor(routeId, slotName, String(slotIndex), "staticText"),
            text: entry.content.body,
            extensions: { "x-formspec-surface": { slotType: entry.type } },
            "x-generation": xgen(`surface:${routeId}`, "static-content-text", [], moduleRef("x-formspec-surface")),
          },
        ]
      : [],
  };
}

function emitModuleWidget(routeId: string, slotName: string, slotIndex: number, entry: SurfaceSlotEntry): ComponentNode {
  const kind = entry.widgetRef ?? "x-formspec-presentation-helper";
  return {
    component: "Card",
    id: idFor(routeId, slotName, String(slotIndex), "moduleWidget"),
    title: entry.title ?? kind,
    extensions: {
      "x-formspec-surface": { slotType: entry.type },
      "x-formspec-widget": {
        kind,
        title: entry.title ?? kind,
        payload: entry.payload ?? {},
        slotType: entry.type,
      },
    },
    "x-generation": xgen(`surface:${routeId}`, "surface-module-widget", [], entry.module ?? moduleForKind(kind)),
  };
}

function emitEmbeddedRoute(routeId: string, slotName: string, slotIndex: number, entry: SurfaceSlotEntry): ComponentNode {
  const kind = "x-formspec-surface-embed";
  return {
    component: "Card",
    id: idFor(routeId, slotName, String(slotIndex), "embedRoute"),
    title: entry.title ?? `Embedded route ${entry.routeRef ?? ""}`,
    extensions: {
      "x-formspec-surface": { slotType: entry.type, routeRef: entry.routeRef },
      "x-formspec-widget": {
        kind,
        title: entry.title ?? `Embedded route ${entry.routeRef ?? ""}`,
        payload: { routeRef: entry.routeRef, ...(entry.payload ?? {}) },
        slotType: entry.type,
      },
    },
    "x-generation": xgen(`surface:${routeId}`, "embed-route", [], moduleRef("x-formspec-surface")),
  };
}

function emitSlotEntry(
  entry: SurfaceSlotEntry,
  route: SurfaceRoute,
  slotName: string,
  slotIndex: number,
  bag: DefinitionBag,
  exp: Experience,
  actionsByDefinition: Map<string, ResponseActions>,
): ComponentNode {
  switch (entry.type) {
    case "definition-form": {
      if (!entry.definitionRef) throw new Error(`definition-form slot on route '${route.id}' lacks definitionRef`);
      if (!entry.unitRef) throw new Error(`definition-form slot on route '${route.id}' lacks unitRef`);
      const def = findDefinition(bag, entry.definitionRef);
      const unit = findUnit(exp, entry.unitRef);
      const index = bag.indexes.get(def.url);
      if (!index) throw new Error(`No index built for Definition '${def.url}'`);
      return emitDataEntryUnit(unit, def, index, actionsFor(actionsByDefinition, def), route.id, entry.type);
    }
    case "experience-unit": {
      if (!entry.unitRef) throw new Error(`experience-unit slot on route '${route.id}' lacks unitRef`);
      return emitWidgetUnit(findUnit(exp, entry.unitRef), route.id, entry.type);
    }
    case "module-widget":
      return emitModuleWidget(route.id, slotName, slotIndex, entry);
    case "static-content":
      return emitStaticContent(route.id, slotName, slotIndex, entry);
    case "embed-route":
      return emitEmbeddedRoute(route.id, slotName, slotIndex, entry);
  }
}

// ---------- Route composition ----------

function routeDefinitionSlot(route: SurfaceRoute): SurfaceSlotEntry | undefined {
  return Object.values(route.slots)
    .flat()
    .find((entry) => entry.type === "definition-form" && entry.definitionRef);
}

function collectSlotTypes(route: SurfaceRoute): string[] {
  return Array.from(new Set(Object.values(route.slots).flat().map((entry) => entry.type)));
}

const SLOT_ORDER = ["shell", "left", "main", "right", "main-footer", "footer"];

function orderedSlotNames(route: SurfaceRoute): string[] {
  const names = Object.keys(route.slots);
  return names.sort((a, b) => {
    const ai = SLOT_ORDER.indexOf(a);
    const bi = SLOT_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
  });
}

function composeSlot(
  route: SurfaceRoute,
  slotName: string,
  bag: DefinitionBag,
  exp: Experience,
  actionsByDefinition: Map<string, ResponseActions>,
): ComponentNode[] {
  return (route.slots[slotName] ?? []).map((entry, index) =>
    emitSlotEntry(entry, route, slotName, index, bag, exp, actionsByDefinition),
  );
}

function emitRouteTree(
  route: SurfaceRoute,
  surface: Surface,
  bag: DefinitionBag,
  exp: Experience,
  actionsByDefinition: Map<string, ResponseActions>,
): ComponentNode {
  const layout = route.layout ?? "shell-with-main";
  const shellChildren = composeSlot(route, "shell", bag, exp, actionsByDefinition);

  if (layout === "shell-with-main") {
    const bodyChildren = orderedSlotNames(route)
      .filter((slotName) => slotName !== "shell")
      .flatMap((slotName) => composeSlot(route, slotName, bag, exp, actionsByDefinition));
    return {
      component: "Stack",
      id: idFor(route.id, "root"),
      extensions: {
        "x-formspec-surface": {
          routeId: route.id,
          path: route.path,
          layout,
          slotTypes: collectSlotTypes(route),
        },
      },
      "x-generation": xgen(`surface:${route.id}`, "route-shell-with-main", [], moduleRef("x-formspec-surface")),
      children: [...shellChildren, ...bodyChildren],
    };
  }

  const pane = (name: "left" | "main" | "right"): ComponentNode => ({
    component: "Stack",
    id: idFor(route.id, "pane", name),
    extensions: {
      "x-formspec-surface": {
        routeId: route.id,
        pane: name,
        slotTypes: (route.slots[name] ?? []).map((entry) => entry.type),
      },
    },
    "x-generation": xgen(`surface:${route.id}`, `pane-${name}`, [], moduleRef("x-formspec-surface")),
    children: [
      ...composeSlot(route, name, bag, exp, actionsByDefinition),
      ...(name === "main" ? composeSlot(route, "main-footer", bag, exp, actionsByDefinition) : []),
    ],
  });

  return {
    component: "Stack",
    id: idFor(route.id, "root"),
    extensions: {
      "x-formspec-surface": {
        routeId: route.id,
        path: route.path,
        layout,
        slotTypes: collectSlotTypes(route),
      },
    },
    "x-generation": xgen(`surface:${route.id}`, "route-shell-with-three-pane", [], moduleRef("x-formspec-surface")),
    children: [
      ...shellChildren,
      {
        component: "Grid",
        id: idFor(route.id, "threePane"),
        columns: ["260px", "1fr", "320px"],
        extensions: {
          "x-formspec-surface": { routeId: route.id, kind: "three-pane" },
        },
        "x-generation": xgen(`surface:${route.id}`, "three-pane-grid", [], moduleRef("x-formspec-surface")),
        children: [pane("left"), pane("main"), pane("right")],
      },
    ],
  };
}

// ---------- Top-level ----------

export function generateBundle(inputs: GeneratorInputs): MultiRouteBundle {
  const bag = buildDefinitionBag(inputs.definitions);
  const actionsByDefinition = new Map(inputs.responseActions.map((ra) => [ra.targetDefinition.url, ra]));
  const defaultShimDefinition = bag.byName.get("new-matter") ?? bag.definitions[0];

  const routes = inputs.surface.routes.map((route) => {
    const tree = emitRouteTree(route, inputs.surface, bag, inputs.experience, actionsByDefinition);
    const firstDefinitionSlot = routeDefinitionSlot(route);
    const routeDefinition = firstDefinitionSlot?.definitionRef ? findDefinition(bag, firstDefinitionSlot.definitionRef) : defaultShimDefinition;
    const usesDefinitionShim = !firstDefinitionSlot;
    const doc: ComponentDoc = {
      $formspecComponent: "1.1",
      version: "1.0.0",
      name: `lexassist-${route.id}`,
      title: `${inputs.surface.appName} - ${route.label ?? route.id}`,
      targetDefinition: {
        url: routeDefinition.url,
        compatibleVersions: `>=${routeDefinition.version} <${nextMajor(routeDefinition.version)}`,
      },
      extensions: {
        "x-formspec-surface": {
          routeId: route.id,
          path: route.path,
          targetSurface: inputs.surface.url,
          formCapable: !usesDefinitionShim,
          definitionRefs: Object.values(route.slots)
            .flat()
            .filter((entry) => entry.type === "definition-form" && entry.definitionRef)
            .map((entry) => entry.definitionRef),
        },
        ...(usesDefinitionShim
          ? {
              "x-spike-v2-current-schema-gap": {
                reason: "Component 1.1 still requires targetDefinition, even for ADR-0150 non-form Surface routes.",
                shimTargetDefinition: routeDefinition.url,
              },
            }
          : {}),
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

  if (routes.length > 0 && !routes.some((r) => r.default)) routes[0].default = true;
  return { appName: inputs.surface.appName, appTagline: inputs.surface.appTagline, nav: inputs.surface.nav ?? [], routes };
}

function nextMajor(v: string): string {
  const [maj] = v.split(".");
  return `${Number(maj) + 1}.0.0`;
}
