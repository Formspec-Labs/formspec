/**
 * @filedesc E4 red-team run. Three trust claims, three violating app graphs,
 * real `produceAppGraphValidationReport` with real Ajv schema validators.
 *
 * The assertions were the pre-registered prediction: each case asserted that
 * the graph validates and that no diagnostic names the violation. All three
 * held.
 *
 * **Read the assertions before reusing this harness.** The three claims no
 * longer assert the same thing:
 *
 * - **Claim 1 asserts CAUGHT, twice.** The route-class slice landed `routeClass`
 *   on `surface.schema.json` `$defs/Route` and `THEME-ROUTE-CLASS` in
 *   `validateUiGraphPolicy`. The violating graph is unchanged apart from the two
 *   routes now stating what they are, and it is refused — as is the composed
 *   variant that hides every widget behind an `embed-route` hop. Either test
 *   failing means the guard regressed.
 * - **Claim 1's residual asserts UNDETECTED.** `routeClass` is optional with no
 *   default, so the identical violation on unclassified routes still passes.
 *   That is why the rollup says `narrowed`, not `closed`.
 * - **Claims 2 and 3 still assert UNDETECTED, deliberately.** Sensitivity
 *   annotation (v8 finding 27) and execution locality (v8 finding 30) are out
 *   of the route-class slice's scope; nothing was built for them. Their routes
 *   ARE now classified — `operation` and `verification` — which strengthens the
 *   result rather than weakening it: the violations survive a fully classified
 *   graph. A failing test there is still the interesting result, and it means
 *   someone shipped a guard.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWireframesMcp, WireframesMcp } from '@formspec-org/mcp-wireframes';
import type { AuthorActor, SessionRef } from '@formspec-org/studio-core';
import { REPORTS_DIR, runCase, type RedTeamOutcome, type Verdict } from '../src/harness.js';
import {
  CLAIM1_SURFACE_URL,
  embeddedThemeAuthorityCase,
  themeAuthorityCase,
  unclassifiedThemeAuthorityCase,
  violatingPolicy,
} from '../src/claim1-theme-authority.js';
import { sensitivityCase } from '../src/claim2-sensitivity.js';
import { clientExecutedCase } from '../src/claim3-client-executed.js';

const author: AuthorActor = {
  id: 'urn:formspec-cloud:actor:red-team:e4',
  kind: 'human',
  actChannel: 'mcp',
};
const session: SessionRef = {
  id: 'urn:formspec-cloud:session:e4-trust-redteam',
  openedAt: '2026-07-26T00:00:00Z',
  actors: [author.id],
};

const outcomes: RedTeamOutcome[] = [];

/** Verbs Wireframes-MCP publishes — the tenant-facing authoring surface. */
function publishedVerbs(): string[] {
  return Object.getOwnPropertyNames(WireframesMcp.prototype)
    .filter((name) => name !== 'constructor')
    .sort();
}

describe('E4 — adversarial red-team of three trust claims', () => {
  it('claim 1 · theme authority: a tenant restyle of the certificate and verifier surfaces is CAUGHT', async () => {
    // Author the violating policy through the SHIPPED verb, not by hand. The
    // authoring verb still accepts it — the guard is a graph-validation guard,
    // not an authoring-time one, because UI Graph Policy is the tenant's own
    // document and a constraint the constrained party can edit is not a
    // constraint. The refusal happens where the platform's Surface is readable.
    const mcp = createWireframesMcp({ authoredBy: author, session });
    const declared = await mcp.declareUiGraphPolicy({
      surfaceUrl: CLAIM1_SURFACE_URL,
      surfaceVersion: '1.0.0',
      version: '1.0.0',
      title: violatingPolicy.title,
      routePolicies: violatingPolicy.routePolicies,
      theme: violatingPolicy.theme,
    });

    expect(declared.ok, 'declareUiGraphPolicy still accepts the tenant theming of proof surfaces').toBe(true);
    if (!declared.ok) return;

    const outcome = await runCase(themeAuthorityCase(declared.value));
    outcomes.push(outcome);

    expect(outcome.phases.find((p) => p.phase === 'schema')?.status).toBe('completed');
    expect(outcome.phases.find((p) => p.phase === 'cross-artifact')?.status).toBe('completed');
    expect(outcome.verdict).toBe('caught');
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnosticCodes).toContain('THEME-ROUTE-CLASS');

    // One diagnostic per violating assignment: two repaint the certificate
    // widget (accent, surface), one repaints the verifier widget.
    const caught = outcome.diagnostics.filter((d) => d.code === 'THEME-ROUTE-CLASS');
    expect(caught).toHaveLength(3);
    expect(caught.map((d) => d.details?.routeClass).sort()).toEqual(['proof', 'proof', 'verification']);
    for (const diagnostic of caught) {
      expect(diagnostic.severity).toBe('error');
      expect(diagnostic.details?.reason).toBe('tenant-theming-refused-by-route-class');
    }
  });

  it('claim 1 composed · the same restyle hidden behind an embed-route hop is CAUGHT', async () => {
    // Neither trust route binds a widget directly; each embeds an unclassified
    // body route that does, and one body route embeds its host back. A
    // `slots[]`-only reading of route class validated this clean — one
    // schema-valid hop restored the whole violation. §5.7 "Composition".
    const outcome = await runCase(embeddedThemeAuthorityCase);
    outcomes.push(outcome);

    expect(outcome.phases.find((p) => p.phase === 'schema')?.status).toBe('completed');
    expect(outcome.verdict).toBe('caught');
    expect(outcome.ok).toBe(false);

    const caught = outcome.diagnostics.filter((d) => d.code === 'THEME-ROUTE-CLASS');
    expect(caught).toHaveLength(3);
    expect(caught.map((d) => d.details?.routeClass).sort()).toEqual(['proof', 'proof', 'verification']);
    // Each refusal names the protected route and the composition path to the
    // route whose slot actually binds the widget.
    expect(caught.map((d) => d.details?.embedChain)).toContainEqual(['certificate', 'certificate-body']);
    expect(caught.map((d) => d.details?.embedChain)).toContainEqual(['verify', 'verify-body']);
  });

  it('claim 1 residual · the same restyle on UNCLASSIFIED routes is still UNDETECTED', async () => {
    // `routeClass` is OPTIONAL with no default, so the guard is opt-in and
    // nothing in the graph requires the opt-in. This is the reason the rollup
    // records claim 1 as `narrowed` rather than `closed`. A failure here means
    // someone made classification mandatory — file it, do not "fix" this test.
    const outcome = await runCase(unclassifiedThemeAuthorityCase);
    outcomes.push(outcome);

    expect(outcome.phases.find((p) => p.phase === 'schema')?.status).toBe('completed');
    expect(outcome.diagnostics, 'no diagnostic of any severity').toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.verdict).toBe('undetected');
  });

  it('claim 2 · sensitivity: respondent PII and a signing secret are routed to the co-pilot slot', async () => {
    const outcome = await runCase(sensitivityCase);
    outcomes.push(outcome);

    expect(outcome.phases.find((p) => p.phase === 'schema')?.status).toBe('completed');
    expect(outcome.phases.find((p) => p.phase === 'cross-artifact')?.status).toBe('completed');
    expect(outcome.diagnostics, 'no diagnostic of any severity').toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.verdict).toBe('undetected');
  });

  it('claim 2 control · a Data Source pointing at a nonexistent route and slot also passes', async () => {
    const outcome = outcomes.find((o) => o.id === 'claim2-sensitivity');
    expect(outcome, 'claim 2 must run first').toBeDefined();
    // If the Data Sources group were cross-validated at all, the dangling
    // availability ref is the cheapest possible catch. Nothing fires, which
    // separates "sensitivity is unmodelled" from "sensitivity is unchecked":
    // the whole group is unchecked.
    expect(outcome?.diagnosticCodes).toEqual([]);
  });

  it('claim 3 · client-executed: the verifier action round-trips to the server', async () => {
    const outcome = await runCase(clientExecutedCase);
    outcomes.push(outcome);

    expect(outcome.phases.find((p) => p.phase === 'schema')?.status).toBe('completed');
    expect(outcome.phases.find((p) => p.phase === 'cross-artifact')?.status).toBe('completed');
    expect(outcome.diagnostics, 'no diagnostic of any severity').toEqual([]);
    expect(outcome.ok).toBe(true);
    expect(outcome.verdict).toBe('undetected');
  });

  it('records which violations the authoring surface can even express', () => {
    const verbs = publishedVerbs();
    // Claim 1 is authorable end-to-end through the MCP.
    expect(verbs).toContain('declareUiGraphPolicy');
    // Claims 2 and 3 have no authoring verb: the Data Sources catalog and the
    // Response Actions document are host-authored artifacts the MCP never
    // writes. "No verb" is an authoring-surface gap, not a substrate guard —
    // the artifacts themselves accept the violating shape, as claims 2 and 3
    // demonstrate.
    expect(verbs.filter((v) => /data ?source/i.test(v))).toEqual([]);
    expect(verbs.filter((v) => /responseAction|action/i.test(v))).toEqual([]);

    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(
      resolve(REPORTS_DIR, 'mcp-verb-surface.json'),
      JSON.stringify({ publishedVerbs: verbs }, null, 2),
    );
  });

  it('writes the rollup', () => {
    expect(outcomes).toHaveLength(5);
    // Per-claim expectation, not a blanket one. E4's original prediction held
    // 3-for-3; the route-class slice narrowed claim 1 and left 2 and 3 open by
    // design. `expected` is what each claim asserts TODAY, so a drift in either
    // direction is a test failure rather than a silent reinterpretation.
    const expected: Record<string, Verdict> = {
      'claim1-theme-authority': 'caught',
      'claim1-theme-authority-embedded': 'caught',
      'claim1-theme-authority-unclassified': 'undetected',
      'claim2-sensitivity': 'undetected',
      'claim3-client-executed': 'undetected',
    };
    const rollup = {
      experiment: 'E4 — trust-claim red team',
      date: '2026-07-26',
      prediction:
        'All three violations are authorable today, validate cleanly, and are undetectable by any producer diagnostic.',
      predictionHeldAtE4Time: true,
      // NARROWED, not closed. The refusal fires only where the Surface says
      // what a route is, and saying so is optional — see the residual case,
      // which runs the identical violation on unclassified routes and is still
      // undetected. Recording this as `closed` would file a guarantee the
      // substrate does not make.
      narrowedSince: {
        'claim1-theme-authority': {
          by: 'Route-class slice: `routeClass` on surface.schema.json $defs/Route + THEME-ROUTE-CLASS in validateUiGraphPolicy, resolved transitively through embed-route composition (ui-graph-policy-spec.md §5.7).',
          caughtWhen: 'The Surface classifies the route as proof, ceremony, or verification — directly or as the host of an embed-route chain that renders the widget.',
          stillUndetectedWhen: [
            'The Surface never classifies the route. routeClass is OPTIONAL with no default, so the guard is opt-in and nothing in the graph requires the opt-in — see case claim1-theme-authority-unclassified.',
            'Composition crosses a Surface boundary. embed-route is Surface-local, so a host mounting one Surface\'s route inside another Surface\'s chrome composes outside anything either document records.',
            'A widget renders a protected artifact without sitting on a protected route — a receipt rendered on an intake route is a repainted proof surface that no route classification names.',
          ],
        },
      },
      stillOpen: ['claim2-sensitivity', 'claim3-client-executed'],
      matchesExpectation: outcomes.every((o) => o.verdict === expected[o.id]),
      cases: outcomes.map((o) => ({
        id: o.id,
        v8Finding: o.v8Finding,
        claim: o.claim,
        violation: o.violation,
        verdict: o.verdict,
        expectedVerdict: expected[o.id],
        reportOk: o.ok,
        diagnosticCount: o.diagnostics.length,
        diagnosticCodes: o.diagnosticCodes,
        phases: o.phases,
      })),
    };
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(resolve(REPORTS_DIR, 'rollup.json'), JSON.stringify(rollup, null, 2));
    expect(rollup.matchesExpectation).toBe(true);
  });
});
