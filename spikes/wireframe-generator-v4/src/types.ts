/** @filedesc Minimal spike-local types. Repository JSON Schemas remain authoritative. */

export type JsonObject = Record<string, unknown>;

export type ModuleRef = {
  id: string;
  version: string;
  publisher?: string;
  lockHash?: string;
  extensions?: JsonObject;
};

export type SiblingRef = {
  url: string;
  version?: string;
  fixture?: string;
  [k: string]: unknown;
};

export type ExperienceRef = SiblingRef & {
  targetDefinitions: Array<{ url: string; compatibleVersions?: string }>;
};

export type ResponseActionsRef = SiblingRef & {
  targetDefinition: { url: string; compatibleVersions?: string };
};

export type SessionRef = {
  id: string;
  openedAt: string;
  closedAt?: string;
  actors: string[];
  extensions?: JsonObject;
};

export type AppManifest = {
  $formspecBundle: "2.0";
  version: string;
  id: string;
  name?: string;
  title?: string;
  description?: string;
  definitions: SiblingRef[];
  experiences: ExperienceRef[];
  responseActions: ResponseActionsRef[];
  registries?: SiblingRef[];
  surfaces?: SiblingRef[];
  dataSources?: SiblingRef[];
  posture?: SiblingRef;
  screeners?: SiblingRef[];
  runtimePlan?: SiblingRef;
  modules?: ModuleRef[];
  sessions?: SessionRef[];
  locales?: Array<SiblingRef & { locale: string }>;
  [k: string]: unknown;
};

export type PostureDeclaration = {
  $postureDeclaration: "1.0";
  url: string;
  version: string;
  allowedModules?: ModuleRef[];
  allowedActors?: string[];
  [k: string]: unknown;
};

export type RegistryEntry = {
  name: string;
  category: string;
  version: string;
  status: string;
  contributes?: string[];
  dependencies?: ModuleRef[];
  semantics?: JsonObject;
  widgetShape?: { props?: JsonObject; childrenPolicy?: string; fallback?: string };
  slotShape?: JsonObject;
  validation?: JsonObject;
  [k: string]: unknown;
};

export type Registry = {
  $formspecRegistry: "1.0";
  entries: RegistryEntry[];
  [k: string]: unknown;
};

export type DataSource = {
  id: string;
  kind: "host-state" | "definition-response" | "document-resource" | "conversation-stream" | "route-params";
  definitionRef?: string;
  routeRef?: string;
  owner: "host" | "formspec" | "module";
  scope: "session" | "route" | "definition" | "resource";
  cache: { mode: "snapshot" | "subscribe" | "draft" | "none"; staleAfter?: string };
  schema?: JsonObject;
  description?: string;
};

export type DataSourceCatalog = {
  $wireframeDataSources: "0.1-spike-v4";
  url?: string;
  version?: string;
  description?: string;
  sources: DataSource[];
};

// ---------- Formspec Definition subset ----------

export type DefItem = {
  type: "field" | "group" | "display";
  key: string;
  label: string;
  dataType?: string;
  semanticType?: string;
  description?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  optionSet?: string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  currency?: string;
  presentation?: { widgetHint?: string; layout?: Record<string, unknown> };
  repeatable?: boolean;
  minRepeat?: number;
  maxRepeat?: number;
  children?: DefItem[];
  initialValue?: unknown;
  extensions?: JsonObject;
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
  $formspec: "1.0";
  modules?: ModuleRef[];
  url: string;
  version: string;
  status: "draft" | "active" | "retired";
  name?: string;
  title: string;
  description?: string;
  date?: string;
  items: DefItem[];
  binds?: DefBind[];
  optionSets?: Record<string, { options: { value: string; label: string }[] }>;
  extensions?: JsonObject;
};

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
  extensions?: JsonObject;
};

export type Experience = {
  $formspecExperience: "1.0";
  modules?: ModuleRef[];
  version: string;
  name?: string;
  title?: string;
  description?: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  actors?: { id: string; title?: string; description?: string; extensions?: JsonObject }[];
  tasks?: { id: string; title?: string; description?: string; actorRefs?: string[]; extensions?: JsonObject }[];
  units?: ExpUnit[];
  extensions?: JsonObject;
};

// ---------- Response Actions ----------

export type LiteralLabel = { literal: string } | { ref: string };

export type RaAction = {
  id: string;
  intent: string;
  label?: LiteralLabel;
  actor?: string;
  preconditions?: { id: string; expression: string; severity: string }[];
  validation?: { profile: string; blocking: string; persistence: string };
  effects: { type: string; [k: string]: unknown }[];
};

export type ResponseActions = {
  $formspecResponseActions: "1.0";
  modules?: ModuleRef[];
  version: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  actions: RaAction[];
};

// ---------- Surface (spike-local, ADR-0150-shaped) ----------

export type SurfaceSlotType =
  | "definition-form"
  | "experience-unit"
  | "module-widget"
  | "static-content"
  | "embed-route";

export type ResponseBinding = {
  owner: "response";
  instancePolicy: "session-singleton" | "route-param-scoped";
  routeParam?: string;
  actionOwner: "response-actions";
};

export type SurfaceSlotEntry = {
  type: SurfaceSlotType;
  title?: string;
  definitionRef?: string;
  unitRef?: string;
  widgetRef?: string;
  routeRef?: string;
  module?: ModuleRef;
  responseBinding?: ResponseBinding;
  content?: { heading?: string; body?: string };
  payload?: JsonObject;
};

export type SurfaceRoute = {
  id: string;
  path: string;
  label?: string;
  default?: boolean;
  layout?: "shell-with-main" | "shell-with-three-pane";
  params?: { name: string; type: string; example?: string }[];
  slots: Record<string, SurfaceSlotEntry[]>;
  transitions?: { on: string; to: string; params?: Record<string, string> }[];
};

export type Surface = {
  $formspecSurface: string;
  url: string;
  version: string;
  modules?: ModuleRef[];
  description?: string;
  appName: string;
  appTagline?: string;
  targetExperience: { url: string; compatibleVersions?: string };
  nav?: { label: string; path: string }[];
  routes: SurfaceRoute[];
};

// ---------- Component output ----------

export type ComponentNode = {
  component: string;
  [k: string]: unknown;
};

export type ComponentDoc = {
  $formspecComponent: "1.1";
  version: string;
  name?: string;
  title?: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  tree: ComponentNode;
  extensions?: Record<string, unknown>;
};

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

export type GeneratorInputs = {
  appManifest: AppManifest;
  definitions: Definition[];
  experience: Experience;
  responseActions: ResponseActions[];
  registry: Registry;
  surface: Surface;
  runtimePlan?: { url?: string; version?: string; [k: string]: unknown };
  posture?: PostureDeclaration;
  dataSources?: DataSourceCatalog;
  screener?: JsonObject;
  locales?: JsonObject[];
};
