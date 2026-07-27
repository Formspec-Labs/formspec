/**
 * @filedesc Spike v9 harness — v8's persona/slot-spec machinery plus the three
 * things v9 exists to measure: real Ajv schema validation, a `declareRegistry`
 * arm, and a `routeClass` reachability probe on `addRoute`.
 *
 * Divergences from v8, each deliberate and each load-bearing on a prediction:
 *
 * 1. **Real Ajv.** v8 passed `schemaValidators: () => ({ ok: true })`, so its
 *    "schema: completed" meant "the pipeline reached the phase", not "Ajv
 *    accepted the document". Every v8 diagnostic count therefore excluded all
 *    schema conformance. v9 uses the E4 pattern: every resolved artifact and
 *    every host-evidence document is validated against its published `$id` from
 *    `formspec/schemas/`. Diagnostic deltas vs v8 are reported both ways —
 *    all-codes and schema-excluded — because only the second is like-for-like.
 *
 * 2. **Four arms.** `v8-parity` reproduces v8's authoring shape so the schema
 *    change can be priced on its own; `verb-only` adds what the published verbs
 *    reach; `host-authored` adds a Registry hand-composed from `declareModule`'s
 *    docstring recipe; `host-corrected` adds the fixes the validator's own
 *    diagnostics name. See `RegistryArm`. The spread across arms IS the answer to
 *    predictions P2 and P4 — a single number would have mixed three effects.
 *
 * 3. **routeClass probe, read back from the kernel.** Every route is offered to
 *    `addRoute` with the class the mockup's vocabulary implies. The Surface the
 *    host then serves is the one `exportSurfaceDocument` produces, NOT one the
 *    spike derived from its own slot specs the way v8 did — so the document can
 *    only assert what an authoring verb actually recorded, and `verbOk` vs
 *    `persisted` become separable facts.
 *
 * 4. **Tenant-theme probe.** Surfaces the product says MUST NOT be tenant-themed
 *    carry `theme.assignments[]` in their UI Graph Policy. Whether the substrate
 *    refuses is measured, not asserted.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020, { type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { initFormspecEngine, initFormspecEngineTools } from '@formspec-org/engine';
import {
  createWireframesMcp,
  type WireframesMcp,
  type WireframesContext,
} from '@formspec-org/mcp-wireframes';
import type { AuthorActor, SessionRef } from '@formspec-org/studio-core';
import type {
  ArtifactLoader,
  ArtifactLoaderInput,
  ArtifactLoaderOutcome,
  SchemaValidationOutcome,
} from '@formspec-org/app-graph';
import type { UiGraphPolicyDocument } from '@formspec-org/types';
import type { FindingsCollector, GapFamily, V7Ref, Disposition } from './findings.js';

export const SPIKE_ROOT = resolve(import.meta.dirname, '..');

/**
 * Output root. Defaults to the spike dir, so a deliberate re-measurement rewrites the
 * checked-in evidence — which is the point of a re-measurement.
 *
 * `V9_OUTPUT_ROOT` redirects it. **Use it for any run that is not a re-measurement.**
 * The reports and artifacts in this spike are the numbers ADR 0160 §7 cites as its
 * baseline; a run that executes only to prove the harness still compiles must not
 * overwrite them, and a run that fails partway must not leave a half-written baseline
 * behind that reads as a measurement.
 */
const OUTPUT_ROOT = process.env.V9_OUTPUT_ROOT
  ? resolve(process.env.V9_OUTPUT_ROOT)
  : SPIKE_ROOT;
export const ARTIFACTS_DIR = resolve(OUTPUT_ROOT, 'artifacts');
export const REPORTS_DIR = resolve(OUTPUT_ROOT, 'reports');
const SCHEMAS_DIR = resolve(SPIKE_ROOT, '..', '..', 'schemas');

/** The workaround marker. Every string the validator cannot read starts with this. */
export const SPIKE_MARK = 'x-spike-v9:';

// ─────────────────────────────────────────────────────────────────────────────
// Real Ajv over the shipped schema corpus (E4 pattern — no stubs)
// ─────────────────────────────────────────────────────────────────────────────

/** Artifact kind → published schema `$id` the ArtifactResolver hands a validator. */
const SCHEMA_ID_BY_KIND: Record<string, string> = {
  appManifest: 'https://formspec.org/schemas/bundleManifest/2.3',
  definition: 'https://formspec.org/schemas/definition/1.0',
  surface: 'https://formspec.org/schemas/surface/0.1',
  registry: 'https://formspec.org/schemas/registry/v1.0/registry.json',
  theme: 'https://formspec.org/schemas/theme/1.0',
  dataSources: 'https://formspec.org/schemas/dataSources/1.0',
  responseActions: 'https://formspec.org/schemas/responseActions/1.0',
  experience: 'https://formspec.org/schemas/experience/1.0',
};

let ajvSingleton: Ajv2020 | undefined;

function ajv(): Ajv2020 {
  if (ajvSingleton) return ajvSingleton;
  const instance = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(instance as never);
  for (const file of readdirSync(SCHEMAS_DIR).filter((name) => name.endsWith('.json'))) {
    const schema = JSON.parse(readFileSync(resolve(SCHEMAS_DIR, file), 'utf8')) as AnySchemaObject;
    if (typeof schema.$id !== 'string') continue;
    instance.addSchema(schema, schema.$id);
  }
  ajvSingleton = instance;
  return instance;
}

function compiled(schemaId: string): ValidateFunction | undefined {
  try {
    return ajv().getSchema(schemaId);
  } catch {
    return undefined;
  }
}

function outcomeFor(schemaId: string | undefined, document: unknown): SchemaValidationOutcome {
  if (!schemaId) return { ok: true };
  const validate = compiled(schemaId);
  if (!validate) {
    return {
      ok: false,
      issues: [{ code: 'V9-SCHEMA-UNAVAILABLE', message: `No compiled schema for ${schemaId}.` }],
    };
  }
  if (validate(document)) return { ok: true };
  return {
    ok: false,
    issues: (validate.errors ?? []).map((error) => ({
      code: 'APP-GRAPH-SCHEMA',
      message: `${error.instancePath || '/'} ${error.message ?? 'failed'}`,
      path: error.instancePath,
      keyword: error.keyword,
      details: { schemaId, params: error.params as Record<string, unknown> },
    })),
  };
}

export function realSchemaValidators() {
  return (input: { artifactKind: string; schemaId?: string; document: unknown }): SchemaValidationOutcome =>
    outcomeFor(input.schemaId ?? SCHEMA_ID_BY_KIND[input.artifactKind], input.document);
}

export function realEvidenceSchemaValidators() {
  return (input: { schemaId?: string; document: unknown }): SchemaValidationOutcome =>
    outcomeFor(input.schemaId, input.document);
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot / route / surface shapes
// ─────────────────────────────────────────────────────────────────────────────

/** ADR 0153 §6.2 closed slot-type taxonomy, as published on the MCP surface. */
export type SlotType =
  | 'definition-form'
  | 'experience-unit'
  | 'module-widget'
  | 'static-content'
  | 'embed-route';

/**
 * The class the persona would state for a route, drawn from the mockup corpus's
 * own vocabulary (the product calls these surfaces receipts, ceremonies,
 * verifiers, trust pages, sign-ins, and console UI). Whether `addRoute` accepts
 * the word is the thing under measurement — the persona does not know.
 */
export type RouteClassAttempt =
  | 'intake'
  | 'proof'
  | 'ceremony'
  | 'verification'
  | 'attestation'
  | 'authentication'
  | 'operation';

export interface SlotSpec {
  id: string;
  slotType: SlotType;
  binding: unknown;
  title?: string;
  position?: string;
  /** Mockup region this slot stands in for — the translation audit trail. */
  mockupRegion: string;
}

export interface RouteSpec {
  routeId: string;
  path: string;
  title: string;
  /** What the persona wants to say this route presents. Offered to `addRoute`. */
  routeClass?: RouteClassAttempt;
  slots: SlotSpec[];
}

export interface SurfaceDoc {
  $formspecSurface: '0.1';
  id: string;
  entry: string;
  routes: Array<{
    id: string;
    path: string;
    title?: string;
    routeClass?: string;
    slots: Array<{ id: string; slotType: SlotType; binding: unknown; title?: string }>;
  }>;
}

/**
 * Per-route record of what `addRoute` did with the offered class.
 *
 * `verbOk` and `persisted` are deliberately separate. A verb that returns
 * `ok: true` has not necessarily recorded what it was handed, and the difference
 * between those two facts is the whole finding: `persisted` is read back from
 * the Surface document the kernel exports, so it cannot be talked into being
 * true by the caller.
 */
export interface RouteClassOutcome {
  routeId: string;
  wanted: RouteClassAttempt | null;
  /** `addRoute` returned ok when handed the class. */
  verbOk: boolean;
  /** The class is present on this route in the kernel's exported Surface. */
  persisted: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/** What `exportSurfaceDocument` said about the authored Surface. */
export interface SurfaceExportOutcome {
  publishable: boolean;
  error?: string;
  diagnostics: Array<{ code: string; message: string }>;
}

/** A tenant-brand token assignment the persona pushes at a protected surface. */
export interface TenantThemeAssignment {
  widgetRef: { moduleId: string; widgetName: string };
  slot: string;
  token: string;
}

/** One translated mockup surface. */
export interface SurfaceScript {
  /** Spike-local surface id (also the report filename stem). */
  id: string;
  /** Mockup file this surface was translated from. */
  mockup: string;
  /** Pattern family from classification.json. */
  family: string;
  /** Production route from the mockup route map. */
  route: string;
  /** Surface id the kernel derives from the surface URL's last path segment. */
  surfaceId: string;
  bundleId: string;
  surfaceUrl: string;
  brief: string;
  title: string;
  /**
   * Tenant-brand token assignments to push into the UI Graph Policy. Set only on
   * surfaces the product's own trust story says MUST NOT be tenant-themed; the
   * substrate's response is the measurement.
   */
  tenantThemeProbe?: TenantThemeAssignment[];
  /** Drives the MCP; returns the routes it authored plus the policy document. */
  author: (ctx: AuthoringContext) => Promise<{ routes: RouteSpec[]; policy: UiGraphPolicyDocument }>;
}

export interface AuthoringContext {
  mcp: WireframesMcp;
  findings: FindingsCollector;
  script: SurfaceScript;
  /** Bind a route's slots through the MCP, recording any refusal as a finding. */
  bindRoute: (route: RouteSpec) => Promise<void>;
  /** Record a primary finding with surface/mockup pre-filled. */
  gap: (f: {
    id: number;
    verb: string;
    family: GapFamily;
    wanted: string;
    got: string;
    severity: 'reshape-needed' | 'workaround-acceptable' | 'missing-feature' | 'design-fit';
    why: string;
    v7Ref: V7Ref;
    disposition?: Disposition;
    suggestion?: string;
  }) => void;
  /** Registry URL declared for this bundle (arm B populates it). */
  registryUrl: string;
  /** Whether `declareRegistry` accepted — the new-in-v9 admission path. */
  registryDeclared: boolean;
  /** Which arm this run is: what the verbs reach, vs what the host can add. */
  arm: RegistryArm;
}

/**
 * The MCP's Definition verbs run through the WASM runtime, so a host that never
 * initialises it gets `UNKNOWN: Formspec runtime WASM is not initialized` from
 * `addDefinitionStub` — a failure mode v8 never reached, because v8 could not
 * mint a Definition to add items to. See finding 21.
 */
let enginePromise: Promise<void> | undefined;
export function ensureEngine(): Promise<void> {
  enginePromise ??= (async () => {
    await initFormspecEngine();
    await initFormspecEngineTools();
  })();
  return enginePromise;
}

export function personaContext(surfaceId: string): WireframesContext {
  const author: AuthorActor = {
    id: 'urn:formspec-cloud:actor:product-manager:wireframe-spike-v9',
    kind: 'human',
    actChannel: 'mcp',
  };
  const session: SessionRef = {
    id: `urn:formspec-cloud:session:wireframe-spike-v9:${surfaceId}`,
    openedAt: '2026-07-26T00:00:00Z',
    actors: [author.id],
  };
  return { authoredBy: author, session };
}

/**
 * Reads back the `routeClass` actually present on each route of a Surface
 * document. v8 hand-derived the loaded Surface from the persona's own slot
 * specs, which meant the document could assert anything the persona wrote down
 * whether or not a verb had recorded it. v9 serves the kernel's own exported
 * Surface instead, so this function reads evidence rather than intent.
 */
export function routeClassesIn(document: unknown): Map<string, string | undefined> {
  const result = new Map<string, string | undefined>();
  if (document === null || typeof document !== 'object') return result;
  const routes = (document as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return result;
  for (const route of routes) {
    if (route === null || typeof route !== 'object') continue;
    const r = route as { id?: unknown; routeClass?: unknown };
    if (typeof r.id !== 'string') continue;
    result.set(r.id, typeof r.routeClass === 'string' ? r.routeClass : undefined);
  }
  return result;
}

export function makeLoader(documents: Record<string, unknown>): ArtifactLoader {
  return ({ artifactKind, ref }: ArtifactLoaderInput): ArtifactLoaderOutcome => {
    const url = ref.url;
    if (url !== undefined && Object.prototype.hasOwnProperty.call(documents, url)) {
      return {
        status: 'loaded',
        source: `spike-v9:${artifactKind}:${url}`,
        schemaId: SCHEMA_ID_BY_KIND[artifactKind],
        document: documents[url],
      };
    }
    return { status: 'missing', source: url ?? '(no url)' };
  };
}

export function phaseStatus(
  report: { phases: Array<{ phase: string; status: string }> },
  name: string,
): string | undefined {
  return report.phases.find((p) => p.phase === name)?.status;
}

/**
 * Maps a validator diagnostic to the primary finding that produced it. Same
 * mapping v8 used, plus the codes only v9's probes can raise.
 */
export function mapDiagnostic(
  code: string,
  fallback: { confirms: number; family: GapFamily; v7Ref: V7Ref },
): { confirms: number; family: GapFamily; v7Ref: V7Ref } {
  if (code === 'THEME-ROUTE-CLASS') {
    return { confirms: 6, family: 'theming-and-density', v7Ref: null };
  }
  if (code.startsWith('THEME-')) {
    // Theme token/widget resolution, not theming authority — finding 39.
    return { confirms: 39, family: 'theming-and-density', v7Ref: null };
  }
  if (code === 'APP-GRAPH-SCHEMA') {
    // Real-Ajv-only diagnostic; v8's stub could not emit it — finding 40.
    return { confirms: 40, family: 'mcp-verb-surface', v7Ref: null };
  }
  if (code.startsWith('MODULE-')) {
    // No Registry admission path for product modules — finding 18.
    return { confirms: 18, family: 'mcp-verb-surface', v7Ref: null };
  }
  if (code.includes('EXPERIENCE-UNIT')) {
    // experience-unit standing in for a read-only panel — finding 24 (v7 F4).
    return { confirms: 24, family: 'read-only-display', v7Ref: 'F4' };
  }
  if (code.includes('DEFINITION')) {
    // definition-form bound to a Definition no verb could mint — finding 21 (v7 F14).
    return { confirms: 21, family: 'mcp-verb-surface', v7Ref: 'F14' };
  }
  return fallback;
}

/**
 * Counts the workaround strings the persona had to write into slot bindings
 * because no substrate primitive accepted the shape. One mechanical rule: every
 * string value anywhere inside an authored slot binding that starts with
 * `x-spike-v9:`. These are the bindings the validator cannot read.
 */
export function countSpikeBindings(routes: RouteSpec[]): { sites: number; distinct: string[] } {
  const found: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v.startsWith(SPIKE_MARK)) found.push(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v !== null && typeof v === 'object') {
      for (const item of Object.values(v)) walk(item);
    }
  };
  for (const route of routes) for (const slot of route.slots) walk(slot.binding);
  return { sites: found.length, distinct: [...new Set(found)].sort() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry composition — arm B only
// ─────────────────────────────────────────────────────────────────────────────

interface ManifestModule {
  id: string;
  version?: string;
}

/**
 * The Registry document a host would hand-write to admit the modules this
 * surface declared. Composed from the recipe stated in `declareModule`'s own
 * docstring — "a Registry declared via `declareRegistry` whose entries carry a
 * `category: \"module\"` entry named for this module's id" — plus one `widget`
 * entry per widget name actually bound, because module admission alone does not
 * obviously admit widgets and the persona has no way to find out but to try.
 *
 * Everything outside the two documented keys (`name`, `category`) is a guess.
 * Real Ajv over `registry.schema.json` grades the guess: a schema failure here
 * is itself the finding, because the recipe the published verb states is the
 * only instruction the author has.
 */
export function composeRegistry(
  modules: ManifestModule[],
  widgets: Map<string, Set<string>>,
  corrected: boolean,
): unknown {
  const entries: unknown[] = [];
  for (const module of modules) {
    const contributed = [...(widgets.get(module.id) ?? new Set<string>())].sort();
    entries.push({
      name: module.id,
      category: 'module',
      version: module.version ?? '0.1.0',
      status: 'stable',
      description: `Formspec Cloud product module ${module.id}.`,
      compatibility: { formspecVersion: '>=1.0.0' },
      ...(contributed.length > 0 ? { contributes: contributed } : {}),
    });
    for (const widget of contributed) {
      entries.push({
        name: widget,
        category: 'widget',
        version: module.version ?? '0.1.0',
        status: 'stable',
        description: `Widget ${widget} contributed by ${module.id}.`,
        compatibility: { formspecVersion: '>=1.0.0' },
        // `widgetShape` is not in any published docstring. The persona adds it
        // in the corrected arm because APP-GRAPH-SCHEMA named it by keyword.
        ...(corrected
          ? {
              widgetShape: {
                tokenSlots: [
                  { name: 'accent', acceptedTokenCategories: ['color'] },
                  { name: 'surface', acceptedTokenCategories: ['color'] },
                ],
              },
            }
          : {}),
      });
    }
  }
  return {
    $formspecRegistry: '1.0',
    publisher: { name: 'Formspec Cloud (host-authored, no MCP verb)' },
    published: '2026-07-26T00:00:00Z',
    entries,
  };
}

/**
 * Widget names bound per module, harvested from the Surface document the kernel
 * produced — not from the persona's slot specs. A Registry composed from intent
 * rather than from the artifact would admit names the graph never sees.
 */
export function widgetsByModule(surfaceDocument: unknown): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (v === null || typeof v !== 'object') return;
    const record = v as Record<string, unknown>;
    if (typeof record.moduleId === 'string' && typeof record.widgetName === 'string') {
      const set = map.get(record.moduleId) ?? new Set<string>();
      set.add(record.widgetName);
      map.set(record.moduleId, set);
    }
    for (const value of Object.values(record)) walk(value);
  };
  walk(surfaceDocument);
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Four arms, each isolating one variable, because v9's headline number would
 * otherwise mix three unrelated effects.
 *
 * - `v8-parity` — v8's exact authoring shape (no `declareRegistry`, no theme
 *   probe), re-run under real Ajv. Its delta against v8's 95 errors is the
 *   *schema* effect alone, with nothing else moving.
 * - `verb-only` — what an author holding only the published verb surface can do:
 *   `declareRegistry` names a Registry, and no verb can populate it, so the host
 *   serves nothing for that URL.
 * - `host-authored` — the same graph plus a Registry document hand-composed from
 *   the recipe stated in `declareModule`'s docstring. Grades the recipe.
 * - `host-corrected` — the same again after the persona reads the validator's own
 *   diagnostics and fixes what they name (widget naming, required entry fields).
 *   This is the best case reachable by a team that owns both the authoring
 *   journey and the host, and it is the arm that answers whether the theming
 *   guard can fire at all.
 */
export type RegistryArm =
  | 'v8-parity'
  | 'verb-only'
  | 'host-authored'
  | 'host-corrected'
  /**
   * ADR 0160 §7.1's fifth arm. The Registry and the Theme are MINTED by the verb
   * family and owned by the kernel: `declareRegistry` with no `url`,
   * `addRegistryEntry` per contribution, `declareTheme` + `setThemeToken` per
   * assigned token. **No host loader is wired at all** and `hostDocuments` stays
   * empty — the claim under measurement is that a bundle authored only through
   * verbs resolves with nothing behind it.
   */
  | 'materialised';

/**
 * The `^x-[a-z]…` contribution id for a module's widget — ADR 0160 §2.4's first
 * vocabulary. It is NOT the Surface binding's `widgetName` (second vocabulary), which
 * `addRegistryEntry` puts in `widgetShape.widgetName`; conflating them re-files v9
 * finding 41 instead of closing it. Module-prefixed so ids are globally unique, which
 * is what the schema's `(name, version)` uniqueness scope assumes.
 */
export function contributionIdFor(moduleId: string, widgetName: string): string {
  const kebab = widgetName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
  return `${moduleId}-${kebab}`;
}

/**
 * Widget-name normalization the persona applies ONLY in `host-corrected`, and
 * only because `APP-GRAPH-SCHEMA` told them to: registry entry names and Theme
 * `widgetRef.widgetName` must match `^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$`, and
 * `bindSlot` accepted the PascalCase names v8 authored without a word.
 * `FormsCollection` → `x-forms-collection`.
 */
export function normalizeWidgetName(name: string): string {
  if (/^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/.test(name)) return name;
  const kebab = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
  return `x-${kebab}`;
}

/** Rewrites every `widgetName` inside one slot binding. */
export function normalizeBinding(binding: unknown): unknown {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, value]) =>
          k === 'widgetName' && typeof value === 'string'
            ? [k, normalizeWidgetName(value)]
            : [k, walk(value)],
        ),
      );
    }
    return v;
  };
  return walk(binding);
}

/**
 * Which authority owns a diagnostic — the axis ADR 0160 §7's acceptance bars are
 * scoped on. The verb family v1 is closed (§4.1), so a diagnostic on a path no
 * member of it can reach is not evidence about the family either way. The split
 * is structural, read off the diagnostic's own `primarySource`, so it cannot be
 * tuned: every error lands in exactly one bucket and the buckets sum to the
 * whole-graph total, which stays reported beside them.
 *
 * - `verb-family` — reachable by `declareRegistry` / `addRegistryEntry` /
 *   `declareTheme` / `setThemeToken` plus the bundle-local loader: the manifest
 *   `modules[]` index, Surface `module-widget` bindings, and resolution of every
 *   bundle-local artifact. **The `MODULE-*` and `cross-artifact` bars are scoped
 *   here.** `ARTIFACT-MISSING` and `THEME-TOKEN-REF` stay unscoped — arm D meets
 *   both whole-graph, so scoping them would buy nothing.
 * - `host-evidence` — supplied by the host as evidence (`hostEvidence.*`), not a
 *   bundle artifact. §6 excludes policy authoring from v1: no verb writes it.
 *   `THEME-TOKEN-REF` originates here too, which is why arm D reaching 0 on it is
 *   a claim about the minted Theme rather than about the policy.
 * - `corpus-identifier` — an identifier the persona authored through a
 *   pre-existing verb that no materialisation verb can make valid (v9's
 *   `x-spike-v9:` unit-kind marker). §4.2(b) made it visible; it did not cause it.
 * - `surface-composition` — a bundle-local Surface that will not publish. §7 row
 *   1a pre-registered this as the out-of-scope twelfth surface.
 */
export type DiagnosticScope =
  | 'verb-family'
  | 'host-evidence'
  | 'corpus-identifier'
  | 'surface-composition';

/** Minimal diagnostic shape the scope split reads. */
interface ScopedDiagnostic {
  code: string;
  primarySource?: { artifactSlot?: string; artifactKind?: string; jsonPointer?: string };
}

const EXPERIENCE_UNIT_KIND_POINTER = /^\/units\/\d+\/kind$/;

/** See {@link DiagnosticScope}. Structural — no code list, no surface list. */
export function scopeOfDiagnostic(d: ScopedDiagnostic): DiagnosticScope {
  const src = d.primarySource ?? {};
  if ((src.artifactSlot ?? '').startsWith('hostEvidence.')) return 'host-evidence';
  if (src.artifactKind === 'experience' && EXPERIENCE_UNIT_KIND_POINTER.test(src.jsonPointer ?? '')) {
    return 'corpus-identifier';
  }
  if (d.code === 'ARTIFACT-STUDIO-BUNDLE-LOCAL-UNPUBLISHABLE' && src.artifactKind === 'surface') {
    return 'surface-composition';
  }
  return 'verb-family';
}

export interface SurfaceOutcome {
  script: SurfaceScript;
  arm: RegistryArm;
  phases: Array<{ phase: string; status: string; reason?: string }>;
  /** `completed` | `skipped` | `not-run` — the phase v8 always reached. */
  crossArtifactStatus: string;
  /** Why cross-artifact was skipped, when it was. */
  crossArtifactReason?: string;
  diagnostics: { error: number; warning: number; info: number };
  diagnosticCodes: string[];
  /** Error diagnostics by code — the unit the v8 delta is computed over. */
  errorCodeCounts: Record<string, number>;
  /**
   * The same errors split by {@link DiagnosticScope}, then by code. Sums back to
   * `errorCodeCounts` exactly, so the scoped view can never be read as fewer
   * errors than the graph actually carries.
   */
  errorCodeCountsByScope: Record<DiagnosticScope, Record<string, number>>;
  slotCount: number;
  routeCount: number;
  /** Workaround bindings the validator cannot read — see countSpikeBindings. */
  spikeBindings: { sites: number; distinct: string[] };
  /** Slot types actually authored on this surface. */
  slotTypes: Record<string, number>;
  /** What `addRoute` did with each offered route class. */
  routeClassOutcomes: RouteClassOutcome[];
  /** Tenant-theme assignments pushed at this surface, if any. */
  tenantThemeAssignments: number;
  /** Diagnostics that would name a theming-authority refusal. */
  themeAuthorityDiagnostics: string[];
  /** Whether the kernel would publish the authored Surface, and why not. */
  surfaceExport: SurfaceExportOutcome;
  declareRegistryOk: boolean;
  declareRegistryError?: string;
  /**
   * The URL `declareRegistry` returned. On the `materialised` arm this is the
   * bundle-scoped URN the kernel minted (§4.3), which is the evidence that the
   * Registry was never a host reference. Absent on `v8-parity`, which declares none.
   */
  declareRegistryUrl?: string;
  /** What the `materialised` arm's verbs actually accepted. Zeroed on other arms. */
  materialisation: MaterialisationOutcome;
}

/**
 * The `materialised` arm's own census. Attempted-vs-accepted is the honest unit:
 * a verb that refuses is data, and a run that silently authored fewer entries than
 * the corpus needs would otherwise read as a clean zero on MODULE-*.
 */
export interface MaterialisationOutcome {
  registryEntriesAttempted: number;
  registryEntriesAccepted: number;
  themeTokensAttempted: number;
  themeTokensAccepted: number;
  refusals: Array<{ verb: string; target: string; code: string; message: string }>;
}

/**
 * Runs one surface script end to end: MCP bootstrap → declareRegistry → author
 * → validate (real Ajv) → persist report + artifact → auto-record every error
 * diagnostic as a finding.
 */
export async function runSurface(
  script: SurfaceScript,
  findings: FindingsCollector,
  diagnosticMapping: { confirms: number; family: GapFamily; v7Ref: V7Ref },
  arm: RegistryArm,
): Promise<SurfaceOutcome> {
  await ensureEngine();

  // ADR 0160 §4.4 — the host ArtifactLoader is DEPLOYMENT-scoped: it is wired at MCP
  // construction, and `produceAppGraphValidationReport` no longer takes a per-call
  // `loader` (passing one throws). Declaration-time refusal (§4.2a) cannot ask a
  // question that is only answered at validation time.
  //
  // The harness's host documents are not known until after authoring — the Surface
  // document is the kernel's own export, and the composed Registry needs the declared
  // module set. So the loader closes over a record the harness fills later; the closure
  // reads it at resolution time, which is what a real deployment's loader does anyway.
  const hostDocuments: Record<string, unknown> = {};
  // §7.2's proof: the materialised arm validates with NO host loader at all. Wiring
  // one "just in case" would make the arm unfalsifiable — every bundle-local miss
  // would fall through to the host and the measurement would say nothing.
  const mcp = createWireframesMcp(
    personaContext(`${script.id}:${arm}`),
    undefined,
    arm === 'materialised' ? {} : { artifactLoader: makeLoader(hostDocuments) },
  );
  const registryUrl = `${script.bundleId}/registries/product-modules`;

  const create = await mcp.wireframeFromBrief({
    bundleId: script.bundleId,
    version: '1.0.0',
    title: script.title,
    brief: script.brief,
    surfaceUrl: script.surfaceUrl,
    surfaceVersion: '1.0.0',
  });
  if (!create.ok) throw new Error(`wireframeFromBrief refused: ${create.error.code} — ${create.error.message}`);

  // NEW IN v9 — the admission-path half of finding 18. The parity arm skips it
  // so its delta against v8 carries only the schema change.
  const registry =
    arm === 'v8-parity'
      ? ({ ok: true, value: undefined } as const)
      : arm === 'materialised'
        // §4.1's reshaped signature: `url` omitted mints a bundle-local Registry the
        // kernel owns, fills through `addRegistryEntry`, and serves with no host.
        ? await mcp.declareRegistry({ version: '1.0.0' })
        : await mcp.declareRegistry({ url: registryUrl, version: '1.0.0' });

  const classOutcomes: RouteClassOutcome[] = [];

  const ctx: AuthoringContext = {
    mcp,
    findings,
    script,
    registryUrl,
    registryDeclared: registry.ok,
    arm,
    // Arm B re-runs the same scripts as a control; recording their findings a
    // second time would double every count in the catalog.
    gap: (f) => {
      if (arm !== 'verb-only') return;
      findings.record({ ...f, surface: script.id, mockup: script.mockup });
    },
    bindRoute: async (route: RouteSpec) => {
      // ── routeClass probe. Offer the class the mockup implies. An MCP verb is
      //    called over the wire with JSON, so an extra key is a runtime question,
      //    not a compile-time one — the cast is what a real tool call looks like.
      const added = await mcp.addRoute({
        surfaceId: script.surfaceId,
        routeId: route.routeId,
        path: route.path,
        title: route.title,
        ...(route.routeClass !== undefined ? { routeClass: route.routeClass } : {}),
      } as Parameters<WireframesMcp['addRoute']>[0]);

      classOutcomes.push({
        routeId: route.routeId,
        wanted: route.routeClass ?? null,
        verbOk: added.ok,
        // Filled in after the kernel exports the Surface — see below.
        persisted: false,
        ...(added.ok ? {} : { errorCode: added.error.code, errorMessage: added.error.message }),
      });

      if (!added.ok) {
        if (arm === 'verb-only') {
          findings.record({
            id: 100 + findings.list().length,
            surface: script.id,
            mockup: script.mockup,
            verb: 'addRoute',
            family: 'app-composition',
            wanted: `Add route ${route.path} to surface ${script.surfaceId}.`,
            got: `addRoute refused: ${added.error.code} — ${added.error.message}`,
            severity: 'reshape-needed',
            why: 'Route-level refusal blocks the whole surface translation.',
            v7Ref: null,
            disposition: 'persists',
          });
        }
        return;
      }

      for (const slot of route.slots) {
        const binding = arm === 'host-corrected' ? normalizeBinding(slot.binding) : slot.binding;
        const bound = await mcp.bindSlot({
          surfaceId: script.surfaceId,
          routeId: route.routeId,
          slotId: slot.id,
          slotType: slot.slotType,
          binding,
          ...(slot.title !== undefined ? { title: slot.title } : {}),
          ...(slot.position !== undefined ? { position: slot.position } : {}),
        });
        if (!bound.ok && arm === 'verb-only') {
          findings.record({
            id: 100 + findings.list().length,
            surface: script.id,
            mockup: script.mockup,
            verb: `bindSlot(${slot.slotType})`,
            family: 'slot-taxonomy',
            wanted: `Bind mockup region "${slot.mockupRegion}" as slot ${slot.id}.`,
            got: `bindSlot refused: ${bound.error.code} — ${bound.error.message}`,
            severity: 'reshape-needed',
            why: 'Even the closest substrate primitive refused this mockup region.',
            v7Ref: null,
            disposition: 'persists',
          });
        }
      }
    },
  };

  const { routes, policy: basePolicy } = await script.author(ctx);

  const corrected = arm === 'host-corrected';

  // ── Tenant-theme probe. Push brand tokens at a surface the product says is
  //    not tenant-themeable, and let the validator answer. The parity arm omits
  //    it so it stays byte-comparable with v8's authoring shape.
  const probe =
    arm === 'v8-parity' || script.tenantThemeProbe === undefined
      ? undefined
      : script.tenantThemeProbe.map((a) => ({
          ...a,
          widgetRef: {
            ...a.widgetRef,
            widgetName: corrected ? normalizeWidgetName(a.widgetRef.widgetName) : a.widgetRef.widgetName,
          },
        }));
  const policy: UiGraphPolicyDocument =
    probe !== undefined
      ? ({ ...basePolicy, theme: { assignments: probe } } as UiGraphPolicyDocument)
      : basePolicy;

  // ── The Surface the host serves is the one the kernel produced, not one the
  //    spike hand-derived from its own intent. This is the correction that makes
  //    the routeClass measurement mean anything: the document can only assert
  //    what an authoring verb actually recorded.
  //
  //    `exportSurfaceDocument` refuses a draft that fails Surface lint, so a
  //    surface the persona could not make publishable falls back to the same
  //    projection via `readSurfaceDraft` — still kernel-produced, and the
  //    refusal is recorded rather than swallowed.
  const exported = await mcp.kernel.exportSurfaceDocument({ surfaceId: script.surfaceId });
  let surfaceExport: SurfaceExportOutcome;
  let surfaceDoc: unknown;
  if (exported.ok) {
    surfaceExport = { publishable: true, diagnostics: [] };
    surfaceDoc = exported.value;
  } else {
    const draft = await mcp.kernel.readSurfaceDraft({ surfaceId: script.surfaceId });
    if (!draft.ok) {
      throw new Error(`readSurfaceDraft refused: ${draft.error.code} — ${draft.error.message}`);
    }
    surfaceExport = {
      publishable: false,
      error: `${exported.error.code} — ${exported.error.message}`,
      diagnostics: draft.value.diagnostics.map((d) => ({ code: d.code, message: d.message })),
    };
    surfaceDoc = draft.value.surface;
  }

  const persistedClasses = routeClassesIn(surfaceDoc);
  for (const outcome of classOutcomes) {
    outcome.persisted =
      outcome.wanted !== null && persistedClasses.get(outcome.routeId) === outcome.wanted;
  }

  // ── ADR 0160 §7.1 fifth arm: MATERIALISE, through verbs only ─────────────
  //
  // Everything the host arms hand-author as a document, this arm mints. Nothing
  // is written into `hostDocuments`: there is no host loader on this arm, so a
  // miss is a miss. Refusals are recorded on the outcome rather than thrown —
  // a verb that cannot express the corpus is the measurement, not a crash.
  const materialisation: MaterialisationOutcome = {
    registryEntriesAttempted: 0,
    registryEntriesAccepted: 0,
    themeTokensAttempted: 0,
    themeTokensAccepted: 0,
    refusals: [],
  };
  if (arm === 'materialised') {
    for (const [moduleId, widgets] of [...widgetsByModule(surfaceDoc)].sort(([a], [b]) => a.localeCompare(b))) {
      const sorted = [...widgets].sort();
      const contributions = sorted.map((widget) => contributionIdFor(moduleId, widget));
      // The module entry names its contributions; the widget entries carry them.
      // §2.4's three vocabularies stay apart: `name` is the x- contribution id,
      // `widgetName` is the Surface binding's own (PascalCase) name.
      materialisation.registryEntriesAttempted += 1 + sorted.length;
      const moduleEntry = await mcp.addRegistryEntry({
        entry: {
          name: moduleId,
          category: 'module',
          version: '0.1.0',
          status: 'stable',
          description: `Formspec Cloud product module ${moduleId}.`,
          compatibility: { formspecVersion: '>=1.0.0' },
          ...(contributions.length > 0 ? { contributes: contributions } : {}),
        },
      });
      if (moduleEntry.ok) materialisation.registryEntriesAccepted += 1;
      else materialisation.refusals.push({ verb: 'addRegistryEntry(module)', target: moduleId, code: moduleEntry.error.code, message: moduleEntry.error.message });

      for (const widget of sorted) {
        const entry = await mcp.addRegistryEntry({
          entry: {
            name: contributionIdFor(moduleId, widget),
            category: 'widget',
            version: '0.1.0',
            status: 'stable',
            description: `Widget ${widget} contributed by ${moduleId}.`,
            compatibility: { formspecVersion: '>=1.0.0' },
            widgetShape: {
              props: { type: 'object' },
              childrenPolicy: 'no-children',
              tokenSlots: [
                { name: 'accent', acceptedTokenCategories: ['color'] },
                { name: 'surface', acceptedTokenCategories: ['color'] },
              ],
            },
          },
          // The verb's ONE shaping obligation (§4.1) — lands in
          // `widgetShape.widgetName`, never in `entry.name`.
          widgetName: widget,
        });
        if (entry.ok) materialisation.registryEntriesAccepted += 1;
        else materialisation.refusals.push({ verb: 'addRegistryEntry(widget)', target: widget, code: entry.error.code, message: entry.error.message });
      }
    }

    // Finding 42's closure: `declareUiGraphPolicy` could assign Theme tokens with
    // no verb to declare a Theme, so THEME-TOKEN-REF fired on every assignment for
    // want of loaded Theme evidence. Mint the Theme and carry the assigned tokens.
    const assignedTokens = [...new Set((probe ?? []).map((assignment) => assignment.token))].sort();
    if (assignedTokens.length > 0) {
      const theme = await mcp.declareTheme({ version: '1.0.0' });
      if (!theme.ok) {
        materialisation.refusals.push({ verb: 'declareTheme', target: script.bundleId, code: theme.error.code, message: theme.error.message });
      } else {
        for (const token of assignedTokens) {
          materialisation.themeTokensAttempted += 1;
          const written = await mcp.setThemeToken({ key: token, value: '#0057B7' });
          if (written.ok) materialisation.themeTokensAccepted += 1;
          else materialisation.refusals.push({ verb: 'setThemeToken', target: token, code: written.error.code, message: written.error.message });
        }
      }
    }
  }

  // Fill the record the construction-time loader closed over (see `hostDocuments`).
  // The materialised arm deliberately leaves it empty — see its construction above.
  if (arm !== 'materialised') hostDocuments[script.surfaceUrl] = surfaceDoc;
  if (arm === 'host-authored' || corrected) {
    const manifestForModules = await mcp.renderPreview();
    const declaredModules =
      manifestForModules.ok && manifestForModules.value !== null && typeof manifestForModules.value === 'object'
        ? (((manifestForModules.value as { modules?: unknown }).modules ?? []) as ManifestModule[])
        : [];
    hostDocuments[registryUrl] = composeRegistry(declaredModules, widgetsByModule(surfaceDoc), corrected);
  }

  const report = await mcp.produceAppGraphValidationReport({
    source: `spike-v9://${script.id}/${arm}/app-manifest`,
    schemaId: SCHEMA_ID_BY_KIND.appManifest,
    schemaValidators: realSchemaValidators(),
    evidenceSchemaValidators: realEvidenceSchemaValidators(),
    uiGraphPolicies: [
      {
        schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
        source: `spike-v9://${script.id}/ui-graph-policy`,
        document: policy,
      },
    ],
  });
  if (!report.ok) {
    throw new Error(`produceAppGraphValidationReport refused: ${report.error.code} — ${report.error.message}`);
  }

  const stem = arm === 'verb-only' ? script.id : `${script.id}.${arm}`;

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(
    resolve(REPORTS_DIR, `${stem}.validation.json`),
    JSON.stringify(report.value, null, 2),
  );

  const manifest = await mcp.renderPreview();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    resolve(ARTIFACTS_DIR, `${stem}.json`),
    JSON.stringify(
      {
        mockup: script.mockup,
        family: script.family,
        route: script.route,
        registryArm: arm,
        // The URL the verb RETURNED, never the one the harness would have asked
        // for. On the materialised arm no `url` is passed and the kernel mints a
        // bundle-scoped URN (§4.3); echoing `registryUrl` there would record an
        // https URL the run never used and hide the one piece of evidence that
        // says the Registry was bundle-local.
        declareRegistry:
          arm === 'v8-parity'
            ? { skipped: 'v8-parity arm does not declare a Registry' }
            : registry.ok
              ? {
                  ok: true,
                  url: registry.value?.url ?? registryUrl,
                  ...(arm === 'materialised'
                    ? { mintedBundleLocal: true }
                    : { requestedUrl: registryUrl }),
                }
              : { ok: false, error: registry.error },
        routeClassOutcomes: classOutcomes,
        surfaceExport,
        manifest: manifest.ok ? manifest.value : null,
        surface: surfaceDoc,
        registryDocument: hostDocuments[registryUrl] ?? null,
        uiGraphPolicy: policy,
        slotMockupRegions: routes.flatMap((r) =>
          r.slots.map((s) => ({ slot: s.id, slotType: s.slotType, mockupRegion: s.mockupRegion })),
        ),
      },
      null,
      2,
    ),
  );

  const diags = report.value.report.diagnostics;
  const errors = diags.filter((d) => d.severity === 'error');
  // Auto-records come from arm A only; arm B is a control, not a second catalog.
  if (arm === 'verb-only') {
    for (const d of errors) {
      findings.recordDiagnostic({
        surface: script.id,
        mockup: script.mockup,
        code: d.code,
        message: d.message ?? '(no message)',
        ...mapDiagnostic(d.code, diagnosticMapping),
      });
    }
  }

  const crossArtifact = report.value.report.phases.find((p) => p.phase === 'cross-artifact') as
    | { phase: string; status: string; reason?: string }
    | undefined;

  return {
    script,
    arm,
    phases: report.value.report.phases.map((p) => ({
      phase: p.phase,
      status: p.status,
      ...((p as { reason?: string }).reason !== undefined
        ? { reason: (p as { reason?: string }).reason }
        : {}),
    })),
    crossArtifactStatus: crossArtifact?.status ?? 'absent',
    ...(crossArtifact?.reason !== undefined ? { crossArtifactReason: crossArtifact.reason } : {}),
    diagnostics: {
      error: errors.length,
      warning: diags.filter((d) => d.severity === 'warning').length,
      info: diags.filter((d) => d.severity === 'info').length,
    },
    diagnosticCodes: [...new Set(diags.map((d) => d.code))].sort(),
    errorCodeCounts: errors.reduce<Record<string, number>>(
      (acc, d) => ({ ...acc, [d.code]: (acc[d.code] ?? 0) + 1 }),
      {},
    ),
    errorCodeCountsByScope: errors.reduce<Record<DiagnosticScope, Record<string, number>>>(
      (acc, d) => {
        const scope = scopeOfDiagnostic(d as ScopedDiagnostic);
        acc[scope][d.code] = (acc[scope][d.code] ?? 0) + 1;
        return acc;
      },
      { 'verb-family': {}, 'host-evidence': {}, 'corpus-identifier': {}, 'surface-composition': {} },
    ),
    slotCount: routes.reduce((n, r) => n + r.slots.length, 0),
    routeCount: routes.length,
    spikeBindings: countSpikeBindings(routes),
    slotTypes: routes
      .flatMap((r) => r.slots)
      .reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.slotType]: (acc[s.slotType] ?? 0) + 1 }), {}),
    routeClassOutcomes: classOutcomes,
    tenantThemeAssignments: probe?.length ?? 0,
    surfaceExport,
    themeAuthorityDiagnostics: [...new Set(diags.filter((d) => d.code === 'THEME-ROUTE-CLASS').map((d) => d.code))],
    declareRegistryOk: registry.ok,
    ...(registry.ok
      ? registry.value !== undefined
        ? { declareRegistryUrl: registry.value.url }
        : {}
      : { declareRegistryError: `${registry.error.code} — ${registry.error.message}` }),
    materialisation,
  };
}
