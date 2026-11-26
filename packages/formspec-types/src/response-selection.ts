/** @filedesc Host inputs and results for the shared Core Response selector. */

import type {
  DispositionObservation, NewerSelectedResponse, ResponseSelectionDelivery, ResponseSelectionOutcome,
  ResponseSelectionRequest,
} from './generated/response-selection.js';
export type {
  DispositionObservation, NewerSelectedResponse, ResponseSelectionDelivery, ResponseSelectionOutcome,
  ResponseSelectionRequest,
} from './generated/response-selection.js';
import type { FormDefinition } from './generated/definition.js';
import type { FormResponse, ResolvedInstance, ResponseSelection } from './generated/response.js';

export type ResponseSelectionRecord = {
  scope: string;
  /** Supplied by the store even when an editable draft contains prepared, completed bytes. */
  kind: 'open-draft' | 'filing';
  /** Host record identity for selection and evidence. Defaults to the authored Response id. */
  recordId?: string;
  implicitSubjectId?: string;
} & (
  | { response: FormResponse; responseJson?: never }
  /** Pass stored JSON text through to the native hasher unchanged. */
  | { responseJson: string; response?: never }
);

export interface ResponseSelectionContext {
  scope: string;
  authorized: boolean;
  source: 'definition' | 'catalog';
  upstreamSubject: NonNullable<FormDefinition['subject']> | null;
  consumerSubject?: NonNullable<FormResponse['subject']>['keys'];
  routeParams?: Readonly<Record<string, string>> | undefined;
  projection?: readonly string[];
  fallback?: unknown;
  dispositions?: readonly (NewerSelectedResponse & { value: string })[];
  mapping?: {
    reference: NonNullable<ResolvedInstance['mapping']>;
    document: unknown;
  };
  pin?: ResponseSelectionDelivery;
  includeInputPositions?: boolean;
}

export type SelectResponses = (
  records: readonly ResponseSelectionRecord[],
  selection: ResponseSelection,
  context: ResponseSelectionContext,
) => ResponseSelectionOutcome & { inputPositions?: number[] };

export interface ResponseSelector {
  select(
    requests: readonly ResponseSelectionRequest[],
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, ResponseSelectionOutcome>>;
}

export interface DispositionAuthority {
  /** Result keys are JSON arrays of [responseId, responseHash]. */
  read(
    records: readonly NewerSelectedResponse[],
    signal?: AbortSignal,
  ): Promise<ReadonlyMap<string, DispositionObservation>>;
}
