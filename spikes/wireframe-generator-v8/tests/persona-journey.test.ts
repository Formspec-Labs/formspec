/**
 * @filedesc Persona-as-test for spike v8. A formspec-cloud PM (the persona)
 * translates twelve mockup surfaces from the Claude Design handoff into AppGraph
 * artifacts using only the Wireframes-MCP verb surface, and records every place
 * the substrate could not carry the mockup.
 *
 * Posture (v7's persona wall, held): the persona has read the mockup corpus, the
 * mockup route map, and the published MCP tool surface. The persona has NOT read
 * `formspec/specs/`, `formspec/schemas/`, or the ADR corpus. When a primitive is
 * missing the persona picks the nearest substrate shape, marks the workaround
 * with an `x-spike-v8:` string so the gap is visible in the artifact, and records
 * a wanted/got finding. Findings are the deliverable; passing tests are not.
 *
 * Cross-cutting findings (1-6, plus 33 from the v7 cross-check pass) are recorded
 * before any surface runs — they are app-level gaps the persona hit while planning
 * the translation, not gaps any single surface owns.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FindingsCollector } from '../src/findings.js';
import { REPORTS_DIR, runSurface, phaseStatus, type SurfaceOutcome } from '../src/harness.js';
import { formsIndex } from '../src/surfaces/forms-index.js';
import { ownerDashboard } from '../src/surfaces/owner-dashboard.js';
import { formDetail } from '../src/surfaces/form-detail.js';
import { formEdit } from '../src/surfaces/form-edit.js';
import { onboarding } from '../src/surfaces/onboarding.js';
import { signatureCeremony } from '../src/surfaces/signature-ceremony.js';
import { adminBilling } from '../src/surfaces/admin-billing.js';
import { devWebhooks } from '../src/surfaces/dev-webhooks.js';
import { trustCenter } from '../src/surfaces/trust-center.js';
import { verifier } from '../src/surfaces/verifier.js';
import { responsesIndex } from '../src/surfaces/responses-index.js';
import { formVersions } from '../src/surfaces/form-versions.js';

const findings = new FindingsCollector();
const outcomes: SurfaceOutcome[] = [];

// ─────────────────────────────────────────────────────────────────────────
// Cross-cutting findings — app-level gaps, recorded before any surface runs
// ─────────────────────────────────────────────────────────────────────────

// FINDING 1 — one app, sixty-one routes, one persistent shell
findings.record({
  id: 1,
  surface: 'cross-cutting',
  mockup: 'surfaces/route-map.html',
  verb: 'wireframeFromBrief',
  family: 'app-composition',
  wanted:
    'One Formspec Cloud app holding sixty-one routes across seven personas, with a persistent authenticated shell (org / workspace / environment switcher, left nav, account menu) that every authenticated route inherits, and three unauthenticated route groups that deliberately do not.',
  got:
    'One Surface per bundle. Twelve translated surfaces became twelve bundles, twelve App Manifests, twelve validation passes, with no shared identity, theme, locale, or chrome. The shell that appears on every authenticated route has to be re-declared per bundle or dropped.',
  severity: 'reshape-needed',
  why:
    'v7 hit this with three sibling authoring tabs. A real SaaS product multiplies it by sixty-one and adds an inheritance axis: the product\'s own route map says the env tag "appears in every authenticated route and carries production weight". Re-declaration is how that promise breaks.',
  v7Ref: 'F1',
  suggestion:
    'A multi-Surface bundle with an app-level shell: `declareSurface` siblings plus a `shell` region set that routes inherit by group, with explicit opt-out for anonymous routes.',
});

// FINDING 2 — no data-source declaration verb at all
findings.record({
  id: 2,
  surface: 'cross-cutting',
  mockup: 'all surfaces',
  verb: 'Wireframes-MCP verb surface',
  family: 'data-source',
  wanted:
    'Declare the data behind each surface: `workspace:forms`, `workspace:responses`, `workspace:envelopes`, `workspace:usage`, `host-status:anchoring`, `catalog:deployment-tiers`. v7 asked for a `workspace:` scope family; the prior question is where a scope string would even be written.',
  got:
    'The MCP publishes no data-source verb. Every data binding in all twelve translations is a free-form string inside a `module-widget` config (`x-spike-v8:workspace:*`), invisible to the validator: 53 workaround binding sites naming 38 distinct strings, none of them checkable, none of them carrying a schema, a sensitivity class, or a freshness contract.',
  severity: 'reshape-needed',
  why:
    'This is the single highest-frequency gap in the run: every surface, every list, every tile, every chart. Without it the app graph describes layout and nothing about what the layout shows — which is most of what a SaaS product is.',
  v7Ref: 'F3',
  suggestion:
    '`declareDataSource({ id, scope, kind, schemaRef, sensitivity, freshness })` on the MCP, slot bindings referencing declared ids, and the `workspace:` / `host-status:` / `catalog:` scope families v7 F3 asked for.',
});

// FINDING 3 — routes carry no parameter contract
findings.record({
  id: 3,
  surface: 'cross-cutting',
  mockup: 'surfaces/route-map.html',
  verb: 'addRoute',
  family: 'app-composition',
  wanted:
    'Declare that `/forms/:id` binds `id` to a form artifact, `/sign/:envelopeId` to an envelope, `/r/:receiptId` to a receipt — with the parameter\'s type, the artifact kind it resolves to, and the not-found behavior.',
  got:
    '`addRoute` takes a path string. `:id` is a character sequence. Nothing connects the parameter to the artifact the route is about, so no slot on the route can be validated against the entity it renders.',
  severity: 'missing-feature',
  why:
    'Thirty-one of the sixty-one routes in the product route map are parameterized entity routes. The parameter is the subject of the page; leaving it untyped means the graph cannot check that a slot renders a field the subject actually has.',
  v7Ref: null,
  suggestion:
    '`params: [{ name, artifactKind, required, notFound: "404" | "redirect" }]` on the route shape, with slot bindings able to reference `params.<name>` as a data-source root.',
});

// FINDING 4 — feature lifecycle state is a product invariant with no home
findings.record({
  id: 4,
  surface: 'cross-cutting',
  mockup: 'surfaces/route-map.html',
  verb: 'addRoute / declareUiGraphPolicy',
  family: 'state-and-status',
  wanted:
    'Each route declares its shipping state from a closed set — live · assisted · preview · disabled — because the product\'s stated rule is that disabled features stay visible and honestly labelled rather than hidden.',
  got:
    'No route-level lifecycle field. The badge is markup inside whatever renders the nav, so the honesty rule is a convention enforced by review rather than a property of the graph.',
  severity: 'missing-feature',
  why:
    'Nine of sixty-one routes ship as preview and three as disabled. The rule that they stay visible is a trust commitment to procurement buyers. Commitments that live only in review comments decay.',
  v7Ref: null,
  suggestion:
    'A `lifecycle` enum on the route (`live` | `assisted` | `preview` | `disabled`) that the renderer badges and the validator can hold to a policy ("disabled routes must remain reachable and labelled").',
});

// FINDING 5 — no auth posture per route
findings.record({
  id: 5,
  surface: 'cross-cutting',
  mockup: 'surfaces/route-map.html',
  verb: 'declareUiGraphPolicy',
  family: 'capability-gating',
  wanted:
    'Declare each route\'s access posture: anonymous (`/verify`, `/trust`, `/status`), authenticated (`/o/:org/w/:ws/*`), elevated with step-up (`/admin/org`, `/admin/step-up`), or signer-link-bearing (`/sign/:envelopeId`).',
  got:
    'UI Graph Policy covers a11y, locale, theme. Access posture is application middleware, so the graph cannot state — or check — that the verifier is reachable without an account, which is the product\'s loudest claim.',
  severity: 'missing-feature',
  why:
    'Anonymous reachability of the verifier is the positioning bet. Step-up on destructive admin actions is the governance claim. Both are properties of routes, and neither is expressible on the artifact that describes routes.',
  v7Ref: 'F10',
  suggestion:
    'An `access` block on RoutePolicy: posture enum plus an opaque predicate slot that ADR 0152 can later give semantics to.',
});

// FINDING 6 — theming has no ownership or immutability assertion
findings.record({
  id: 6,
  surface: 'cross-cutting',
  mockup: 'surfaces/route-map.html + signature-ceremony + verifier + receipt + certificate',
  verb: 'declareUiGraphPolicy',
  family: 'theming-and-density',
  wanted:
    'Assert that tenants may theme the form chrome and may not theme the receipt, certificate, verifier, signature ceremony, or any admin / dev / trust surface — the product states this as a structural rule, not a preference.',
  got:
    'UI Graph Policy has a theme slot. It expresses what the theme is, not who may change it. A tenant theme reaching the ceremony is indistinguishable, at graph level, from a tenant theme reaching a form.',
  severity: 'missing-feature',
  why:
    'The proof surfaces are recognizable precisely because they look the same for every tenant. If theming authority is not in the artifact, the rule survives only as long as nobody ships a well-meaning white-label feature.',
  v7Ref: null,
  suggestion:
    'A `themeAuthority` field on RoutePolicy — `tenant` | `platform` | `frozen` — with the validator refusing tenant theme evidence against a `frozen` route.',
});

// FINDING 33 — a11y profile set is intake-shaped (recorded on the v7 cross-check pass)
findings.record({
  id: 33,
  surface: 'cross-cutting',
  mockup: 'all surfaces',
  verb: 'declareUiGraphPolicy',
  family: 'a11y-profile',
  wanted:
    'a11y declarations that fit what the corpus actually contains: a 4 218-row table with configurable columns, six-tab entity navigation, right-hand drawers with focus traps, a keyboard-first command palette, a signature ceremony that must not trap a screen reader mid-attestation, and a receipt that renders with JavaScript off.',
  got:
    'Every one of the twelve policies declares the same two knobs — `landmark` and `keyboardNavigation` — because that is what RoutePolicy.a11y offers. Twelve surfaces, one a11y shape, no expression of table semantics, focus order across panes, drawer traps, shortcut maps, or no-JS fallbacks.',
  severity: 'reshape-needed',
  why:
    'The product sells to government and healthcare buyers who procure against Section 508 and WCAG 2.1 AA, and its own design philosophy states that AI accessibility and human accessibility are one investment. An a11y profile that cannot describe the product\'s densest surfaces cannot carry either claim.',
  v7Ref: 'F6',
  suggestion:
    'A profile set alongside the respondent profiles: `data-table` (row/column semantics, sort announcement), `multi-pane` (focus order, drawer trap, restore target), `command-surface` (shortcut map), `no-script` (required-render assertion for receipt-class routes).',
});

// ─────────────────────────────────────────────────────────────────────────
// Surface translations — one exemplar per pattern family
// ─────────────────────────────────────────────────────────────────────────

const exemplars = [
  { script: formsIndex, fallback: { confirms: 7, family: 'slot-taxonomy' as const, v7Ref: 'F8' as const } },
  { script: ownerDashboard, fallback: { confirms: 12, family: 'slot-taxonomy' as const, v7Ref: 'F13' as const } },
  { script: formDetail, fallback: { confirms: 16, family: 'app-composition' as const, v7Ref: 'F1' as const } },
  { script: formEdit, fallback: { confirms: 18, family: 'mcp-verb-surface' as const, v7Ref: null } },
  { script: onboarding, fallback: { confirms: 20, family: 'app-composition' as const, v7Ref: null } },
  { script: signatureCeremony, fallback: { confirms: 22, family: 'slot-taxonomy' as const, v7Ref: null } },
  { script: adminBilling, fallback: { confirms: 24, family: 'read-only-display' as const, v7Ref: 'F4' as const } },
  { script: devWebhooks, fallback: { confirms: 26, family: 'action-vocabulary' as const, v7Ref: 'F9' as const } },
  { script: trustCenter, fallback: { confirms: 28, family: 'slot-taxonomy' as const, v7Ref: 'F13' as const } },
  { script: verifier, fallback: { confirms: 30, family: 'action-vocabulary' as const, v7Ref: 'F12' as const } },
  { script: responsesIndex, fallback: { confirms: 32, family: 'state-and-status' as const, v7Ref: null } },
  { script: formVersions, fallback: { confirms: 35, family: 'slot-taxonomy' as const, v7Ref: 'F11' as const } },
];

describe('mockup → AppGraph translation', () => {
  for (const { script, fallback } of exemplars) {
    it(`translates ${script.mockup} (${script.family}) → ${script.route}`, async () => {
      const outcome = await runSurface(script, findings, fallback);
      outcomes.push(outcome);

      // The substrate accepts the shape: artifact resolution and cross-artifact
      // both complete. What it cannot accept is the content — that is the catalog.
      expect(phaseStatus({ phases: outcome.phases }, 'artifact-resolution')).toBe('completed');
      expect(phaseStatus({ phases: outcome.phases }, 'cross-artifact')).toBe('completed');
      expect(outcome.slotCount).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Rollup — per-surface tracker + findings catalog for the spike doc
// ─────────────────────────────────────────────────────────────────────────
describe('rollup', () => {
  it('writes reports/findings.json and reports/rollup.json', () => {
    findings.writeReport(resolve(REPORTS_DIR, 'findings.json'));

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'rollup.json'),
      JSON.stringify(
        {
          spike: 'wireframe-generator-v8',
          exemplars: outcomes.length,
          surfaces: outcomes.map((o) => ({
            id: o.script.id,
            mockup: o.script.mockup,
            family: o.script.family,
            route: o.script.route,
            routes: o.routeCount,
            slots: o.slotCount,
            phasesCompleted: o.phases.filter((p) => p.status === 'completed').map((p) => p.phase),
            diagnostics: o.diagnostics,
            diagnosticCodes: o.diagnosticCodes,
            slotTypes: o.slotTypes,
            spikeBindingSites: o.spikeBindings.sites,
          })),
          totals: {
            routes: outcomes.reduce((n, o) => n + o.routeCount, 0),
            slots: outcomes.reduce((n, o) => n + o.slotCount, 0),
            errorDiagnostics: outcomes.reduce((n, o) => n + o.diagnostics.error, 0),
            warningDiagnostics: outcomes.reduce((n, o) => n + o.diagnostics.warning, 0),
            infoDiagnostics: outcomes.reduce((n, o) => n + o.diagnostics.info, 0),
            slotTypes: outcomes
              .flatMap((o) => Object.entries(o.slotTypes))
              .reduce<Record<string, number>>((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), {}),
            spikeBindingSites: outcomes.reduce((n, o) => n + o.spikeBindings.sites, 0),
            spikeBindingsDistinct: [...new Set(outcomes.flatMap((o) => o.spikeBindings.distinct))].sort().length,
          },
          familyRanking: findings.familyRanking(),
          v7CrossReference: findings.v7CrossReference(),
        },
        null,
        2,
      ),
    );

    expect(outcomes.length).toBe(exemplars.length);
    expect(findings.primary().length).toBeGreaterThanOrEqual(36);
  });
});
