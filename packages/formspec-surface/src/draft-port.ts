/** @filedesc Qualified draft storage and progress reads for Surface hosts. */
import type { ProgressCounts } from '@formspec-org/layout';
import type { DataSourceSubject } from './data-source-loader.js';

export interface DraftKey {
  scope: string;
  definitionUrl: string;
  /** Absent when the Definition uses the caller's implicit respondent identity. */
  subject?: (DataSourceSubject & { id: string }) | undefined;
}

export type FilingProgressCounts = Readonly<Pick<ProgressCounts, 'total' | 'filled' | 'toFix' | 'toCheck'>>;
export interface DraftSectionPlacement {
  id?: string;
  fields: readonly string[];
}

export interface FilingDraftQuery {
  /** Correlates a result to this Definition, subject, and section plan within the batch. */
  key: string;
  definitionUrl: string;
  definitionVersion: string;
  subject?: DataSourceSubject;
  sections: readonly DraftSectionPlacement[];
}

export type CurrentDraftProgress = {
  status: 'current';
  form: FilingProgressCounts & { ready: boolean | null };
  sections: Readonly<Record<string, FilingProgressCounts>>;
};

export type FilingDraftObservation =
  | CurrentDraftProgress
  | { status: 'absent' | 'denied' | 'stale' | 'unavailable' };

export type FilingStatusReader = (
  queries: readonly FilingDraftQuery[],
  input: { previewScope: string | undefined; signal: AbortSignal },
) => Promise<ReadonlyMap<string, FilingDraftObservation>>;

export interface DraftRecord {
  /** Opaque compare-and-save token, unique across discard and recreation. */
  revision: string;
  /** Exact engine snapshot JSON, including hidden answers and empty rows. */
  snapshotJson: string;
  /** Exact filtered in-progress Response JSON for authorized sibling reads. */
  responseJson: string;
}

export interface DraftSaveInput extends Omit<DraftRecord, 'revision'> {
  key: DraftKey;
  definitionVersion: string;
  /** Null means the caller observed no draft. */
  expectedRevision: string | null;
  /** Null invalidates counts for this revision. */
  summary: { sections: readonly DraftSectionPlacement[]; progress: CurrentDraftProgress } | null;
}

type DraftRefusal = { status: 'denied' | 'unavailable' };
type DraftWriteRefusal = DraftRefusal | { status: 'conflict' };

export type DraftLoadResult =
  | { status: 'loaded'; draft: DraftRecord }
  | { status: 'absent' }
  | { status: 'version-mismatch'; storedVersion: string; revision: string }
  | DraftRefusal;
export type DraftSaveResult = { status: 'saved'; revision: string } | DraftWriteRefusal;
export type DraftRestartResult = { status: 'discarded' } | DraftWriteRefusal;

export interface DraftPort {
  /** Authorize before looking up a draft or disclosing its pin. */
  load(key: DraftKey, definitionVersion: string, signal?: AbortSignal): Promise<DraftLoadResult>;
  /** Compare the revision and commit both draft pieces and progress atomically. */
  save(input: DraftSaveInput): Promise<DraftSaveResult>;
  readSummaries: FilingStatusReader;
}

/** Browser preview can discard an authorized mismatched revision on confirmation. */
export interface BrowserDraftPort extends DraftPort {
  restart(key: DraftKey, expectedRevision: string): Promise<DraftRestartResult>;
  subscribe(listener: () => void): () => void;
}
