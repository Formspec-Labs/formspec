/** @filedesc Host inputs and results for the shared Core Response selector. */

import type { FormDefinition } from './generated/definition.js';
import type { FormResponse, ResolvedInstance, ResolvedInstanceRecord, ResponseSelection, Sha256Digest } from './generated/response.js';

export interface ResponseSelectionRecord {
  scope: string;
  response: FormResponse;
  implicitSubjectId?: string;
}

export type ResponseSelectionDelivery = Pick<ResolvedInstance, 'records' | 'valueDigest' | 'none' | 'pinned' | 'mapping'> & {
  value: unknown;
};

export type NewerSelectedResponse = Pick<ResolvedInstanceRecord, 'responseId'> & { responseHash: Sha256Digest };

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

export type ResponseSelectionOutcome =
  | ({ status: 'available'; newer?: NewerSelectedResponse; inputPositions?: number[] } & ResponseSelectionDelivery)
  | { status: 'unavailable' };

export type SelectResponses = (
  records: readonly ResponseSelectionRecord[],
  selection: ResponseSelection,
  context: ResponseSelectionContext,
) => ResponseSelectionOutcome;
