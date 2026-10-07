/** @filedesc Canonical ResponseReview metadata without renderer runtime imports. */
import type { FiniteJsonValue } from '@formspec-org/surface';
import type { FormDefinition, FormResponse } from '@formspec-org/types';
import type { SurfaceWidgetProps } from '../widget-api.js';

export const RESPONSE_REVIEW_COPY_KEYS = [
  "heading",
  "pending",
  "beforeSign",
  "beforeSubmit",
  "responseId",
  "draftVersion",
  "locale",
  "signatures",
  "additionalAnswers",
  "emptyString",
  "nullValue",
  "trueValue",
  "falseValue",
  "emptyArray",
  "emptyObject",
  "attachmentPending",
  "attachmentUnavailable",
  "attachmentFailed",
  "attachmentPreview",
  "attachmentDetails",
  "retry",
  "unavailable",
] as const;
export type ResponseReviewCopy = Readonly<
  Record<(typeof RESPONSE_REVIEW_COPY_KEYS)[number], string> & { acceptedRecord?: string }
>;
export interface ResponseReviewPresentation {
  responseHash: string;
  definitionUrl: string;
  definitionVersion: string;
  locale: string;
  actorRef: string;
  draft: { id: string; version: number };
  phase: "before-sign" | "before-submit";
  /** Captured public field/group metadata for this exact snapshot, never live engine values. */
  fields: Readonly<
    Record<
      string,
      { label: string; options?: readonly { value: string; label: string }[] }
    >
  >;
}
export interface ResponseReviewData {
  definition: FormDefinition;
  response: FormResponse;
  presentation: ResponseReviewPresentation;
}
export interface ResponseReviewState {
  status: "pending" | "ready" | "unavailable";
  responseHash: string;
  /** Hash of all captured Definition, Response and presentation inputs. Absent until admitted. */
  contextIdentity?: string;
  actorRef: string;
  draft: Readonly<{ id: string; version: number }>;
  locale: string;
  phase: ResponseReviewPresentation["phase"];
}
/** Frozen accepted-record presentation; no signing actor or draft authority. */
export interface AcceptedResponseReviewPresentation
  extends Omit<ResponseReviewPresentation, "actorRef" | "draft" | "phase"> {
  phase: "accepted-record";
  /** Actual qualified IntakeHandoff.handoffId, never a synthesized record revision. */
  handoffId: string;
}
export interface AcceptedResponseReviewData extends Omit<ResponseReviewData, "presentation"> {
  presentation: AcceptedResponseReviewPresentation;
}
/** Display availability only; cannot authorize signing, submission, or case access. */
export interface AcceptedResponseReviewState
  extends Omit<ResponseReviewState, "actorRef" | "draft" | "phase"> {
  phase: "accepted-record";
  handoffId: string;
}
export type ResponseReviewInput = ResponseReviewData | AcceptedResponseReviewData;
export type ResponseReviewPresentationInput = ResponseReviewPresentation | AcceptedResponseReviewPresentation;
export interface AcceptedResponseReviewAttachmentRequest extends AcceptedResponseReviewData {
  path: string;
  descriptor: FiniteJsonValue;
}
export interface ResponseReviewAttachmentRequest extends ResponseReviewData {
  path: string;
  descriptor: FiniteJsonValue;
}
export interface ResponseReviewOptions {
  /** Inject the maintained integrity-canonical handoff producer; no raw-JCS fallback. */
  canonicalResponseHandoffBytes?: (
    response: unknown
  ) => Uint8Array<ArrayBuffer>;
  /** Host checks private ownership/authorization and returns the exact descriptor's bytes. */
  readAttachment?: (
    request: ResponseReviewAttachmentRequest,
    options: { signal: AbortSignal }
  ) => Promise<Blob>;
  /** Host authorizes this accepted case and qualifies its opaque attachment association.
   * No fallback to the applicant reader. Host lifecycle replacement must revoke access. */
  readAcceptedAttachment?: (
    request: AcceptedResponseReviewAttachmentRequest,
    options: { signal: AbortSignal }
  ) => Promise<Blob>;
  /** Accepted-record display availability only; never delivered to signing callbacks. */
  onAcceptedReviewState?: (state: AcceptedResponseReviewState) => void;
  /** Presentation availability only; does not establish human review or signing authority. */
  onReviewState?: (state: ResponseReviewState) => void;
}
export interface ResponseReviewProps
  extends SurfaceWidgetProps,
    ResponseReviewOptions {}

export const RESPONSE_REVIEW_DELIVERY_CONTRACT_ID =
  "@formspec-org/surface-react/ResponseReview@0.1";
export const RESPONSE_REVIEW_RENDERED_CONFIG_NODES = [
  { pointerPattern: "", kind: "response-review" },
  { pointerPattern: "/copy/*", kind: "response-review-copy" },
] as const;
export const RESPONSE_REVIEW_CONFIG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["copy"],
  properties: {
    copy: {
      type: "object",
      minProperties: 1,
      propertyNames: { pattern: "^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$" },
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: RESPONSE_REVIEW_COPY_KEYS,
        properties: {
          ...Object.fromEntries(
            RESPONSE_REVIEW_COPY_KEYS.map((k) => [
              k,
              { type: "string", minLength: 1 },
            ])
          ),
          acceptedRecord: { type: "string", minLength: 1 },
          "x-generation": { type: "object" },
        },
      },
    },
    "x-generation": { type: "object" },
  },
} as const;
export const RESPONSE_REVIEW_WIDGET_SHAPE = {
  widgetName: "ResponseReview",
  props: RESPONSE_REVIEW_CONFIG_SCHEMA,
  dataInputs: ["definition", "response", "presentation"].map((name) => ({
    name,
    required: true,
  })),
  childrenPolicy: "none",
  deliveryContractId: RESPONSE_REVIEW_DELIVERY_CONTRACT_ID,
  renderedConfigNodes: RESPONSE_REVIEW_RENDERED_CONFIG_NODES,
} as const;

/** Schema for the separately qualified presentation input; not renderer-selected authority. */
export const RESPONSE_REVIEW_PRESENTATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "responseHash",
    "definitionUrl",
    "definitionVersion",
    "locale",
    "actorRef",
    "draft",
    "phase",
    "fields",
  ],
  properties: {
    responseHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    definitionUrl: { type: "string", minLength: 1 },
    definitionVersion: { type: "string", minLength: 1 },
    locale: { type: "string", minLength: 1 },
    actorRef: { type: "string", minLength: 1 },
    draft: {
      type: "object",
      additionalProperties: false,
      required: ["id", "version"],
      properties: {
        id: { type: "string", minLength: 1 },
        version: {
          type: "integer",
          minimum: 0,
          maximum: Number.MAX_SAFE_INTEGER,
        },
      },
    },
    phase: { enum: ["before-sign", "before-submit"] },
    fields: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["label"],
        properties: {
          label: { type: "string", minLength: 1 },
          options: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["value", "label"],
              properties: {
                value: { type: "string", minLength: 1 },
                label: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Presentation availability only; ready must identify the complete captured input set. */
export const RESPONSE_REVIEW_STATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "responseHash", "actorRef", "draft", "locale", "phase"],
  properties: {
    status: { enum: ["pending", "ready", "unavailable"] },
    contextIdentity: { type: "string", pattern: "^[a-f0-9]{64}$" },
    responseHash: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.responseHash,
    actorRef: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.actorRef,
    draft: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.draft,
    locale: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.locale,
    phase: RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties.phase,
  },
  allOf: [
    {
      if: { properties: { status: { const: "ready" } }, required: ["status"] },
      then: { required: ["contextIdentity"] },
    },
  ],
} as const;

/** Closed accepted presentation; existing named presentation schema stays signing-only. */
export const ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...RESPONSE_REVIEW_PRESENTATION_SCHEMA.required.filter(
    key => key !== "actorRef" && key !== "draft"), "handoffId"],
  properties: {
    ...Object.fromEntries(Object.entries(RESPONSE_REVIEW_PRESENTATION_SCHEMA.properties)
      .filter(([key]) => key !== "actorRef" && key !== "draft")),
    phase: { const: "accepted-record" },
    handoffId: { type: "string", minLength: 1 },
  },
} as const;
/** Closed input wrapper; hosts register the maintained native schemas for admission.
 * Shape admission does not establish custody, authorization, or integrity. */
export const ACCEPTED_RESPONSE_REVIEW_DATA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["definition", "response", "presentation"],
  properties: {
    definition: { $ref: "https://formspec.org/schemas/definition/1.0" },
    response: { $ref: "https://formspec.org/schemas/response/1.0" },
    presentation: ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA,
  },
} as const;
/** Closed accepted display state; this schema is not a SigningCeremony source. */
export const ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...RESPONSE_REVIEW_STATE_SCHEMA.required.filter(
    key => key !== "actorRef" && key !== "draft"), "handoffId"],
  properties: {
    ...Object.fromEntries(Object.entries(RESPONSE_REVIEW_STATE_SCHEMA.properties)
      .filter(([key]) => key !== "actorRef" && key !== "draft")),
    phase: { const: "accepted-record" },
    handoffId: { type: "string", minLength: 1 },
  },
  allOf: RESPONSE_REVIEW_STATE_SCHEMA.allOf,
} as const;
export const RESPONSE_REVIEW_PRESENTATION_UNION_SCHEMA = {
  oneOf: [RESPONSE_REVIEW_PRESENTATION_SCHEMA, ACCEPTED_RESPONSE_REVIEW_PRESENTATION_SCHEMA],
} as const;
export const RESPONSE_REVIEW_STATE_UNION_SCHEMA = {
  oneOf: [RESPONSE_REVIEW_STATE_SCHEMA, ACCEPTED_RESPONSE_REVIEW_STATE_SCHEMA],
} as const;
