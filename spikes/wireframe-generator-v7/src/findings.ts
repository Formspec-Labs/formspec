/**
 * @filedesc Findings collector for the v7 spike. Captures substrate gaps the
 * persona encountered while authoring Policy Studio's UI through Wireframes-MCP.
 *
 * Each finding records what the persona wanted to express, what the substrate
 * accepted instead, and why the gap matters for authoring-tool UIs (vs.
 * respondent-facing intake forms — the substrate's design center).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface Finding {
  /** Numeric id matching the FINDING N: comment block in the journey test. */
  id: number;
  /** Surface the persona was authoring when the gap surfaced. */
  surface: 'source-vault' | 'lint-findings' | 'scenario-viewer' | 'cross-cutting';
  /** Verb / primitive the persona was trying to use. */
  verb: string;
  /** What the persona wanted to express. */
  wanted: string;
  /** What the substrate let them express instead (or refused). */
  got: string;
  /** Severity of the gap for authoring-tool UIs. */
  severity: 'reshape-needed' | 'workaround-acceptable' | 'missing-feature' | 'design-fit';
  /** Why this matters for authoring-tool UIs. */
  why: string;
  /** Optional: pointer to a verb/primitive that would close the gap. */
  suggestion?: string;
}

export class FindingsCollector {
  private findings: Finding[] = [];
  record(f: Finding): void {
    this.findings.push(f);
  }
  list(): readonly Finding[] {
    return this.findings;
  }
  writeReport(outPath: string): void {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ findings: this.findings }, null, 2));
  }
}
