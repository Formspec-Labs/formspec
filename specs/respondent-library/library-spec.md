---
title: Formspec Respondent Library
version: 1.0.0-draft.1
date: 2026-05-23
depends_on:
  - specs/core/spec.md
  - specs/issuer/issuer-spec.md
  - specs/audit/respondent-ledger-spec.md
---

# Formspec Respondent Library v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-23
**Editors:** Formspec Working Group
**Schema:** `schemas/respondent-library.schema.json` (`https://formspec.org/schemas/respondentLibrary/1.0`)
**Companion to:** Formspec v1.0, Issuer, Response, Intake Handoff, Respondent Ledger, WOS applicant/status APIs, W3C VC Data Model 2.0, and OpenID4VP

---

## Status of This Document

This document is a **draft normative companion** to [Formspec v1.0 core specification](../core/spec.md). It defines the Respondent Library document: a respondent-held, client-side aggregation artifact for obligations, reusable documents, prior submissions, applicant-status projections, selective-presentation policy, and portability exports.

This spec exists to keep respondent-side history and document reuse out of `formspec-web`. The web surface may consume this contract through ports and stubs, but it MUST NOT become the normative owner of cross-issuer respondent library semantics.

## Conventions and Terminology

BCP 14 normative terms (MUST, MUST NOT, SHOULD, MAY) appear in capitals. "Ledger" means [Respondent Ledger](../audit/respondent-ledger-spec.md). "Issuer" means the respondent-facing issuer defined by [Issuer](../issuer/issuer-spec.md), not an identity provider. "Wallet" means a respondent-controlled client or agent that stores and presents library material.

A **Respondent Library** is a JSON document conforming to this specification, identified by `$formspecRespondentLibrary: "1.0"`. An **Obligation** is a respondent-visible task or due item from an issuer. A **Document Record** is a reusable respondent-held document, attachment, credential, receipt, or correspondence reference. A **Submission Record** is respondent-visible submission history with an optional WOS applicant-status projection. A **Presentation Policy** bounds selective disclosure of library material.

---

## Bottom Line Up Front

<!-- bluf:start file=library-spec.bluf.md -->
- Respondent Library is a client-held document for obligations, documents, submissions, applicant-status projections, selective-presentation policies, and portability exports; it is not a server-side respondent database.
- Conforming documents require `$formspecRespondentLibrary`, `version`, `libraryId`, `subject`, `aggregationMode: "client-wallet"`, and `trustModel.serverAggregation: "forbidden"`.
- The v1 document-kind taxonomy is closed: identity proof, income proof, proof of address, proof of age, eligibility evidence, form attachment, signed receipt, correspondence, and other.
- Presentation policies are explicit-consent gates over document refs and purposes; OpenID4VP and W3C VC Data Model 2.0 are protocol/data-model hints, not implicit grants.
- Passkey-derived HPKE is the intended production encryption posture; servers MUST NOT aggregate cross-tenant obligations, documents, or history for the respondent.
<!-- bluf:end -->

## 1. Purpose and Scope

The Respondent Library gives a respondent one place to answer three questions:

1. **What is coming?** Obligations across issuers.
2. **What do I have?** Documents, attachments, credentials, receipts, and correspondence.
3. **What have I done?** Submission history and applicant-status projections.

The library is respondent-held. It may be backed by browser storage, an OS wallet, a user agent, or an encrypted export file. A service may synchronize encrypted blobs for the respondent, but it MUST NOT aggregate cross-issuer obligations, documents, or submissions as readable server-side state.

### 1.1 Out of Scope

This spec does not define:

- Workflow case state or caseworker operations. WOS owns governed workflow state.
- Raw object storage. Attachment storage remains the stack-common object-store plus attestation concern.
- Identity-provider login semantics. Identity binding is an input to wallet policy, not the library's authorization engine.
- A production wallet implementation. This document defines the portable contract that wallets, web shells, and agents consume.

## 2. Document Structure

### 2.1 Top-Level Shape

<!-- schema-ref:start id=respondent-library-top-level schema=schemas/respondent-library.schema.json pointers=# -->
<!-- generated:schema-ref id=respondent-library-top-level -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/properties/$formspecRespondentLibrary` | `$formspecRespondentLibrary` | <code>string</code> | yes | const: <code>"1.0"</code>; critical | Respondent Library specification version. MUST be '1.0'. |
| `#/properties/aggregationMode` | `aggregationMode` | <code>string</code> | yes | const: <code>"client-wallet"</code>; critical | Aggregation mode. Only client-wallet is conforming; server-side cross-tenant aggregation is forbidden. |
| `#/properties/documents` | `documents` | <code>array</code> | no | — | Respondent-held documents, credentials, attachments, receipts, and correspondence. |
| `#/properties/encryption` | `encryption` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/EncryptionEnvelope</code> | Optional envelope describing client-side encryption for the library. |
| `#/properties/export` | `export` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/ExportPackage</code> | Optional portability/export metadata for a library snapshot. |
| `#/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/properties/libraryId` | `libraryId` | <code>string</code> | yes | critical | Stable URI for this respondent-held library or export snapshot. |
| `#/properties/obligations` | `obligations` | <code>array</code> | no | — | Upcoming or open respondent obligations across issuers. |
| `#/properties/presentationPolicies` | `presentationPolicies` | <code>array</code> | no | — | Policies that bound which documents may be presented to which recipients and purposes. |
| `#/properties/subject` | `subject` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/SubjectBinding</code>; critical | Privacy-preserving respondent subject binding for the local wallet/library. |
| `#/properties/submissions` | `submissions` | <code>array</code> | no | — | Submission history visible to the respondent across issuers. Applicant status is referenced as a WOS applicant projection, not redefined here. |
| `#/properties/trustModel` | `trustModel` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/TrustModel</code> | Trust and storage posture that governs the whole library. |
| `#/properties/version` | `version` | <code>string</code> | yes | — | Version of this Respondent Library document. SemVer is RECOMMENDED. |
<!-- schema-ref:end -->

A conforming document MUST include `$formspecRespondentLibrary`, `version`, `libraryId`, `subject`, `aggregationMode`, and `trustModel`.

`aggregationMode` MUST be `"client-wallet"`. Any mode that lets a server aggregate respondent material across issuers or tenants is non-conforming.

### 2.2 Example

```json
{
  "$formspecRespondentLibrary": "1.0",
  "version": "1.0.0",
  "libraryId": "urn:formspec:respondent-library:demo-wallet",
  "subject": {
    "subjectRef": "respondent:demo",
    "privacyTier": "pseudonymous"
  },
  "aggregationMode": "client-wallet",
  "trustModel": {
    "storagePosture": "client-encrypted",
    "issuerIsolation": "per-issuer",
    "serverAggregation": "forbidden",
    "presentationDefault": "explicit-consent"
  }
}
```

## 3. Obligations Stream

An Obligation names respondent-visible work from an issuer: renewal, evidence request, signature request, correction, deadline, or other due item.

<!-- schema-ref:start id=respondent-library-obligation schema=schemas/respondent-library.schema.json pointers=#/$defs/Obligation -->
<!-- generated:schema-ref id=respondent-library-obligation -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/Obligation/properties/description` | `description` | <code>string</code> | no | — | — |
| `#/$defs/Obligation/properties/dueAt` | `dueAt` | <code>string</code> | no | — | — |
| `#/$defs/Obligation/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/Obligation/properties/formRef` | `formRef` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/DefinitionRef</code> | — |
| `#/$defs/Obligation/properties/id` | `id` | <code>string</code> | yes | — | Stable local obligation id. |
| `#/$defs/Obligation/properties/issuer` | `issuer` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IssuerRef</code> | — |
| `#/$defs/Obligation/properties/state` | `state` | <code>string</code> | yes | enum: <code>"upcoming"</code>, <code>"due"</code>, <code>"overdue"</code>, <code>"submitted"</code>, <code>"satisfied"</code>, <code>"closed"</code>, <code>"unknown"</code> | Local state used to render the obligations stream. |
| `#/$defs/Obligation/properties/submissionRef` | `submissionRef` | <code>string</code> | no | — | Optional link to a local SubmissionRecord.id that satisfied or attempted the obligation. |
| `#/$defs/Obligation/properties/title` | `title` | <code>string</code> | yes | — | Respondent-visible obligation title. |
<!-- schema-ref:end -->

Obligation `state` is portable display state, not a workflow state machine. Workflow hosts remain authoritative for governed case state; the library stores what the respondent can see and act on.

Processors MUST NOT infer a WOS transition from an Obligation state change. A library may link an obligation to a `submissionRef` when a respondent attempts or satisfies it.

## 4. Document Library

Document Records describe reusable material held by the respondent: credentials, uploaded attachments, signed receipts, or correspondence.

<!-- schema-ref:start id=respondent-library-document schema=schemas/respondent-library.schema.json pointers=#/$defs/DocumentRecord,#/$defs/DocumentKind,#/$defs/ContentRef -->
<!-- generated:schema-ref id=respondent-library-document -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/DocumentRecord/properties/capturedAt` | `capturedAt` | <code>string</code> | yes | — | — |
| `#/$defs/DocumentRecord/properties/contentRef` | `contentRef` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/ContentRef</code> | — |
| `#/$defs/DocumentRecord/properties/displayName` | `displayName` | <code>string</code> | yes | — | Respondent-visible document label. |
| `#/$defs/DocumentRecord/properties/expiresAt` | `expiresAt` | <code>string</code> | no | — | — |
| `#/$defs/DocumentRecord/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/DocumentRecord/properties/id` | `id` | <code>string</code> | yes | — | Stable document id within the library. |
| `#/$defs/DocumentRecord/properties/issuer` | `issuer` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/IssuerRef</code> | — |
| `#/$defs/DocumentRecord/properties/kind` | `kind` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/DocumentKind</code> | — |
| `#/$defs/DocumentRecord/properties/presentationPolicyRef` | `presentationPolicyRef` | <code>string</code> | no | — | Optional PresentationPolicy.id that usually governs this record. |
| `#/$defs/DocumentRecord/properties/sourceSubmissionRef` | `sourceSubmissionRef` | <code>string</code> | no | — | Optional SubmissionRecord.id that produced or uploaded this document. |
| `#/$defs/DocumentKind` | `(self)` | <code>string</code> | — | enum: <code>"identity-proof"</code>, <code>"income-proof"</code>, <code>"proof-of-address"</code>, <code>"proof-of-age"</code>, <code>"eligibility-evidence"</code>, <code>"form-attachment"</code>, <code>"signed-receipt"</code>, <code>"correspondence"</code>, <code>"other"</code> | Closed v1 document-kind taxonomy. Unsupported domain-specific kinds belong in extensions until promoted. |
| `#/$defs/ContentRef/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ContentRef/properties/mediaType` | `mediaType` | <code>string</code> | yes | — | IANA media type or profile media type. |
| `#/$defs/ContentRef/properties/sha256` | `sha256` | <code>string</code> | no | — | Optional SHA-256 content digest in deployment profile encoding. |
| `#/$defs/ContentRef/properties/uri` | `uri` | <code>string</code> | yes | — | Opaque URI for local encrypted storage, content-addressed storage, or credential location. |
<!-- schema-ref:end -->

`DocumentKind` is closed for v1. Domain-specific kinds MUST live in `extensions` until promoted. This keeps cross-issuer rendering and selective-presentation policy portable.

`contentRef` is opaque. It may point to encrypted local storage, content-addressed storage, a verifiable credential, or an export package member. The library does not standardize the storage backend.

## 5. Submission History and Status

Submission Records give the respondent an issuer-scoped history of prior submissions and current feedback.

<!-- schema-ref:start id=respondent-library-submission schema=schemas/respondent-library.schema.json pointers=#/$defs/SubmissionRecord,#/$defs/ApplicantStatusProjection -->
<!-- generated:schema-ref id=respondent-library-submission -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/SubmissionRecord/properties/applicantStatus` | `applicantStatus` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/ApplicantStatusProjection</code> | Optional WOS applicant-status projection reference/cache. The applicant API remains the source of status vocabulary. |
| `#/$defs/SubmissionRecord/properties/definitionRef` | `definitionRef` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/DefinitionRef</code> | — |
| `#/$defs/SubmissionRecord/properties/documentRefs` | `documentRefs` | <code>array</code> | no | — | DocumentRecord ids attached to this submission. |
| `#/$defs/SubmissionRecord/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/SubmissionRecord/properties/id` | `id` | <code>string</code> | yes | — | Stable local submission id. |
| `#/$defs/SubmissionRecord/properties/issuer` | `issuer` | <code>&#36;ref</code> | yes | <code>&#36;ref</code>: <code>#/&#36;defs/IssuerRef</code> | — |
| `#/$defs/SubmissionRecord/properties/receiptRef` | `receiptRef` | <code>string</code> | no | — | Optional receipt, ledger, or verification reference. |
| `#/$defs/SubmissionRecord/properties/submittedAt` | `submittedAt` | <code>string</code> | yes | — | — |
| `#/$defs/ApplicantStatusProjection/properties/endpoint` | `endpoint` | <code>string</code> | no | — | Optional endpoint path or URL from which the projection was read. |
| `#/$defs/ApplicantStatusProjection/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ApplicantStatusProjection/properties/headline` | `headline` | <code>string</code> | no | — | Optional display headline copied from or derived from the applicant projection. |
| `#/$defs/ApplicantStatusProjection/properties/payloadDigest` | `payloadDigest` | <code>string</code> | no | — | Optional digest of the cached applicant projection payload. |
| `#/$defs/ApplicantStatusProjection/properties/projectionKind` | `projectionKind` | <code>string</code> | yes | enum: <code>"ApplicantCaseSummary"</code>, <code>"ApplicantCaseDetail"</code>, <code>"ApplicantTaskSummary"</code>, <code>"ApplicantNotificationListItem"</code>, <code>"ApplicantStatusTimelineEntry"</code> | WOS applicant API projection kind. Values name external schema definitions; this schema does not redefine their internal status vocabulary. |
| `#/$defs/ApplicantStatusProjection/properties/resourceRef` | `resourceRef` | <code>string</code> | no | — | WOS resource URN or equivalent applicant-visible resource id. |
| `#/$defs/ApplicantStatusProjection/properties/sourceSchema` | `sourceSchema` | <code>string</code> | yes | const: <code>"https://schemas.formspec.io/wos-api/applicant/v1"</code> | Normative source schema for applicant-visible status projections. |
| `#/$defs/ApplicantStatusProjection/properties/summary` | `summary` | <code>string</code> | no | — | Optional display summary copied from or derived from the applicant projection. |
| `#/$defs/ApplicantStatusProjection/properties/updatedAt` | `updatedAt` | <code>string</code> | yes | — | — |
<!-- schema-ref:end -->

Applicant-status projections are respondent-facing references to or cached summaries of the WOS applicant API. The Respondent Library MUST NOT redefine the applicant API's lifecycle, task, notification, or timeline vocabularies. A projection MAY carry display text and a payload digest, but `sourceSchema` remains `https://schemas.formspec.io/wos-api/applicant/v1`.

## 6. Selective Presentation

Presentation Policies bound what the wallet may present, to whom, and for what purpose.

<!-- schema-ref:start id=respondent-library-presentation schema=schemas/respondent-library.schema.json pointers=#/$defs/PresentationPolicy -->
<!-- generated:schema-ref id=respondent-library-presentation -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/PresentationPolicy/properties/allowedPurposes` | `allowedPurposes` | <code>array</code> | yes | — | — |
| `#/$defs/PresentationPolicy/properties/documentRefs` | `documentRefs` | <code>array</code> | no | — | DocumentRecord ids authorized by selected-documents policies. |
| `#/$defs/PresentationPolicy/properties/expiresAt` | `expiresAt` | <code>string</code> | no | — | — |
| `#/$defs/PresentationPolicy/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/PresentationPolicy/properties/id` | `id` | <code>string</code> | yes | — | Stable policy id. |
| `#/$defs/PresentationPolicy/properties/protocolHints` | `protocolHints` | <code>array</code> | no | — | Presentation protocol hints. Hints do not grant access without respondent consent. |
| `#/$defs/PresentationPolicy/properties/recipientIssuer` | `recipientIssuer` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/IssuerRef</code> | — |
| `#/$defs/PresentationPolicy/properties/scope` | `scope` | <code>string</code> | yes | enum: <code>"selected-documents"</code>, <code>"all-documents"</code>, <code>"metadata-only"</code> | Which library material this policy may present. |
<!-- schema-ref:end -->

`scope: "selected-documents"` MUST include `documentRefs`. `protocolHints` such as `openid4vp` and `w3c-vc-data-model-2.0` describe possible transport or credential profiles. They do not grant access by themselves.

The default posture is explicit consent. A conforming wallet MUST NOT present documents to an issuer unless a user action, saved consent policy, or equivalent host policy authorizes the presentation.

## 7. Trust Model and Encryption

<!-- schema-ref:start id=respondent-library-trust schema=schemas/respondent-library.schema.json pointers=#/$defs/TrustModel,#/$defs/EncryptionEnvelope -->
<!-- generated:schema-ref id=respondent-library-trust -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/TrustModel/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/TrustModel/properties/issuerIsolation` | `issuerIsolation` | <code>string</code> | yes | enum: <code>"per-issuer"</code>, <code>"per-program"</code>, <code>"respondent-chosen"</code> | How issuer data is partitioned in the local wallet. |
| `#/$defs/TrustModel/properties/presentationDefault` | `presentationDefault` | <code>string</code> | yes | enum: <code>"explicit-consent"</code>, <code>"deny-by-default"</code> | Default access posture for presenting library material. |
| `#/$defs/TrustModel/properties/serverAggregation` | `serverAggregation` | <code>string</code> | yes | const: <code>"forbidden"</code> | Servers MUST NOT aggregate this library across issuers or tenants. |
| `#/$defs/TrustModel/properties/storagePosture` | `storagePosture` | <code>string</code> | yes | enum: <code>"client-encrypted"</code>, <code>"client-local-only"</code>, <code>"export-snapshot"</code> | Where and how the library is stored. |
| `#/$defs/EncryptionEnvelope/properties/cipherSuite` | `cipherSuite` | <code>string</code> | no | — | Optional HPKE ciphersuite identifier. |
| `#/$defs/EncryptionEnvelope/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/EncryptionEnvelope/properties/keyDerivation` | `keyDerivation` | <code>string</code> | no | enum: <code>"passkey-derived"</code>, <code>"external-key"</code> | How the encryption key is derived or located. |
| `#/$defs/EncryptionEnvelope/properties/mode` | `mode` | <code>string</code> | yes | enum: <code>"none"</code>, <code>"passkey-hpke"</code> | Encryption envelope mode. passkey-hpke is the intended production posture. |
| `#/$defs/EncryptionEnvelope/properties/recipientKeyRef` | `recipientKeyRef` | <code>string</code> | no | — | Recipient HPKE public key or key-handle reference. |
<!-- schema-ref:end -->

The intended production posture is client-side encryption using a passkey-derived key and HPKE envelope primitives from the integrity stack. A conforming document may describe `mode: "none"` only for local demos, fixtures, or explicitly unencrypted exports.

`trustModel.serverAggregation` MUST be `"forbidden"`. Servers may store encrypted blobs on behalf of a respondent, but servers MUST NOT readably aggregate obligations, documents, or submission history across issuers or tenants.

## 8. Portability and Export

<!-- schema-ref:start id=respondent-library-export schema=schemas/respondent-library.schema.json pointers=#/$defs/ExportPackage -->
<!-- generated:schema-ref id=respondent-library-export -->
| Pointer | Field | Type | Required | Notes | Description |
|---|---|---|---|---|---|
| `#/$defs/ExportPackage/properties/createdAt` | `createdAt` | <code>string</code> | yes | — | — |
| `#/$defs/ExportPackage/properties/encryption` | `encryption` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/EncryptionEnvelope</code> | — |
| `#/$defs/ExportPackage/properties/extensions` | `extensions` | <code>&#36;ref</code> | no | <code>&#36;ref</code>: <code>#/&#36;defs/Extensions</code> | — |
| `#/$defs/ExportPackage/properties/format` | `format` | <code>string</code> | yes | enum: <code>"portable-json"</code>, <code>"encrypted-portable-json"</code> | Portable export package format. |
| `#/$defs/ExportPackage/properties/id` | `id` | <code>string</code> | yes | — | — |
| `#/$defs/ExportPackage/properties/includes` | `includes` | <code>array</code> | yes | — | — |
<!-- schema-ref:end -->

Export packages exist so respondents can move their library between wallets or inspect it outside a hosted service. Implementations SHOULD support encrypted exports before production use.

Exported material remains subject to presentation policy. Export is not an implicit grant to a relying party.

## 9. Conformance

### 9.1 Core Conformance

A Core processor MUST:

1. Validate the document against `schemas/respondent-library.schema.json`.
2. Reject any `aggregationMode` other than `"client-wallet"`.
3. Reject any `trustModel.serverAggregation` other than `"forbidden"`.
4. Preserve unknown `x-` extension keys without assigning them standard semantics.
5. Treat applicant-status projections, obligations, and document records as respondent-visible evidence, not workflow authority.

### 9.2 Wallet Conformance

A Wallet processor additionally MUST:

1. Enforce presentation policy before releasing document material.
2. Keep issuer partitions separate according to `trustModel.issuerIsolation`.
3. Encrypt at rest when `trustModel.storagePosture` is `client-encrypted`.
4. Support portability export if it advertises export/import behavior.

### 9.3 Web Consumer Conformance

A web consumer, including `formspec-web`, MUST consume this contract through a DI seam. It may provide stub adapters and reference interfaces, but it MUST NOT invent alternate document-kind, presentation-policy, status, or aggregation semantics in web-only code.

## 10. Relationship to Other Specs

| Spec | Relationship |
| --- | --- |
| Core Definition / Response | Definition identifies forms; Response captures a single filled form. The library indexes across many forms. |
| Intake Handoff | Handoff transfers one validated submission to a workflow host. The library may link to handoff/receipt refs but does not replace handoff. |
| Respondent Ledger | Ledger provides audit history for responses. The library may store ledger refs and receipts, but does not author ledger events. |
| Issuer | Issuer names the organization asking or responding. Library issuer refs are display/index references, not identity-provider claims. |
| WOS applicant/status API | Status adapters may attach WOS applicant projections to submissions. The applicant API remains authoritative for status vocabularies and case-subject authority boundaries. |
| W3C VC / OpenID4VP | Credential and presentation protocols may carry document material under PresentationPolicy. They do not change the library trust model. |

## 11. Security and Privacy Notes

- Cross-issuer aggregation is respondent-side by design. Moving readable aggregation server-side is a privacy and architecture violation.
- A respondent may choose to synchronize encrypted library blobs. Synchronization services must not be able to inspect issuer history or documents without the respondent's key.
- Presentation policy must be visible enough that a respondent can understand which documents are being shared and why.
- Extension fields must not be used to smuggle server-authoritative workflow state into the library.

## 12. Schema

The normative schema is [`schemas/respondent-library.schema.json`](../../schemas/respondent-library.schema.json). Generated schema tables in this document are derived from that file.

## 13. References

- [Formspec Core](../core/spec.md)
- [Issuer](../issuer/issuer-spec.md)
- [Respondent Ledger](../audit/respondent-ledger-spec.md)
- [W3C Verifiable Credentials Data Model 2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [OpenID for Verifiable Presentations](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
