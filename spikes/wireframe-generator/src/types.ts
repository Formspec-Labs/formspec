/** @filedesc Minimal type aliases for the wireframe-generator spike. Schemas under formspec/schemas/ are authoritative. */

export type Json = unknown;

// ---------- Formspec Definition (subset) ----------

export type DefItem = {
  type: "field" | "group" | "display";
  key: string;
  label?: string;
  dataType?: string;
  semanticType?: string;
  description?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  optionSet?: string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  presentation?: { widgetHint?: string; layout?: Record<string, unknown> };
  repeatable?: boolean;
  minRepeat?: number;
  maxRepeat?: number;
  children?: DefItem[];
  $ref?: string;
  initialValue?: unknown;
};

export type DefBind = {
  path: string;
  required?: string | boolean;
  relevant?: string;
  calculate?: string;
  readonly?: string | boolean;
  constraint?: string;
  constraintMessage?: string;
};

export type Definition = {
  $formspec: string;
  url: string;
  version: string;
  title?: string;
  items: DefItem[];
  binds?: DefBind[];
  shapes?: unknown[];
  optionSets?: Record<string, { options: { value: string; label: string }[] }>;
};

// ---------- Experience ----------

export type ExpUnit = {
  id: string;
  kind: string;
  title?: string;
  description?: string;
  actorRef?: string;
  taskRefs?: string[];
  itemRefs?: { path: string }[];
  actionRefs?: { id: string; role?: string }[];
  accessibility?: { complexity?: "low" | "moderate" | "high" };
  extensions?: Record<string, unknown>;
};

export type Experience = {
  $formspecExperience: string;
  version: string;
  title?: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  actors?: { id: string; title?: string; description?: string }[];
  tasks?: { id: string; title?: string; description?: string; actorRefs?: string[] }[];
  units: ExpUnit[];
};

// ---------- Response Actions ----------

export type RaAction = {
  id: string;
  intent: string;
  label?: string;
  actor?: string;
  preconditions?: { id: string; expression: string; severity: string }[];
  validation?: { profile: string; blocking: string; persistence: string };
  effects: { type: string; [k: string]: unknown }[];
};

export type ResponseActions = {
  $formspecResponseActions: string;
  version: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  actions: RaAction[];
};

// ---------- Surface (spike-only) ----------

export type SurfaceRoute = {
  id: string;
  path: string;
  label?: string;
  default?: boolean;
  layout?: "shell-with-main" | "shell-with-three-pane";
  shellUnitRef?: string;
  params?: { name: string; type: string; example?: string }[];
  slots?: Partial<Record<"left" | "main" | "right" | "main-footer", string[]>>;
  transitions?: { on: string; to: string; params?: Record<string, string> }[];
};

export type Surface = {
  $formspecSurface: string;
  version: string;
  description?: string;
  appName: string;
  appTagline?: string;
  targetExperience: { url: string; compatibleVersions?: string };
  nav?: { label: string; path: string }[];
  routes: SurfaceRoute[];
};

// ---------- Component (per-route output) ----------

export type ComponentNode = {
  component: string;
  [k: string]: unknown;
};

export type ComponentDoc = {
  $formspecComponent: "1.0" | "1.1";
  version: string;
  name?: string;
  title?: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  tree: ComponentNode;
  extensions?: Record<string, unknown>;
};

// ---------- Multi-route bundle ----------

export type MultiRouteBundle = {
  appName: string;
  appTagline?: string;
  nav: { label: string; path: string }[];
  routes: {
    id: string;
    path: string;
    label: string;
    default: boolean;
    layout: "shell-with-main" | "shell-with-three-pane";
    doc: ComponentDoc;
  }[];
};

// ---------- Definition index ----------

export type IndexedItem = {
  path: string;
  item: DefItem;
  isRepeat: boolean;
  binds: DefBind[];
};

export type DefinitionIndex = {
  byPath: Map<string, IndexedItem>;
  bindsByPath: Map<string, DefBind[]>;
};
