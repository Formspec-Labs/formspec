/**
 * @filedesc Stage 2.5 — NEEDS. Why each screen exists, on the record.
 *
 * The lifecycle table ADR 0159 draws starts at *Idea*, and an Experience
 * document is already a framing decision. This stage runs the row the table
 * silently assumed: the written record of what people said they needed, paired
 * with the bundle, and a coverage query that answers "which of these does this
 * release actually serve?" without a meeting.
 *
 * The beat in one line: **an agent notices a need, a person approves it, the
 * screen that serves it links back to it, and the checker goes green.**
 *
 * Two refusals are load-bearing and neither comes from a posture declaration:
 *
 * 1. The agent may file a need and may not approve one. That is the
 *    needs-spec S4.3 adoption floor, and it holds in a deployment that
 *    declares nothing — the `needs.adoption` vocabulary handle is RESERVED,
 *    not minted (S10.2). Contrast stage 2's `routeClass` refusals, which are
 *    this deployment's posture choosing to narrow.
 * 2. Coverage never blocks. It fires eight rows here and the release is not
 *    stopped by any of them (S9.3, S11.4.2).
 *
 * Spec: ../../../specs/needs/needs-spec.md
 */
import type { WireframesMcp } from '@formspec-org/mcp-wireframes';
import {
  realEvidenceSchemaValidators,
  realSchemaValidators,
  writeArtifact,
  type Evidence,
} from './harness.js';
import { AGENT_PROPOSAL, BUNDLE_ID, CITATIONS, readNeedsCorpus } from './exemplar.js';
import { mcpFor, type WalkState } from './stages.js';

export interface CoverageSnapshot {
  /** Adopted needs nothing in the bundle serves. */
  unserved: string[];
  /** Screens that say nothing about why they exist. */
  unjustified: string[];
  /** Every NEED-* row, so a regression cannot hide behind the two counts. */
  codes: Record<string, number>;
  /** Errors in the whole report, to show coverage never blocks. */
  reportErrors: number;
}

interface ReportDiagnostic {
  code: string;
  severity: string;
  message?: string;
  details?: Record<string, unknown>;
}

async function coverageSnapshot(mcp: WireframesMcp, label: string): Promise<CoverageSnapshot> {
  const result = await mcp.produceAppGraphValidationReport({
    source: `lifecycle-v10://${BUNDLE_ID}/app-manifest`,
    schemaId: 'https://formspec.org/schemas/bundleManifest/2.3',
    schemaValidators: realSchemaValidators(),
    evidenceSchemaValidators: realEvidenceSchemaValidators(),
  });
  if (!result.ok) throw new Error(`produceAppGraphValidationReport refused (${label}): ${result.error.message}`);
  const report = (result.value as unknown as { report: { diagnostics: ReportDiagnostic[] } }).report;
  const needRows = report.diagnostics.filter((d) => d.code.startsWith('NEED-'));
  writeArtifact(`stage-2_5-needs.${label}.coverage.json`, {
    needDiagnostics: needRows,
    totalDiagnostics: report.diagnostics.length,
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
    reportErrors: report.diagnostics.filter((d) => d.severity === 'error').length,
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

export async function stageNeeds(ev: Evidence, state: WalkState): Promise<NeedsBeat> {
  ev.openStage(
    'needs',
    'Somebody wrote down what people actually said they needed, and the app is checked against it. Four needs, four screens, and at first nothing connects them — the checker says so out loud. Then the AI notices something in the drop-off numbers and writes down a fifth need. It tries to approve its own idea and is stopped: a machine may notice a need, only a person may commit to one. A person approves it, each screen is linked to what it is for, and the check comes back clean.',
  );

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

  const before = await coverageSnapshot(state.agent, 'before');
  ev.beat({
    actor: 'system',
    verb: 'coverage',
    intent: 'Ask the app which of these needs it actually serves.',
    outcome: 'recorded',
    message:
      `Nothing serves any of them yet. ${before.unserved.length} needs have nothing built for them, and `
      + `${before.unjustified.length} screens say nothing about why they exist. The release is not stopped by any of it — `
      + 'this is a report, not a gate.',
    details: { ...before, artifact: 'evidence/stage-2_5-needs.before.coverage.json' },
  });

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
        + 'configured anything — unlike the page-label refusals earlier, which are this deployment narrowing.',
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
  writeArtifact('stage-2_5-needs.needs-document.json', approved.value);
  // Carried into the handoff so the person's replay re-pairs the same record
  // and re-cites the same screens (see `authorBaseline`'s `needs` option).
  state.needsDocument = approved.value as never;

  for (const citation of CITATIONS) {
    const cited = await state.agent.citeNeed({ unitId: citation.unitId, needId: citation.needId, description: citation.because });
    if (!cited.ok) throw new Error(`citeNeed(${citation.unitId} → ${citation.needId}) refused: ${cited.error.message}`);
  }
  ev.beat({
    actor: 'ai-agent',
    verb: 'citeNeed',
    intent: 'Link each screen to what it is there for.',
    outcome: 'admitted',
    details: {
      citations: CITATIONS.map((c) => ({ screen: c.unitId, need: c.needId, because: c.because })),
      note:
        'The link carries no version number, on purpose. A screen serves the need as currently written, so fixing a '
        + 'typo in the wording never quietly unlinks it.',
    },
  });

  const after = await coverageSnapshot(state.agent, 'after');
  ev.beat({
    actor: 'system',
    verb: 'coverage',
    intent: 'Ask the same question again.',
    outcome: 'recorded',
    message:
      after.unserved.length === 0 && after.unjustified.length === 0
        ? 'Clean. Every need the organisation has committed to has something built for it, and every screen can say why '
          + 'it exists. The one candidate nobody has ruled on yet is not counted either way — it is not a commitment.'
        : `Still firing: ${after.unserved.length} unserved, ${after.unjustified.length} unexplained.`,
    details: { ...after, artifact: 'evidence/stage-2_5-needs.after.coverage.json' },
  });

  const experienceUrl = String(((await state.agent.renderPreview()).ok
    ? ((await state.agent.renderPreview()) as { ok: true; value: { experience?: { url?: string } } }).value.experience?.url
    : undefined) ?? '');
  const experience = state.agent.kernel.resolveBundleLocal({ artifactKind: 'experience', ref: { url: experienceUrl } } as never);
  writeArtifact('stage-2_5-needs.experience.json', experience?.status === 'loaded' ? experience.document : null);

  ev.closeStage({
    needsPaired: corpus.needs.length + 1,
    adoptedNeeds: approved.value.needs.filter((need) => need.status === 'adopted').length,
    proposedNeeds: approved.value.needs.filter((need) => need.status === 'proposed').length,
    unservedBefore: before.unserved,
    unservedAfter: after.unserved,
    unjustifiedBefore: before.unjustified,
    unjustifiedAfter: after.unjustified,
    citations: CITATIONS.length,
    artifact: 'evidence/stage-2_5-needs.needs-document.json',
  });

  return { before, after, proposedNeedId: AGENT_PROPOSAL.id, refusalMessage, citations: CITATIONS.length };
}
