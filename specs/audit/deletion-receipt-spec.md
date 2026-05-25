---
title: Formspec Deletion Receipt
version: 1.0.0-draft.1
date: 2026-05-25
status: draft
---

# Formspec Deletion Receipt v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Schema:** `schemas/deletion-receipt.schema.json` (`https://formspec.org/schemas/deletion-receipt/1.0`)
**Companion to:** Formspec Response, Respondent Ledger, Verification Receipt, Signature Method Registry, and ADR-0111 receipt signing

## Status of This Document

This document is a draft normative companion to Formspec. It defines the SC-2
Deletion Receipt sidecar: an issuer-signed statement that a draft-abandonment or
erasure flow completed for a specific draft identifier and erased declared
classes of draft material.

The receipt is evidence of the issuer's deletion operation. It is not the data
that was deleted, and it MUST NOT embed erased response values, attachments,
identity attributes, or raw draft payloads.

Deletion Receipt documents are closed sidecars: they do not define `extensions`
slots at the document level or inside nested receipt records. Deployment-specific
erasure metadata belongs in opaque references or digests such as `evidence`, not
inside arbitrary payload fields that could replay erased material.

## Prior-Art Pass

The shape is deliberately small and borrows only broad evidence patterns:

- GDPR Article 17 and EDPB erasure guidance establish the erasure request
  posture, response timing, non-absolute exceptions, and recipient-notification
  concern: <https://www.edpb.europa.eu/node/5347_en>.
- W3C Verifiable Credential Data Integrity 1.0 gives a current Web proof model
  for constrained digital documents, but this spec does not require JSON-LD or
  VC issuance: <https://www.w3.org/TR/vc-data-integrity/>.
- OASIS DSS-X defines request/response signing, verifying, and timestamping
  protocols. Deletion Receipt aligns with the evidence pattern but does not
  adopt DSS wire formats: <https://www.oasis-open.org/standard/dss-core-v2-cs01/>.

## 1. Purpose and Scope

A deletion receipt lets a respondent keep proof that an issuer accepted and
completed a "delete this draft and forget me" action. The receipt is signed by
the issuer, not by the respondent, because it attests to the issuer's operation.

In scope:

- stable receipt identity;
- deleted draft identifier;
- deletion timestamp;
- erased data-class taxonomy;
- retention waivers;
- issuer signer identity;
- cryptographic receipt-signing method and signed-payload digest;
- optional evidence digests for an erasure job, recipient notices, or erasure log.
- closed receipt objects with no `extensions` payloads.

Out of scope:

- storage deletion algorithms;
- legal advice or jurisdiction-specific sufficiency;
- raw erased content;
- analytics retention policy beyond declared class-level erasure;
- Formspec-web UI or runtime behavior.

## 2. Document Structure

A Deletion Receipt document is JSON identified by
`$formspecDeletionReceipt: "1.0"` and validated by
`schemas/deletion-receipt.schema.json`.

Required fields:

| Field | Meaning |
|---|---|
| `$formspecDeletionReceipt` | Document type and spec-version marker. |
| `version` | Version of this receipt document. |
| `receiptId` | Stable URI for this receipt. |
| `deletedDraftId` | The abandoned or erased draft identifier. |
| `deletedAt` | RFC 3339 timestamp when the issuer recorded deletion completion. |
| `issuer` | Issuer that signs and stands behind the deletion attestation. |
| `classesErased` | Non-empty list of erased data classes. |
| `retentionWaived` | List of retention classes the issuer waived for this erasure. Empty means no waiver was declared. |
| `cryptographicMethod` | Receipt-signing method, signed-payload digest, and signed receipt evidence. |
| `receiptSigner` | Issuer signing key reference. `role` MUST be `issuer`. |

Example:

```json
{
  "$formspecDeletionReceipt": "1.0",
  "version": "1.0.0",
  "receiptId": "urn:formspec:deletion-receipt:demo:001",
  "deletedDraftId": "draft-7f6a",
  "deletedAt": "2026-05-25T15:42:00Z",
  "issuer": {
    "name": "Springfield Benefits Office",
    "identifier": "https://springfield.gov/benefits"
  },
  "classesErased": ["draft-response", "attachments", "autosave-cache"],
  "retentionWaived": [
    {
      "class": "analytics-linkage",
      "basis": "user-request",
      "authorityRef": "GDPR-Article-17"
    }
  ],
  "cryptographicMethod": {
    "method": "urn:formspec:receipt-method:ed25519-cose-sign1@1",
    "canonicalization": "jcs-rfc8785",
    "signedPayloadDigest": {
      "algorithm": "sha-256",
      "value": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    },
    "receiptBytes": "0oRWoQExiQEFQnNpZ25lZA=="
  },
  "receiptSigner": {
    "role": "issuer",
    "keyRef": "did:web:springfield.gov#receipt-2026"
  }
}
```

## 3. Erased Classes

`classesErased` is a class-level statement. It does not carry erased values.

Standard data classes:

- `draft-response`
- `draft-metadata`
- `attachments`
- `identity-session`
- `prepopulation-cache`
- `autosave-cache`
- `client-cache`
- `analytics-linkage`
- `review-thread`
- `notification-contact`
- `other`

Deployment-specific classes MUST use the `x-` prefix.

## 4. Retention Waivers

`retentionWaived` names classes for which the issuer waived an otherwise
available retention reason. It is not a list of data that remains retained. If a
deployment must preserve material for legal obligation, public-interest
archiving, legal claims, or another jurisdictional exception, that preservation
belongs in an implementation-specific records policy outside this base receipt.

The base receipt intentionally does not standardize retained-data exceptions
because doing so would invite false legal sufficiency claims across
jurisdictions.

## 5. Cryptographic Method

`cryptographicMethod.method` MUST use the receipt-method value space from
`specs/registry/signature-method-registry.md`.

The signed payload is the canonical Deletion Receipt document with detached
receipt bytes omitted. `signedPayloadDigest` records the digest of that payload.
`cryptographicMethod.receiptBytes`, when present, is base64-encoded COSE_Sign1
signed receipt evidence produced by the ADR-0111 receipt-signing profile over
that canonical payload.

A conforming Deletion Receipt MUST carry signed evidence. It MUST include either
`cryptographicMethod.receiptBytes` or `cryptographicMethod.verificationReceiptRef`.
`verificationReceiptRef` points to an existing repo-native structured
Verification Receipt or receipt artifact that carries the signed receipt bytes;
it is not a new signature discipline. Receipts MAY also link to timestamp
evidence by digest or URI, but timestamp evidence does not replace the signed
receipt requirement.

## 6. Conformance

A conforming Deletion Receipt processor:

1. MUST validate the receipt against `schemas/deletion-receipt.schema.json`.
2. MUST reject receipt documents without `cryptographicMethod.receiptBytes` or
   `cryptographicMethod.verificationReceiptRef`.
3. MUST reject receipt documents whose `receiptSigner.role` is not `issuer`.
4. MUST reject receipt documents that carry non-schema raw erased values.
5. MUST treat `classesErased` as class-level evidence, not value-level replay.
6. MUST reject `extensions` payloads at the document level and within nested
   receipt records.
7. MUST NOT imply that receipt validity alone establishes jurisdiction-specific
   legal sufficiency.
8. SHOULD preserve the receipt independently from the erased draft material so
   erasure does not delete the respondent's proof of erasure.
