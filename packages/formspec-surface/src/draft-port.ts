/** @filedesc Qualified draft storage and progress reads for Surface hosts. */
import type { DecidedDisposition, ResponseSelectionDelivery, Sha256Digest } from '@formspec-org/types';
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

export type FilingObservation =
  | { status: 'none' }
  | { status: 'denied' | 'unavailable' }
  | {
      status: 'filed' | DecidedDisposition['review'];
      receiptRef: string;
      responseHash: Sha256Digest;
      review: 'available' | 'unavailable';
      comments: readonly string[];
      sample?: 'preview-submit' | 'fixture';
    };

export interface FilingStatusObservation {
  draft: FilingDraftObservation;
  filing: FilingObservation;
}

export type FilingStatusReader = (
  queries: readonly FilingDraftQuery[],
  input: { previewScope: string | undefined; signal: AbortSignal },
) => Promise<ReadonlyMap<string, FilingStatusObservation>>;

export interface DraftRecord {
  /** Opaque compare-and-save token, unique across discard and recreation. */
  revision: string;
  /** Exact engine snapshot JSON, including hidden answers and empty rows. */
  snapshotJson: string;
  /** Exact filtered in-progress Response JSON for authorized sibling reads. */
  responseJson: string;
  pins: Readonly<Record<string, ResponseSelectionDelivery>>;
}

export interface DraftSaveInput extends Omit<DraftRecord, 'revision' | 'pins'> {
  key: DraftKey;
  definitionVersion: string;
  /** Null means the caller observed no draft. */
  expectedRevision: string | null;
  /** Required on a creating save for at-open reads. The adapter compares these with its own selection. */
  creationPins?: DraftRecord['pins'];
  /** Null invalidates counts for this revision. */
  summary: { sections: readonly DraftSectionPlacement[]; progress: CurrentDraftProgress } | null;
}

type DraftRefusal = { status: 'denied' | 'unavailable' };
type DraftWriteRefusal = DraftRefusal | { status: 'conflict' };

export type DraftLoadResult =
  | { status: 'loaded'; draft: DraftRecord }
  | { status: 'initialized'; revision: string; pins: DraftRecord['pins'] }
  | { status: 'absent' }
  | { status: 'version-mismatch'; storedVersion: string; revision: string }
  | DraftRefusal;
export type DraftSaveResult = { status: 'saved'; revision: string } | { status: 'pin-unavailable'; instance: string } | DraftWriteRefusal;
export type DraftRestartResult = { status: 'discarded' } | DraftWriteRefusal;

/** Parent keys only. The same attempt must recover the same initialized unit. */
export interface DraftStartInput {
  scope: string;
  definitionUrl: string;
  definitionVersion: string;
  subject: DataSourceSubject;
  attemptId: string;
}

export type DraftStartResult =
  | { status: 'started'; subject: NonNullable<DraftKey['subject']> }
  | { status: 'invalid-subject' | 'conflict' }
  | { status: 'pin-unavailable'; instance: string }
  | DraftRefusal;

export interface DraftPort {
  /** A store offering explicit unit creation authorizes open before lookup or minting. */
  start?(input: DraftStartInput): Promise<DraftStartResult>;
  /** Authorize before looking up a draft or disclosing its pin. */
  load(key: DraftKey, definitionVersion: string, signal?: AbortSignal): Promise<DraftLoadResult>;
  /** Compare the revision and commit both draft pieces and progress atomically. */
  save(input: DraftSaveInput): Promise<DraftSaveResult>;
  readSummaries: FilingStatusReader;
}

/** Browser preview can discard an authorized mismatched revision on confirmation. */
export interface BrowserDraftPort extends DraftPort {
  start(input: DraftStartInput): Promise<DraftStartResult>;
  restart(key: DraftKey, expectedRevision: string): Promise<DraftRestartResult>;
  subscribe(listener: () => void): () => void;
}
