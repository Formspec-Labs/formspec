/**
 * @filedesc The v10 walk — ONE exemplar through six lifecycle stages, with the
 * six pre-registered bars asserted rather than reported.
 *
 * Pre-registration lives in
 * `formspec/thoughts/spikes/2026-07-26-lifecycle-demo-v10.md` §Pre-registered
 * bars, written before this file ran. **Bar 5 is expected to fail**; it is
 * asserted as a MEASUREMENT (the three probes ran and agree) rather than as a
 * demonstration, so a regression in the measuring apparatus fails the suite
 * while the honest negative result stands.
 *
 * No host `ArtifactLoader` is wired anywhere in this file. Every artifact the
 * graph validates is bundle-local, served by `kernel.resolveBundleLocal`
 * (ADR 0160 §4.4) — wiring a loader would make bar 6 unfalsifiable.
 */
import { describe, it, expect } from 'vitest';
import {
  Evidence,
  checkAgainstDef,
  readArtifact,
  writeArtifact,
  type BarResult,
} from '../src/harness.js';
import {
  APP_TITLE,
  BRIEF,
  BUNDLE_ID,
  DESIGNER_INSERTION,
  DESIGNER_RETITLE,
  ITEMS,
  ROUTES,
  UNITS,
} from '../src/exemplar.js';
import {
  countByCode,
  ensureEngine,
  mcpFor,
  scopeOfDiagnostic,
  stageBuild,
  stageFeedback,
  stageIdea,
  stagePlan,
  stageRelease,
  stageSignOff,
  type WalkState,
} from '../src/stages.js';
import {
  generateDevKey,
  signBundleExport,
  verifyOffline,
} from '../src/signing.js';
import {
  probeApiSurface,
  probeFixtureCorpus,
  slotPresent,
  slotTitle,
  type EditProbe,
} from '../src/regeneration.js';
import { writeWalkthrough } from '../src/walkthrough.js';

describe('spike v10 — the lifecycle demo', () => {
  it('walks one app through six stages and reports the six pre-registered bars', async () => {
    await ensureEngine();
    const ev = new Evidence();
    const state: WalkState = { agent: mcpFor('ai-agent', 'idea-plan-build') };

    // ── The walk ───────────────────────────────────────────────────────────
    await stageIdea(ev, state);
    await stagePlan(ev, state);
    await stageBuild(ev, state);
    const { bundleExport } = await stageSignOff(ev, state);
    const human = state.human!;

    // ── Sign-off: the authored signature ───────────────────────────────────
    const key = await generateDevKey();
    const signed = await signBundleExport(
      {
        bundleExport,
        bundleId: BUNDLE_ID,
        documentId: 'rentAssistanceRelease',
        signerId: 'product-owner',
        signerName: 'R. Okonjo, Product Owner',
        signedAt: '2026-07-27T09:30:00Z',
        affirmationText:
          'I have reviewed this release and I stand behind what each page in it claims to be.',
        ceremonyId: 'ceremony-v10-0001',
      },
      key,
    );
    const signatureSchema = checkAgainstDef(
      'https://formspec.org/schemas/response/1.0',
      'AuthoredSignature',
      signed.record,
    );
    writeArtifact('stage-4-signoff.authored-signature.json', {
      record: signed.record,
      coseSign1Base64: signed.coseSign1Base64,
      publicKeyBase64: signed.publicKeyBase64,
      kidBase64: signed.kidBase64,
      schemaValid: signatureSchema.ok,
      schemaIssues: signatureSchema.issues,
    });
    // NOT asserted, and not part of bar 2's pre-registered criterion — measured.
    // The shipped `AuthoredSignature` schema pins
    // `signedPayload.canonicalization` to `const: "formspec-response-signing-v1"`,
    // so a signature over anything other than a Response cannot conform without
    // declaring a canonicalization profile it did not use. Claiming that const
    // would be exactly the cross-domain reuse ADR 0111 forbids, so the record
    // carries its true profile and fails the schema on that one field. That is
    // the finding, reported below.
    const blockedByConst = signatureSchema.issues.every((i) =>
      i.path === '/signedPayload/canonicalization',
    ) && signatureSchema.issues.length > 0;

    const report = await stageRelease(ev, state);

    // ── Release: the offline verification ──────────────────────────────────
    // Re-read from disk. Nothing below touches the kernel, the MCP, or the
    // signing key — which is what makes "offline" checkable rather than claimed.
    const exportOnDisk = readArtifact<{ manifest: unknown; documents: Record<string, unknown> }>(
      'stage-4-signoff.bundle-export.json',
    );
    const sigOnDisk = readArtifact<{ record: Record<string, unknown>; publicKeyBase64: string }>(
      'stage-4-signoff.authored-signature.json',
    );
    const verification = await verifyOffline({
      bundleExport: exportOnDisk,
      signatureRecord: sigOnDisk.record,
      publicKeyBase64: sigOnDisk.publicKeyBase64,
      inputsRead: [
        'evidence/stage-4-signoff.bundle-export.json',
        'evidence/stage-4-signoff.authored-signature.json',
        'formspec/registries/signature-method-registry.json',
      ],
    });

    // The negative control. A bar 2 that only ever sees a good export proves
    // nothing: a verifier that returns `verified` unconditionally would pass it.
    const tampered = structuredClone(exportOnDisk);
    const tamperTarget = Object.keys(tampered.documents).find((k) => k.includes('/surfaces/'))!;
    (tampered.documents[tamperTarget] as { id: string }).id = 'tampered';
    const tamperCheck = await verifyOffline({
      bundleExport: tampered,
      signatureRecord: sigOnDisk.record,
      publicKeyBase64: sigOnDisk.publicKeyBase64,
      inputsRead: ['(tampered copy of the export, held in memory)'],
    });
    writeArtifact('stage-5-release.verification.json', { verification, tamperCheck });

    await stageFeedback(ev, state);

    // ── Bar 5 — the moat, measured in three parts ──────────────────────────
    const apiProbe = await probeApiSurface();
    const fixtureProbe = probeFixtureCorpus();

    const oldGenerated = state.oldGeneratedSurface;
    const designerEdited = state.designerEditedSurface;
    const newGenerated = state.newGeneratedSurface;

    const edits: EditProbe[] = [
      {
        id: 'DESIGNER-EDIT-1',
        what: `the sentence "${String((DESIGNER_INSERTION.binding as { content: string }).content)}"`,
        deltaClass: 'designer-inserted',
        presentInOldGenerated: slotPresent(oldGenerated, 'apply', DESIGNER_INSERTION.slotId),
        presentInDesignerEdited: slotPresent(designerEdited, 'apply', DESIGNER_INSERTION.slotId),
        presentInNewGenerated: slotPresent(newGenerated, 'apply', DESIGNER_INSERTION.slotId),
        presentInMerged: null,
        survived: false,
      },
      {
        id: 'DESIGNER-EDIT-2',
        what: `the plain-English heading "${DESIGNER_RETITLE.designerTitle}" (the AI wrote "${DESIGNER_RETITLE.generatedTitle}")`,
        deltaClass: 'designer-modified',
        presentInOldGenerated: slotTitle(oldGenerated, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        presentInDesignerEdited: slotTitle(designerEdited, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        presentInNewGenerated: slotTitle(newGenerated, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        presentInMerged: null,
        survived: false,
      },
    ];
    // No merge ran, so "what a consumer receives" IS `new-generated`.
    for (const edit of edits) edit.survived = edit.presentInNewGenerated;

    const moat = {
      inputs: {
        oldGenerated: 'evidence/bar5-old-generated.surface.json',
        designerEdited: 'evidence/bar5-designer-edited.surface.json',
        newGenerated: 'evidence/bar5-new-generated.surface.json',
      },
      mergeAttempt: {
        attempted: true,
        entryPoint: apiProbe.matches[0]?.name ?? null,
        outcome: apiProbe.noMergeEntryPoint
          ? `No merge entry point exists. ${apiProbe.exportsSeen} runtime exports across ${apiProbe.packagesProbed.length} substrate packages were enumerated and scanned twice. `
            + `Zero carry a regeneration-merge entry-point name (${apiProbe.patternsScanned.mergeEntryPoint}). `
            + `${apiProbe.anchorVocabulary.length} carry the merge spec's own §3/§9 identity vocabulary (${apiProbe.patternsScanned.anchorIdentity}) — ${apiProbe.anchorVocabulary.map((m) => m.name).join(', ')}, all in ${[...new Set(apiProbe.anchorVocabulary.map((m) => m.pkg))].join(', ')}. `
            + `So the merge's identity and rename primitives ship; the merge that would compose them does not. `
            + `The spec is ${fixtureProbe.specStatus}, the report schema ships, ${fixtureProbe.completeTriples} three-way fixture scenarios ship carrying expected merge OUTPUTS, ${fixtureProbe.assertingPreservation} of which assert that a designer-only value survives — and ${fixtureProbe.executesFixtures.length === 0 ? 'NO test in the repo reads any of those expected outputs' : `they are read by ${fixtureProbe.executesFixtures.join(', ')}`}. The conformance suite collects ${fixtureProbe.collectedTests.length} tests under \`-k regeneration\`, all of them in ${fixtureProbe.collectedTestFiles.join(', ')} — which validates the report SCHEMA and never runs a merge. ${fixtureProbe.mentionsOnly.length} further files name the corpus without executing it.`
          : `A merge entry point exists: ${apiProbe.matches.map((m) => `${m.pkg}.${m.name}`).join(', ')}.`,
      },
      apiProbe,
      fixtureProbe,
      edits,
      survivingEdits: edits.filter((e) => e.survived).length,
      totalEdits: edits.length,
    };
    writeArtifact('bar5-moat-measurement.json', moat);

    // ── The six bars ───────────────────────────────────────────────────────

    // Bar 1 — trace connectivity.
    const traceRebuilt = await human.kernel.rebuildTraceIndex();
    expect(traceRebuilt.ok).toBe(true);
    const fresh = await human.kernel.verifyTraceFresh();
    const traceIndex = traceRebuilt.ok ? traceRebuilt.value.index : { edges: [], sources: [] };
    type ExportedSurface = { routes: Array<{ id: string; slots: Array<{ slotType: string; binding: Record<string, unknown> }> }> };
    const surfaceKeys = Object.keys(exportOnDisk.documents).filter((k) => k.includes('/surfaces/'));
    const exportedSurfaces = surfaceKeys.map((k) => exportOnDisk.documents[k] as ExportedSurface);
    const exportedSurface: ExportedSurface = { routes: exportedSurfaces.flatMap((s) => s.routes) };
    const experienceKey = Object.keys(exportOnDisk.documents).find((k) => k.endsWith(':experience'))!;
    const exportedExperience = exportOnDisk.documents[experienceKey] as { units: Array<{ id: string; taskRefs?: string[]; actorRef?: string }> };
    const definitionKey = Object.keys(exportOnDisk.documents).find((k) => k.includes('/definitions/'))!;
    const exportedDefinition = exportOnDisk.documents[definitionKey] as { items: Array<{ key: string }> };

    const hops = buildTraceHops({
      brief: BRIEF,
      experience: exportedExperience,
      surface: exportedSurface,
      definition: exportedDefinition,
      traceEdges: traceIndex.edges as Array<{ kind: string; endpoints: [string, string] }>,
    });
    const bar1Met = hops.every((h) => h.holds);
    // The chain closes, but the unit→route hop closes over the units a route
    // can actually mount, which is not all of them. Counted here so the bar's
    // headline can carry it instead of leaving it inside the hop note.
    const mountedUnits = new Set(
      exportedSurface.routes.flatMap((r) =>
        r.slots.filter((s) => s.slotType === 'experience-unit').map((s) => String(s.binding.unitRef)),
      ),
    ).size;
    const totalUnits = exportedExperience.units.length;

    // Bar 3 — the 0152 beats.
    const allBeats = ev.stages.flatMap((s) => s.beats);
    const routeClassRefusals = allBeats.filter(
      (b) => b.verb === 'addRoute' && b.outcome === 'refused' && b.actor === 'ai-agent',
    );
    const themeRefusal = allBeats.find((b) => b.verb === 'declareTheme' && b.outcome === 'refused');
    const themeAdmission = allBeats.find((b) => b.verb === 'declareTheme' && b.outcome === 'admitted');
    const legible = (b: { message?: string } | undefined, vocab: string, value?: string): boolean =>
      b?.message !== undefined
      && b.message.includes(vocab)
      && b.message.includes('urn:formspec:actor:ai-agent')
      && (value === undefined || b.message.includes(value));
    const nothingSmuggled = ev.stages
      .find((s) => s.stage === 'plan')!
      .substrateState.classifiedRoutes === 0;
    // Keyed on the check's own marker, not on the verb string: more than one
    // beat uses `(check)`, and a positional lookup would silently read the
    // wrong one the moment another check is added.
    const themeLeak = allBeats.find(
      (b) => (b.details as { check?: string } | undefined)?.check === 'refused-theme-declaration-left-no-state',
    );
    const bar3Met =
      routeClassRefusals.length === ROUTES.length
      && routeClassRefusals.every((b) => legible(b, 'surface.routeClass'))
      && legible(themeRefusal, 'theme.declaration')
      && themeAdmission !== undefined
      && nothingSmuggled
      && (themeLeak?.details as { themeSlot?: unknown } | undefined)?.themeSlot === null;

    // Bar 4 — THEME-ROUTE-CLASS.
    const crossArtifact = report.report.phases.find((p) => p.phase === 'cross-artifact');
    const themeRouteClass = report.report.diagnostics.filter((d) => d.code === 'THEME-ROUTE-CLASS');
    const firedOn = (routeId: string) =>
      themeRouteClass.filter((d) => (d.details as { routeId?: string } | undefined)?.routeId === routeId);
    const bar4Met =
      crossArtifact?.status === 'completed'
      && firedOn('apply').length === 0
      && firedOn('receipt').length === 1
      && (firedOn('receipt')[0]!.details as { reason?: string }).reason === 'tenant-theming-refused-by-route-class';

    // Bar 6 — the five ADR 0160 bars.
    const errors = report.report.diagnostics.filter((d) => d.severity === 'error');
    const byScope = errors.reduce<Record<string, Record<string, number>>>((acc, d) => {
      const scope = scopeOfDiagnostic(d);
      acc[scope] = acc[scope] ?? {};
      acc[scope][d.code] = (acc[scope][d.code] ?? 0) + 1;
      return acc;
    }, {});
    const whole = countByCode(errors);
    const verbFamily = byScope['verb-family'] ?? {};
    const routeCount = exportedSurface.routes.length;
    const slotCount = exportedSurface.routes.reduce((n, r) => n + r.slots.length, 0);
    // The authored census: every route's declared slots, plus the designer's one
    // inserted slot. `slotsUnchanged` is the control — a bar cleared by authoring
    // less is not cleared.
    const authoredSlots = ROUTES.reduce((n, r) => n + r.slots.length, 0) + 1;
    const bar6Rows = {
      'ARTIFACT-MISSING <= 1 (whole graph)': (whole['ARTIFACT-MISSING'] ?? 0) <= 1,
      'THEME-TOKEN-REF = 0 (whole graph)': (whole['THEME-TOKEN-REF'] ?? 0) === 0,
      'MODULE-* = 0 (verb-family scope)':
        (verbFamily['MODULE-UNRESOLVED'] ?? 0) + (verbFamily['MODULE-CONTRIBUTION-MISSING'] ?? 0) === 0,
      'cross-artifact completed': crossArtifact?.status === 'completed',
      'slotsUnchanged (authored census == exported census)': slotCount === authoredSlots && routeCount === ROUTES.length,
    };
    const bar6Met = Object.values(bar6Rows).every(Boolean);

    // Bar 2 — offline verification.
    const bar2Met =
      verification.result === 'verified'
      && verification.digestMatches
      && tamperCheck.result === 'failed';

    // Bar 5 — the moat.
    const bar5Met = moat.survivingEdits === moat.totalEdits;

    const bars: BarResult[] = [
      {
        id: 'BAR 1',
        title: 'Everything traces back to the brief',
        met: bar1Met,
        qualifier:
          `Met, and narrower than it sounds: only ${mountedUnits} of the ${totalUnits} journey entries is mounted on a page at all, so the unit-to-page hop holds over ${mountedUnits} of ${totalUnits}. `
          + 'The other three are unmountable on a Definition-bearing bundle — `APP-GRAPH-SURFACE-EXPERIENCE-UNIT-DEFINITION` requires any route mounting a unit to also carry a `definition-form` slot for the Experience\'s `targetDefinition`. The chain is connected; it is not four parallel chains.',
        criterion:
          'Each hop from a brief sentence to a page, a question and a rendered field is either an edge the substrate itself recorded, or a reference physically present in the exported files.',
        evidence: {
          mountedUnits,
          totalUnits,
          hops,
          traceIndexFresh: fresh.ok,
          traceEdgeKinds: [...new Set((traceIndex.edges as Array<{ kind: string }>).map((e) => e.kind))].sort(),
          traceSources: (traceIndex.sources as Array<{ kind: string }>).map((s) => s.kind),
        },
        ...(bar1Met ? {} : { finding: hops.filter((h) => !h.holds).map((h) => h.note).join(' ') }),
      },
      {
        id: 'BAR 2',
        title: 'The signature checks out with nothing running',
        met: bar2Met,
        criterion:
          'The release signature verifies from the committed files alone, and a single changed byte makes it stop verifying.',
        evidence: {
          verification,
          tamperedByte: `${tamperTarget} .id -> "tampered"`,
          tamperResult: tamperCheck.result,
          tamperDigestMatches: tamperCheck.digestMatches,
          authoredSignatureSchemaValid: signatureSchema.ok,
          authoredSignatureSchemaIssues: signatureSchema.issues,
          schemaFinding: blockedByConst
            ? 'The record conforms to `response.schema.json` $defs/AuthoredSignature on every field EXCEPT `signedPayload.canonicalization`, which is `const: "formspec-response-signing-v1"`. The shipped authored-signature record cannot describe a signature over anything but a Response. Claiming that const for bundle-export bytes would be the cross-domain reuse ADR 0111 forbids, so the record states its true profile and fails the schema there. Widening it is a spec change, not a spike fix.'
            : `Unexpected schema issues beyond the canonicalization const: ${JSON.stringify(signatureSchema.issues)}`,
          recordedChoice:
            'ADR 0083 profile signs a Response; this signs a bundle export, so the spike mints one spike-local domain tag and reuses every shipped primitive (JCS, COSE_Sign1, the shipped method registry, the WebCrypto adapter). The tag is not a promotion candidate.',
        },
        ...(bar2Met ? {} : { finding: `verification=${verification.result}, tamper=${tamperCheck.result}` }),
      },
      {
        id: 'BAR 3',
        title: 'The authorization rules fire in the middle of the story',
        met: bar3Met,
        criterion:
          'The AI is refused the page classifications and the theme declaration, each refusal naming what was refused and who was refused; it keeps working; nothing leaks through; and a person succeeds at both under the same deployment rule.',
        evidence: {
          routeClassRefusals: routeClassRefusals.length,
          routeClassRefusalMessages: routeClassRefusals.map((b) => b.message),
          themeDeclarationRefusal: themeRefusal?.message ?? null,
          themeDeclarationAdmittedFor: themeAdmission?.actor ?? null,
          agentKeptWorkingAfterRefusal: true,
          classifiedRoutesInAgentSession: 0,
          themeSlotAfterRefusal: (themeLeak?.details as { themeSlot?: unknown } | undefined)?.themeSlot ?? null,
          onePostureDrivesBoth: true,
        },
      },
      {
        id: 'BAR 4',
        title: 'Tenant branding stops at the receipt',
        met: bar4Met,
        criterion:
          'In the release report, the tenant colour is allowed on the application form and refused on the receipt, with the substrate naming the reason.',
        evidence: {
          crossArtifactStatus: crossArtifact?.status,
          perRoute: ROUTES.map((r) => ({
            routeId: r.routeId,
            routeClass: r.routeClass,
            fires: firedOn(r.routeId).length,
            reason: (firedOn(r.routeId)[0]?.details as { reason?: string } | undefined)?.reason ?? null,
          })),
          totalFires: themeRouteClass.length,
        },
      },
      {
        id: 'BAR 5',
        title: "The designer's edits survive a rebuild",
        met: bar5Met,
        criterion:
          'After the change request rebuilds the app, both hand-made edits are still there, put there by the substrate\'s own three-way merge.',
        evidence: moat,
        ...(bar5Met
          ? {}
          : {
              finding:
                `No regeneration merge exists to run. ${moat.mergeAttempt.outcome} `
                + `Both designer edits are therefore lost on rebuild: ${edits.map((e) => `${e.id} (${e.deltaClass})`).join(', ')}. `
                + `This was the pre-registered prediction, and it is ADR 0159's own falsifier firing — the moat is specified, fixtured, and unbuilt.`,
            }),
      },
      {
        id: 'BAR 6',
        title: 'The materialisation guarantees still hold here',
        met: bar6Met,
        criterion:
          'The five ADR 0160 acceptance bars stay met on this new app, authored entirely through the verb family with no host wiring.',
        evidence: {
          rows: bar6Rows,
          wholeGraphErrorsByCode: whole,
          errorsByScope: byScope,
          census: { routes: routeCount, slots: slotCount, authoredSlots },
          hostArtifactLoadersWired: 0,
          namedResiduals: {
            'APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER': (verbFamily['APP-GRAPH-SURFACE-RESPONSE-ACTION-TRIGGER'] ?? 0) > 0
              ? 'Verb-family-scoped and OUTSIDE the five §7 bars. `addAction` mints a Response Actions document that no manifest slot names and `exportBundle` does not serialise, so the `submit` transitions cannot resolve. ADR 0160 §4.2(b) fixed exactly this defect for `ensureExperience`; §6.5 excludes Locale, Mapping and Data Sources from v1 and does NOT list Response Actions, so this is a gap rather than a decision.'
              : 'none',
            'THEME-ROUTE-CLASS': `${(byScope['host-evidence'] ?? {})['THEME-ROUTE-CLASS'] ?? 0} — these are the guard WORKING (bar 4), not a defect. Host-evidence-scoped because the UI Graph Policy is host evidence.`,
          },
        },
        ...(bar6Met
          ? {}
          : { finding: Object.entries(bar6Rows).filter(([, v]) => !v).map(([k]) => k).join('; ') }),
      },
    ];
    for (const bar of bars) ev.bar(bar);

    const evidencePath = ev.write({
      exemplar: { title: APP_TITLE, bundleId: BUNDLE_ID, brief: BRIEF },
      signature: { record: signed.record, publicKeyBase64: signed.publicKeyBase64, schemaValid: signatureSchema.ok },
      verification: { ...verification, tamperResult: tamperCheck.result },
      moat,
      corpus: { units: UNITS.length, items: ITEMS.length, routes: ROUTES.length },
    });

    const walkthroughPath = writeWalkthrough({
      exemplar: { title: APP_TITLE, bundleId: BUNDLE_ID, brief: [...BRIEF] },
      stages: ev.stages,
      bars: ev.bars,
      signature: { record: signed.record },
      verification: { ...verification, tamperResult: tamperCheck.result },
      moat,
    });

    // eslint-disable-next-line no-console
    console.log(`\nevidence: ${evidencePath}\nwalkthrough: ${walkthroughPath}`);
    // eslint-disable-next-line no-console
    console.log(bars.map((b) => `  ${b.id} ${b.met ? 'MET    ' : 'NOT MET'} — ${b.title}`).join('\n'));

    // ── Assertions ─────────────────────────────────────────────────────────
    // Bars 1-4 and 6 are asserted as claims. Bar 5 is asserted as a
    // MEASUREMENT: the three probes must have run and agreed, so a broken
    // apparatus fails loudly while the honest negative result stands.
    expect(bar2Met, 'BAR 2 — offline signature verification').toBe(true);
    expect(bar3Met, 'BAR 3 — the 0152 beats').toBe(true);
    expect(bar4Met, 'BAR 4 — THEME-ROUTE-CLASS').toBe(true);
    expect(bar6Met, `BAR 6 — ADR 0160 bars: ${JSON.stringify(bar6Rows)}`).toBe(true);
    expect(bar1Met, `BAR 1 — trace connectivity: ${JSON.stringify(hops.filter((h) => !h.holds))}`).toBe(true);

    expect(moat.apiProbe.packagesProbed.length, 'bar 5a probed the substrate packages').toBeGreaterThan(0);
    expect(moat.fixtureProbe.completeTriples, 'bar 5b found the shipped fixture corpus').toBeGreaterThan(0);
    expect(moat.totalEdits, 'bar 5c measured both designer edits').toBe(2);
    for (const edit of edits) {
      expect(edit.presentInDesignerEdited, `${edit.id} was actually made at build`).toBe(true);
      expect(edit.presentInOldGenerated, `${edit.id} was not in the AI's first output`).toBe(false);
    }
  }, 120_000);
});

interface Hop {
  from: string;
  to: string;
  holds: boolean;
  /** How the hop is established — an index edge, or a reference in the export. */
  via: string;
  note: string;
}

/**
 * Builds the brief → unit → task → route → slot → item chain, marking each hop
 * with how it is established. A hop the spike could only assert from its own
 * bookkeeping is marked `spike-bookkeeping` and does not hold.
 */
function buildTraceHops(args: {
  brief: readonly { id: string; text: string; unitId: string }[];
  experience: { units: Array<{ id: string; taskRefs?: string[]; actorRef?: string }> };
  surface: { routes: Array<{ id: string; slots: Array<{ slotType: string; binding: Record<string, unknown> }> }> };
  definition: { items: Array<{ key: string }> };
  traceEdges: Array<{ kind: string; endpoints: [string, string] }>;
}): Hop[] {
  const unitIds = new Set(args.experience.units.map((u) => u.id));
  const briefUnitsPresent = args.brief.every((b) => unitIds.has(b.unitId));

  const unitServesTask = args.traceEdges.filter((e) => e.kind === 'unit-serves-task');
  const everyUnitHasTaskEdge = args.experience.units.every((u) =>
    unitServesTask.some((e) => e.endpoints[0] === `unit:${u.id}`),
  );

  const unitRefsOnRoutes = new Set(
    args.surface.routes.flatMap((r) =>
      r.slots.filter((s) => s.slotType === 'experience-unit').map((s) => String(s.binding.unitRef)),
    ),
  );
  const mountedUnitsResolve =
    unitRefsOnRoutes.size > 0 && [...unitRefsOnRoutes].every((u) => unitIds.has(u));

  const definitionRefs = args.surface.routes.flatMap((r) =>
    r.slots.filter((s) => s.slotType === 'definition-form').map((s) => String(s.binding.definitionRef)),
  );
  const componentRendersItem = args.traceEdges.filter((e) => e.kind === 'component-renders-item');
  const itemsRendered = new Set(componentRendersItem.map((e) => e.endpoints[1].replace(/^item:/, '')));
  const everyItemRendered = args.definition.items.every((i) => itemsRendered.has(i.key));

  return [
    {
      from: 'brief sentence',
      to: 'Experience unit',
      holds: briefUnitsPresent,
      via: 'exported Experience document',
      note: briefUnitsPresent
        ? `All ${args.brief.length} brief sentences appear as units in the exported Experience. The brief TEXT is not persisted by any verb; the units are what survives it.`
        : 'A brief sentence produced no unit.',
    },
    {
      from: 'Experience unit',
      to: 'task',
      holds: everyUnitHasTaskEdge,
      via: 'TraceIndex edge `unit-serves-task`',
      note: everyUnitHasTaskEdge
        ? `${unitServesTask.length} unit-serves-task edges, built by the kernel's own trace builder and digest-verified fresh.`
        : 'A unit carries no task edge.',
    },
    {
      from: 'Experience unit',
      to: 'Surface route',
      holds: mountedUnitsResolve,
      via: 'exported Surface `experience-unit` slot binding',
      note: `${unitRefsOnRoutes.size} of ${args.experience.units.length} units are mounted on a route, and every mounted \`unitRef\` names a unit that exists in the Experience. The other units are NOT mountable: `
        + '`APP-GRAPH-SURFACE-EXPERIENCE-UNIT-DEFINITION` requires any route mounting a unit to also carry a `definition-form` slot for the Experience\'s `targetDefinition`, which the kernel stamps automatically once a Definition is declared. On a Definition-bearing bundle that makes a receipt, a signing screen and a staff queue unmountable — the rule reads `targetDefinition` as "every unit collects for this form", which is false of `attestation`, `confirmation` and `review` units.',
    },
    {
      from: 'Surface route',
      to: 'Definition',
      holds: definitionRefs.length > 0 && new Set(definitionRefs).size === 1,
      via: 'exported Surface `definition-form` slot binding',
      note: 'The intake route binds the Definition by URL. This route is ALSO where the Experience meets the Definition: no kernel op writes `unit.itemRefs` after a unit exists, so the Experience-to-item link the ADR 0159 Plan row describes runs through the route rather than through the Experience.',
    },
    {
      from: 'Definition item',
      to: 'rendered Component node',
      holds: everyItemRendered,
      via: 'TraceIndex edge `component-renders-item`',
      note: everyItemRendered
        ? `Every one of the ${args.definition.items.length} questions has a component-renders-item edge.`
        : 'A question is rendered by nothing.',
    },
  ];
}
