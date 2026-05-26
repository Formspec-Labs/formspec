/**
 * @filedesc Persona-as-test for v7 spike. A Policy Studio PM (the persona)
 * briefs Wireframes-MCP to author three Policy Studio surfaces — Source Vault
 * Browser, Lint Findings, Scenario Result Viewer — using only the MCP verbs.
 * Validation gates run after each surface; every substrate gap the persona
 * hits is recorded inline (FINDING N: comment) and programmatically via the
 * FindingsCollector. Final report at reports/findings.json; per-surface
 * artifacts at artifacts/<surface-id>.json.
 *
 * Posture rules (per spike/persona/PRD.md):
 * - The persona has read Policy Studio's VISION / CONCEPT-MODEL / FEATURE
 *   MATRIX as a customer brief. The persona has NOT read Formspec internals.
 * - The persona discovers substrate shape by trying to express Policy Studio's
 *   needs through the MCP verb surface.
 * - When a verb refuses or a primitive is missing, the persona picks the
 *   closest substrate primitive and records the mismatch. Findings are gold.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  createWireframesMcp,
  type WireframesMcp,
  type WireframesContext,
} from '@formspec-org/mcp-wireframes';
import type { AuthorActor, SessionRef } from '@formspec-org/studio-core';
import type { ArtifactLoader, ArtifactLoaderInput, ArtifactLoaderOutcome } from '@formspec-org/app-graph';
import { FindingsCollector } from '../src/findings.js';

// ── Spike-local paths ────────────────────────────────────────────────────
const SPIKE_ROOT = resolve(import.meta.dirname, '..');
const ARTIFACTS_DIR = resolve(SPIKE_ROOT, 'artifacts');
const REPORTS_DIR = resolve(SPIKE_ROOT, 'reports');

// ── Persona context (Policy Studio PM authoring through the MCP) ─────────
function personaContext(): WireframesContext {
  const author: AuthorActor = {
    id: 'urn:policy-studio:actor:product-manager:wireframe-spike-v7',
    kind: 'human',
    actChannel: 'mcp',
  };
  const session: SessionRef = {
    id: 'urn:policy-studio:session:wireframe-spike-v7',
    openedAt: '2026-05-26T00:00:00Z',
    actors: [author.id],
  };
  return { authoredBy: author, session };
}

// ── Findings collector — survives across all three surface describes ─────
const findings = new FindingsCollector();

// ── Artifact persistence helper ──────────────────────────────────────────
function saveArtifact(surfaceId: string, payload: unknown): void {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  writeFileSync(
    resolve(ARTIFACTS_DIR, `${surfaceId}.json`),
    JSON.stringify(payload, null, 2),
  );
}

// ── Validation report convenience ────────────────────────────────────────
function phaseStatus(report: { phases: Array<{ phase: string; status: string }> }, name: string): string | undefined {
  return report.phases.find((p) => p.phase === name)?.status;
}

// ── Policy Studio surface URLs ───────────────────────────────────────────
const APP_BUNDLE_ID = 'https://policy-studio.gov/apps/authoring';

// FINDING 1: one App / three sibling tabs vs. one Surface / one bundle.
// Three surfaces forced into three bundles; details in findings record.
findings.record({
  id: 1,
  surface: 'cross-cutting',
  verb: 'wireframeFromBrief',
  wanted:
    'Three sibling surfaces under one Policy Studio app — each is a top-level tab in the IA, sharing identity, theme, and locale.',
  got: 'One Surface URL per bundle. Authoring three Policy Studio tabs forces three bundles, three App Manifests, three validation passes.',
  severity: 'reshape-needed',
  why:
    'Authoring-tool UIs are multi-pane apps; substrate one-Surface-per-bundle assumes a respondent flow with one entry. Either the bundle needs sibling-Surface support or the MCP needs a verb for tab-shaped IA on a single Surface.',
  suggestion:
    'Add `addSurface` as a peer to `wireframeFromBrief`, or expose a `tabs[]` shape on the Surface for top-level IA siblings.',
});

const SOURCE_VAULT_BUNDLE = `${APP_BUNDLE_ID}/source-vault`;
const SOURCE_VAULT_SURFACE = `${APP_BUNDLE_ID}/source-vault/surfaces/browser`;
const LINT_FINDINGS_BUNDLE = `${APP_BUNDLE_ID}/lint-findings`;
const LINT_FINDINGS_SURFACE = `${APP_BUNDLE_ID}/lint-findings/surfaces/list`;
const SCENARIO_VIEWER_BUNDLE = `${APP_BUNDLE_ID}/scenario-viewer`;
const SCENARIO_VIEWER_SURFACE = `${APP_BUNDLE_ID}/scenario-viewer/surfaces/result`;

// ── Inline artifact loader — serves the Surface documents the persona authored
// In a real authoring tool we'd persist these; for the spike the loader holds
// them in memory keyed by URL. ───────────────────────────────────────────
type LoadedSurface = {
  $formspecSurface: '0.1';
  id: string;
  entry: string;
  routes: Array<{
    id: string;
    path: string;
    title?: string;
    slots: Array<{
      id: string;
      slotType: 'definition-form' | 'experience-unit' | 'module-widget' | 'static-content' | 'embed-route';
      binding: unknown;
      title?: string;
    }>;
  }>;
};

function makeLoader(surfaces: Record<string, LoadedSurface>): ArtifactLoader {
  return ({ artifactKind, ref }: ArtifactLoaderInput): ArtifactLoaderOutcome => {
    const url = ref.url;
    if (artifactKind === 'surface' && url !== undefined && surfaces[url]) {
      return {
        status: 'loaded',
        source: `spike-v7:surface:${url}`,
        document: surfaces[url],
      };
    }
    return { status: 'missing', source: url ?? '(no url)' };
  };
}

// ── Bootstrap helper ─────────────────────────────────────────────────────
function makeMcp(): WireframesMcp {
  return createWireframesMcp(personaContext());
}

// ─────────────────────────────────────────────────────────────────────────
// SURFACE 1 — Source Vault Browser
// ─────────────────────────────────────────────────────────────────────────
describe('Surface 1: Source Vault Browser', () => {
  it('authors a tree + detail + drawer Source Vault layout via Wireframes-MCP', async () => {
    const mcp = makeMcp();

    // Start the app with the Source Vault surface URL.
    const create = await mcp.wireframeFromBrief({
      bundleId: SOURCE_VAULT_BUNDLE,
      version: '1.0.0',
      title: 'Source Vault Browser',
      brief:
        'Three-pane policy source browser: left tree of uploaded sources by program/jurisdiction; main detail view of the selected source with parsed sections; bottom drawer listing extracted policy objects anchored to the selected section.',
      surfaceUrl: SOURCE_VAULT_SURFACE,
      surfaceVersion: '1.0.0',
    });
    expect(create.ok).toBe(true);

    // The Source Vault has one route — the browser itself.
    const addRoute = await mcp.addRoute({
      surfaceId: 'browser',
      routeId: 'browse',
      path: '/sources',
      title: 'Source Vault',
    });
    expect(addRoute.ok).toBe(true);

    // FINDING 2: no `tree` slot type — falls back to module-widget.
    findings.record({
      id: 2,
      surface: 'source-vault',
      verb: 'bindSlot',
      wanted:
        'A `tree` slot type — hierarchical navigation with expand/collapse, selection state, and a node-shape schema the validator can check.',
      got:
        'slotType ∈ { definition-form, experience-unit, module-widget, static-content, embed-route }. Falls back to `module-widget` with a custom module the substrate cannot reason about.',
      severity: 'missing-feature',
      why:
        'Authoring tools are tree-heavy (source vault, lint by tier, scenario taxonomy). Without a first-class tree, every authoring surface bypasses the substrate validator for its core navigation primitive — the substrate stops carrying the load it claims to.',
      suggestion:
        'Add `tree` as a sixth slot type with a node-shape schema, selection contract, and expand/collapse state binding.',
    });

    // Declare the tree module — substrate-unaware custom widget.
    const treeModule = await mcp.declareModule({
      id: 'x-policy-studio-source-tree',
      version: '0.1.0',
    });
    expect(treeModule.ok).toBe(true);

    // FINDING 3: no `workspace:` Data Source scope for authoring data.
    findings.record({
      id: 3,
      surface: 'source-vault',
      verb: 'bindSlot',
      wanted:
        'A `workspace:` Data Source scope so the source-tree binding lists the actual uploaded policy documents and routes through the substrate Data Source contract.',
      got:
        'Data Source vocabulary appears respondent-shaped (host: / response: / resource:). Module fetches workspace state out-of-band; no substrate-level enforcement of consent / sensitivity / cache discipline on authoring data.',
      severity: 'reshape-needed',
      why:
        'Authoring data IS workspace-scoped — sources, policy objects, lint findings, scenarios. Forcing every authoring widget to bypass Data Sources strips the substrate of its visibility into the data plane of every authoring tool.',
      suggestion:
        'Extend Data Source vocabulary with workspace-scoped sources (workspace:sources, workspace:policy-objects, workspace:lint-findings, workspace:scenarios) carrying ownership and sensitivity metadata.',
    });

    // Left pane: source tree (module-widget fallback). Substrate constrains
    // binding to `{moduleId, widgetName, config?}` — module-widget config is
    // free-form, so all workspace/dataSource/groupBy goes there.
    const treeSlot = await mcp.bindSlot({
      surfaceId: 'browser',
      routeId: 'browse',
      slotId: 'sourceTree',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-policy-studio-source-tree',
        widgetName: 'SourceTree',
        // x-spike-v7 — module-private fetch shape. The substrate cannot
        // validate this; this is the cost of FINDING 3.
        config: {
          dataSource: 'x-spike-v7:workspace:sources',
          groupBy: ['program', 'jurisdiction'],
        },
      },
      title: 'Sources',
      position: 'left',
    });
    if (!treeSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'source-vault',
        verb: 'bindSlot(module-widget)',
        wanted: 'Bind the source-tree module-widget slot to the left pane.',
        got: `bindSlot refused: ${treeSlot.error.code} — ${treeSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'Even the fallback substrate primitive (module-widget) refused this binding shape.',
      });
    }

    // Right pane: source detail. The detail shape is read-only — metadata
    // (effective dates, supersession lineage, authority rank, canonical URL)
    // plus a viewer for parsed sections.
    //
    // FINDING 4: read-only data view wedged through Experience Unit (form-adjacent).
    findings.record({
      id: 4,
      surface: 'source-vault',
      verb: 'addExperienceUnit',
      wanted:
        'A "read-only data view" slot/Component shape — display structured data with no respondent intent, no Task, no Definition.',
      got:
        'Experience Unit (form-adjacent) is the closest fit; `definition-form` demands a Definition. Read-only display is wedged through Experience.',
      severity: 'missing-feature',
      why:
        'Authoring tool surfaces are mostly read-only data display (detail panels, finding messages, scenario traces). Reusing Experience for this conflates form-flow semantics with display, polluting both.',
      suggestion:
        'Add a `data-view` slot type (or a `display-only` Component shape) explicitly for read-only structured data with no respondent semantics.',
    });

    const sourceDetailUnit = await mcp.addExperienceUnit({
      unitId: 'sourceDetailView',
      kind: 'x-spike-v7:source-detail-view',
      title: 'Source Detail',
      // No actorRef, no taskRefs — this is a read-only viewer, but the field
      // shape implies they're authoring-relevant. FINDING 4.
    });
    expect(sourceDetailUnit.ok).toBe(true);

    const detailSlot = await mcp.bindSlot({
      surfaceId: 'browser',
      routeId: 'browse',
      slotId: 'sourceDetail',
      slotType: 'experience-unit',
      binding: { unitRef: 'sourceDetailView' },
      title: 'Detail',
      position: 'main',
    });
    expect(detailSlot.ok).toBe(true);

    // Bottom drawer: extracted policy objects for the selected section.
    // Drawer is also read-only — same FINDING 4 mismatch.
    const objectsDrawerUnit = await mcp.addExperienceUnit({
      unitId: 'extractedObjectsDrawer',
      kind: 'x-spike-v7:object-list-view',
      title: 'Extracted Policy Objects',
    });
    expect(objectsDrawerUnit.ok).toBe(true);

    const drawerSlot = await mcp.bindSlot({
      surfaceId: 'browser',
      routeId: 'browse',
      slotId: 'objectsDrawer',
      slotType: 'experience-unit',
      binding: { unitRef: 'extractedObjectsDrawer' },
      title: 'Extracted Objects',
      position: 'drawer-bottom',
    });
    expect(drawerSlot.ok).toBe(true);

    // FINDING 5: no cross-slot selection/binding contract.
    findings.record({
      id: 5,
      surface: 'source-vault',
      verb: 'bindSlot',
      wanted:
        'A cross-slot selection contract: "slot B and slot C receive the selected node from slot A". Substrate could validate the shape and emit a11y focus-order diagnostics.',
      got:
        'No cross-slot binding verb. Selection coordination becomes module-private state that escapes the substrate validator and the UI Graph Policy a11y rules.',
      severity: 'missing-feature',
      why:
        'Master-detail and tree-drawer patterns are the dominant authoring-tool layouts. Without substrate-level cross-slot binding, multi-pane authoring surfaces are opaque to the validator and to the a11y policy that needs to know focus order across panes.',
      suggestion:
        'Add a `slotBindings[]` contract on the route shape, where a producer slot exposes named state (selection, filter) and consumer slots subscribe.',
    });

    // FINDING 6: RoutePolicy.a11y is respondent-shaped (landmark/keyboardNavigation only).
    findings.record({
      id: 6,
      surface: 'source-vault',
      verb: 'declareUiGraphPolicy',
      wanted:
        'Authoring-shaped a11y profile: tree-node ARIA, multi-pane focus order, keyboard shortcut declarations (open finding, waive, re-run scenario), drawer focus trap semantics.',
      got:
        'RoutePolicy.a11y exposes landmark + keyboardNavigation — respondent-form vocabulary. Tree-control, multi-pane, and authoring-shortcut concerns are not expressible.',
      severity: 'reshape-needed',
      why:
        'Authoring tools are keyboard-heavy and tree-heavy. A respondent-shaped a11y profile under-covers authoring surfaces, silently. The UI Graph Policy needs to be the authoring-tool a11y contract, not just the intake-form a11y contract.',
      suggestion:
        'Extend RoutePolicy.a11y with an `authoring` sub-profile: tree controls, multi-pane focus order, shortcut taxonomy, drawer/dialog focus trap rules.',
    });

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SOURCE_VAULT_SURFACE,
      surfaceVersion: '1.0.0',
      title: 'Source Vault Browser policy',
      routePolicies: [
        {
          routeId: 'browse',
          a11y: { landmark: 'main', keyboardNavigation: true },
        },
      ],
    });
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;

    // Validate.
    const surfaces: Record<string, LoadedSurface> = {
      [SOURCE_VAULT_SURFACE]: {
        $formspecSurface: '0.1',
        id: 'browser',
        entry: 'browse',
        routes: [
          {
            id: 'browse',
            path: '/sources',
            title: 'Source Vault',
            slots: [
              {
                id: 'sourceTree',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-policy-studio-source-tree',
                  widgetName: 'SourceTree',
                  config: {
                    dataSource: 'x-spike-v7:workspace:sources',
                    groupBy: ['program', 'jurisdiction'],
                  },
                },
                title: 'Sources',
              },
              {
                id: 'sourceDetail',
                slotType: 'experience-unit',
                binding: { unitRef: 'sourceDetailView' },
                title: 'Detail',
              },
              {
                id: 'objectsDrawer',
                slotType: 'experience-unit',
                binding: { unitRef: 'extractedObjectsDrawer' },
                title: 'Extracted Objects',
              },
            ],
          },
        ],
      },
    };

    const report = await mcp.produceAppGraphValidationReport({
      source: 'spike-v7://source-vault/app-manifest',
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
      loader: makeLoader(surfaces),
      uiGraphPolicies: [
        {
          schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
          source: 'spike-v7://source-vault/ui-graph-policy',
          document: policy.value,
        },
      ],
    });

    expect(report.ok).toBe(true);
    if (!report.ok) return;

    // Persist the validation report so reviewers can see what landed.
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'source-vault.validation.json'),
      JSON.stringify(report.value, null, 2),
    );

    // Record real authoring-tool-UI gaps surfaced by error-level diagnostics.
    const errorDiagnostics = report.value.report.diagnostics.filter((d) => d.severity === 'error');
    if (errorDiagnostics.length > 0) {
      for (const d of errorDiagnostics) {
        findings.record({
          id: 100 + findings.list().length,
          surface: 'source-vault',
          verb: 'produceAppGraphValidationReport',
          wanted: 'Surface validates cleanly so authoring can advance to render.',
          got: `Validator emitted ${d.severity}: ${d.code} — ${d.message ?? '(no message)'}`,
          severity: 'reshape-needed',
          why:
            'Validator diagnostics on authoring-tool surfaces signal where the substrate refuses an authoring shape. Each one is evidence the substrate is intake-shaped, not authoring-shaped.',
        });
      }
    }

    // Surface validates if artifact-resolution and cross-artifact phases
    // complete (UI policy diagnostics are informational signals, not blockers
    // for the test to continue).
    expect(phaseStatus(report.value.report, 'artifact-resolution')).toBe('completed');

    // Save authored artifacts.
    const manifest = await mcp.renderPreview();
    saveArtifact('source-vault', {
      manifest: manifest.ok ? manifest.value : null,
      surface: surfaces[SOURCE_VAULT_SURFACE],
      uiGraphPolicy: policy.value,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SURFACE 2 — Lint Findings
// ─────────────────────────────────────────────────────────────────────────
describe('Surface 2: Lint Findings', () => {
  it('authors a filter-bar + list + drawer Lint Findings layout via Wireframes-MCP', async () => {
    const mcp = makeMcp();

    const create = await mcp.wireframeFromBrief({
      bundleId: LINT_FINDINGS_BUNDLE,
      version: '1.0.0',
      title: 'Lint Findings',
      brief:
        'Filtered findings list with detail drawer: top filter bar (tier S1-S6, severity, lifecycle state); main list of findings with severity badge / rule id / plain-language message / subject / state; right drawer with full message + suggested fix + source-citation chain + conditional Waive action.',
      surfaceUrl: LINT_FINDINGS_SURFACE,
      surfaceVersion: '1.0.0',
    });
    expect(create.ok).toBe(true);

    const addRoute = await mcp.addRoute({
      surfaceId: 'list',
      routeId: 'findings',
      path: '/findings',
      title: 'Findings',
    });
    expect(addRoute.ok).toBe(true);

    // FINDING 7: no `filter-bar` primitive — module-widget fallback again.
    findings.record({
      id: 7,
      surface: 'lint-findings',
      verb: 'bindSlot',
      wanted:
        'A `filter-bar` slot type — declarative facets with chip state, bound to a Data Source the list slot consumes.',
      got:
        'Closest fit is `module-widget` again (or wedging a `definition-form` for a filter "form" the user never submits). Substrate-opaque either way.',
      severity: 'missing-feature',
      why:
        'Filtered lists are the dominant authoring-tool pattern (lint, sources, scenarios, findings, change-impact). Without filter primitives, the validator cannot enforce filter↔list coupling, persisted-filter URL state, or accessibility of filter controls.',
      suggestion:
        'Add a `filter-bar` slot type with declared facets, a producer→consumer slot contract (FINDING 5), and a Data Source binding shape.',
    });

    const filterModule = await mcp.declareModule({
      id: 'x-policy-studio-lint-filter-bar',
      version: '0.1.0',
    });
    expect(filterModule.ok).toBe(true);

    const filterSlot = await mcp.bindSlot({
      surfaceId: 'list',
      routeId: 'findings',
      slotId: 'filterBar',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-policy-studio-lint-filter-bar',
        widgetName: 'LintFilterBar',
        config: {
          facets: [
            { id: 'tier', label: 'Tier', values: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] },
            { id: 'severity', label: 'Severity', values: ['info', 'warn', 'error', 'block'] },
            { id: 'state', label: 'State', values: ['open', 'acknowledged', 'resolved', 'waived'] },
          ],
        },
      },
      title: 'Filters',
      position: 'top',
    });
    if (!filterSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'lint-findings',
        verb: 'bindSlot(module-widget)',
        wanted: 'Bind filter-bar module-widget slot.',
        got: `bindSlot refused: ${filterSlot.error.code} — ${filterSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'Filter-bar fallback shape rejected by module-widget contract.',
      });
    }

    // FINDING 8: no `list` primitive — module-widget fallback (universal pattern, missing).
    findings.record({
      id: 8,
      surface: 'lint-findings',
      verb: 'bindSlot',
      wanted:
        'A `list` slot type — paginated/sortable rows with columns, row selection, row-level conditional actions.',
      got: 'Same `module-widget` fallback as the tree. No list-shape schema, no row-binding contract, no row-action verb.',
      severity: 'missing-feature',
      why:
        'List-with-drawer is the universal back-office layout. Without a list primitive, every authoring tool ships a custom list widget that the substrate cannot validate, instrument, or theme.',
      suggestion:
        'Add a `list` slot type with column-binding and a row-action contract. Action visibility uses the capability-gating model (FINDING 10).',
    });

    const listModule = await mcp.declareModule({
      id: 'x-policy-studio-findings-list',
      version: '0.1.0',
    });
    expect(listModule.ok).toBe(true);

    const listSlot = await mcp.bindSlot({
      surfaceId: 'list',
      routeId: 'findings',
      slotId: 'findingsList',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-policy-studio-findings-list',
        widgetName: 'FindingsList',
        config: {
          dataSource: 'x-spike-v7:workspace:lint-findings',
          columns: ['ruleId', 'severity', 'message', 'subject', 'state'],
        },
      },
      title: 'Findings',
      position: 'main',
    });
    if (!listSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'lint-findings',
        verb: 'bindSlot(module-widget)',
        wanted: 'Bind findings-list module-widget slot.',
        got: `bindSlot refused: ${listSlot.error.code} — ${listSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'List fallback shape rejected.',
      });
    }

    // FINDING 9: Response Actions are intake-completion-shaped; reviewer actions don't fit.
    findings.record({
      id: 9,
      surface: 'lint-findings',
      verb: 'addExperienceUnit / addDefinitionStub',
      wanted:
        'Reviewer-shaped Response Actions: `waive-finding`, `acknowledge`, `re-run-scenario`, `request-review`. Bound at row level with action-intent + payload schema.',
      got:
        'Response Actions vocabulary appears intake-completion-shaped (submit / save-draft / validate / cancel). Waive lands as a Definition+form (rationale field) attached to a separate route, not as a row action.',
      severity: 'reshape-needed',
      why:
        'Authoring tools are action-heavy (waive, acknowledge, override, regenerate, re-run, approve). Forcing reviewer actions through intake-completion vocabulary loses the action taxonomy the substrate could use for audit trails and authorization checks.',
      suggestion:
        'Extend Response Actions with a `reviewer-action` family carrying actionIntent, target subject ref, optional rationale schema, and an AuthorityGrant gating ref.',
    });

    // FINDING 14: no createDefinition verb; addDefinitionStub only mutates an existing one.
    findings.record({
      id: 14,
      surface: 'lint-findings',
      verb: 'addDefinitionStub',
      wanted:
        'A `createDefinition` / `addDefinition` MCP verb that mints a fresh Definition document inline as part of the authoring journey.',
      got:
        '`addDefinitionStub` only adds items to a pre-loaded Definition. New Definitions must be host-minted out-of-band, breaking the journey.',
      severity: 'missing-feature',
      why:
        'Authoring tools mint many small forms (waivers, exception requests, attestations). A surface authoring journey that cannot create a Definition cannot stand up its own intake forms.',
      suggestion:
        'Add `createDefinition({ url, version, title })` as a peer of `wireframeFromBrief`; addDefinitionStub then continues to attach items.',
    });

    const waiveDef = await mcp.addDefinitionStub({
      definitionId: 'https://policy-studio.gov/forms/lint-waiver',
      itemPath: '/rationale',
      label: 'Waiver rationale',
      dataType: 'text/long',
    });
    if (!waiveDef.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'lint-findings',
        verb: 'addDefinitionStub',
        wanted: 'Add waiver-rationale item.',
        got: `addDefinitionStub refused: ${waiveDef.error.code} — ${waiveDef.error.message}`,
        severity: 'reshape-needed',
        why: 'Confirms FINDING 14: no Definition exists to add items to.',
      });
    }

    // Drawer = read-only finding detail. Same FINDING 4 — Experience Unit
    // misused as a data-view shape.
    const drawerUnit = await mcp.addExperienceUnit({
      unitId: 'findingDetailDrawer',
      kind: 'x-spike-v7:finding-detail-view',
      title: 'Finding Detail',
    });
    expect(drawerUnit.ok).toBe(true);

    const drawerSlot = await mcp.bindSlot({
      surfaceId: 'list',
      routeId: 'findings',
      slotId: 'detailDrawer',
      slotType: 'experience-unit',
      binding: { unitRef: 'findingDetailDrawer' },
      title: 'Finding Detail',
      position: 'drawer-right',
    });
    expect(drawerSlot.ok).toBe(true);

    // FINDING 10: UI Graph Policy carries no capability-gating (AuthorityGrant predicate).
    findings.record({
      id: 10,
      surface: 'lint-findings',
      verb: 'declareUiGraphPolicy',
      wanted:
        'A capability-gating slot in the UI Graph Policy: per-action / per-slot visibility predicate against an AuthorityGrant ref ("user holds grant for action=waive, scope=ruleId WF-LINT-001").',
      got:
        'UI Graph Policy covers a11y, locale, theme. Capability gating must live in module logic, invisible to the validator and to audit/export tooling.',
      severity: 'missing-feature',
      why:
        'Authoring tools are role-shaped — waive, approve, override, publish are not affordances every user has. Without substrate-level capability gating, audit trails cannot prove "the substrate did not show this button to unauthorized users" — that property lives in module code outside the spec.',
      suggestion:
        'Add `capabilityGates[]` to UI Graph Policy: per route+slot or per action predicate that resolves against an AuthorityGrant ref. Validator and audit-export can then reason about visibility.',
    });

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: LINT_FINDINGS_SURFACE,
      surfaceVersion: '1.0.0',
      title: 'Lint Findings policy',
      routePolicies: [
        {
          routeId: 'findings',
          a11y: { landmark: 'main', keyboardNavigation: true },
        },
      ],
    });
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;

    const surfaces: Record<string, LoadedSurface> = {
      [LINT_FINDINGS_SURFACE]: {
        $formspecSurface: '0.1',
        id: 'list',
        entry: 'findings',
        routes: [
          {
            id: 'findings',
            path: '/findings',
            title: 'Findings',
            slots: [
              {
                id: 'filterBar',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-policy-studio-lint-filter-bar',
                  widgetName: 'LintFilterBar',
                },
                title: 'Filters',
              },
              {
                id: 'findingsList',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-policy-studio-findings-list',
                  widgetName: 'FindingsList',
                  config: { dataSource: 'x-spike-v7:workspace:lint-findings' },
                },
                title: 'Findings',
              },
              {
                id: 'detailDrawer',
                slotType: 'experience-unit',
                binding: { unitRef: 'findingDetailDrawer' },
                title: 'Finding Detail',
              },
            ],
          },
        ],
      },
    };

    const report = await mcp.produceAppGraphValidationReport({
      source: 'spike-v7://lint-findings/app-manifest',
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
      loader: makeLoader(surfaces),
      uiGraphPolicies: [
        {
          schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
          source: 'spike-v7://lint-findings/ui-graph-policy',
          document: policy.value,
        },
      ],
    });

    expect(report.ok).toBe(true);
    if (!report.ok) return;

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'lint-findings.validation.json'),
      JSON.stringify(report.value, null, 2),
    );

    const errorDiagnostics = report.value.report.diagnostics.filter((d) => d.severity === 'error');
    if (errorDiagnostics.length > 0) {
      for (const d of errorDiagnostics) {
        findings.record({
          id: 100 + findings.list().length,
          surface: 'lint-findings',
          verb: 'produceAppGraphValidationReport',
          wanted: 'Surface validates cleanly so authoring can advance to render.',
          got: `Validator emitted ${d.severity}: ${d.code} — ${d.message ?? '(no message)'}`,
          severity: 'reshape-needed',
          why:
            'Error-level diagnostics on a list-with-drawer surface flag where the substrate refuses authoring-shape composition. Continue authoring; record the gap.',
        });
      }
    }

    expect(phaseStatus(report.value.report, 'artifact-resolution')).toBe('completed');

    const manifest = await mcp.renderPreview();
    saveArtifact('lint-findings', {
      manifest: manifest.ok ? manifest.value : null,
      surface: surfaces[LINT_FINDINGS_SURFACE],
      uiGraphPolicy: policy.value,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SURFACE 3 — Scenario Result Viewer
// ─────────────────────────────────────────────────────────────────────────
describe('Surface 3: Scenario Result Viewer', () => {
  it('authors a metadata + split + explanation layout via Wireframes-MCP', async () => {
    const mcp = makeMcp();

    const create = await mcp.wireframeFromBrief({
      bundleId: SCENARIO_VIEWER_BUNDLE,
      version: '1.0.0',
      title: 'Scenario Result Viewer',
      brief:
        'Side-by-side expected vs. actual scenario trace. Top: scenario metadata (name, type, linked policy objects). Main split: expected workflow path on the left, actual simulated trace on the right, inline divergence highlighting. Bottom: plain-language divergence explanation. Action: re-run scenario.',
      surfaceUrl: SCENARIO_VIEWER_SURFACE,
      surfaceVersion: '1.0.0',
    });
    expect(create.ok).toBe(true);

    const addRoute = await mcp.addRoute({
      surfaceId: 'result',
      routeId: 'view',
      path: '/scenarios/:id',
      title: 'Scenario',
    });
    expect(addRoute.ok).toBe(true);

    // FINDING 13: static-content kinds are { heading|text|image|divider } — no metadata strip.
    findings.record({
      id: 13,
      surface: 'scenario-viewer',
      verb: 'bindSlot(static-content)',
      wanted:
        'A `metadata-strip` static-content kind — declarative key/value or labeled fields the substrate can theme and render without a module.',
      got:
        'static-content kind ∈ { heading, text, image, divider }. Forced to use `heading` and lose the structured fields, or fall back to a module-widget the substrate cannot validate.',
      severity: 'missing-feature',
      why:
        'Authoring surfaces are header-heavy (each surface has a "what am I looking at" strip). Without structured metadata kinds, every surface ships a custom header module — UX drift the substrate cannot prevent.',
      suggestion:
        'Extend static-content kinds with `metadata-strip` (labeled fields), `breadcrumb`, `status-badge`. Closed taxonomy keeps the substrate authoritative.',
    });

    const metadataSlot = await mcp.bindSlot({
      surfaceId: 'result',
      routeId: 'view',
      slotId: 'scenarioMetadata',
      slotType: 'static-content',
      binding: {
        kind: 'heading',
        content: 'Scenario',
        level: 1,
      },
      title: 'Scenario',
      position: 'top',
    });
    if (!metadataSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'scenario-viewer',
        verb: 'bindSlot(static-content)',
        wanted: 'Bind metadata heading slot.',
        got: `bindSlot refused: ${metadataSlot.error.code} — ${metadataSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'Static-content fallback rejected.',
      });
    }

    // FINDING 11: no `diff` / `split-tree` slot type — two side-by-side module-widgets.
    findings.record({
      id: 11,
      surface: 'scenario-viewer',
      verb: 'bindSlot',
      wanted:
        'A `diff` or `split-tree` slot type — two structured tree inputs, aligned by node identity, inline divergence markers, a11y-aware focus order.',
      got:
        'Two module-widget slots positioned left/right, divergence-marking logic inside a substrate-opaque module. The substrate has no way to reason about diff alignment, divergence semantics, or which side is the "source of truth."',
      severity: 'missing-feature',
      why:
        'Authoring tools live and die on diffs — workflow versions, scenario expected-vs-actual, policy-object change, source-version compare. Without a diff primitive, every diff in the product is custom and inconsistent.',
      suggestion:
        'Add `split-tree` (or `diff`) as a slot type with two named inputs, an alignment-key contract, and divergence-marker output the substrate can audit.',
    });

    const diffModule = await mcp.declareModule({
      id: 'x-policy-studio-scenario-diff',
      version: '0.1.0',
    });
    expect(diffModule.ok).toBe(true);

    const expectedSlot = await mcp.bindSlot({
      surfaceId: 'result',
      routeId: 'view',
      slotId: 'expectedTrace',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-policy-studio-scenario-diff',
        widgetName: 'ScenarioTraceView',
        config: {
          side: 'expected',
          dataSource: 'x-spike-v7:workspace:scenarios:expected',
        },
      },
      title: 'Expected',
      position: 'main-left',
    });
    if (!expectedSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'scenario-viewer',
        verb: 'bindSlot(module-widget)',
        wanted: 'Bind expected-trace module-widget.',
        got: `bindSlot refused: ${expectedSlot.error.code} — ${expectedSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'Diff-left fallback rejected.',
      });
    }

    const actualSlot = await mcp.bindSlot({
      surfaceId: 'result',
      routeId: 'view',
      slotId: 'actualTrace',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-policy-studio-scenario-diff',
        widgetName: 'ScenarioTraceView',
        config: {
          side: 'actual',
          dataSource: 'x-spike-v7:workspace:scenarios:actual',
        },
      },
      title: 'Actual',
      position: 'main-right',
    });
    if (!actualSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'scenario-viewer',
        verb: 'bindSlot(module-widget)',
        wanted: 'Bind actual-trace module-widget.',
        got: `bindSlot refused: ${actualSlot.error.code} — ${actualSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'Diff-right fallback rejected.',
      });
    }

    // Bottom: plain-language divergence explanation — read-only data view.
    // Same Experience Unit misuse as FINDING 4.
    const explanationUnit = await mcp.addExperienceUnit({
      unitId: 'divergenceExplanation',
      kind: 'x-spike-v7:explanation-view',
      title: 'Why diverged',
    });
    expect(explanationUnit.ok).toBe(true);

    const explanationSlot = await mcp.bindSlot({
      surfaceId: 'result',
      routeId: 'view',
      slotId: 'divergence',
      slotType: 'experience-unit',
      binding: { unitRef: 'divergenceExplanation' },
      title: 'Explanation',
      position: 'bottom',
    });
    expect(explanationSlot.ok).toBe(true);

    // FINDING 12: no non-form action vocabulary — re-run is an opaque module button.
    findings.record({
      id: 12,
      surface: 'scenario-viewer',
      verb: 'bindSlot / Response Actions',
      wanted:
        '`re-run-scenario` as a substrate-recognized non-form action: target=runtime command, payload=scenario id, result updates a named output slot.',
      got:
        'No non-form action vocabulary. Re-run is a module-widget button that the substrate cannot audit, gate, or chain into validation diagnostics.',
      severity: 'reshape-needed',
      why:
        'Authoring tools call runtime / build / lint / re-run actions constantly. A respondent-completion-shaped Action vocabulary cannot carry these; they leak into module code and become invisible to audit and policy.',
      suggestion:
        'Extend Response Actions with a `runtime-command` family carrying actionIntent, command target, payload schema, and a typed result-slot contract.',
    });

    const rerunModule = await mcp.declareModule({
      id: 'x-policy-studio-scenario-rerun-button',
      version: '0.1.0',
    });
    expect(rerunModule.ok).toBe(true);

    const rerunSlot = await mcp.bindSlot({
      surfaceId: 'result',
      routeId: 'view',
      slotId: 'rerunAction',
      slotType: 'module-widget',
      binding: {
        moduleId: 'x-policy-studio-scenario-rerun-button',
        widgetName: 'RerunButton',
        config: { action: 'x-spike-v7:runtime:re-run-scenario' },
      },
      title: 'Re-run',
      position: 'top-right',
    });
    if (!rerunSlot.ok) {
      findings.record({
        id: 100 + findings.list().length,
        surface: 'scenario-viewer',
        verb: 'bindSlot(module-widget)',
        wanted: 'Bind re-run button module-widget.',
        got: `bindSlot refused: ${rerunSlot.error.code} — ${rerunSlot.error.message}`,
        severity: 'reshape-needed',
        why: 'Re-run action fallback rejected.',
      });
    }

    const policy = await mcp.declareUiGraphPolicy({
      surfaceUrl: SCENARIO_VIEWER_SURFACE,
      surfaceVersion: '1.0.0',
      title: 'Scenario Result Viewer policy',
      routePolicies: [
        {
          routeId: 'view',
          a11y: { landmark: 'main', keyboardNavigation: true },
        },
      ],
    });
    expect(policy.ok).toBe(true);
    if (!policy.ok) return;

    const surfaces: Record<string, LoadedSurface> = {
      [SCENARIO_VIEWER_SURFACE]: {
        $formspecSurface: '0.1',
        id: 'result',
        entry: 'view',
        routes: [
          {
            id: 'view',
            path: '/scenarios/:id',
            title: 'Scenario',
            slots: [
              {
                id: 'scenarioMetadata',
                slotType: 'static-content',
                binding: { kind: 'heading', content: 'Scenario', level: 1 },
                title: 'Scenario',
              },
              {
                id: 'expectedTrace',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-policy-studio-scenario-diff',
                  widgetName: 'ScenarioTraceView',
                  config: { side: 'expected' },
                },
                title: 'Expected',
              },
              {
                id: 'actualTrace',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-policy-studio-scenario-diff',
                  widgetName: 'ScenarioTraceView',
                  config: { side: 'actual' },
                },
                title: 'Actual',
              },
              {
                id: 'divergence',
                slotType: 'experience-unit',
                binding: { unitRef: 'divergenceExplanation' },
                title: 'Explanation',
              },
              {
                id: 'rerunAction',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-policy-studio-scenario-rerun-button',
                  widgetName: 'RerunButton',
                  config: { action: 'x-spike-v7:runtime:re-run-scenario' },
                },
                title: 'Re-run',
              },
            ],
          },
        ],
      },
    };

    const report = await mcp.produceAppGraphValidationReport({
      source: 'spike-v7://scenario-viewer/app-manifest',
      schemaValidators: () => ({ ok: true }),
      evidenceSchemaValidators: () => ({ ok: true }),
      loader: makeLoader(surfaces),
      uiGraphPolicies: [
        {
          schemaId: 'https://formspec.org/schemas/uiGraphPolicy/0.1',
          source: 'spike-v7://scenario-viewer/ui-graph-policy',
          document: policy.value,
        },
      ],
    });

    expect(report.ok).toBe(true);
    if (!report.ok) return;

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'scenario-viewer.validation.json'),
      JSON.stringify(report.value, null, 2),
    );

    const errorDiagnostics = report.value.report.diagnostics.filter((d) => d.severity === 'error');
    if (errorDiagnostics.length > 0) {
      for (const d of errorDiagnostics) {
        findings.record({
          id: 100 + findings.list().length,
          surface: 'scenario-viewer',
          verb: 'produceAppGraphValidationReport',
          wanted: 'Surface validates cleanly so authoring can advance to render.',
          got: `Validator emitted ${d.severity}: ${d.code} — ${d.message ?? '(no message)'}`,
          severity: 'reshape-needed',
          why:
            'Diff-shape + non-form-action surface — every error here is evidence the substrate cannot describe authoring-tool diff/action shapes.',
        });
      }
    }

    expect(phaseStatus(report.value.report, 'artifact-resolution')).toBe('completed');

    const manifest = await mcp.renderPreview();
    saveArtifact('scenario-viewer', {
      manifest: manifest.ok ? manifest.value : null,
      surface: surfaces[SCENARIO_VIEWER_SURFACE],
      uiGraphPolicy: policy.value,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Persist findings report — runs after every test in this file.
// ─────────────────────────────────────────────────────────────────────────
describe('persona findings report', () => {
  it('writes reports/findings.json', () => {
    const reportPath = resolve(REPORTS_DIR, 'findings.json');
    mkdirSync(dirname(reportPath), { recursive: true });
    findings.writeReport(reportPath);
    expect(findings.list().length).toBeGreaterThan(0);
  });
});
