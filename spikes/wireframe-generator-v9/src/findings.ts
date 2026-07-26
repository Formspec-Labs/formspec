/**
 * @filedesc Findings collector for the v9 spike. Same collector v8 used, plus
 * the one axis a delta run needs: `disposition`.
 *
 * v8 asked "what can the substrate not carry?" and answered with a catalog.
 * v9 asks "what did `declareRegistry`, `declareDefinition`, and `routeClass`
 * actually close?" — so every finding it re-records carries an explicit verdict
 * against its v8 self: closed, narrowed, persists, or new. A finding whose
 * disposition is `persists` and whose `got` text is unchanged from v8 is a
 * finding v9 re-confirmed; it is not padding, but it is not progress either,
 * and the rollup counts the two separately.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Gap families — closed set, ranked by hit frequency in the spike doc. */
export type GapFamily =
  | 'slot-taxonomy'
  | 'read-only-display'
  | 'data-source'
  | 'action-vocabulary'
  | 'capability-gating'
  | 'app-composition'
  | 'cross-slot-contract'
  | 'a11y-profile'
  | 'mcp-verb-surface'
  | 'state-and-status'
  | 'theming-and-density';

/** v7 finding ids (2026-05-26 spike). `null` = gap v7 did not record. */
export type V7Ref =
  | 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7'
  | 'F8' | 'F9' | 'F10' | 'F11' | 'F12' | 'F13' | 'F14'
  | null;

/**
 * Verdict against this finding's v8 self.
 *
 * - `closed` — the path the finding asked for exists and the persona walked it.
 * - `narrowed` — part of the path exists; the finding's remaining half is stated
 *   in `got`.
 * - `persists` — nothing about this finding changed.
 * - `new` — v9 surfaced it; no v8 counterpart. Numbered from 38.
 */
export type Disposition = 'closed' | 'narrowed' | 'persists' | 'new';

export interface Finding {
  /** Numeric id. 1..N are primary findings; 100+ are auto-records from validator diagnostics. */
  id: number;
  /** Spike surface id the gap surfaced on (`cross-cutting` for app-level gaps). */
  surface: string;
  /** Mockup file the surface was translated from. */
  mockup?: string;
  /** Verb / primitive the persona was trying to use. */
  verb: string;
  /** Gap family for frequency ranking. */
  family: GapFamily;
  /** What the persona wanted to express. */
  wanted: string;
  /** What the substrate let them express instead (or refused). */
  got: string;
  severity: 'reshape-needed' | 'workaround-acceptable' | 'missing-feature' | 'design-fit';
  /** Why this matters for the SaaS product. */
  why: string;
  /** v7 finding this confirms, or null when the SaaS corpus surfaced it fresh. */
  v7Ref: V7Ref;
  /** Verdict against v8. Defaults to `persists` for findings v9 re-ran unchanged. */
  disposition?: Disposition;
  /** Optional: pointer to a verb/primitive that would close the gap. */
  suggestion?: string;
}

export class FindingsCollector {
  private findings: Finding[] = [];

  record(f: Finding): void {
    this.findings.push({ disposition: 'persists', ...f });
  }

  /** Auto-record shape for validator-emitted diagnostics (one per error diagnostic). */
  recordDiagnostic(input: {
    surface: string;
    mockup: string;
    code: string;
    message: string;
    confirms: number;
    family: GapFamily;
    v7Ref: V7Ref;
  }): void {
    this.findings.push({
      id: 100 + this.findings.length,
      surface: input.surface,
      mockup: input.mockup,
      verb: 'produceAppGraphValidationReport',
      family: input.family,
      wanted: 'Surface validates cleanly so the SaaS route can advance to render.',
      got: `Validator emitted error: ${input.code} — ${input.message}`,
      severity: 'reshape-needed',
      why: `Diagnostic traces to primary finding F${input.confirms}: the persona had no substrate-native primitive for this mockup region and fell back to a shape the validator cannot resolve.`,
      v7Ref: input.v7Ref,
      disposition: 'persists',
    });
  }

  list(): readonly Finding[] {
    return this.findings;
  }

  /** Primary findings only (ids below 100). */
  primary(): readonly Finding[] {
    return this.findings.filter((f) => f.id < 100);
  }

  /** Primary findings grouped by verdict against v8. */
  dispositionCounts(): Record<Disposition, number> {
    const counts: Record<Disposition, number> = { closed: 0, narrowed: 0, persists: 0, new: 0 };
    for (const f of this.primary()) counts[f.disposition ?? 'persists'] += 1;
    return counts;
  }

  /** Primary finding ids per verdict, for the spike doc's disposition table. */
  dispositionIds(): Record<Disposition, number[]> {
    const ids: Record<Disposition, number[]> = { closed: [], narrowed: [], persists: [], new: [] };
    for (const f of this.primary()) ids[f.disposition ?? 'persists'].push(f.id);
    for (const key of Object.keys(ids) as Disposition[]) ids[key].sort((a, b) => a - b);
    return ids;
  }

  /** Gap families ranked by hit count across primary findings. */
  familyRanking(): Array<{ family: GapFamily; primaryHits: number; totalHits: number; findings: number[] }> {
    const byFamily = new Map<GapFamily, { primary: number[]; total: number }>();
    for (const f of this.findings) {
      const entry = byFamily.get(f.family) ?? { primary: [], total: 0 };
      entry.total += 1;
      if (f.id < 100) entry.primary.push(f.id);
      byFamily.set(f.family, entry);
    }
    return [...byFamily.entries()]
      .map(([family, e]) => ({
        family,
        primaryHits: e.primary.length,
        totalHits: e.total,
        findings: e.primary.sort((a, b) => a - b),
      }))
      .sort((a, b) => b.primaryHits - a.primaryHits || b.totalHits - a.totalHits);
  }

  /** v7 cross-reference: which of v7's 14 findings recurred under real-SaaS demand. */
  v7CrossReference(): { confirmed: V7Ref[]; notHit: V7Ref[]; newInV9: number[] } {
    const all: Exclude<V7Ref, null>[] = [
      'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14',
    ];
    const hit = new Set(this.findings.map((f) => f.v7Ref).filter((r): r is Exclude<V7Ref, null> => r !== null));
    return {
      confirmed: all.filter((r) => hit.has(r)),
      notHit: all.filter((r) => !hit.has(r)),
      newInV9: this.primary().filter((f) => f.disposition === 'new').map((f) => f.id),
    };
  }

  writeReport(outPath: string): void {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify(
        {
          spike: 'wireframe-generator-v9',
          corpus: 'formspec-cloud/thoughts/concepts/claude-design-handoff/project',
          counts: {
            total: this.findings.length,
            primary: this.primary().length,
            diagnosticAutoRecords: this.findings.length - this.primary().length,
          },
          dispositionCounts: this.dispositionCounts(),
          dispositionIds: this.dispositionIds(),
          familyRanking: this.familyRanking(),
          v7CrossReference: this.v7CrossReference(),
          findings: this.findings,
        },
        null,
        2,
      ),
    );
  }
}
