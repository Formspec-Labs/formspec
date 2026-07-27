/**
 * @filedesc Persona-as-test for spike v9 — the delta run. The same formspec-cloud
 * PM re-translates the same twelve mockup surfaces v8 translated, through the
 * same wall, and every finding carries an explicit verdict against its v8 self.
 *
 * Posture (v7's persona wall, held): the persona has read the mockup corpus, the
 * mockup route map, and the published MCP tool surface — including the docstrings
 * on `declareRegistry`, `declareDefinition`, and `declareModule`, which are part
 * of that published surface. The persona has NOT read `formspec/specs/`,
 * `formspec/schemas/`, or the ADR corpus. Where a primitive is missing the persona
 * picks the nearest substrate shape, marks it `x-spike-v9:`, and records
 * wanted/got. Findings are the deliverable; passing tests are not.
 *
 * Three things changed under the persona since v8, and v9 exists to price them:
 * `declareRegistry`, `declareDefinition`, and `routeClass` + `THEME-ROUTE-CLASS`.
 * The value of this run comes from its ability to come out negative, so no arm
 * below asserts that a diagnostic count improved. The one exception is deliberate
 * and lives outside the arms: the ADR 0160 §7 acceptance block enforces that
 * ADR's five published bars, because those are that contract's own acceptance
 * evidence rather than this spike's findings.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FindingsCollector } from '../src/findings.js';
import {
  REPORTS_DIR,
  SPIKE_ROOT,
  runSurface,
  phaseStatus,
  type DiagnosticScope,
  type SurfaceOutcome,
} from '../src/harness.js';
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
/** v8's exact authoring shape under real Ajv — isolates the schema effect. */
const armParity: SurfaceOutcome[] = [];
/** What the published verb surface reaches. The catalog arm. */
const armA: SurfaceOutcome[] = [];
/** Plus a Registry hand-composed from the docstring recipe. */
const armB: SurfaceOutcome[] = [];
/** Plus the corrections the validator's own diagnostics named. */
const armC: SurfaceOutcome[] = [];
/** ADR 0160 §7.1's fifth arm — Registry and Theme MINTED by the verb family. */
const armD: SurfaceOutcome[] = [];

const V8_REPORTS = resolve(SPIKE_ROOT, '..', 'wireframe-generator-v8', 'reports');

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
  disposition: 'persists',
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
    'The MCP still publishes no data-source verb. Every data binding in all twelve translations is a free-form string inside a `module-widget` config (`x-spike-v9:workspace:*`), invisible to the validator — none of them checkable, none carrying a schema, a sensitivity class, or a freshness contract. The mechanical count is in `reports/rollup.json` `totals.spikeBindingSites`.',
  severity: 'reshape-needed',
  why:
    'This is still the single highest-frequency gap in the run: every surface, every list, every tile, every chart. Without it the app graph describes layout and nothing about what the layout shows — which is most of what a SaaS product is.',
  v7Ref: 'F3',
  disposition: 'persists',
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
    '`addRoute` takes `{ surfaceId, routeId, path, title }` and nothing else. `:id` is a character sequence. Nothing connects the parameter to the artifact the route is about, so no slot on the route can be validated against the entity it renders.',
  severity: 'missing-feature',
  why:
    'Thirty-one of the sixty-one routes in the product route map are parameterized entity routes. The parameter is the subject of the page; leaving it untyped means the graph cannot check that a slot renders a field the subject actually has.',
  v7Ref: null,
  disposition: 'persists',
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
  disposition: 'persists',
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
  disposition: 'persists',
  suggestion:
    'An `access` block on RoutePolicy: posture enum plus an opaque predicate slot.',
});

// FINDING 6 — theming authority: the rule now exists, and this author cannot reach it
findings.record({
  id: 6,
  surface: 'cross-cutting',
  mockup: 'surfaces/route-map.html + signature-ceremony + verifier + trust-center',
  verb: 'addRoute / declareUiGraphPolicy',
  family: 'theming-and-density',
  wanted:
    'Assert that tenants may theme the form chrome and may not theme the receipt, certificate, verifier, signature ceremony, or any admin / dev / trust surface — the product states this as a structural rule, not a preference.',
  got:
    'The rule exists now: a Surface route can carry a class, and a Theme assignment against a protected class is refused as `THEME-ROUTE-CLASS`. The persona cannot reach it. `addRoute` accepts `{ surfaceId, routeId, path, title }` and rejects anything else that is not `x-`-prefixed, so every one of the fifteen routes v9 authored is *unclassified*, and an unclassified route refuses nothing. The tenant-theme probe on ceremony, verifier, and trust-center — see `reports/rollup.json` `themeAuthority` — produced zero `THEME-ROUTE-CLASS` diagnostics.',
  severity: 'reshape-needed',
  why:
    'A guard that only fires on a field the authoring surface cannot write is off by construction for every app authored through that surface. The proof surfaces are recognizable precisely because they look the same for every tenant; that property is now defended by a rule nobody authoring through Wireframes-MCP can switch on.',
  v7Ref: null,
  disposition: 'narrowed',
  suggestion:
    'See finding 38. The reachability question is not "add routeClass to addRoute" — it is which actor may write it.',
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
  disposition: 'persists',
  suggestion:
    'A profile set alongside the respondent profiles: `data-table`, `multi-pane`, `command-surface`, `no-script`.',
});

// ─────────────────────────────────────────────────────────────────────────
// Surface translations — one exemplar per pattern family, same twelve as v8
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

describe('arm 0 — v8 parity under real Ajv', () => {
  for (const { script, fallback } of exemplars) {
    it(`re-runs ${script.id} in v8's exact authoring shape`, async () => {
      const outcome = await runSurface(script, findings, fallback, 'v8-parity');
      armParity.push(outcome);

      // v8 reached cross-artifact on every surface with a stubbed schema phase.
      // Whether real Ajv still lets it through is a measurement, not a promise —
      // the assertion is only that the run got far enough to be comparable.
      expect(phaseStatus({ phases: outcome.phases }, 'artifact-resolution')).toBe('completed');
      expect(outcome.slotCount).toBeGreaterThan(0);
    });
  }
});

describe('arm A — verb-only (what the published MCP surface reaches)', () => {
  for (const { script, fallback } of exemplars) {
    it(`translates ${script.mockup} (${script.family}) → ${script.route}`, async () => {
      const outcome = await runSurface(script, findings, fallback, 'verb-only');
      armA.push(outcome);
      expect(phaseStatus({ phases: outcome.phases }, 'artifact-resolution')).toBe('completed');
      expect(outcome.slotCount).toBeGreaterThan(0);
    });
  }
});

describe('arm B — host-authored Registry from the docstring recipe', () => {
  for (const { script, fallback } of exemplars) {
    it(`re-runs ${script.id} with a hand-written Registry document`, async () => {
      const outcome = await runSurface(script, findings, fallback, 'host-authored');
      armB.push(outcome);
      expect(outcome.slotCount).toBeGreaterThan(0);
    });
  }
});

describe('arm C — host-corrected (the persona reads the diagnostics and fixes them)', () => {
  for (const { script, fallback } of exemplars) {
    it(`re-runs ${script.id} with widget names and entry fields the schema accepts`, async () => {
      const outcome = await runSurface(script, findings, fallback, 'host-corrected');
      armC.push(outcome);
      expect(outcome.slotCount).toBeGreaterThan(0);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// Post-run findings — recorded from what the two arms actually produced
// ─────────────────────────────────────────────────────────────────────────

/**
 * ADR 0160 §7.1's fifth arm. Everything the host arms hand-author, this arm mints
 * through the verb family, and it validates with **no host loader at all**.
 *
 * Nothing here asserts an improvement: §7.1's bars are checked in the acceptance
 * block below, against the numbers this arm actually produced. An arm that has to be
 * tuned to clear a bar has stopped measuring.
 */
describe('arm D — materialised (ADR 0160 verb family, no host loader)', () => {
  for (const { script, fallback } of exemplars) {
    it(`re-runs ${script.id} with a kernel-minted Registry and Theme`, async () => {
      const outcome = await runSurface(script, findings, fallback, 'materialised');
      armD.push(outcome);
      expect(outcome.slotCount).toBeGreaterThan(0);
    });
  }
});

/**
 * ADR 0160 §7's bars are scoped to the paths verb family v1 OWNS, and the same
 * numbers are reported unscoped beside them. Neither view can be read without the
 * other: `bars` says what the family did with what it can reach, `wholeGraph` says
 * what the corpus still carries, and `byScope` reconciles them diagnostic for
 * diagnostic. Scope is read off each diagnostic's own `primarySource` (harness
 * `scopeOfDiagnostic`) — there is no per-surface exclusion list to tune.
 */
describe('ADR 0160 §7 acceptance bars — measured, then enforced', () => {
  const count = (arm: SurfaceOutcome[], code: string): number =>
    arm.reduce((total, outcome) => total + (outcome.errorCodeCounts[code] ?? 0), 0);
  const countScoped = (arm: SurfaceOutcome[], scope: DiagnosticScope, code: string): number =>
    arm.reduce((total, outcome) => total + (outcome.errorCodeCountsByScope[scope][code] ?? 0), 0);
  /** Errors on this surface that no member of verb family v1 can reach. */
  const outOfFamilyErrors = (o: SurfaceOutcome): number =>
    (['host-evidence', 'corpus-identifier', 'surface-composition'] as const).reduce(
      (n, scope) => n + Object.values(o.errorCodeCountsByScope[scope]).reduce((a, b) => a + b, 0),
      0,
    );

  it('holds the materialised arm to every §7 bar, scoped and unscoped', () => {
    const artifactMissing = count(armD, 'ARTIFACT-MISSING');
    const themeTokenRef = count(armD, 'THEME-TOKEN-REF');
    const crossArtifactCompleted = armD.filter((o) => o.crossArtifactStatus === 'completed').length;
    const moduleStar = count(armD, 'MODULE-UNRESOLVED') + count(armD, 'MODULE-CONTRIBUTION-MISSING');
    // Verb-scoped: the same two counts restricted to diagnostics the family owns.
    const moduleStarOwned =
      countScoped(armD, 'verb-family', 'MODULE-UNRESOLVED')
      + countScoped(armD, 'verb-family', 'MODULE-CONTRIBUTION-MISSING');
    // The denominator narrows, the numerator does not: a surface is evaluable for
    // the family only when nothing outside the family is blocking it.
    const evaluable = armD.filter((o) => outOfFamilyErrors(o) === 0);
    const evaluableCompleted = evaluable.filter((o) => o.crossArtifactStatus === 'completed').length;
    const slots = armD.reduce((n, o) => n + o.slotCount, 0);
    const routes = armD.reduce((n, o) => n + o.routeCount, 0);
    const paritySlots = armParity.reduce((n, o) => n + o.slotCount, 0);
    const parityRoutes = armParity.reduce((n, o) => n + o.routeCount, 0);

    /**
     * ADR 0160 §7's five bars, each carrying the scope §7's own prose gives it —
     * not one scope label stretched over the block. `ARTIFACT-MISSING`,
     * `THEME-TOKEN-REF` and `slotsUnchanged` are met WHOLE-GRAPH (§7: scoping them
     * "would buy nothing and cost a reader's trust"), so they read `count`.
     * `MODULE-*` and `cross-artifact` are verb-family-scoped, so they read
     * `countScoped` and the out-of-family-blocker denominator. Label and
     * measurement move together: a bar labelled `whole-graph` that quietly counted
     * scoped is exactly the overclaim §7's scope note exists to prevent.
     */
    const bars = {
      artifactMissing: {
        scope: 'whole-graph',
        target: '<= 1',
        measured: artifactMissing,
        met: artifactMissing <= 1,
      },
      themeTokenRef: {
        scope: 'whole-graph',
        target: '0',
        measured: themeTokenRef,
        met: themeTokenRef === 0,
      },
      // v9's own control. The arm must author the SAME corpus; an arm that dropped
      // slots would clear every error bar by authoring less.
      slotsUnchanged: {
        scope: 'whole-graph',
        target: 'same corpus as the parity arm',
        measured: `${slots} slots / ${routes} routes`,
        met: slots === paritySlots && routes === parityRoutes,
        slots,
        routes,
        paritySlots,
        parityRoutes,
      },
      moduleStar: {
        scope: 'verb-family',
        target: '0',
        measured: moduleStarOwned,
        met: moduleStarOwned === 0,
      },
      crossArtifactCompleted: {
        scope: 'verb-family',
        target: 'every surface with no out-of-family blocker',
        measured: `${evaluableCompleted} / ${evaluable.length}`,
        met: evaluableCompleted === evaluable.length,
        evaluable: evaluable.map((o) => o.script.id),
      },
    };

    // All five bars are ASSERTED, not merely written to the report. A bar that only
    // lands in a JSON file is a number nothing can regress against, and asserting
    // `slotsUnchanged` alone would let every error bar rot while the control stayed
    // green — the arm would still be authoring the same corpus, just worse.
    expect(bars.artifactMissing.met).toBe(true);
    expect(bars.themeTokenRef.met).toBe(true);
    expect(bars.slotsUnchanged.met).toBe(true);
    expect(bars.moduleStar.met).toBe(true);
    expect(bars.crossArtifactCompleted.met).toBe(true);

    const byScope = (['verb-family', 'host-evidence', 'corpus-identifier', 'surface-composition'] as const)
      .reduce<Record<string, { errors: number; codes: Record<string, number>; surfaces: string[] }>>((acc, scope) => {
        const codes: Record<string, number> = {};
        const surfaces: string[] = [];
        for (const o of armD) {
          const entries = Object.entries(o.errorCodeCountsByScope[scope]);
          if (entries.length > 0) surfaces.push(o.script.id);
          for (const [code, n] of entries) codes[code] = (codes[code] ?? 0) + n;
        }
        acc[scope] = { errors: Object.values(codes).reduce((a, b) => a + b, 0), codes, surfaces };
        return acc;
      }, {});

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'materialised-arm.json'),
      JSON.stringify(
        {
          arm: 'materialised',
          adr: 'thoughts/adr/0160-mcp-materialisation-verbs.md#7-acceptance-evidence',
          exemplars: armD.length,
          /**
           * §7's five bars, every one asserted above. Each carries its OWN `scope`:
           * three are whole-graph, two are verb-family-scoped, per §7's scope note.
           */
          bars,
          /** The same run, unscoped. §7's table carries both columns side by side. */
          wholeGraph: {
            moduleStar,
            crossArtifactCompleted: `${crossArtifactCompleted} / ${armD.length}`,
            errors: armD.reduce((n, o) => n + o.diagnostics.error, 0),
          },
          /**
           * The floors arm D is measured against, taken from THIS process — same
           * code, same corpus, same run. The committed `*.v8-parity.*` /
           * `*.validation.json` files are v9's ORIGINAL baseline and are left
           * untouched, but they no longer reproduce byte-for-byte: §4.4's
           * bundle-local loader now serves the Surface on every arm, which shifts
           * `primarySource.source` and makes the Experience a validated artifact
           * on the legacy arms too. Citing a delta needs both ends measured under
           * one code state, so both ends are recorded here.
           */
          baselinesUnderLandedCode: {
            parity: {
              moduleUnresolved: countScoped(armParity, 'verb-family', 'MODULE-UNRESOLVED'),
              moduleContributionMissingOwned: countScoped(armParity, 'verb-family', 'MODULE-CONTRIBUTION-MISSING'),
              moduleContributionMissingWholeGraph: count(armParity, 'MODULE-CONTRIBUTION-MISSING'),
              crossArtifactCompleted: `${armParity.filter((o) => o.crossArtifactStatus === 'completed').length} / ${armParity.length}`,
            },
            verbOnly: {
              artifactMissing: count(armA, 'ARTIFACT-MISSING'),
              crossArtifactCompleted: `${armA.filter((o) => o.crossArtifactStatus === 'completed').length} / ${armA.length}`,
            },
            hostCorrected: {
              themeTokenRef: count(armC, 'THEME-TOKEN-REF'),
            },
          },
          /** Reconciles the two: every error in exactly one scope. */
          byScope,
          errorCodeCounts: armD.reduce<Record<string, number>>((acc, o) => {
            for (const [code, n] of Object.entries(o.errorCodeCounts)) acc[code] = (acc[code] ?? 0) + n;
            return acc;
          }, {}),
          crossArtifact: armD.map((o) => ({ id: o.script.id, status: o.crossArtifactStatus, reason: o.crossArtifactReason })),
          materialisation: armD.map((o) => ({
            id: o.script.id,
            // The URN the kernel minted — the arm's proof the Registry was never
            // a host reference (ADR 0160 §4.3).
            registryUrl: o.declareRegistryUrl ?? null,
            ...o.materialisation,
          })),
        },
        null,
        2,
      ),
    );
  });
});

describe('v9 findings', () => {
  it('records the new findings the delta exposed', () => {
    const classAttempts = armA.flatMap((o) => o.routeClassOutcomes).filter((o) => o.wanted !== null);
    const classPersisted = classAttempts.filter((o) => o.persisted);
    const classVerbOk = classAttempts.filter((o) => o.verbOk);
    const sampleError = classAttempts.find((o) => o.errorMessage !== undefined);

    // ── FINDING 38 — addRoute takes routeClass, says yes, and throws it away
    findings.record({
      id: 38,
      surface: 'cross-cutting',
      mockup: 'all surfaces',
      verb: 'addRoute',
      family: 'mcp-verb-surface',
      wanted:
        'State what each route presents, in the vocabulary the product already uses about itself: `/sign/:envelopeId` is a ceremony, `/verify` is a verification, `/trust` is an attestation, the console routes are operations. The Surface artifact carries a route class and the theming rule reads it, so saying it once at `addRoute` should be enough.',
      got: `Handed \`routeClass\`, \`addRoute\` returned ok on ${classVerbOk.length} of ${classAttempts.length} routes and refused ${classAttempts.length - classVerbOk.length}${sampleError ? ` (e.g. "${sampleError.errorCode} — ${sampleError.errorMessage}")` : ''}. The class then appears on ${classPersisted.length} of ${classAttempts.length} routes in the Surface document the kernel exports. The verb signature is \`{ surfaceId, routeId, path, title }\` and the facade rebuilds the route from exactly those four keys, so the class is dropped before the kernel — which would have rejected it — ever sees it. The caller gets a success and an unclassified route.`,
      severity: 'reshape-needed',
      why:
        'Silent discard is worse than refusal: a refusal teaches the author, a success teaches them wrong. It also inverts the E4 residual. E4 filed unclassified routes as the *edge* case, the price of leaving classification optional. For every app authored through Wireframes-MCP it is the only case — 15 of 15 routes here, 61 of 61 in the product route map — so `THEME-ROUTE-CLASS` is inert across the whole corpus rather than at its margin.',
      v7Ref: null,
      disposition: 'new',
      suggestion:
        'Not simply "add routeClass to addRoute". Wireframes-MCP is meant to run in both a platform-side and a tenant/AI-facing posture, and a tenant who can classify their own route as `intake` unlocks theming on it — the constraint the constrained party can edit is not a constraint (E4). The seam to evaluate is posture-gated write authority: `actor-posture-admission.ts` (ADR 0150 §5.4 / ADR 0151 §8) with `POSTURE_ACTOR_SCOPE_EXTENSION` / `POSTURE_CLASS_SCOPE_EXTENSION`, plus `posture-declaration.schema.json` `allowedActors`. Assess before building. Independent of that decision and cheap now: the facade should pass unknown keys through to the kernel so its existing `SurfaceRoute contains unsupported property` check fires, instead of swallowing them.',
    });

    const themeProbes = armC.filter((o) => o.tenantThemeAssignments > 0);
    const themeRefusalsA = armA.reduce((n, o) => n + o.themeAuthorityDiagnostics.length, 0);
    const themeRefusalsC = armC.reduce((n, o) => n + o.themeAuthorityDiagnostics.length, 0);

    // ── FINDING 39 — the tenant-theme probe lands on the protected surfaces
    findings.record({
      id: 39,
      surface: 'cross-cutting',
      mockup: 'signature-ceremony + verifier + trust-center',
      verb: 'declareUiGraphPolicy',
      family: 'theming-and-density',
      wanted:
        'The substrate refuses a tenant-brand token assignment aimed at the signature ceremony, the verifier, and the trust center — the three surfaces the corpus explicitly says are not tenant-themeable.',
      got: `${themeProbes.length} surfaces carried tenant-brand assignments through \`declareUiGraphPolicy\`, which accepted every one of them without comment. \`THEME-ROUTE-CLASS\` diagnostics emitted: ${themeRefusalsA} in the verb-only arm, ${themeRefusalsC} in the best-case host-corrected arm where the Registry resolves, the widgets are admitted, and the token slots exist. The refusal cannot fire because the routes carry no class, and no verb writes one.`,
      severity: 'missing-feature',
      why:
        'This is finding 6 executed rather than asserted. The v8 catalog said theming authority was unexpressible; v9 says it is expressible and unreachable. Those are different problems with different fixes — and a guard that stays silent in the best case is not a guard yet.',
      v7Ref: null,
      disposition: 'new',
      suggestion:
        'Same seam as finding 38. A refusal that depends on the protected party classifying itself needs the classification to come from the posture being protected, not the one being constrained.',
    });

    const schemaByArm = (outcomes: SurfaceOutcome[]): number =>
      outcomes.reduce((n, o) => n + (o.errorCodeCounts['APP-GRAPH-SCHEMA'] ?? 0), 0);

    // ── FINDING 40 — what the v8 stub hid
    findings.record({
      id: 40,
      surface: 'cross-cutting',
      mockup: 'all surfaces',
      verb: 'produceAppGraphValidationReport',
      family: 'mcp-verb-surface',
      wanted:
        'A diagnostic count that means what it says. v8\'s reported 95 errors were produced with `schemaValidators: () => ({ ok: true })`, so no artifact in that run was ever checked against its published schema.',
      got: `v9 wires real Ajv over \`formspec/schemas/*.json\`. \`APP-GRAPH-SCHEMA\` errors by arm: v8-parity ${schemaByArm(armParity)}, verb-only ${schemaByArm(armA)}, host-authored ${schemaByArm(armB)}, host-corrected ${schemaByArm(armC)}. The v8-parity arm is the like-for-like comparison against v8's 95; everything else moves a second variable.`,
      severity: 'design-fit',
      why:
        'A spike whose headline number was produced by a stub is a spike whose headline number is unfalsifiable. Recording the correction as a finding is how the next run avoids inheriting it.',
      v7Ref: null,
      disposition: 'new',
      suggestion: undefined,
    });

    // ── FINDING 41 — bindSlot accepts widget names the artifact vocabulary refuses
    const armBSchema = schemaByArm(armB);
    const armCSchema = schemaByArm(armC);
    findings.record({
      id: 41,
      surface: 'cross-cutting',
      mockup: 'all surfaces',
      verb: 'bindSlot(module-widget) / Registry entry',
      family: 'mcp-verb-surface',
      wanted:
        'Bind a widget by the name the design system calls it (`FormsCollection`, `SignatureCapture`, `VerificationResult`) and have that same name be sayable in the Registry entry that admits it and in the Theme assignment that paints it.',
      got: `\`bindSlot\` accepted all 47 PascalCase widget names without comment. The Registry entry that must admit them, and the Theme assignment that must target them, both require \`^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$\` — so the host-authored arm collected ${armBSchema} \`APP-GRAPH-SCHEMA\` errors purely from naming, dropping to ${armCSchema} after renaming every widget and adding the undocumented \`widgetShape\` field. Nothing at authoring time said the name would be unrepresentable.`,
      severity: 'reshape-needed',
      why:
        'The authoring verb and the artifact vocabulary disagree about what a widget may be called, and the disagreement surfaces two hops downstream in a document the author has no verb to write. An AI agent authoring through this MCP will produce a graph that cannot be admitted and will not learn why until a human reads Ajv output.',
      v7Ref: null,
      disposition: 'new',
      suggestion:
        '`bindSlot` should validate `binding.widgetName` against the same pattern the Registry and Theme artifacts use, and refuse at authoring time. Cheap, local, and it moves the error to the verb the author actually called.',
    });

    // ── FINDING 42 — no verb declares a Theme artifact
    const themeTokenRefs = armC.reduce((n, o) => n + (o.errorCodeCounts['THEME-TOKEN-REF'] ?? 0), 0);
    findings.record({
      id: 42,
      surface: 'cross-cutting',
      mockup: 'signature-ceremony + verifier + trust-center',
      verb: 'Wireframes-MCP verb surface',
      family: 'theming-and-density',
      wanted:
        'Declare the Theme the app ships with, so a token assignment in the UI Graph Policy resolves against something. Theming is the subject of two of this run\'s findings; the artifact it depends on has no authoring verb.',
      got: `The MCP publishes \`declareDefinition\`, \`declareRegistry\`, \`declareComponent\`, \`declareModule\`, and \`declareUiGraphPolicy\` — and nothing that declares a Theme. \`declareUiGraphPolicy\` happily accepts \`theme.assignments[]\` naming tokens no declared artifact defines, producing ${themeTokenRefs} \`THEME-TOKEN-REF\` errors in the best-case arm.`,
      severity: 'missing-feature',
      why:
        'The asymmetry is the point: the verb surface lets a tenant *assign* theme tokens but not *declare* the theme they come from. Assignment is the half that carries the authority risk (findings 6, 39); declaration is the half that carries the legitimate use case. Only the risky half shipped.',
      v7Ref: null,
      disposition: 'new',
      suggestion:
        '`declareTheme({ url, version })` as a peer of `declareRegistry`, and `declareUiGraphPolicy` refusing `theme.assignments[]` when no Theme is declared on the manifest.',
    });

    // ── FINDING 43 — declare puts a pointer on the manifest; nothing exports the
    //    document behind it. The one gap findings 18 and 21 share.
    const residualMissing = armC.reduce((n, o) => n + (o.errorCodeCounts['ARTIFACT-MISSING'] ?? 0), 0);
    findings.record({
      id: 43,
      surface: 'cross-cutting',
      mockup: 'onboarding + form-edit + every module-bearing surface',
      verb: 'declareDefinition / declareRegistry / declareComponent',
      family: 'mcp-verb-surface',
      wanted:
        'After declaring an artifact and authoring into it through the MCP, get the document out — so the host can serve at the URL the manifest now points at, and the graph can resolve what the journey just built.',
      got: `The MCP publishes exactly one export: \`exportSurfaceDocument\`, on the kernel rather than the verb surface. Definition, Registry, Component, and Theme have a \`declare*\` verb (or none) and no export. So the best-case arm — Registry hand-written, widgets renamed, modules admitted, MODULE-* at zero — still carries ${residualMissing} \`ARTIFACT-MISSING\` for \`definitions[0]\`: the Definition \`declareDefinition\` created and \`addDefinitionStub\` populated, which nothing can hand to a loader.`,
      severity: 'reshape-needed',
      why:
        'This is the shape both narrowed findings share, stated once. `declareRegistry` closed finding 18\'s admission half and left the content half open; `declareDefinition` closed finding 21 and left the same hole one artifact over. The pattern is not "one more declare verb" — it is that declaration and materialisation were split, and only declaration shipped.',
      v7Ref: null,
      disposition: 'new',
      suggestion:
        '`export<Artifact>Document({ url })` as a peer of each `declare*`, mirroring `exportSurfaceDocument` including its refuse-when-unpublishable behaviour. One symmetric verb family closes the residue of findings 18, 21, and 42 at once.',
    });

    expect(findings.primary().length).toBeGreaterThanOrEqual(40);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Rollup + mechanical delta against v8
// ─────────────────────────────────────────────────────────────────────────

interface V8Rollup {
  surfaces: Array<{ id: string; diagnostics: { error: number }; diagnosticCodes: string[]; slots: number; spikeBindingSites: number }>;
  totals: {
    routes: number;
    slots: number;
    errorDiagnostics: number;
    spikeBindingSites: number;
    spikeBindingsDistinct: number;
  };
}

function summarise(outcomes: SurfaceOutcome[]) {
  return {
    surfaces: outcomes.map((o) => ({
      id: o.script.id,
      mockup: o.script.mockup,
      family: o.script.family,
      route: o.script.route,
      routes: o.routeCount,
      slots: o.slotCount,
      phasesCompleted: o.phases.filter((p) => p.status === 'completed').map((p) => p.phase),
      crossArtifactStatus: o.crossArtifactStatus,
      crossArtifactReason: o.crossArtifactReason ?? null,
      diagnostics: o.diagnostics,
      diagnosticCodes: o.diagnosticCodes,
      errorCodeCounts: o.errorCodeCounts,
      slotTypes: o.slotTypes,
      spikeBindingSites: o.spikeBindings.sites,
      declareRegistryOk: o.declareRegistryOk,
      routeClassPersisted: o.routeClassOutcomes.filter((r) => r.persisted).length,
      routeClassVerbOk: o.routeClassOutcomes.filter((r) => r.verbOk && r.wanted !== null).length,
      routeClassAttempted: o.routeClassOutcomes.filter((r) => r.wanted !== null).length,
    })),
    totals: {
      routes: outcomes.reduce((n, o) => n + o.routeCount, 0),
      slots: outcomes.reduce((n, o) => n + o.slotCount, 0),
      errorDiagnostics: outcomes.reduce((n, o) => n + o.diagnostics.error, 0),
      warningDiagnostics: outcomes.reduce((n, o) => n + o.diagnostics.warning, 0),
      infoDiagnostics: outcomes.reduce((n, o) => n + o.diagnostics.info, 0),
      errorCodeCounts: outcomes
        .flatMap((o) => Object.entries(o.errorCodeCounts))
        .reduce<Record<string, number>>((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), {}),
      slotTypes: outcomes
        .flatMap((o) => Object.entries(o.slotTypes))
        .reduce<Record<string, number>>((acc, [k, v]) => ({ ...acc, [k]: (acc[k] ?? 0) + v }), {}),
      spikeBindingSites: outcomes.reduce((n, o) => n + o.spikeBindings.sites, 0),
      spikeBindingsDistinct: [...new Set(outcomes.flatMap((o) => o.spikeBindings.distinct))].sort().length,
      crossArtifactCompleted: outcomes.filter((o) => o.crossArtifactStatus === 'completed').length,
    },
  };
}

const SCHEMA_CODE = 'APP-GRAPH-SCHEMA';

function schemaExcluded(counts: Record<string, number>): number {
  return Object.entries(counts).reduce((n, [code, count]) => (code === SCHEMA_CODE ? n : n + count), 0);
}

function moduleErrors(counts: Record<string, number>): number {
  return Object.entries(counts)
    .filter(([code]) => code.startsWith('MODULE-'))
    .reduce((n, [, count]) => n + count, 0);
}

describe('rollup', () => {
  it('writes reports/findings.json, reports/rollup.json, reports/delta.json', () => {
    findings.writeReport(resolve(REPORTS_DIR, 'findings.json'));

    const p = summarise(armParity);
    const a = summarise(armA);
    const b = summarise(armB);
    const c = summarise(armC);

    const v8: V8Rollup = JSON.parse(readFileSync(resolve(V8_REPORTS, 'rollup.json'), 'utf8'));
    const v8Findings = JSON.parse(readFileSync(resolve(V8_REPORTS, 'findings.json'), 'utf8')) as {
      counts: { total: number; primary: number; diagnosticAutoRecords: number };
      findings: Array<{ id: number; got: string }>;
    };
    // v8 recorded one auto-record per error diagnostic, with the code in `got`.
    const v8ModuleDiagnostics = v8Findings.findings.filter(
      (f) => f.id >= 100 && /Validator emitted error: MODULE-/.test(f.got),
    ).length;

    const perSurface = a.surfaces.map((s) => {
      const prior = v8.surfaces.find((x) => x.id === s.id);
      const pArm = p.surfaces.find((x) => x.id === s.id);
      const bArm = b.surfaces.find((x) => x.id === s.id);
      const cArm = c.surfaces.find((x) => x.id === s.id);
      return {
        id: s.id,
        v8Errors: prior?.diagnostics.error ?? null,
        v9Errors: {
          parity: pArm?.diagnostics.error ?? null,
          verbOnly: s.diagnostics.error,
          hostAuthored: bArm?.diagnostics.error ?? null,
          hostCorrected: cArm?.diagnostics.error ?? null,
        },
        v9ErrorsLikeForLike: {
          parity: pArm ? schemaExcluded(pArm.errorCodeCounts) : null,
          verbOnly: schemaExcluded(s.errorCodeCounts),
          hostAuthored: bArm ? schemaExcluded(bArm.errorCodeCounts) : null,
          hostCorrected: cArm ? schemaExcluded(cArm.errorCodeCounts) : null,
        },
        deltaParityVsV8: prior && pArm ? schemaExcluded(pArm.errorCodeCounts) - prior.diagnostics.error : null,
        crossArtifact: {
          parity: pArm?.crossArtifactStatus ?? null,
          verbOnly: s.crossArtifactStatus,
          hostAuthored: bArm?.crossArtifactStatus ?? null,
          hostCorrected: cArm?.crossArtifactStatus ?? null,
        },
        v8Codes: prior?.diagnosticCodes ?? [],
        v9Codes: {
          parity: pArm?.diagnosticCodes ?? [],
          verbOnly: s.diagnosticCodes,
          hostAuthored: bArm?.diagnosticCodes ?? [],
          hostCorrected: cArm?.diagnosticCodes ?? [],
        },
        slotsUnchanged: prior ? prior.slots === s.slots : null,
        v8SpikeBindingSites: prior?.spikeBindingSites ?? null,
        v9SpikeBindingSites: s.spikeBindingSites,
      };
    });

    const delta = {
      spike: 'wireframe-generator-v9',
      baseline: 'wireframe-generator-v8',
      note:
        'v8 stubbed schema validation (`schemaValidators: () => ({ ok: true })`); v9 runs real Ajv over formspec/schemas/*.json. The ONLY like-for-like comparison against v8 is the `parity` arm with APP-GRAPH-SCHEMA excluded: same authoring shape, same checks. Every other arm moves a second variable and is reported as its own number, not as a delta.',
      arms: {
        parity: 'v8 authoring shape, real Ajv, no declareRegistry, no theme probe',
        verbOnly: 'plus declareRegistry (unpopulated — no verb authors entries) and the tenant-theme probe',
        hostAuthored: 'plus a Registry document hand-composed from declareModule\'s docstring recipe',
        hostCorrected: 'plus the corrections APP-GRAPH-SCHEMA named: x- widget names, widgetShape',
      },
      totals: {
        v8ErrorDiagnostics: v8.totals.errorDiagnostics,
        v9ErrorDiagnostics: {
          parity: p.totals.errorDiagnostics,
          verbOnly: a.totals.errorDiagnostics,
          hostAuthored: b.totals.errorDiagnostics,
          hostCorrected: c.totals.errorDiagnostics,
        },
        v9ErrorDiagnosticsLikeForLike: {
          parity: schemaExcluded(p.totals.errorCodeCounts),
          verbOnly: schemaExcluded(a.totals.errorCodeCounts),
          hostAuthored: schemaExcluded(b.totals.errorCodeCounts),
          hostCorrected: schemaExcluded(c.totals.errorCodeCounts),
        },
        deltaParityVsV8LikeForLike: schemaExcluded(p.totals.errorCodeCounts) - v8.totals.errorDiagnostics,
        deltaHostCorrectedVsV8LikeForLike:
          schemaExcluded(c.totals.errorCodeCounts) - v8.totals.errorDiagnostics,
        crossArtifactCompleted: {
          v8: v8.surfaces.length,
          parity: p.totals.crossArtifactCompleted,
          verbOnly: a.totals.crossArtifactCompleted,
          hostAuthored: b.totals.crossArtifactCompleted,
          hostCorrected: c.totals.crossArtifactCompleted,
        },
        v8SpikeBindingSites: v8.totals.spikeBindingSites,
        v9SpikeBindingSites: a.totals.spikeBindingSites,
        v8SpikeBindingsDistinct: v8.totals.spikeBindingsDistinct,
        v9SpikeBindingsDistinct: a.totals.spikeBindingsDistinct,
        v8Routes: v8.totals.routes,
        v9Routes: a.totals.routes,
        v8Slots: v8.totals.slots,
        v9Slots: a.totals.slots,
      },
      errorCodeCounts: {
        parity: p.totals.errorCodeCounts,
        verbOnly: a.totals.errorCodeCounts,
        hostAuthored: b.totals.errorCodeCounts,
        hostCorrected: c.totals.errorCodeCounts,
      },
      routeClass: {
        attempted: armA.reduce((n, o) => n + o.routeClassOutcomes.filter((r) => r.wanted !== null).length, 0),
        verbReturnedOk: armA.reduce((n, o) => n + o.routeClassOutcomes.filter((r) => r.verbOk && r.wanted !== null).length, 0),
        persistedInExportedSurface: armA.reduce((n, o) => n + o.routeClassOutcomes.filter((r) => r.persisted).length, 0),
        distinctErrors: [
          ...new Set(
            armA
              .flatMap((o) => o.routeClassOutcomes)
              .filter((r) => !r.verbOk && r.errorMessage !== undefined)
              .map((r) => `${r.errorCode} — ${r.errorMessage}`),
          ),
        ],
        classesWanted: [
          ...new Set(armA.flatMap((o) => o.routeClassOutcomes.map((r) => r.wanted)).filter((c) => c !== null)),
        ].sort(),
      },
      themeAuthority: {
        surfacesProbed: armA.filter((o) => o.tenantThemeAssignments > 0).map((o) => o.script.id),
        assignmentsPushed: armA.reduce((n, o) => n + o.tenantThemeAssignments, 0),
        themeRouteClassDiagnostics: {
          verbOnly: armA.reduce((n, o) => n + o.themeAuthorityDiagnostics.length, 0),
          hostAuthored: armB.reduce((n, o) => n + o.themeAuthorityDiagnostics.length, 0),
          hostCorrected: armC.reduce((n, o) => n + o.themeAuthorityDiagnostics.length, 0),
        },
      },
      surfaceExport: {
        publishable: armA.filter((o) => o.surfaceExport.publishable).length,
        surfaces: armA.length,
        refusals: armA
          .filter((o) => !o.surfaceExport.publishable)
          .map((o) => ({
            id: o.script.id,
            error: o.surfaceExport.error ?? null,
            codes: [...new Set(o.surfaceExport.diagnostics.map((d) => d.code))],
          })),
      },
      registry: {
        surfaces: armA.length,
        declareRegistryAccepted: armA.filter((o) => o.declareRegistryOk).length,
        moduleDiagnostics: {
          v8: v8ModuleDiagnostics,
          parity: moduleErrors(p.totals.errorCodeCounts),
          verbOnly: moduleErrors(a.totals.errorCodeCounts),
          hostAuthored: moduleErrors(b.totals.errorCodeCounts),
          hostCorrected: moduleErrors(c.totals.errorCodeCounts),
        },
      },
      findings: {
        v8Primary: v8Findings.counts.primary,
        v8Total: v8Findings.counts.total,
        v9Primary: findings.primary().length,
        v9Total: findings.list().length,
        dispositionCounts: findings.dispositionCounts(),
        dispositionIds: findings.dispositionIds(),
      },
      perSurface,
    };

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'rollup.json'),
      JSON.stringify(
        {
          spike: 'wireframe-generator-v9',
          exemplars: armA.length,
          arms: { parity: p, verbOnly: a, hostAuthored: b, hostCorrected: c },
          themeAuthority: delta.themeAuthority,
          routeClass: delta.routeClass,
          registry: delta.registry,
          surfaceExport: delta.surfaceExport,
          familyRanking: findings.familyRanking(),
          v7CrossReference: findings.v7CrossReference(),
          dispositionCounts: findings.dispositionCounts(),
        },
        null,
        2,
      ),
    );
    writeFileSync(resolve(REPORTS_DIR, 'delta.json'), JSON.stringify(delta, null, 2));

    expect(armParity.length).toBe(exemplars.length);
    expect(armA.length).toBe(exemplars.length);
    expect(armB.length).toBe(exemplars.length);
    expect(armC.length).toBe(exemplars.length);
    // The delta is only honest if the twelve translations are the same twelve.
    expect(perSurface.every((s) => s.slotsUnchanged === true)).toBe(true);
  });
});
