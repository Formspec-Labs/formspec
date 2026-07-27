/**
 * @filedesc The v10 walk — ONE exemplar through six lifecycle stages, with the
 * six pre-registered bars asserted rather than reported.
 *
 * Pre-registration lives in
 * `formspec/thoughts/spikes/2026-07-26-lifecycle-demo-v10.md` §Pre-registered
 * bars, written before this file ran. Bar 5 was pre-registered as expected to
 * FAIL, and on 2026-07-26 it did: nothing in the substrate merged a rebuild
 * against a designer's edits. The merge shipped on 2026-07-27
 * (`kernel.regenerateSurfaceDocument` over `@formspec-org/core`'s
 * `regenerationMerge`), so bar 5 is now asserted as a demonstration — and its
 * measuring apparatus is asserted alongside it, so a bar that passes because
 * the probes broke still fails the suite.
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
    const merge = state.merge!;
    const merged = state.mergedSurface;

    const edits: EditProbe[] = [
      {
        id: 'DESIGNER-EDIT-1',
        what: `the sentence "${String((DESIGNER_INSERTION.binding as { content: string }).content)}"`,
        deltaClass: 'designer-inserted',
        presentInOldGenerated: slotPresent(oldGenerated, 'apply', DESIGNER_INSERTION.slotId),
        presentInDesignerEdited: slotPresent(designerEdited, 'apply', DESIGNER_INSERTION.slotId),
        presentInNewGenerated: slotPresent(newGenerated, 'apply', DESIGNER_INSERTION.slotId),
        presentInMerged: slotPresent(merged, 'apply', DESIGNER_INSERTION.slotId),
        survived: false,
      },
      {
        id: 'DESIGNER-EDIT-2',
        what: `the plain-English heading "${DESIGNER_RETITLE.designerTitle}" (the AI wrote "${DESIGNER_RETITLE.generatedTitle}")`,
        deltaClass: 'designer-modified',
        presentInOldGenerated: slotTitle(oldGenerated, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        presentInDesignerEdited: slotTitle(designerEdited, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        presentInNewGenerated: slotTitle(newGenerated, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        presentInMerged: slotTitle(merged, 'apply', DESIGNER_RETITLE.slotId) === DESIGNER_RETITLE.designerTitle,
        survived: false,
      },
    ];
    // The merge ran, so "what a consumer receives" IS `merged`.
    for (const edit of edits) edit.survived = edit.presentInMerged === true;

    // The rebuild's OWN work has to land too. A merge that preserved the
    // designer by discarding the AI's update would clear this bar while making
    // the product useless, so the new route the change request asked for is
    // checked in the same breath as the two preserved edits.
    const regeneratedWorkLanded =
      (merged as { routes?: Array<{ id: string }> }).routes?.some((r) => r.id === 'applyMoney') === true;

    const moat = {
      inputs: {
        oldGenerated: 'evidence/bar5-old-generated.surface.json',
        designerEdited: 'evidence/bar5-designer-edited.surface.json',
        newGenerated: 'evidence/bar5-new-generated.surface.json',
        merged: 'evidence/stage-6-feedback.merged.surface.json',
      },
      mergeAttempt: {
        attempted: true,
        entryPoint: merge.entryPoint,
        outcome: apiProbe.noMergeEntryPoint
          ? `The merge ran through ${merge.entryPoint}, but the export sweep found no merge entry point — the two halves of this probe disagree, which is a broken measurement, not a result.`
          : `The merge ran through ${merge.entryPoint}, which composes ${apiProbe.matches.map((m) => `${m.pkg}.${m.name}`).join(', ')}. `
            + `${apiProbe.exportsSeen} runtime exports across ${apiProbe.packagesProbed.length} substrate packages were enumerated and scanned twice; ${apiProbe.matches.length} carry a regeneration-merge entry-point name (${apiProbe.patternsScanned.mergeEntryPoint}) and ${apiProbe.anchorVocabulary.length} carry the merge spec's own §3/§9 identity vocabulary (${apiProbe.patternsScanned.anchorIdentity}). `
            + `The spec is ${fixtureProbe.specStatus}, the report schema ships, and ${fixtureProbe.completeTriples} three-way fixture scenarios ship carrying expected merge OUTPUTS, ${fixtureProbe.assertingPreservation} of which assert that a designer-only value survives. `
            + `This run replayed ${fixtureProbe.executedHere} of them through the shipped entry point: ${fixtureProbe.reproducedExpectedMerged} reproduced the expected merged document and ${fixtureProbe.reproducedExpectedReport} reproduced the expected report${fixtureProbe.failures.length === 0 ? '' : ` (failures: ${fixtureProbe.failures.join(', ')})`}. `
            + `${fixtureProbe.executesFixtures.length === 0 ? 'No committed test reads those expected outputs' : `They are executed by ${fixtureProbe.executesFixtures.join(', ')}`}. `
            + `The Python conformance suite still collects ${fixtureProbe.collectedTests.length} tests under \`-k regeneration\`, all of them in ${fixtureProbe.collectedTestFiles.join(', ')} — report-schema tests that do not run a merge; the executable corpus runner is TypeScript-side. `
            + `${fixtureProbe.mentionsOnly.length} further files name the corpus without executing it.`,
      },
      mergeReport: merge.report,
      reviewQueue: merge.reviewQueue,
      regeneratedWorkLanded,
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
    // Counted, never typed: bar 3's headline states how many times the AI was
    // told no, and a hardcoded number would go stale the first time a beat moves.
    const aiRefusals = allBeats.filter((b) => b.outcome === 'refused' && b.actor === 'ai-agent').length;
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

    // Bar 5 — the moat. Both hand-made changes survive, the rebuild's own new
    // page lands, and the corpus that defines "correct" passes end to end.
    const bar5Met =
      moat.survivingEdits === moat.totalEdits
      && regeneratedWorkLanded
      && fixtureProbe.reproducedExpectedMerged === fixtureProbe.completeTriples
      && fixtureProbe.reproducedExpectedReport === fixtureProbe.completeTriples;

    const bars: BarResult[] = [
      {
        id: 'BAR 1',
        title: 'Everything traces back to the original request',
        met: bar1Met,
        qualifier:
          `Met, and narrower than it sounds: only ${mountedUnits} of the ${totalUnits} journey steps is shown on a page at all, so that one link was tested over ${mountedUnits} of ${totalUnits}. `
          + 'The other three cannot be put on a page in an app that collects answers — a rule we found and reported rather than worked around. The chain is connected end to end; it is not four parallel chains.',
        criterion:
          'Every step from a sentence in the original request to a page, a question, and the field a person actually fills in is either a link the system recorded itself, or a reference sitting in the shipped files.',
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
        title: 'The sign-off can be verified by anyone, offline, forever',
        met: bar2Met,
        criterion:
          'The sign-off checks out from the saved files alone, with nothing running and no need to contact us — and changing a single byte of the app makes it stop checking out.',
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
        title: `The AI was refused ${aiRefusals} times — and kept working`,
        met: bar3Met,
        criterion:
          "The AI is refused every page label and the app's look. Each refusal names what was blocked and who was blocked. The AI carries on building. Nothing slips through. A person then does both, under the very same rule.",
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
        title: 'Your brand goes on your form, never on the receipt',
        met: bar4Met,
        criterion:
          "The organisation's brand colour is allowed on the application form and refused on the receipt a court reads, with the system stating the reason in its own words.",
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
        title: "A designer's hand-made changes survive an AI rebuild",
        met: bar5Met,
        qualifier:
          'Measured missing on 2026-07-26 and closed on 2026-07-27. The first run of this bar found no merging step anywhere in the product, and both hand-made changes were lost the moment the app was rebuilt. '
          + `The step now ships and runs here: ${merge.entryPoint} kept the designer's wording and the sentence they added, took the AI's new page and its updated links, and put the ${merge.report.pendingReview.length} genuinely new pieces in a review list instead of into the app unannounced. `
          + `The ${fixtureProbe.completeTriples} written-down test cases that define "correct" for this step now run, and all of them pass.`,
        criterion:
          "After the AI rebuilds the app, both hand-made changes are still in it — kept by the product's own merging step, not put back by us.",
        evidence: moat,
        ...(bar5Met
          ? {}
          : {
              finding:
                `Preserved ${moat.survivingEdits} of ${moat.totalEdits} hand-made changes; the rebuild's own new page ${regeneratedWorkLanded ? 'landed' : 'did NOT land'}; `
                + `${fixtureProbe.reproducedExpectedMerged}/${fixtureProbe.completeTriples} written-down test cases reproduced the expected app and ${fixtureProbe.reproducedExpectedReport}/${fixtureProbe.completeTriples} the expected report`
                + `${fixtureProbe.failures.length === 0 ? '' : ` (${fixtureProbe.failures.join(', ')})`}.`,
            }),
      },
      {
        id: 'BAR 6',
        title: 'The finished app passed every automated check',
        met: bar6Met,
        criterion:
          'The five structural checks the product commits to all still pass on this app — which was built end to end by the AI and one person, with nothing wired in by hand behind the scenes.',
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
    // All six bars are now asserted as claims. Bar 5's apparatus is asserted
    // too — the probes must still have run and agreed, so a broken measurement
    // fails loudly rather than passing the bar for the wrong reason.
    expect(bar2Met, 'BAR 2 — offline signature verification').toBe(true);
    expect(bar3Met, 'BAR 3 — the 0152 beats').toBe(true);
    expect(bar4Met, 'BAR 4 — THEME-ROUTE-CLASS').toBe(true);
    expect(bar6Met, `BAR 6 — ADR 0160 bars: ${JSON.stringify(bar6Rows)}`).toBe(true);
    expect(bar1Met, `BAR 1 — trace connectivity: ${JSON.stringify(hops.filter((h) => !h.holds))}`).toBe(true);

    expect(moat.apiProbe.packagesProbed.length, 'bar 5a probed the substrate packages').toBeGreaterThan(0);
    expect(moat.apiProbe.noMergeEntryPoint, 'bar 5a found the shipped merge entry point').toBe(false);
    expect(moat.fixtureProbe.completeTriples, 'bar 5b found the shipped fixture corpus').toBe(17);
    expect(moat.fixtureProbe.failures, 'bar 5b — every corpus scenario reproduced').toEqual([]);
    expect(moat.fixtureProbe.reproducedExpectedMerged, 'bar 5b — expected merged documents').toBe(17);
    expect(moat.fixtureProbe.reproducedExpectedReport, 'bar 5b — expected merge reports').toBe(17);
    expect(moat.totalEdits, 'bar 5c measured both designer edits').toBe(2);
    for (const edit of edits) {
      expect(edit.presentInDesignerEdited, `${edit.id} was actually made at build`).toBe(true);
      expect(edit.presentInOldGenerated, `${edit.id} was not in the AI's first output`).toBe(false);
      expect(edit.presentInNewGenerated, `${edit.id} is NOT in the rebuild — the merge is what saves it`).toBe(false);
      expect(edit.presentInMerged, `${edit.id} survived the merge`).toBe(true);
    }
    expect(bar5Met, `BAR 5 — the moat: ${JSON.stringify({ survivingEdits: moat.survivingEdits, regeneratedWorkLanded })}`).toBe(true);
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
