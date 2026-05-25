---
title: Formspec Review Thread
version: 1.0.0-draft.1
date: 2026-05-25
status: draft
---

# Formspec Review Thread v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Schema:** `schemas/review-thread.schema.json` (`https://formspec.org/schemas/review-thread/1.0`)
**Companion to:** Formspec Response, FW-0042 Trusted Reviewer, FW-0113 ReviewThreadStore / ReviewerSession, Respondent Ledger, and optional review-attestation receipt hooks

## Status of This Document

This document is a draft normative companion to Formspec. It defines the SC-6
Review Thread sidecar: a draft-scoped, append-only event log for trusted-reviewer
comments, suggestions, share lifecycle records, and respondent decisions.

The Review Thread is not part of the signed Formspec Response. A respondent who
signs after receiving reviewer comments signs the same Response bytes they would
have signed without a reviewer, unless a separate opt-in receipt hook references
the thread by hash.

## Bottom Line Up Front

<!-- bluf:start file=review-thread-spec.bluf.md -->
- Review Thread is the SC-6 sidecar for trusted-reviewer comments, suggestions, share lifecycle, and respondent decisions; it lives outside the signed Response bytes.
- A valid Review Thread document requires `$formspecReviewThread`, `threadId`, `draftRef`, `createdAt`, `policySnapshot`, `shares`, and append-only `events`.
- Reviewer shares are scoped capability records; review content lives in the thread event log, while capability URL minting and redemption remain a ReviewerSession concern.
- Suggestion application and share lifecycle decisions are respondent-authored events; reviewer-authored suggestions are proposals only and never mutate the Response directly.
- Processors must preserve the sidecar/Response separation: deleting, rotating, or hashing the thread must not invalidate a signed Response unless the respondent separately opts into a receipt hook.
<!-- bluf:end -->

## 1. Purpose and Scope

The Review Thread sidecar lets a respondent invite one or more human reviewers
to read a draft, leave comments, and, when policy permits, propose field-value
changes. It exists because reviewer material has a different authority boundary
and lifetime than the Response itself.

In scope:

- thread identity and draft binding;
- the trusted-reviewer policy snapshot captured when the thread is created;
- reviewer share records for capability-URL based access;
- field-anchored comment and suggestion events;
- respondent-authored accept, decline, share-minted, and share-revoked events;
- optional hash-chain rows and receipt-pinning fields for verifier-grade
  deployments.

Out of scope:

- account creation, identity-provider integration, or capability URL wire format;
- applying suggestions to the Response;
- signing ceremony behavior;
- legal advice about reviewer duties;
- multi-thread-per-draft orchestration.

## 2. Document Structure

A Review Thread document is JSON identified by
`$formspecReviewThread: "1.0"` and validated by
`schemas/review-thread.schema.json`.

Required fields:

| Field | Meaning |
|---|---|
| `$formspecReviewThread` | Document type and spec-version marker. |
| `threadId` | Stable URI for the thread. |
| `draftRef` | Draft/form binding for the draft being reviewed. |
| `createdAt` | RFC 3339 timestamp when the thread was created. |
| `policySnapshot` | Trusted-reviewer posture and respondent-only field list captured at creation. |
| `shares` | Capability share records minted for this thread. |
| `events` | Append-only event log for comments, suggestions, respondent decisions, and share lifecycle. |

Example:

```json
{
  "$formspecReviewThread": "1.0",
  "threadId": "urn:formspec:review-thread:demo:001",
  "draftRef": {
    "formUrl": "https://example.gov/forms/benefits-intake",
    "formVersion": "1.2.0",
    "subjectRef": "draft-7f6a"
  },
  "createdAt": "2026-05-25T16:00:00Z",
  "policySnapshot": {
    "posture": "suggest-allowed",
    "respondentOnlyFieldPointers": ["/household/ssn"]
  },
  "shares": [
    {
      "shareId": "urn:formspec:review-share:demo:001",
      "threadId": "urn:formspec:review-thread:demo:001",
      "grantedScope": "view+comment+suggest",
      "capabilityUrl": "https://review.example.gov/r/demo-token",
      "audienceHint": "CPA reviewer",
      "createdAt": "2026-05-25T16:05:00Z",
      "expiresAt": "2026-05-28T16:05:00Z"
    }
  ],
  "events": [
    {
      "eventId": "urn:formspec:review-event:demo:001",
      "threadId": "urn:formspec:review-thread:demo:001",
      "occurredAt": "2026-05-25T16:06:00Z",
      "author": {
        "kind": "respondent",
        "displayName": "Applicant"
      },
      "payload": {
        "type": "share-minted",
        "shareId": "urn:formspec:review-share:demo:001",
        "audienceHint": "CPA reviewer"
      }
    },
    {
      "eventId": "urn:formspec:review-event:demo:002",
      "threadId": "urn:formspec:review-thread:demo:001",
      "occurredAt": "2026-05-25T16:20:00Z",
      "author": {
        "kind": "reviewer",
        "shareId": "urn:formspec:review-share:demo:001",
        "displayName": "CPA reviewer"
      },
      "payload": {
        "type": "suggestion-added",
        "anchor": {
          "fieldPointer": "/income/annualGross"
        },
        "proposedValue": 42000
      }
    }
  ]
}
```

## 3. Authority Boundary

The Review Thread is a sidecar, not a Response extension. Reviewers author
comments and suggestions in the thread. They do not author Response values, do
not submit, and do not sign. A conforming processor MUST NOT merge review-thread
events into the Response canonical signed-payload preimage.

Suggestion application is respondent-only. The `suggestion-accepted` and
`suggestion-declined` payloads MUST be paired with `author.kind: "respondent"`.
Accepting a suggestion records a respondent decision in the thread; the actual
Response mutation, if any, remains a normal respondent-authored Response edit.

The schema enforces the author boundary for respondent-only event types. Runtime
adapters MUST also verify the caller's session token against the author claim
before appending an event.

## 4. Policy Snapshot

`policySnapshot` records the trusted-reviewer posture that applied when the
thread was created:

| Posture | Meaning |
|---|---|
| `comment-allowed` | Reviewers may read and comment. Suggestion events are schema-invalid under this posture. |
| `suggest-allowed` | Reviewers may read, comment, and author suggestion records. |

`forbidden` is intentionally absent from the thread posture enum. A conforming
runtime MUST NOT create a Review Thread when the resolved trusted-reviewer
policy is forbidden.

`respondentOnlyFieldPointers` pins the field pointers hidden from reviewers.
The schema cannot compare a suggestion anchor against this dynamic array; the
ReviewThreadStore adapter MUST reject reviewer suggestions on those pointers.

## 5. Shares

`shares[]` records capability shares ever minted for the thread. The share record
does not store reviewer comments; it stores the authorization envelope that let
the reviewer reach the thread. Capability URL syntax, HMAC verification, and
redemption semantics belong to the ReviewerSession port. The Review Thread
stores only the resulting share metadata needed for audit and revocation.

A revoked share remains in `shares[]` with `revokedAt` and optional
`revokedReason`. Review events remain append-only; a share revocation is also
mirrored as a `share-revoked` event for verifier walking.

## 6. Events

`events[]` is append-only. Processors MUST append new events rather than
rewriting or deleting existing records.

Event payload types:

| Type | Author | Meaning |
|---|---|---|
| `share-minted` | respondent | Mirrors a share append. |
| `share-revoked` | respondent | Mirrors share revocation. |
| `comment-added` | respondent or reviewer | Adds a field-anchored comment. |
| `comment-resolved` | respondent or reviewer | Marks a comment as resolved without deleting it. |
| `suggestion-added` | reviewer | Proposes a value for a field. |
| `suggestion-accepted` | respondent | Records respondent acceptance and optional applied value. |
| `suggestion-declined` | respondent | Records respondent decline and optional reason. |

Field anchors use RFC 6901 JSON Pointer syntax into the Response value space.
`valueHashAtAnchor` MAY carry a `sha256:<hex>` commitment to the field value at
the time the reviewer commented or suggested. Staleness is computed by comparing
that hash and the current field value at read time; stale comments are not
deleted automatically.

## 7. Optional Integrity Hooks

`hashChain[]` MAY provide event-level continuity for deployments that need a
verifier-grade review trail. The hash chain is over Review Thread events, not
Response bytes.

`pinForReceipt` style runtime operations MAY return a `threadHash` and
`bindingArtifactRef` for an optional receipt hook. This specification reserves
the sidecar fields and hash form but does not define the receipt hook itself.

## 8. Conformance

A conforming Review Thread processor:

1. MUST validate the document against `schemas/review-thread.schema.json`.
2. MUST preserve the Review Thread as a sidecar outside the signed Response.
3. MUST reject `suggestion-added` events when `policySnapshot.posture` is
   `comment-allowed`.
4. MUST reject `suggestion-added` events whose author is not a reviewer.
5. MUST reject `share-minted`, `share-revoked`, `suggestion-accepted`, and
   `suggestion-declined` events whose author is not the respondent.
6. MUST preserve event order and append-only history.
7. MUST NOT treat comments or suggestions as Response mutations.
8. MUST enforce respondent-only field suggestion refusal in the adapter layer.

## 9. Schema Reference

<!-- schema-ref:start id=review-thread-core schema=schemas/review-thread.schema.json pointers=#/properties,#/$defs/PolicySnapshot,#/$defs/ReviewThreadEvent,#/$defs/ReviewThreadPayload -->
<!-- generated:schema-ref id=review-thread-core -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecReviewThread` | `$formspecReviewThread` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Review Thread specification version. MUST be '1.0'. |
| `#/properties/createdAt` | `createdAt` | <code>string</code> | yes | — | RFC 3339 timestamp when the thread was created. |
| `#/properties/draftRef` | `draftRef` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/DraftRef</code>; critical | Draft and form binding for the draft under review. |
| `#/properties/draftSnapshot` | `draftSnapshot` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/DraftSnapshot</code> | Optional bounded snapshot used by reviewer shells to render field labels, visible values, respondent-only masks, and anchors. |
| `#/properties/events` | `events` | <code>array</code> | yes | critical | Append-only review event log. Processors append events rather than rewriting comments, suggestions, or decisions. |
| `#/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/properties/hashChain` | `hashChain` | <code>array</code> | no | — | Optional event-level continuity records for verifier-grade threads. |
| `#/properties/policySnapshot` | `policySnapshot` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/PolicySnapshot</code>; critical | Trusted-reviewer resolved-policy snapshot captured when the thread is created. |
| `#/properties/shares` | `shares` | <code>array</code> | yes | critical | Capability shares ever minted for this thread. Revoked shares remain listed with revokedAt. |
| `#/properties/threadId` | `threadId` | <code>string</code> | yes | critical | Stable URI identifying this review thread. Slice 1 uses one thread per draft. |
| `#/properties/updatedAt` | `updatedAt` | <code>string</code> | no | — | RFC 3339 timestamp of the last thread update. |
| `#/$defs/PolicySnapshot/properties/allowedRoles` | `allowedRoles` | <code>array</code> | no | — | Optional resolved reviewer roles after form/org policy intersection. |
| `#/$defs/PolicySnapshot/properties/defaultShareExpiresAtRule` | `defaultShareExpiresAtRule` | <code>string</code> | no | — | Optional human-readable or implementation-defined expiry rule captured from policy. |
| `#/$defs/PolicySnapshot/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/PolicySnapshot/properties/maxActiveSharesPerDraft` | `maxActiveSharesPerDraft` | <code>integer</code> | no | — | Optional active-share limit captured from policy. |
| `#/$defs/PolicySnapshot/properties/posture` | `posture` | <code>string</code> | yes | enum: <code>"comment-allowed"</code>, <code>"suggest-allowed"</code>; critical | Trusted-reviewer posture captured when the thread was created. Forbidden forms do not create threads. |
| `#/$defs/PolicySnapshot/properties/respondentOnlyFieldPointers` | `respondentOnlyFieldPointers` | <code>array</code> | yes | critical | Field pointers masked from reviewers. Adapters must reject suggestions anchored to these pointers. |
| `#/$defs/PolicySnapshot/properties/reviewThreadStoreBindingRef` | `reviewThreadStoreBindingRef` | <code>string</code> | no | — | Optional runtime binding reference for the ReviewThreadStore adapter. |
| `#/$defs/PolicySnapshot/properties/reviewerAssuranceFloor` | `reviewerAssuranceFloor` | <code>string</code> | no | enum: <code>"L1"</code>, <code>"L2"</code>, <code>"L3"</code>, <code>"L4"</code> | Optional reviewer identity assurance floor required by policy. |
| `#/$defs/PolicySnapshot/properties/reviewerSessionBindingRef` | `reviewerSessionBindingRef` | <code>string</code> | no | — | Optional runtime binding reference for the ReviewerSession adapter. |
| `#/$defs/ReviewThreadEvent/properties/author` | `author` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/ReviewThreadAuthor</code> | — |
| `#/$defs/ReviewThreadEvent/properties/eventId` | `eventId` | <code>string</code> | yes | — | Stable URI identifying this event. |
| `#/$defs/ReviewThreadEvent/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ReviewThreadEvent/properties/occurredAt` | `occurredAt` | <code>string</code> | yes | — | — |
| `#/$defs/ReviewThreadEvent/properties/payload` | `payload` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/ReviewThreadPayload</code> | — |
| `#/$defs/ReviewThreadEvent/properties/threadId` | `threadId` | <code>string</code> | yes | — | Thread this event belongs to. |
| `#/$defs/ReviewThreadPayload` | `(self)` | <code>composite</code> | — | — | — |
<!-- schema-ref:end -->
