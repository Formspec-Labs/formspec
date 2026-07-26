/**
 * @filedesc Spike v8 harness — persona context, slot-spec → bindSlot + loader
 * document bridge, and the validate/persist step every surface script ends on.
 *
 * v7 hand-wrote each Surface document a second time so the ArtifactLoader had
 * something to serve. v8 declares slots once (`SlotSpec[]`) and derives both the
 * `bindSlot` calls and the loaded Surface document from that single list, so a
 * translation gap cannot hide behind a hand-tuned loader copy.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
} from '@formspec-org/app-graph';
import type { UiGraphPolicyDocument } from '@formspec-org/types';
import type { FindingsCollector, GapFamily, V7Ref } from './findings.js';

export const SPIKE_ROOT = resolve(import.meta.dirname, '..');
export const ARTIFACTS_DIR = resolve(SPIKE_ROOT, 'artifacts');
export const REPORTS_DIR = resolve(SPIKE_ROOT, 'reports');

/** ADR 0153 §6.2 closed slot-type taxonomy, as published on the MCP surface. */
export type SlotType =
  | 'definition-form'
  | 'experience-unit'
  | 'module-widget'
  | 'static-content'
  | 'embed-route';

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
    slots: Array<{ id: string; slotType: SlotType; binding: unknown; title?: string }>;
  }>;
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
    suggestion?: string;
  }) => void;
}

export function personaContext(surfaceId: string): WireframesContext {
  const author: AuthorActor = {
    id: 'urn:formspec-cloud:actor:product-manager:wireframe-spike-v8',
    kind: 'human',
    actChannel: 'mcp',
  };
  const session: SessionRef = {
    id: `urn:formspec-cloud:session:wireframe-spike-v8:${surfaceId}`,
    openedAt: '2026-07-26T00:00:00Z',
    actors: [author.id],
  };
  return { authoredBy: author, session };
}

export function toSurfaceDoc(script: SurfaceScript, routes: RouteSpec[]): SurfaceDoc {
  return {
    $formspecSurface: '0.1',
    id: script.surfaceId,
    entry: routes[0].routeId,
    routes: routes.map((r) => ({
      id: r.routeId,
      path: r.path,
      title: r.title,
      slots: r.slots.map((s) => ({
        id: s.id,
        slotType: s.slotType,
        binding: s.binding,
        ...(s.title !== undefined ? { title: s.title } : {}),
      })),
    })),
  };
}

export function makeLoader(surfaces: Record<string, SurfaceDoc>): ArtifactLoader {
  return ({ artifactKind, ref }: ArtifactLoaderInput): ArtifactLoaderOutcome => {
    const url = ref.url;
    if (artifactKind === 'surface' && url !== undefined && surfaces[url]) {
      return { status: 'loaded', source: `spike-v8:surface:${url}`, document: surfaces[url] };
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
 * Maps a validator diagnostic to the primary finding that produced it. The
 * mapping is by diagnostic code, not by surface, because the same fallback
 * (module-widget against an unadmitted module; experience-unit standing in for
 * a read-only panel) recurs across surfaces and should rank as one gap.
 */
export function mapDiagnostic(
  code: string,
  fallback: { confirms: number; family: GapFamily; v7Ref: V7Ref },
): { confirms: number; family: GapFamily; v7Ref: V7Ref } {
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

export interface SurfaceOutcome {
  script: SurfaceScript;
  phases: Array<{ phase: string; status: string }>;
  diagnostics: { error: number; warning: number; info: number };
  diagnosticCodes: string[];
  slotCount: number;
  routeCount: number;
}

/**
 * Runs one surface script end to end: MCP bootstrap → author → validate →
 * persist report + artifact → auto-record every error diagnostic as a finding.
 */
export async function runSurface(
  script: SurfaceScript,
  findings: FindingsCollector,
  diagnosticMapping: { confirms: number; family: GapFamily; v7Ref: V7Ref },
): Promise<SurfaceOutcome> {
  const mcp = createWireframesMcp(personaContext(script.id));

  const create = await mcp.wireframeFromBrief({
    bundleId: script.bundleId,
    version: '1.0.0',
    title: script.title,
    brief: script.brief,
    surfaceUrl: script.surfaceUrl,
    surfaceVersion: '1.0.0',
  });
  if (!create.ok) throw new Error(`wireframeFromBrief refused: ${create.error.code} — ${create.error.message}`);

  const ctx: AuthoringContext = {
    mcp,
    findings,
    script,
    gap: (f) => findings.record({ ...f, surface: script.id, mockup: script.mockup }),
    bindRoute: async (route: RouteSpec) => {
      const added = await mcp.addRoute({
        surfaceId: script.surfaceId,
        routeId: route.routeId,
        path: route.path,
        title: route.title,
      });
      if (!added.ok) {
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
        });
        return;
      }
      for (const slot of route.slots) {
        const bound = await mcp.bindSlot({
          surfaceId: script.surfaceId,
          routeId: route.routeId,
          slotId: slot.id,
          slotType: slot.slotType,
          binding: slot.binding,
          ...(slot.title !== undefined ? { title: slot.title } : {}),
          ...(slot.position !== undefined ? { position: slot.position } : {}),
        });
        if (!bound.ok) {
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
          });
        }
      }
    },
  };

  const { routes, policy } = await script.author(ctx);

  const surfaceDoc = toSurfaceDoc(script, routes);
  const report = await mcp.produceAppGraphValidationReport({
    source: `spike-v8://${script.id}/app-manifest`,
    schemaValidators: () => ({ ok: true }),
    evidenceSchemaValidators: () => ({ ok: true }),
    loader: makeLoader({ [script.surfaceUrl]: surfaceDoc }),
    uiGraphPolicies: [
      {
        schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
        source: `spike-v8://${script.id}/ui-graph-policy`,
        document: policy,
      },
    ],
  });
  if (!report.ok) {
    throw new Error(`produceAppGraphValidationReport refused: ${report.error.code} — ${report.error.message}`);
  }

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(
    resolve(REPORTS_DIR, `${script.id}.validation.json`),
    JSON.stringify(report.value, null, 2),
  );

  const manifest = await mcp.renderPreview();
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    resolve(ARTIFACTS_DIR, `${script.id}.json`),
    JSON.stringify(
      {
        mockup: script.mockup,
        family: script.family,
        route: script.route,
        manifest: manifest.ok ? manifest.value : null,
        surface: surfaceDoc,
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
  for (const d of diags.filter((x) => x.severity === 'error')) {
    findings.recordDiagnostic({
      surface: script.id,
      mockup: script.mockup,
      code: d.code,
      message: d.message ?? '(no message)',
      ...mapDiagnostic(d.code, diagnosticMapping),
    });
  }

  return {
    script,
    phases: report.value.report.phases.map((p) => ({ phase: p.phase, status: p.status })),
    diagnostics: {
      error: diags.filter((d) => d.severity === 'error').length,
      warning: diags.filter((d) => d.severity === 'warning').length,
      info: diags.filter((d) => d.severity === 'info').length,
    },
    diagnosticCodes: [...new Set(diags.map((d) => d.code))].sort(),
    slotCount: routes.reduce((n, r) => n + r.slots.length, 0),
    routeCount: routes.length,
  };
}
