/** @filedesc Needs Document integrity, needRef resolution, and coverage diagnostics over a caller-paired bundle. */

import {
  type AppGraphContext,
  type AppGraphDiagnostic,
  type AppGraphHostEvidenceDocument,
  type AppGraphSourcePointer,
  type ResolvedArtifactHandle,
} from './types.js';
import { diagnosticSourceForHandle } from './report.js';

/**
 * Diagnostic codes this module emits (needs-spec S9.4). The reserved codes of
 * S9.5 — `NEED-STALE-001`, `NEED-ORPHAN-001` — are deliberately absent: v1
 * processors MUST NOT emit them (S11.3.4), and registering them here as
 * unreachable constants would be the first step to emitting them.
 */
const CODE_GROUND = 'NEED-GROUND-001';
const CODE_DOC = 'NEED-DOC-001';
const CODE_REF = 'NEED-REF-001';
const CODE_COVERAGE_UNSERVED = 'NEED-COVERAGE-001';
const CODE_COVERAGE_UNJUSTIFIED = 'NEED-COVERAGE-002';

/** The assertor half of every EARL-framed row (needs-spec S9.3). */
const ASSERTOR = 'formspec-needs-coverage-checker';

/**
 * `need:<id>@<revision>` (needs-spec S8). The shared anchor regex in
 * `common.schema.json` stays broad by convention; the per-prefix grammar is
 * this spec's, so it is enforced here rather than in the schema.
 */
const NEED_ANCHOR = /^need:([a-zA-Z][a-zA-Z0-9_-]*)@([0-9]+)$/;

/**
 * The in-document schema id every Needs Document carries: needs-spec
 * §Conventions defines a Needs Document as one "identified by
 * `$formspecNeeds: '1.0'`", and `needs.schema.json` pins the value with
 * `const`. Id and version are the same token, so one comparison is both the
 * schema-id check and the version check.
 */
const NEEDS_DOCUMENT_SCHEMA_ID = '$formspecNeeds';
const NEEDS_DOCUMENT_VERSION = '1.0';

type Json = Record<string, unknown>;

export type NeedStatus = 'proposed' | 'adopted' | 'superseded' | 'withdrawn';

/** One EARL-shaped report row, carried on every NEED-* diagnostic's `details`. */
export interface NeedsEarlFrame {
  /** Who ran the check. */
  assertor: string;
  /** What was tested — a Need id, a Unit id, or the document itself. */
  subject: string;
  /** The rule the subject was tested against, as a spec-section handle. */
  criterion: string;
  /** EARL outcome vocabulary, narrowed to what this checker can conclude. */
  outcome: 'failed' | 'cantTell';
}

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Json
    : undefined;
}

function stringProp(value: Json | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function handlesByKind(handles: readonly ResolvedArtifactHandle[], artifactKind: string): ResolvedArtifactHandle[] {
  return handles.filter((handle) => handle.artifactKind === artifactKind && handle.status === 'loaded');
}

/**
 * The paired entries this checker will read.
 *
 * An entry is a pairing only if its document says it is a Needs Document at a
 * version this checker implements — the same posture `componentGraphContexts`
 * takes toward an entry whose schema id is not its own. Parsing as a record is
 * not enough: an Experience Document parses too, and reading `needs[]` off a
 * document that never declared itself would invent findings about an artifact
 * the checker cannot claim to have understood.
 *
 * Refusal is silent here by design. A mis-declared entry is a *schema-id*
 * defect, already reported once as `APP-GRAPH-EVIDENCE-SCHEMA-ID` by the
 * evidence phase (`validator.ts`); restating it as a `NEED-*` finding would
 * name one defect twice. What remains is the unpaired posture (S2.1): nothing
 * paired, nothing emitted.
 */
function needsDocuments(context: AppGraphContext): AppGraphHostEvidenceDocument[] {
  return (context.hostEvidence?.needsDocuments ?? []).filter(
    (evidence) => record(evidence.document)?.[NEEDS_DOCUMENT_SCHEMA_ID] === NEEDS_DOCUMENT_VERSION,
  );
}

function evidenceSource(slot: string, evidence: AppGraphHostEvidenceDocument, jsonPointer: string): AppGraphSourcePointer {
  return { artifactSlot: slot, source: evidence.source, jsonPointer };
}

function earl(subject: string, criterion: string, outcome: NeedsEarlFrame['outcome'] = 'failed'): NeedsEarlFrame {
  return { assertor: ASSERTOR, subject, criterion, outcome };
}

function diagnostic(
  code: string,
  severity: AppGraphDiagnostic['severity'],
  message: string,
  primarySource: AppGraphSourcePointer,
  frame: NeedsEarlFrame,
  details: Json,
  relatedSources?: AppGraphSourcePointer[],
): AppGraphDiagnostic {
  return {
    code,
    severity,
    phase: 'cross-artifact',
    origin: 'app-graph-validator',
    message,
    primarySource,
    ...(relatedSources && relatedSources.length > 0 ? { relatedSources } : {}),
    details: { ...frame, ...details },
  };
}

// ─── Reading the paired document ─────────────────────────────────────────────

interface NeedRecord {
  index: number;
  id?: string;
  journey?: string;
  origin?: string;
  status?: string;
  supersedes?: string;
  revision?: number;
  hasGrounding: boolean;
  groundingCount: number;
  hasUngroundedReason: boolean;
  proposedBy?: Json;
  adoptedBy?: Json;
}

function readNeeds(document: Json): NeedRecord[] {
  const needs = document.needs;
  if (!Array.isArray(needs)) return [];
  return needs.map((raw, index): NeedRecord => {
    const need = record(raw) ?? {};
    const grounding = need.grounding;
    return {
      index,
      id: stringProp(need, 'id'),
      journey: stringProp(need, 'journey'),
      origin: stringProp(need, 'origin'),
      status: stringProp(need, 'status'),
      supersedes: stringProp(need, 'supersedes'),
      revision: typeof need.revision === 'number' ? need.revision : undefined,
      hasGrounding: grounding !== undefined,
      groundingCount: Array.isArray(grounding) ? grounding.length : 0,
      hasUngroundedReason: need.ungroundedReason !== undefined,
      proposedBy: record(need.proposedBy),
      adoptedBy: record(need.adoptedBy),
    };
  });
}

function readJourneyIds(document: Json): Set<string> | undefined {
  const journeys = document.journeys;
  if (!Array.isArray(journeys)) return undefined;
  const ids = new Set<string>();
  for (const raw of journeys) {
    const id = stringProp(record(raw), 'id');
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

// ─── Reading the bundle side ─────────────────────────────────────────────────

interface UnitNeedRef {
  unitIndex: number;
  unitId?: string;
  refIndex: number;
  id: string;
}

interface UnitRecord {
  index: number;
  id?: string;
  /** Refs carrying a usable id — the resolution and citation input. */
  refs: UnitNeedRef[];
  /**
   * Entries the unit *declared*, id-bearing or not. The justified predicate
   * (S9.2) counts declarations: `needRefs: [{}]` is a malformed ref, which is
   * the schema's defect to report, not an unjustified unit.
   */
  declaredRefCount: number;
}

function experienceUnits(experience: ResolvedArtifactHandle): UnitRecord[] {
  const units = record(experience.document)?.units;
  if (!Array.isArray(units)) return [];
  return units.map((rawUnit, unitIndex): UnitRecord => {
    const unit = record(rawUnit);
    const unitId = stringProp(unit, 'id');
    const needRefs = unit?.needRefs;
    const refs: UnitNeedRef[] = Array.isArray(needRefs)
      ? needRefs.flatMap((rawRef, refIndex) => {
        const id = stringProp(record(rawRef), 'id');
        return id === undefined ? [] : [{ unitIndex, unitId, refIndex, id }];
      })
      : [];
    return {
      index: unitIndex,
      id: unitId,
      refs,
      declaredRefCount: Array.isArray(needRefs) ? needRefs.length : 0,
    };
  });
}

/**
 * Every `need:` anchor reachable from a loaded artifact, with the JSON pointer
 * that carries it. Walks `x-generation.anchors[]` wherever it appears — the
 * carrier is a vendor extension on arbitrary nodes (common.schema.json
 * `$defs.Generation`), so there is no fixed depth to look at.
 */
interface NeedAnchor {
  needId: string;
  revision: number;
  raw: string;
  jsonPointer: string;
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

function collectNeedAnchors(node: unknown, pointer: string, out: NeedAnchor[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectNeedAnchors(child, `${pointer}/${index}`, out));
    return;
  }
  const object = record(node);
  if (!object) return;

  const generation = record(object['x-generation']);
  const anchors = generation?.anchors;
  if (Array.isArray(anchors)) {
    anchors.forEach((anchor, index) => {
      if (typeof anchor !== 'string') return;
      const match = NEED_ANCHOR.exec(anchor);
      if (!match) return;
      out.push({
        needId: match[1]!,
        revision: Number(match[2]),
        raw: anchor,
        jsonPointer: `${pointer}/x-generation/anchors/${index}`,
      });
    });
  }

  for (const [key, child] of Object.entries(object)) {
    collectNeedAnchors(child, `${pointer}/${escapePointerSegment(key)}`, out);
  }
}

// ─── S6 document integrity ───────────────────────────────────────────────────

function integrityDiagnostics(
  slot: string,
  evidence: AppGraphHostEvidenceDocument,
  document: Json,
  needs: readonly NeedRecord[],
): AppGraphDiagnostic[] {
  const diagnostics: AppGraphDiagnostic[] = [];
  const pointerFor = (need: NeedRecord, suffix = ''): string => `/needs/${need.index}${suffix}`;
  const subjectFor = (need: NeedRecord): string => need.id ?? `needs[${need.index}]`;

  // Rule 5 — grounding exclusivity. Schema-enforced too (S12 `oneOf`); named
  // here so a checker reading an already-parsed document reports the same code.
  for (const need of needs) {
    let reason: string | undefined;
    let detail: string | undefined;
    if (need.hasGrounding && need.hasUngroundedReason) {
      reason = 'both-grounding-and-ungrounded-reason';
      detail = 'declares both evidence and a declared absence';
    } else if (need.hasGrounding && need.groundingCount === 0) {
      reason = 'empty-grounding';
      detail = 'declares an empty grounding array, which is the same silence the rule forbids';
    } else if (!need.hasGrounding && !need.hasUngroundedReason) {
      reason = 'neither-grounding-nor-ungrounded-reason';
      detail = 'declares neither evidence nor a declared absence';
    }
    if (reason === undefined) continue;
    diagnostics.push(diagnostic(
      CODE_GROUND,
      'error',
      `Need '${subjectFor(need)}' ${detail}: exactly one of grounding (with at least one entry) or ungroundedReason is REQUIRED (needs-spec S5.4).`,
      evidenceSource(slot, evidence, pointerFor(need)),
      earl(subjectFor(need), 'needs-spec S5.4 grounding exclusivity'),
      { reason, needId: need.id, needIndex: need.index },
    ));
  }

  // Rule 1 — id uniqueness.
  const seen = new Map<string, number>();
  for (const need of needs) {
    if (need.id === undefined) continue;
    const first = seen.get(need.id);
    if (first === undefined) {
      seen.set(need.id, need.index);
      continue;
    }
    diagnostics.push(diagnostic(
      CODE_DOC,
      'error',
      `Need id '${need.id}' is declared more than once; need.id values MUST be unique within needs[] (needs-spec S6.1).`,
      evidenceSource(slot, evidence, pointerFor(need, '/id')),
      earl(need.id, 'needs-spec S6.1 id uniqueness'),
      { reason: 'duplicate-need-id', needId: need.id, needIndex: need.index, firstIndex: first },
    ));
  }
  const journeyIds = readJourneyIds(document);
  if (journeyIds) {
    const journeys = Array.isArray(document.journeys) ? document.journeys : [];
    const seenJourneys = new Map<string, number>();
    journeys.forEach((raw, index) => {
      const id = stringProp(record(raw), 'id');
      if (id === undefined) return;
      const first = seenJourneys.get(id);
      if (first === undefined) {
        seenJourneys.set(id, index);
        return;
      }
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Journey id '${id}' is declared more than once; journey.id values MUST be unique within journeys[] (needs-spec S6.1).`,
        evidenceSource(slot, evidence, `/journeys/${index}/id`),
        earl(id, 'needs-spec S6.1 id uniqueness'),
        { reason: 'duplicate-journey-id', journeyId: id, journeyIndex: index, firstIndex: first },
      ));
    });
  }

  const byId = new Map<string, NeedRecord>();
  for (const need of needs) {
    if (need.id !== undefined && !byId.has(need.id)) byId.set(need.id, need);
  }

  // Rule 2 — supersession integrity, both directions.
  const supersededBy = new Map<string, string[]>();
  for (const need of needs) {
    if (need.supersedes === undefined) continue;
    const target = byId.get(need.supersedes);
    if (!target) {
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' supersedes '${need.supersedes}', which is not a need.id in this document (needs-spec S6.2).`,
        evidenceSource(slot, evidence, pointerFor(need, '/supersedes')),
        earl(subjectFor(need), 'needs-spec S6.2 supersession integrity'),
        { reason: 'supersedes-unresolved', needId: need.id, supersedes: need.supersedes },
      ));
      continue;
    }
    supersededBy.set(need.supersedes, [...(supersededBy.get(need.supersedes) ?? []), subjectFor(need)]);
    if (target.status !== 'superseded') {
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' supersedes '${need.supersedes}', whose status is '${target.status ?? '<absent>'}' rather than 'superseded' (needs-spec S6.2).`,
        evidenceSource(slot, evidence, pointerFor(need, '/supersedes')),
        earl(subjectFor(need), 'needs-spec S6.2 supersession integrity'),
        { reason: 'supersedes-target-not-superseded', needId: need.id, supersedes: need.supersedes, targetStatus: target.status },
      ));
    }
  }
  for (const need of needs) {
    if (need.status !== 'superseded' || need.id === undefined) continue;
    const citing = supersededBy.get(need.id) ?? [];
    if (citing.length === 1) continue;
    diagnostics.push(diagnostic(
      CODE_DOC,
      'error',
      citing.length === 0
        ? `Need '${need.id}' is 'superseded' but no live record carries supersedes: '${need.id}'; a superseded record MUST be the target of exactly one (needs-spec S6.2).`
        : `Need '${need.id}' is 'superseded' and ${citing.length} records claim to supersede it (${citing.join(', ')}); exactly one MUST (needs-spec S6.2).`,
      evidenceSource(slot, evidence, pointerFor(need, '/status')),
      earl(need.id, 'needs-spec S6.2 supersession integrity'),
      { reason: citing.length === 0 ? 'superseded-without-successor' : 'superseded-by-multiple', needId: need.id, successors: citing },
    ));
  }

  // Rule 3 — journey resolution, only when journeys[] is declared.
  if (journeyIds) {
    for (const need of needs) {
      if (need.journey === undefined || journeyIds.has(need.journey)) continue;
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' groups under journey '${need.journey}', which is not a journeys[].id (needs-spec S6.3).`,
        evidenceSource(slot, evidence, pointerFor(need, '/journey')),
        earl(subjectFor(need), 'needs-spec S6.3 journey resolution'),
        { reason: 'journey-unresolved', needId: need.id, journey: need.journey, knownJourneys: [...journeyIds].sort() },
      ));
    }
  }

  // Rule 4 — origin/status agreement, including the adoption floor.
  for (const need of needs) {
    if (need.origin === 'ai-proposed' && need.proposedBy === undefined) {
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' has origin 'ai-proposed' without proposedBy (needs-spec S6.4).`,
        evidenceSource(slot, evidence, pointerFor(need)),
        earl(subjectFor(need), 'needs-spec S6.4 origin/status agreement'),
        { reason: 'ai-proposed-without-proposed-by', needId: need.id },
      ));
    }
    if (need.status === 'adopted' && need.adoptedBy === undefined) {
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' has status 'adopted' without adoptedBy (needs-spec S6.4).`,
        evidenceSource(slot, evidence, pointerFor(need)),
        earl(subjectFor(need), 'needs-spec S6.4 origin/status agreement'),
        { reason: 'adopted-without-adopted-by', needId: need.id },
      ));
    }
    // The adoption floor (S4.3): an AI-filed Need never self-adopts. Checked
    // wherever adoptedBy is present, so an `ai-agent` stamp is refused on the
    // terminal statuses too — a laundered adoption that then supersedes is
    // still a laundered adoption.
    const adoptedKind = stringProp(need.adoptedBy, 'kind');
    if (need.origin === 'ai-proposed' && adoptedKind !== undefined && adoptedKind !== 'human') {
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' has origin 'ai-proposed' and adoptedBy.kind '${adoptedKind}'; an AI-filed Need MUST be adopted by a human actor (needs-spec S4.3, S6.4).`,
        evidenceSource(slot, evidence, pointerFor(need, '/adoptedBy/kind')),
        earl(subjectFor(need), 'needs-spec S4.3 adoption floor'),
        { reason: 'ai-proposed-adopted-by-non-human', needId: need.id, adoptedByKind: adoptedKind },
      ));
    }
    if (need.origin === 'ai-proposed' && (need.status === 'adopted' || need.status === 'superseded') && need.adoptedBy === undefined) {
      diagnostics.push(diagnostic(
        CODE_DOC,
        'error',
        `Need '${subjectFor(need)}' has origin 'ai-proposed' and status '${need.status}' without adoptedBy; the record left 'proposed' through an adoption that no actor is recorded for (needs-spec S6.4).`,
        evidenceSource(slot, evidence, pointerFor(need)),
        earl(subjectFor(need), 'needs-spec S6.4 origin/status agreement'),
        { reason: 'ai-proposed-past-proposed-without-adopted-by', needId: need.id, status: need.status },
      ));
    }
  }

  return diagnostics;
}

// ─── The validator ───────────────────────────────────────────────────────────

/**
 * Needs Core processor steps 2–3 plus Needs Coverage checker steps 4–5
 * (needs-spec S10.1), over the caller-paired (Needs Document, bundle) pair.
 *
 * **Unpaired is inapplicable, not failing** (S2.1). With no
 * `hostEvidence.needsDocuments[]`, this returns an empty array: no resolution
 * finding, no coverage finding, and specifically no `NEED-COVERAGE-002` on
 * units that cite nothing — there is nothing for them to have cited. An entry
 * whose document does not declare `$formspecNeeds: '1.0'` is not a pairing
 * either; see {@link needsDocuments}.
 *
 * Every finding is `phase: 'cross-artifact'`, severity per S9.4, and carries
 * the EARL frame (assertor / subject / criterion / outcome) on `details` so a
 * coverage report reads like a conformance audit (S9.3).
 */
export function validateNeedsCoverage(context: AppGraphContext): AppGraphDiagnostic[] {
  const paired = needsDocuments(context);
  if (paired.length === 0) return [];

  const diagnostics: AppGraphDiagnostic[] = [];
  const allNeeds: NeedRecord[] = [];
  const needSources = new Map<string, AppGraphSourcePointer>();
  const needsSlotSources: AppGraphSourcePointer[] = [];

  paired.forEach((evidence, evidenceIndex) => {
    const slot = `hostEvidence.needsDocuments[${evidenceIndex}]`;
    const document = record(evidence.document)!;
    const needs = readNeeds(document);
    diagnostics.push(...integrityDiagnostics(slot, evidence, document, needs));
    needsSlotSources.push(evidenceSource(slot, evidence, '/needs'));
    for (const need of needs) {
      allNeeds.push(need);
      if (need.id !== undefined && !needSources.has(need.id)) {
        needSources.set(need.id, evidenceSource(slot, evidence, `/needs/${need.index}`));
      }
    }
  });

  const knownIds = new Set(allNeeds.flatMap((need) => (need.id === undefined ? [] : [need.id])));
  const experiences = handlesByKind(context.handles, 'experience');

  // Step 3 — resolve needRefs; and the citation half of the coverage predicate.
  const citedIds = new Set<string>();
  for (const experience of experiences) {
    for (const unit of experienceUnits(experience)) {
      for (const ref of unit.refs) {
        if (knownIds.has(ref.id)) {
          citedIds.add(ref.id);
          continue;
        }
        diagnostics.push(diagnostic(
          CODE_REF,
          'error',
          `Experience unit '${unit.id ?? '<unknown>'}' needRefs[${ref.refIndex}].id '${ref.id}' does not resolve to any need.id in the paired Needs Document.`,
          diagnosticSourceForHandle(experience, `/units/${unit.index}/needRefs/${ref.refIndex}/id`),
          earl(ref.id, 'needs-spec S7 needRef resolution'),
          {
            reason: 'need-id-unresolved',
            unitId: unit.id,
            unitIndex: unit.index,
            refIndex: ref.refIndex,
            needRefId: ref.id,
            knownNeedIds: [...knownIds].sort(),
          },
          needsSlotSources,
        ));
      }
    }
  }

  // The anchor half of the coverage predicate: any bundle artifact node.
  const anchoredIds = new Set<string>();
  for (const handle of context.handles) {
    if (handle.status !== 'loaded' || handle.document === undefined) continue;
    const anchors: NeedAnchor[] = [];
    collectNeedAnchors(handle.document, '', anchors);
    for (const anchor of anchors) anchoredIds.add(anchor.needId);
  }

  // Step 4/5 — the S9.2 predicate.
  for (const need of allNeeds) {
    if (need.status !== 'adopted' || need.id === undefined) continue;
    if (citedIds.has(need.id) || anchoredIds.has(need.id)) continue;
    diagnostics.push(diagnostic(
      CODE_COVERAGE_UNSERVED,
      'warning',
      `Adopted Need '${need.id}' is served by nothing in this bundle: no Experience unit cites it and no generated node anchors to it.`,
      needSources.get(need.id) ?? needsSlotSources[0]!,
      earl(need.id, 'needs-spec S9.2 served predicate'),
      { reason: 'adopted-need-unserved', needId: need.id, status: need.status },
    ));
  }

  for (const experience of experiences) {
    for (const unit of experienceUnits(experience)) {
      if (unit.declaredRefCount > 0) continue;
      diagnostics.push(diagnostic(
        CODE_COVERAGE_UNJUSTIFIED,
        'info',
        `Experience unit '${unit.id ?? '<unknown>'}' cites no Need, so nothing on record says why it exists.`,
        diagnosticSourceForHandle(experience, `/units/${unit.index}`),
        earl(unit.id ?? `units[${unit.index}]`, 'needs-spec S9.2 justified predicate'),
        { reason: 'unit-unjustified', unitId: unit.id, unitIndex: unit.index },
      ));
    }
  }

  return diagnostics;
}
