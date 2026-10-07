/** @filedesc Canonical SigningCeremony metadata without renderer runtime imports. */
import type { FormResponse, Generation, SigningContent, SigningContentSource } from '@formspec-org/types';
import { RESPONSE_REVIEW_STATE_SCHEMA, type ResponseReviewState } from './response-review-metadata.js';
import { SIGNING_CONTENT_SOURCE_PROPS_SCHEMA } from '../generated/signing-content-source-schema.js';

export interface SigningCeremonyCopy {
  'x-generation'?: Generation;
  heading: string;
  readInstruction: string;
  readConfirmation: string;
  signerName: string;
  pending: string;
  signed: string;
  failed: string;
  unavailable: string;
  reviewPending?: string;
  reviewUnavailable?: string;
}
export interface SigningCeremonyConfig {
  requireResponseReview?: boolean;
  contentRefs: Readonly<Record<string, SigningContentSource>>;
  copy: Readonly<Record<string, SigningCeremonyCopy>>;
}
export interface SigningCeremonyDraft {
  id: string;
  version: number;
  /** Digest of the frozen preparation, admitted by the host using its existing Response byte profile. */
  responseHash: string;
}
export type SigningCeremonyResult =
  | { state: 'unsigned' }
  | {
      state: 'signed';
      response: FormResponse;
      draft: { id: string; version: number };
      verification: { mode: 'delegated-service-key'; provider: string; keyId: string };
    };
export interface SigningCeremonyReview {
  /** Independently computed by the host for its current captured review inputs. */
  contextIdentity: string;
  state: ResponseReviewState;
}
export interface SigningCeremonyData {
  review?: SigningCeremonyReview;
  content: SigningContent;
  response: FormResponse;
  draft: SigningCeremonyDraft;
  actor: { id: string };
  signingResult: SigningCeremonyResult;
  /** Exact mapped Action label refs resolved through the admitted Locale; literal labels need no entry. */
  actionLabels: Readonly<Record<string, string>>;
}

const COPY_KEYS = ['heading', 'readInstruction', 'readConfirmation', 'signerName', 'pending', 'signed', 'failed', 'unavailable'] as const;
export const SIGNING_CEREMONY_CONFIG_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['contentRefs', 'copy'],
  properties: {
    requireResponseReview: { type: 'boolean' },
    contentRefs: {
      type: 'object', minProperties: 1,
      propertyNames: { pattern: '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' },
      additionalProperties: SIGNING_CONTENT_SOURCE_PROPS_SCHEMA,
    },
    copy: {
      type: 'object', minProperties: 1,
      propertyNames: { pattern: '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$' },
      additionalProperties: {
        type: 'object', additionalProperties: false, required: COPY_KEYS,
        properties: { ...Object.fromEntries([...COPY_KEYS, 'reviewPending', 'reviewUnavailable'].map((key) => [key, { type: 'string', minLength: 1 }])),
          'x-generation': { type: 'object' } },
      },
    },
    'x-generation': { type: 'object' },
  },
  allOf: [{ if: { required: ['requireResponseReview'], properties: { requireResponseReview: { const: true } } }, then: { properties: { copy: { additionalProperties: { required: ['reviewPending', 'reviewUnavailable'] } } } } }],
} as const;

export const SIGNING_CEREMONY_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/SigningCeremony@0.1';
export const SIGNING_CEREMONY_RENDERED_CONFIG_NODES = [
  { pointerPattern: '', kind: 'signing-ceremony' },
  { pointerPattern: '/copy/*', kind: 'signing-ceremony-copy' },
] as const;
/** Exact authored Registry widgetShape; source payload schemas stay in the Data Sources catalog. */
export const SIGNING_CEREMONY_WIDGET_SHAPE = {
  widgetName: 'SigningCeremony',
  props: SIGNING_CEREMONY_CONFIG_SCHEMA,
  dataInputs: [...['content', 'response', 'draft', 'actor', 'signingResult', 'actionLabels'].map((name) => ({ name, required: true })), { name: 'review', required: false }],
  actionOutputs: [{ name: 'sign' }, { name: 'submit' }, { name: 'paper' }],
  childrenPolicy: 'none',
  deliveryContractId: SIGNING_CEREMONY_DELIVERY_CONTRACT_ID,
  renderedConfigNodes: SIGNING_CEREMONY_RENDERED_CONFIG_NODES,
} as const;

/** Separately qualified opt-in source; expected identity is computed independently by the host. */
export const SIGNING_CEREMONY_REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['contextIdentity','state'],
  properties: { contextIdentity: {type:'string',pattern:'^[a-f0-9]{64}$'}, state: RESPONSE_REVIEW_STATE_SCHEMA },
} as const;
