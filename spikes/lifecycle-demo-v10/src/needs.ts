/**
 * @filedesc Stage 0 — DISCOVER / NEEDS. Why the product should exist, on the
 * record, before Experience turns that purpose into actors, tasks, and units.
 *
 * ADR 0159 Amendment A3 adds the missing first stage: Discover owns the Needs
 * document; Idea owns Experience. The kernel needs a bundle workspace before it
 * can pair any bundle-local artifact, and `wireframeFromBrief` currently mints
 * an empty Experience and respondent Surface as part of that workspace. This
 * stage records that scaffold explicitly. No Experience actor, task, or unit
 * is authored until Idea; no route is authored until Plan.
 *
 * The beat in one line: **people state the need; an agent notices another; only
 * a person may adopt it; Experience is designed from that record next.**
 *
 * Two refusals are load-bearing and neither comes from a posture declaration:
 *
 * 1. The agent may file a need and may not approve one. That is the
 *    needs-spec S4.3 adoption floor, and it holds in a deployment that
 *    declares nothing — the candidate `needs.adoption` vocabulary handle is
 *    not minted (S10.2). Contrast stage 2's `routeClass` refusals, which are
 *    this deployment's posture choosing to narrow.
 * 2. Coverage never blocks. `connectNeedsToExperience` measures it during Idea,
 *    as soon as the Experience units exist (S9.3, S11.4.2).
 *
 * Spec: ../../../specs/needs/needs-spec.md
 */
import type { WireframesMcp } from '@formspec-org/mcp-wireframes';
import {
  validateNeedsCoverage,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '@formspec-org/app-graph';
import {
  schemaIdForArtifact,
  writeArtifact,
  type Evidence,
} from './harness.js';
import {
  AGENT_PROPOSAL,
  APP_TITLE,
  BRIEF,
  BRIEF_TEXT,
  BUNDLE_ID,
  CITATIONS,
  SURFACE_URL,
  readNeedsCorpus,
} from './exemplar.js';
import { mcpFor, type WalkState } from './stages.js';

export interface CoverageSnapshot {
  /** Adopted needs nothing in the bundle serves. */
  unserved: string[];
  /** Experience units that say nothing about why they exist. */
  unjustified: string[];
  /** Every NEED-* row, so a regression cannot hide behind the two counts. */
  codes: Record<string, number>;
  /** Error-severity findings from the coverage run, to show coverage never blocks. */
  blockingErrors: number;
}

interface ReportDiagnostic {
  code: string;
  severity: string;
  message?: string;
  details?: Record<string, unknown>;
}

async function coverageSnapshot(mcp: WireframesMcp, label: string): Promise<CoverageSnapshot> {
  const preview = await mcp.renderPreview();
  if (!preview.ok) throw new Error(`renderPreview refused (${label}): ${preview.error.message}`);
  const needs = await mcp.readNeedsDocument();
  if (!needs.ok) throw new Error(`readNeedsDocument refused (${label}): ${needs.error.message}`);

  const manifestDocument = preview.value as Record<string, unknown>;
  const experienceUrl = String((manifestDocument.experience as { url?: string } | undefined)?.url ?? '');
  const resolvedExperience = mcp.kernel.resolveBundleLocal({
    artifactKind: 'experience',
    ref: { url: experienceUrl },
  } as never);
  if (resolvedExperience?.status !== 'loaded') {
    throw new Error(`Experience unavailable for Needs coverage (${label}): ${resolvedExperience?.status ?? 'absent'}`);
  }

  const manifest: ResolvedArtifactHandle = {
    slot: 'manifest',
    artifactKind: 'appManifest',
    status: 'loaded',
    source: `lifecycle-v10://${BUNDLE_ID}/app-manifest`,
    ref: { url: BUNDLE_ID, version: '1.0.0' },
    document: manifestDocument,
  };
  const experience: ResolvedArtifactHandle = {
    slot: 'experience',
    artifactKind: 'experience',
    status: 'loaded',
    source: `lifecycle-v10://${BUNDLE_ID}/experience`,
    ref: { url: experienceUrl },
    document: resolvedExperience.document,
  };
  const context: AppGraphContext = {
    manifest,
    handles: [manifest, experience],
    schemaResults: [],
    evidenceResults: [],
    hostEvidence: {
      needsDocuments: [{
        schemaId: schemaIdForArtifact('needs')!,
        source: 'spikes/lifecycle-demo-v10/corpus/assistance.needs.json',
        document: needs.value,
      }],
    },
  };
  const needRows = validateNeedsCoverage(context) as ReportDiagnostic[];
  writeArtifact(`stage-1-idea.${label}.coverage.json`, {
    needDiagnostics: needRows,
    totalDiagnostics: needRows.length,
  });
  return {
    unserved: needRows
      .filter((d) => d.code === 'NEED-COVERAGE-001')
      .map((d) => String(d.details?.needId ?? '<unknown>'))
      .sort(),
    unjustified: needRows
      .filter((d) => d.code === 'NEED-COVERAGE-002')
      .map((d) => String(d.details?.unitId ?? '<unknown>'))
      .sort(),
    codes: needRows.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.code]: (acc[d.code] ?? 0) + 1 }), {}),
    blockingErrors: needRows.filter((d) => d.severity === 'error').length,
  };
}

export interface NeedsBeat {
  before: CoverageSnapshot;
  after: CoverageSnapshot;
  proposedNeedId: string;
  /** The substrate's own words when the agent tried to approve its own proposal. */
  refusalMessage: string;
  citations: number;
}

export interface NeedsDiscovery {
  proposedNeedId: string;
  /** The substrate's own words when the agent tried to approve its own proposal. */
  refusalMessage: string;
}

export async function stageDiscover(ev: Evidence, state: WalkState): Promise<NeedsDiscovery> {
  ev.openStage(
    'discover',
    'Before anyone designs a screen, people write down who needs help and why. The AI notices one more need in the drop-off numbers. It may record that finding, but when it tries to approve its own idea the system stops it: a machine may notice a need; only a person may commit the organisation to one.',
  );

  // Bundle-local authoring needs a workspace. Today this operation also mints
  // empty Experience and respondent Surface documents. Record that scaffold
  // rather than pretending their semantic content already exists: Experience
  // units arrive in Idea and Surface routes arrive in Plan.
  const created = await state.agent.wireframeFromBrief({
    bundleId: BUNDLE_ID,
    version: '1.0.0',
    title: APP_TITLE,
    brief: BRIEF_TEXT,
    surfaceUrl: SURFACE_URL,
    surfaceVersion: '1.0.0',
  });
  ev.beat({
    actor: 'ai-agent',
    verb: 'wireframeFromBrief',
    intent: 'Open the bundle workspace where the Needs document can be paired.',
    outcome: created.ok ? 'admitted' : 'refused',
    ...(created.ok ? {} : { message: created.error.message }),
    details: {
      bundleId: BUNDLE_ID,
      briefLines: BRIEF.length,
      implementationScaffold:
        'The kernel also mints an empty Experience and an empty respondent Surface here. They contain no actors, tasks, units, or routes; their substantive content starts in Idea and Plan.',
    },
  });
  if (!created.ok) throw new Error(`wireframeFromBrief refused: ${created.error.message}`);

  ev.beat({
    actor: 'system',
    verb: 'wireframeFromBrief',
    intent: 'Keep the request itself, so later steps can point back at the words someone wrote.',
    outcome: 'recorded',
    message:
      'It does not. The request is read, used once, and thrown away. The Needs document is the durable source for purpose; Experience units later carry the brief lines forward as design inputs.',
    details: {
      finding: 'no-brief-persistence',
      technical:
        '`wireframeFromBrief` accepts the brief as an argument and discards it. It forwards only id, version and title to `createBundle`; no verb persists the brief text.',
    },
  });

  const corpus = readNeedsCorpus();
  const paired = await state.agent.pairNeedsDocument(corpus as never);
  ev.beat({
    actor: 'human',
    verb: 'pairNeedsDocument',
    intent: 'Hand the app the written record of what people said they needed.',
    outcome: paired.ok ? 'admitted' : 'refused',
    ...(paired.ok ? {} : { message: paired.error.message }),
    details: {
      source: 'spikes/lifecycle-demo-v10/corpus/assistance.needs.json',
      needs: corpus.needs.map((need) => ({ id: need.id, status: need.status, origin: need.origin, want: need.statement.want })),
      note:
        'The record is handed over, not found. Nothing infers it from a filename or a folder — an app and a set of needs '
        + 'are paired by whoever is asking the question (needs-spec S2.1).',
    },
  });
  if (!paired.ok) throw new Error(`pairNeedsDocument refused: ${paired.error.message}`);

  const proposed = await state.agent.proposeNeed(AGENT_PROPOSAL as never);
  ev.beat({
    actor: 'ai-agent',
    verb: 'proposeNeed',
    intent: 'Write down something the drop-off numbers keep showing: people start on a phone and cannot finish later.',
    outcome: proposed.ok ? 'admitted' : 'refused',
    ...(proposed.ok ? {} : { message: proposed.error.message }),
    details: {
      needId: AGENT_PROPOSAL.id,
      want: AGENT_PROPOSAL.statement.want,
      evidence: AGENT_PROPOSAL.grounding[0]!.uri,
      status: 'proposed',
      note: 'Filed as a candidate, not a commitment. The coverage check ignores candidates entirely.',
    },
  });
  if (!proposed.ok) throw new Error(`proposeNeed refused: ${proposed.error.message}`);

  const selfAdopt = await state.agent.adoptNeed({ needId: AGENT_PROPOSAL.id });
  ev.beat({
    actor: 'ai-agent',
    verb: 'adoptNeed',
    intent: 'Approve its own idea and move on.',
    outcome: selfAdopt.ok ? 'admitted' : 'refused',
    ...(selfAdopt.ok ? {} : { message: selfAdopt.error.message }),
    details: {
      needId: AGENT_PROPOSAL.id,
      ...(selfAdopt.ok ? {} : { reason: selfAdopt.error.details?.reason }),
      why:
        'A machine may notice that something is missing. Deciding the organisation will commit to it is a different act, '
        + 'and it belongs to a person.',
      note:
        'This refusal is not this deployment\'s choice. It is in the standard, and it holds even where nobody has '
        + 'configured anything — unlike the page-label refusals later, which are this deployment narrowing.',
    },
  });
  if (selfAdopt.ok) throw new Error('adoptNeed admitted an AI adopting its own proposal — the S4.3 floor did not hold');
  const refusalMessage = selfAdopt.error.message;

  // The handoff a real deployment makes: the person opens their own session and
  // the filed record is handed across. One kernel is one actor (see stages.ts).
  const filed = await state.agent.readNeedsDocument();
  if (!filed.ok) throw new Error(`readNeedsDocument refused: ${filed.error.message}`);
  const approver = mcpFor('human', 'needs-adoption');
  const rePaired = await approver.pairNeedsDocument(filed.value);
  if (!rePaired.ok) throw new Error(`pairNeedsDocument (human) refused: ${rePaired.error.message}`);
  const adopted = await approver.adoptNeed({ needId: AGENT_PROPOSAL.id });
  ev.beat({
    actor: 'human',
    verb: 'adoptNeed',
    intent: 'Read what the AI noticed, agree with it, and commit the organisation to it.',
    outcome: adopted.ok ? 'admitted' : 'refused',
    ...(adopted.ok ? {} : { message: adopted.error.message }),
    details: {
      needId: AGENT_PROPOSAL.id,
      note:
        'The record still says the AI found this. Approving it does not rewrite who noticed it, and it does not count '
        + 'as changing the words — so nothing already built goes stale just because somebody said yes.',
    },
  });
  if (!adopted.ok) throw new Error(`adoptNeed refused: ${adopted.error.message}`);

  const approved = await approver.readNeedsDocument();
  if (!approved.ok) throw new Error(`readNeedsDocument (human) refused: ${approved.error.message}`);
  const handedBack = await state.agent.pairNeedsDocument(approved.value);
  if (!handedBack.ok) throw new Error(`pairNeedsDocument (hand-back) refused: ${handedBack.error.message}`);
  writeArtifact('stage-0-discover.needs-document.json', approved.value);
  // Carried into Idea and then into the human handoff so both sessions cite
  // the same Needs document.
  state.needsDocument = approved.value as never;

  ev.closeStage({
    journeys: approved.value.journeys?.map((journey) => ({ id: journey.id, title: journey.title })) ?? [],
    needsPaired: corpus.needs.length + 1,
    adoptedNeeds: approved.value.needs.filter((need) => need.status === 'adopted').length,
    proposedNeeds: approved.value.needs.filter((need) => need.status === 'proposed').length,
    experienceActors: 0,
    experienceTasks: 0,
    experienceUnits: 0,
    surfaceRoutes: 0,
    artifact: 'evidence/stage-0-discover.needs-document.json',
  });

  return { proposedNeedId: AGENT_PROPOSAL.id, refusalMessage };
}

/**
 * Measures the Needs-to-Experience join immediately after Idea has authored
 * its units and before Plan creates a Definition or Surface. The checker runs
 * directly over the paired Needs document and loaded Experience, which are the
 * only inputs its S9.2 predicate needs.
 */
export async function connectNeedsToExperience(
  ev: Evidence,
  state: WalkState,
  discovery: NeedsDiscovery,
): Promise<NeedsBeat> {
  const before = await coverageSnapshot(state.agent, 'before');
  ev.appendBeat('idea', {
    actor: 'system',
    verb: 'coverage',
    intent: 'Ask which adopted needs the new Experience serves before any links are written.',
    outcome: 'recorded',
    message:
      `Nothing is linked yet. ${before.unserved.length} adopted needs have nothing connected to them, and `
      + `${before.unjustified.length} Experience units cannot say why they exist. This report does not stop Plan or Release.`,
    details: { ...before, artifact: 'evidence/stage-1-idea.before.coverage.json' },
  });

  for (const citation of CITATIONS) {
    const cited = await state.agent.citeNeed({ unitId: citation.unitId, needId: citation.needId, description: citation.because });
    if (!cited.ok) throw new Error(`citeNeed(${citation.unitId} → ${citation.needId}) refused: ${cited.error.message}`);
  }
  ev.appendBeat('idea', {
    actor: 'ai-agent',
    verb: 'citeNeed',
    intent: 'Link each Experience unit to the adopted need it serves.',
    outcome: 'admitted',
    details: {
      citations: CITATIONS.map((c) => ({ unit: c.unitId, need: c.needId, because: c.because })),
      note:
        'The link carries no version number, on purpose. A unit serves the need as currently written, so fixing a '
        + 'typo in the wording never quietly unlinks it.',
    },
  });

  const after = await coverageSnapshot(state.agent, 'after');
  ev.appendBeat('idea', {
    actor: 'system',
    verb: 'coverage',
    intent: 'Ask the same question again.',
    outcome: 'recorded',
    message:
      after.unserved.length === 0 && after.unjustified.length === 0
        ? 'Clean. Every need the organisation has committed to has something built for it, and every Experience unit can say why '
          + 'it exists. The one candidate nobody has ruled on yet is not counted either way — it is not a commitment.'
        : `Still firing: ${after.unserved.length} unserved, ${after.unjustified.length} unexplained.`,
    details: { ...after, artifact: 'evidence/stage-1-idea.after.coverage.json' },
  });

  const experienceUrl = String(((await state.agent.renderPreview()).ok
    ? ((await state.agent.renderPreview()) as { ok: true; value: { experience?: { url?: string } } }).value.experience?.url
    : undefined) ?? '');
  const experience = state.agent.kernel.resolveBundleLocal({ artifactKind: 'experience', ref: { url: experienceUrl } } as never);
  writeArtifact('stage-1-idea.experience.json', experience?.status === 'loaded' ? experience.document : null);

  ev.mergeStageState('idea', {
    unservedBefore: before.unserved,
    unservedAfter: after.unserved,
    unjustifiedBefore: before.unjustified,
    unjustifiedAfter: after.unjustified,
    citations: CITATIONS.length,
    artifact: 'evidence/stage-1-idea.experience.json',
  });

  return {
    before,
    after,
    proposedNeedId: discovery.proposedNeedId,
    refusalMessage: discovery.refusalMessage,
    citations: CITATIONS.length,
  };
}
