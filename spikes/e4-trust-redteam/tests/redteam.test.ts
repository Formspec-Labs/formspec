/**
 * @filedesc E4 red-team run. Three trust claims, three violating app graphs,
 * real `produceAppGraphValidationReport` with real Ajv schema validators.
 *
 * The assertions ARE the pre-registered prediction: each case asserts that the
 * graph validates and that no diagnostic names the violation. A failing test
 * here is the interesting result — it means the substrate caught something.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createWireframesMcp, WireframesMcp } from '@formspec-org/mcp-wireframes';
import type { AuthorActor, SessionRef } from '@formspec-org/studio-core';
import { REPORTS_DIR, runCase, type RedTeamOutcome } from '../src/harness.js';
import { CLAIM1_SURFACE_URL, themeAuthorityCase, violatingPolicy } from '../src/claim1-theme-authority.js';
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
  it('claim 1 · theme authority: a tenant restyles the certificate and verifier surfaces', async () => {
    // Author the violating policy through the SHIPPED verb, not by hand. If the
    // authoring surface had a theme-authority guard, this is where it would sit.
    const mcp = createWireframesMcp({ authoredBy: author, session });
    const declared = await mcp.declareUiGraphPolicy({
      surfaceUrl: CLAIM1_SURFACE_URL,
      surfaceVersion: '1.0.0',
      version: '1.0.0',
      title: violatingPolicy.title,
      routePolicies: violatingPolicy.routePolicies,
      theme: violatingPolicy.theme,
    });

    expect(declared.ok, 'declareUiGraphPolicy accepted the tenant theming of proof surfaces').toBe(true);
    if (!declared.ok) return;

    const outcome = await runCase(themeAuthorityCase(declared.value));
    outcomes.push(outcome);

    expect(outcome.phases.find((p) => p.phase === 'schema')?.status).toBe('completed');
    expect(outcome.phases.find((p) => p.phase === 'cross-artifact')?.status).toBe('completed');
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
    expect(outcomes).toHaveLength(3);
    const rollup = {
      experiment: 'E4 — trust-claim red team',
      date: '2026-07-26',
      prediction:
        'All three violations are authorable today, validate cleanly, and are undetectable by any producer diagnostic.',
      held: outcomes.every((o) => o.verdict === 'undetected' && o.diagnostics.length === 0),
      cases: outcomes.map((o) => ({
        id: o.id,
        v8Finding: o.v8Finding,
        claim: o.claim,
        violation: o.violation,
        verdict: o.verdict,
        reportOk: o.ok,
        diagnosticCount: o.diagnostics.length,
        diagnosticCodes: o.diagnosticCodes,
        phases: o.phases,
      })),
    };
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(resolve(REPORTS_DIR, 'rollup.json'), JSON.stringify(rollup, null, 2));
    expect(rollup.held).toBe(true);
  });
});
