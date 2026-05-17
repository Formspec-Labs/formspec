---
title: Respondent Ledger Add-On Specification
version: 0.2.0-draft
date: 2026-04-27
status: draft
---

# Respondent Ledger Add-On Specification v0.2

**Status:** Draft  
**Last updated:** 2026-04-27
**Audience:** Formspec add-on editors, platform engineers, runtime implementers, trust/compliance reviewers  
**Normative language:** The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as described in RFC 2119 / RFC 8174 when, and only when, they appear in all capitals.

---

## 1. Purpose

This document defines an **optional, respondent-facing audit change tracking ledger** for Formspec-based systems.

The ledger is designed for the **people filling out forms**. It records the material history of a draft, submission, reopening, amendment, or abandonment flow without changing the core Formspec `Response` contract. Deployments that need finer reconstruction **MAY** enable field-level editing changelog mode, which records durable per-path edits as `ChangeSetEntry` objects.

This add-on exists to answer questions such as:

- what materially changed between draft saves,
- which field-level edits were durably captured when field-level changelog mode is enabled,
- what changed after a completed submission was reopened,
- which values were user-entered versus prepopulated or system-derived,
- which validation findings were present when the respondent saved or tried to submit,
- and whether the recorded history can be verified later for support, appeals, dispute handling, downstream assurance, or identity-sensitive review flows.

This specification is intentionally **layered on top of** Formspec core. It reaches down into base Formspec semantics such as response pinning, item keys, response paths, validation snapshots, migrations, non-relevant behavior, and extensions; however, it does **not** redefine `Response` as an event stream and does **not** require every Formspec processor to implement the ledger.

---

## 2. Relationship to Formspec core

### 2.1 Layering model

A conforming implementation using this add-on works across three distinct layers:

1. **Definition** — the structural and behavioral meaning of the form.
2. **Response** — the current saved or submitted state of the respondent's answers, pinned to one exact `(definitionUrl, definitionVersion)` tuple.
3. **Respondent Ledger** — an append-only history of material respondent-side events that explain how the `Response` reached its current state.

### 2.2 What remains canonical

The `Response` remains the canonical state snapshot for the current answer set. The ledger is explanatory history, not a replacement source of truth.

A processor implementing this add-on:

- **MUST** continue to treat the pinned Formspec `Response` as the canonical submission payload,
- **MUST NOT** require ledger replay in order to interpret a valid `Response`,
- **MUST NOT** redefine core Formspec validation, relevance, calculation, or completion semantics,
- **MAY** use the ledger to support audit UI, dispute review, amendment flows, or forensic reconstruction.

### 2.3 Optionality and conformance boundary

This is a companion specification. A processor can be fully conformant to Formspec core without implementing anything in this document.

A processor that claims conformance to this add-on:

- **MUST** produce or preserve ledger documents according to this specification,
- **MUST** keep ledger semantics additive to Formspec core,
- **SHOULD** expose an implementation-specific discovery mechanism linking a `Response` to its ledger,
- **MAY** embed that discovery pointer in `Response.extensions`, provided the extension does not alter core semantics.

Recommended extension pointer shape:

```json
{
  "extensions": {
    "x-respondentLedger": {
      "ledgerId": "ledger-018f6f2f",
      "specVersion": "0.1",
      "href": "https://example.gov/audit/respondent-ledgers/ledger-018f6f2f"
    }
  }
}
```

### 2.4 Legal sufficiency

Ledger integrity, event chaining, and checkpoint anchoring contribute to evidentiary quality but do not, by themselves, guarantee legal admissibility in any particular jurisdiction. Implementations **MUST NOT** imply that ledger integrity alone is sufficient for legal admissibility. Implementations **MAY** make stronger evidentiary claims only to the extent supported by declared process, authored signature semantics, records-management practice, and applicable law — and **MUST** disclose which of those conditions they rely on when making such claims.

### 2.5 Field-level editing changelog mode

The respondent ledger supports two capture modes:

- `material` — default mode. The processor records material respondent-side events and material deltas at save, submit, amendment, migration, attachment, or validation boundaries.
- `field-level` — optional mode. The processor records a durable `ChangeSetEntry` for each response field path whose persisted value changes at a declared capture boundary.

Field-level changelog mode is a changelog of **persisted response edits**, not UI telemetry. It **MUST NOT** require keystroke capture, focus/blur capture, cursor movement capture, page navigation capture, or rendering lifecycle capture. An implementation **MAY** coalesce multiple UI interactions into one durable event when the event preserves the final per-path `before` / `after` value or hash for every changed field path.

A ledger using `field-level` mode **MUST** declare `changelogBoundaries`, the durable boundary families at which field deltas are captured. Exact lifecycle details still live on each event's `eventType`; the boundary declaration states which families the ledger promises to capture.

Allowed `changelogBoundaries` values:

- `save` — respondent or support-triggered save of an in-progress response.
- `autosave` — implementation-defined autosave batch.
- `submit` — submit attempt or successful completion.
- `amendment` — save or completion during a reopened amendment cycle.
- `prepopulation` — external, parent-response, or imported data writes values into the response.
- `migration` — processor migration across definition versions.
- `merge` — system resolution of conflicting changes or resume merges.

---

## 3. Design goals and non-goals

### 3.1 Goals

This add-on is intended to be:

- **Optional** — not every processor must implement it.
- **Append-only** — history is preserved rather than overwritten.
- **Material** — it captures meaningful state changes rather than UI noise.
- **Changelog-capable** — deployments can opt into field-level persisted-edit history without making keystroke telemetry mandatory.
- **Path-native** — change entries align with Formspec response paths and stable item keys.
- **Portable** — the data model can travel with the response or be stored externally.
- **Identity-portable** — identity, proof-of-personhood, and delegated-access facts can be represented through stable provider-neutral references rather than hard-coded vendor shapes.
- **Tier-aware disclosure** — one canonical event model can support anonymous, pseudonymous, identified, and fully disclosed review contexts without reshaping the ledger.
- **Identity-decoupled** — response storage, audit storage, and even on-chain anchoring can remain anonymous or pseudonymous while identity proofing stays in a separate but compatible framework.
- **Privacy-bounded** — implementations can retain proofs of change without retaining every prior sensitive value.
- **Human-legible first** — the first payoff is understandable respondent history.
- **Integrity-ready** — cryptographic sealing and platform-ledger anchoring can be layered on without changing event meaning.

### 3.2 Non-goals

This specification does **not** require:

- keystroke-by-keystroke capture,
- focus/blur or rendering telemetry,
- a particular storage engine,
- a particular cryptographic algorithm,
- studio-author change tracking,
- reviewer workflow history,
- or a mandated user interface.

---

## 4. Core model

### 4.1 Top-level document

A ledger document represents the material respondent-side history for one
Formspec `Response`. It is response-scoped history, not a workflow case ledger.

Each ledger document **MUST** correspond to exactly one current `responseId`.

A ledger document **MAY** cover one or more session segments over the life of
that response, including amendment cycles. Workflow hosts may compose a sealed
response ledger head into a separate case ledger, but that composition does not
rename or merge the Respondent Ledger into case governance history.

### 4.2 Canonical objects

This specification defines four primary object types:

1. `RespondentLedger`
2. `RespondentLedgerEvent`
3. `ChangeSetEntry`
4. `LedgerCheckpoint`

These names are canonical for this specification even if an implementation stores them in different physical tables or streams.

---

## 5. RespondentLedger object

### 5.1 Required fields

A `RespondentLedger` object **MUST** contain at least:

- `ledgerId`
- `$formspecRespondentLedger`
- `responseId`
- `definitionUrl`
- `definitionVersion`
- `status`
- `createdAt`
- `lastEventAt`
- `eventCount`

### 5.2 Recommended fields

A `RespondentLedger` object **SHOULD** also include, where available:

- `organizationId`
- `environment`
- `currentResponseHash`
- `currentResponseAuthored`
- `headEventId`
- `sessionRefs`
- `checkpointRefs`
- `integrityProfile`
- `offlineAuthoring`
- `changelogMode`
- `changelogBoundaries`
- `extensions`

### 5.3 Field semantics

- `ledgerId` — stable identifier for the ledger document.
- `$formspecRespondentLedger` — add-on specification version string.
- `responseId` — identifier of the current Formspec `Response` this ledger describes.
- `definitionUrl` and `definitionVersion` — the exact Formspec definition identity currently associated with the response.
- `status` — current ledger status, typically aligned to the latest response lifecycle state.
- `createdAt` — timestamp of the first event recorded in the ledger.
- `lastEventAt` — timestamp of the most recent event in the ledger.
- `eventCount` — total number of retained events.
- `currentResponseHash` — optional digest of the current canonical response snapshot.
- `currentResponseAuthored` — last known `Response.authored` timestamp.
- `headEventId` — identifier of the newest retained event.
- `integrityProfile` — optional integrity declaration. Allowed values are
  `none`, `chained`, and `trellis-wrapped`. If omitted, `none` is assumed.
  The `trellis-wrapped` value remains an optional compatibility profile value
  in this base schema, but Formspec only assigns the hash-obligation semantics
  described here. Trellis envelope, export, and certificate validation are
  profile-validator responsibilities outside the base Respondent Ledger.
- `offlineAuthoring` — optional synchronization profile for events authored
  while offline or not yet accepted by the server.
- `changelogMode` — optional capture declaration. Allowed values are `material` and `field-level`. If omitted, `material` is assumed.
- `changelogBoundaries` — optional in `material` mode and required in `field-level` mode. Declares the durable boundaries at which field-level deltas are captured.

### 5.4 Example

```json
{
  "$formspecRespondentLedger": "0.1",
  "ledgerId": "ledger-018f6f2f",
  "responseId": "resp-8d0b1e85",
  "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
  "definitionVersion": "2.3.0",
  "status": "in-progress",
  "createdAt": "2026-03-22T09:00:12Z",
  "lastEventAt": "2026-03-22T09:14:27Z",
  "eventCount": 4,
  "headEventId": "evt-0004",
  "currentResponseAuthored": "2026-03-22T09:14:27Z",
  "integrityProfile": "trellis-wrapped",
  "extensions": {
    "x-storage": {
      "partition": "tenant-44/us-east-1"
    }
  }
}
```

---

## 6. RespondentLedgerEvent object

### 6.1 Required fields

Each event **MUST** contain at least:

- `eventId`
- `sequence`
- `eventType`
- `occurredAt`
- `recordedAt`
- `responseId`
- `definitionUrl`
- `definitionVersion`
- `actor`
- `source`

### 6.2 Conditional fields

- `changes` **MUST** be present when the event records a material state delta.
- `validationSnapshot` **SHOULD** be present for save, submit-attempt, completion, amendment, or stop transitions when validation findings are available.
- `identityAttestation` **SHOULD** be present for `identity-verified`, `attestation.captured`, delegated-signing, or other events where identity, proof-of-personhood, or assurance facts materially changed.
- `priorEventHash` and `eventHash` **SHOULD** be present when integrity chaining is enabled. When a Respondent Ledger event is wrapped by a Trellis envelope, `eventHash` and `priorEventHash` **MUST** be present; `priorEventHash` is `null` only for the first event in the wrapped chain.
- `attachmentBinding` **MUST** be present for `attachment.added` and `attachment.replaced`.
- `priorAttachmentBindingHash` **MUST** be present for `attachment.removed`; `attachment.removed` **MUST NOT** carry a new `attachmentBinding`.
- `sessionRef` **SHOULD** be present when the implementation distinguishes respondent sessions.
- `amendmentRef` **SHOULD** be present when an event belongs to a particular reopening/amendment cycle.

### 6.3 Field semantics

- `eventId` — unique event identifier within the ledger.
- `sequence` — monotonic sequence number within the ledger.
- `eventType` — event classification defined in [Section 8](#8-event-taxonomy).
- `occurredAt` — when the underlying action happened.
- `recordedAt` — when the processor persisted the event.
- `responseId` — the response this event belongs to.
- `definitionUrl` / `definitionVersion` — the pinned definition tuple in force for the event.
- `actor` — who initiated or is attributed with the event.
- `source` — which channel or subsystem produced the event.
- `changes` — ordered set of atomic field/document/status changes, if any.
- `validationSnapshot` — point-in-time summary of validation state relevant to the event.
- `identityAttestation` — provider-neutral record of identity, proof-of-personhood, DID, or delegation evidence associated with the event.
- `attachmentBinding` — chain-bound `EvidenceAttachmentBinding` record for an added or replaced attachment, defined in §6.9.
- `priorAttachmentBindingHash` — prior attachment-binding event hash referenced by an attachment removal.
- `recordKind` — correction-profile discriminator for `response.correction-recorded`; when present it **MUST** equal `responseCorrection`.
- `data` — structured `ResponseCorrection` payload for `response.correction-recorded`, defined in §11.3.
- `priorEventHash` — previous event hash in the respondent-ledger chain, or `null` for the first event in a Trellis-wrapped chain.
- `eventHash` — hash of this respondent-ledger event under the active integrity profile.
- `privacyTier` — optional disclosure tier on the actor or identity attestation stating how linkable or revealed the subject is for this event.
- `extensions` — additive implementation-specific metadata.

### 6.4 Actor object

The `actor` object **MUST** include `kind` and **SHOULD** include one stable identifier when available.

Supported `actor.kind` values:

- `respondent`
- `delegate`
- `system`
- `support-agent`
- `unknown`

Recommended actor fields:

- `kind`
- `id`
- `display`
- `assuranceLevel`
- `did`
- `identityProviderRef`
- `subjectRef`

### 6.5 Source object

The `source` object **MUST** identify the capture channel.

Supported `source.kind` values:

- `web`
- `mobile`
- `api`
- `import`
- `system-job`
- `unknown`

Recommended source fields:

- `kind`
- `channelId`
- `deviceId`
- `ipAddressRef`
- `userAgentRef`

Implementations handling sensitive network metadata **SHOULD** store references or protected derivatives rather than raw values in the ledger itself.

### 6.6 Identity attestation object

The `identityAttestation` object is the canonical place to record identity, proof-of-personhood, delegated-access, or verifiable-credential evidence that materially affects the respondent workflow.

This object is intentionally **provider-neutral**. Implementations **SHOULD** normalize provider-specific payloads — for example an `id.me` session result, an OpenID Connect identity assertion, or a wallet-presented credential — into a common shape that can survive export, review, and future adapter changes.

Recommended identity attestation fields:

- `provider` — provider or issuer identifier such as `idme`, `login.gov`, `internal-proofing`, or a DID issuer name.
- `adapter` — implementation adapter or interface identifier used to normalize provider-specific payloads.
- `subjectRef` — stable pseudonymous subject or continuity reference that the ledger can use without embedding a real-world identifier.
- `did` — subject DID when the identity flow issues or binds one.
- `verificationMethod` — DID URL, key identifier, or other method reference used to verify the assertion.
- `credentialType` — high-level type such as `oidc-token`, `verifiable-credential`, `proof-of-personhood`, or `delegation-assertion`.
- `credentialRef` — reference to the protected credential or token envelope, not the raw secret itself.
- `personhoodCheck` — whether proof-of-personhood or liveness/uniqueness checks passed, failed, or were not performed.
- `subjectBinding` — whether the attestation is about the respondent, subject, delegate, or another party.
- `assuranceLevel` — ordered assurance tier per §6.6.1.
- `privacyTier` — disclosure tier such as `anonymous`, `pseudonymous`, `identified`, or `public`.
- `selectiveDisclosureProfile` — named policy profile controlling what parts of the attestation may be revealed in support, review, export, or dispute contexts.
- `evidenceRef` — pointer to encrypted reveal material, redacted export evidence, or provider response evidence.

### 6.6.1 Assurance levels

Implementations using `assuranceLevel` **MUST** support at minimum the following ordered four-level taxonomy:

| Level | Label | Meaning |
|---|---|---|
| `L1` | Self-asserted | Subject or actor asserted the identity binding; no external corroboration. |
| `L2` | Corroborated | Binding corroborated by at least one external source (e.g., emailed magic link, phone verification). |
| `L3` | Verified | Binding verified against an authoritative source (e.g., government ID match, credential issuer). |
| `L4` | In-person or equivalent | Binding verified under conditions equivalent to in-person government-issued identity check. |

Implementations **MAY** define additional levels; additional levels **MUST** be declared with an explicit ordering position relative to the base four.

Assurance levels are declared per attestation; they are not properties of the subject. An assurance level **MAY** be upgraded by a later `attestation.captured` event referencing the same `subjectRef`, but **MUST NOT** be silently downgraded. Upgrades apply forward only; prior events **MUST NOT** be rewritten.

If a processor integrates with a third-party identity provider such as **ID.me**, it **SHOULD** do so through an adapter boundary that emits this canonical object rather than writing provider-native fields directly into the ledger event shape.

### 6.6A Identity and implementation decoupling

Processors **SHOULD** distinguish between at least three separable concerns:

1. **response state and audit continuity** — what was answered, when it changed, and what hashes/checkpoints represent that history,
2. **subject continuity** — which pseudonymous case/subject/ref the ledger is about across sessions or devices, and
3. **identity proofing** — how a respondent later proved personhood, eligibility, delegation, or legal identity.

The first concern may be stored off-chain, on-chain, or in hybrid storage. The second may be represented by a stable `subjectRef` that is intentionally not itself a legal identity. The third may be satisfied by provider adapters, DID presentations, proof-of-personhood systems, or internal proofing services that bind evidence to that `subjectRef` when policy requires it.

This means a conforming implementation can keep the form response and respondent ledger anonymous or pseudonymous by default — including when writing hashes, checkpoints, or commitments to a chain — while still using the same framework to attach higher-assurance identity proofs later.

Implementations **SHOULD** preserve this separation all the way through export and verification: the event chain proves continuity and integrity of respondent activity, `identityAttestation` proves identity or assurance claims about a subject, and an authored signature proves explicit assent to specific Response content. These claims may corroborate one another, but they **MUST NOT** be collapsed into one field or one verification step.

### 6.7 Disclosure tier and assurance are independent

Implementations **MUST NOT** conflate disclosure tier (`privacyTier`) and assurance level (`assuranceLevel`). The two are independent properties of an attestation. Implementations **MUST NOT** derive one from the other, and **MUST NOT** couple their transitions.

A respondent **MAY** be highly assured and pseudonymously disclosed (a verified L3 attestation disclosed under a pseudonym). A respondent **MAY** be weakly assured and fully identified (a self-asserted L1 attestation tied to a legal name). All four combinations of privacy tier and assurance level are valid. Implementations that force these to co-vary violate this requirement.

Consequences:

- Profiles and export policies **MAY** constrain disclosure tier or assurance level independently. A profile constraining both **MUST** constrain them as independent predicates, not a joint predicate.
- `attestation.captured` events that upgrade assurance **MUST NOT** implicitly change the disclosure tier on the same `subjectRef`.
- Disclosure re-scoping (e.g., a pseudonymous record being later identified) **MUST NOT** imply an assurance upgrade.
- Reviewers and verifiers **MUST** be able to check assurance claims independently of disclosure claims.

Note: `privacyTier` uses a closed enumeration (the four values above are exhaustive); `assuranceLevel` is extensible per §6.6.1 (implementations MAY declare additional levels). This asymmetry is intentional — privacy tiers are a fixed ontology; assurance levels are an ordered scale that domains may extend.

### 6.8 Authored signatures vs. recorded attestations

A Response **MAY** carry an authored signature — a cryptographic binding by the respondent (or delegate) to the submitted Response payload at authoring time. Authored signatures are a property of the Response data contract; their shape and verification are defined where the Response itself is specified, not in this add-on.

This add-on records the fact that a signature, credential, or delegation was bound into audit history via `attestation.captured` events and `identityAttestation` objects. The two concerns are distinct and **MUST** remain distinguishable:

- An **authored signature** is evidence produced by the respondent at authoring time, binding the respondent to the Response content.
- A **recorded attestation** is an audit-history entry describing that signature (or another credential) as it was observed, validated, or admitted into workflow.

An implementation **MUST NOT** treat a recorded `attestation.captured` event as a substitute for the authored signature itself. Verifiers evaluating authenticity of Response content **MUST** verify the authored signature; the ledger event is corroborating audit context, not the signature.

Signature lifecycle history **SHOULD** be recorded as response-scoped ledger
events when a deployment needs durable audit history for capture, verification
success, verification failure, withdrawal, supersession, or amendment after
signing. Those events **SHOULD** reference the authored signature with
`signatureId`, `responseId`, and `signedPayload.digest` values from the
Formspec Response. The ledger records lifecycle history and corroborating
facts; it **MUST NOT** replace Formspec authored-signature verification or
invent signature semantics outside the Response contract.

The source-of-truth for each cross-record signature fact is defined by the
normative source-of-truth table in `formspec/specs/core/spec.md` §2.1.N. The
Response is the canonical carrier of signer identity, signed bytes, signed-at
timestamp, signing intent, and document binding. Ledger events are derived/
corroborating. When a ledger event records a fact that diverges from the
Response's canonical fact, the Response prevails.

### 6.9 EvidenceAttachmentBinding object

`EvidenceAttachmentBinding` is the canonical Formspec-originated attachment-binding record adopted by [ADR 0072](../../../thoughts/adr/0072-stack-evidence-integrity-and-attachment-binding.md).

For `attachment.added` and `attachment.replaced`, the event **MUST** carry an `attachmentBinding` object with exactly these fields:

- `attachment_id`
- `slot_path`
- `media_type`
- `byte_length`
- `attachment_sha256`
- `payload_content_hash`
- `filename`
- `prior_binding_hash`

Field semantics:

- `attachment_id` — stable logical attachment identifier within the current `responseId` and origin-layer scope. It **MUST** remain stable across replacement of the same logical attachment. It **MUST NOT** be derived solely from filename, storage key, or content hash.
- `slot_path` — Formspec response path or evidence slot where the attachment is bound. For repeated or multi-attachment slots, the path **SHOULD** include a stable row or attachment discriminator when available and **SHOULD NOT** rely on an array index alone when a stable discriminator exists.
- `media_type` — RFC 6838 media type of the attachment bytes.
- `byte_length` — exact byte length before any adapter encryption, export wrapping, or transport encoding.
- `attachment_sha256` — SHA-256 over the exact attachment bytes before any adapter encryption, export wrapping, or transport encoding. The processor **MUST NOT** canonicalize, transcode, normalize, or MIME-reinterpret bytes before computing this digest.
- `payload_content_hash` — hash of the payload bytes as carried by the selected integrity or export profile. For Trellis-wrapped attachment events, this value **MUST** equal `EventPayload.content_hash` and `PayloadExternal.content_hash`.
- `filename` — display-only filename, or `null`. It **MUST NOT** be treated as identity.
- `prior_binding_hash` — `null` for `attachment.added`; the prior binding event's `canonical_event_hash` for `attachment.replaced`.

`attachment.added` **MUST** set `prior_binding_hash` to `null`.

`attachment.replaced` **MUST** set `prior_binding_hash` to the immediately prior binding event for the same `attachment_id`.

`attachment.removed` **MUST NOT** emit a new `EvidenceAttachmentBinding`; it records removal under its own lifecycle event and references the removed binding through `priorAttachmentBindingHash`.

The attachment binding is authoritative for portable attachment identity.
Storage layout, blob identifiers, filenames, membership under a payload
directory, and export-wrapper hashes are adapter details and **MUST NOT** be
used as substitutes for this record. Attachment lifecycle meaning comes from
the Formspec fields `attachment_id`, `slot_path`, `attachment_sha256`, and
`prior_binding_hash`; export profiles may add byte-carriage evidence but do not
define the lifecycle act.

When this event is wrapped by Trellis, the `EvidenceAttachmentBinding` metadata is carried in `EventPayload.extensions["trellis.evidence-attachment-binding.v1"]`; Trellis `PayloadExternal` names the attachment ciphertext bytes whose digest is `payload_content_hash`.

---

## 7. ChangeSetEntry object

### 7.1 Purpose

A `ChangeSetEntry` is the atomic unit of respondent-visible change.

Change entries are designed to be:

- stable enough for machine analysis,
- understandable enough for respondent or support timelines,
- and compact enough to avoid storing entire response copies on every save.

### 7.2 Required fields

Each `ChangeSetEntry` **MUST** contain:

- `op`
- `path`
- `valueClass`

### 7.3 Recommended fields

Each `ChangeSetEntry` **SHOULD** include, where resolvable:

- `itemKey`
- `accessClass`
- `before`
- `after`
- `beforeHash`
- `afterHash`
- `displayBefore`
- `displayAfter`
- `reasonCode`
- `editBatchId`
- `editSequence`
- `dataPointer`

### 7.4 Supported operations

Allowed `op` values:

- `set`
- `unset`
- `add`
- `remove`
- `replace`
- `reorder`
- `status-transition`

Interpretation:

- `set` — assign or overwrite a scalar/object value at an existing path.
- `unset` — clear a value while retaining the path's structural meaning.
- `add` — introduce a new array entry, attachment, or object branch.
- `remove` — remove an array entry, attachment, or object branch.
- `replace` — substitute one value/document for another where replacement semantics matter.
- `reorder` — reorder repeated elements without semantic value mutation.
- `status-transition` — record a change to lifecycle state.
- In `field-level` changelog mode, `set`, `unset`, `add`, `remove`, `replace`, and `reorder` are the durable edit operations for response paths. Implementations **MAY** group many such entries inside one save/coalesced-autosave event rather than emitting one ledger event per field.

### 7.5 Value classes

Allowed `valueClass` values:

- `user-input`
- `prepopulated`
- `calculated`
- `imported`
- `attachment`
- `system-derived`
- `migration-derived`

### 7.6 Path requirements

The `path` field **MUST** use the same logical response path model used by the implementation for Formspec response addressing.

A processor **SHOULD** additionally record `itemKey` when the changed node maps to a stable definition item key.

For repeated structures, implementations:

- **SHOULD** record a stable row discriminator when available,
- **MAY** include a concrete `dataPointer` using JSON Pointer notation for precise row targeting,
- **SHOULD NOT** rely on array index alone when a stable repeated-row identifier exists elsewhere in the runtime.

### 7.7 Field-level changelog requirements

When `RespondentLedger.changelogMode = "field-level"`, each durable edit boundary **MUST** include one `ChangeSetEntry` for each response field path whose persisted value changed at that boundary.

Field-level mode:

- **MUST** use the logical response path in `path`,
- **SHOULD** include `itemKey` for every changed field that maps to a stable Formspec item,
- **SHOULD** include `editBatchId` when multiple entries were produced by the same save/autosave/submit action,
- **SHOULD** include `editSequence` to preserve stable ordering within the batch,
- **MAY** store raw `before` / `after` values, hashes, display summaries, or redaction metadata according to policy,
- **MUST NOT** treat omitted raw values as evidence that no field edit occurred.

A field-level changelog is not a replay authority. The current Formspec `Response` remains canonical; the changelog explains how the persisted response reached that state.

### 7.8 Sensitive values and minimization

Implementations **MAY** omit `before` and/or `after` when policy prohibits retention of raw values.

If raw values are omitted for policy reasons, implementations **SHOULD** record one or more of:

- `beforeHash`
- `afterHash`
- `displayBefore`
- `displayAfter`
- `semanticDelta`
- `redactionPolicy`

This enables proof that a material change happened without retaining the full sensitive content indefinitely.

When a Privacy Profile is loaded, each `ChangeSetEntry` for a response field **MUST** inherit the field's `accessControl.class` as `accessClass` when the class is resolvable. Raw `before` and `after` values for a class **MUST NOT** be exposed to a reader who lacks authority for that class. Implementations **MAY** retain hashes, display summaries, or redaction metadata outside the raw value bucket only when doing so does not leak more than the deployment's header/tag policy allows.

### 7.9 Example

```json
{
  "op": "replace",
  "path": "household.members[1].monthlyIncome",
  "itemKey": "member_monthly_income",
  "valueClass": "user-input",
  "before": 2400,
  "after": 2800,
  "reasonCode": "user-edit"
}
```

---

## 8. Event taxonomy

### 8.1 Required event types

A conforming implementation **MUST** support the following event types when the corresponding lifecycle moments occur:

- `session.started`
- `draft.saved`
- `draft.resumed`
- `response.completed`
- `response.amendment-opened`
- `response.amended`
- `response.stopped`
- `attachment.added`
- `attachment.replaced`
- `attachment.removed`
- `prepopulation.applied`
- `system.merge-resolved`
- `validation.snapshot-recorded`

### 8.2 Optional event types

An implementation **MAY** support additional material event types, including:

- `calculation.material-change`
- `nonrelevant.pruned`
- `autosave.coalesced`
- `device-linked`
- `identity-verified`
- `attestation.captured`
- `response.submit-attempted`
- `response.migrated`
- `response.correction-recorded`
- `field.edit-recorded`

### 8.3 Event type guidance

- `session.started` — first usable interaction in a respondent session.
- `draft.saved` — explicit save or a coalesced autosave materialized as a durable checkpoint.
- `draft.resumed` — resume of an existing draft after inactivity or across devices.
- `response.submit-attempted` — attempted completion, whether or not it succeeds.
- `response.completed` — successful transition to `Response.status = completed`.
- `response.amendment-opened` — previously completed response reopened for editing.
- `response.amended` — durable completion of an amendment cycle.
- `response.stopped` — response marked abandoned or intentionally stopped.
- `attachment.added` — first introduction of attachment bytes. The event **MUST** carry `attachmentBinding` with `prior_binding_hash = null`.
- `attachment.replaced` — replacement of an existing logical attachment. The event **MUST** carry `attachmentBinding` with `prior_binding_hash` set to the prior binding event hash.
- `attachment.removed` — removal of an existing logical attachment. The event **MUST** carry `priorAttachmentBindingHash` and **MUST NOT** carry a new `attachmentBinding`.
- `prepopulation.applied` — external or parent-response data hydrated into the response.
- `system.merge-resolved` — platform resolved concurrent changes, conflicts, or resume merges.
- `validation.snapshot-recorded` — explicit audit capture of validation state independent of save or submit.
- `identity-verified` — an identity provider, DID verifier, or proof-of-personhood flow materially updated the assurance state relied on by the workflow.
- `attestation.captured` — a credential, delegation, personhood proof, or related attestation was durably bound into audit history.
- `response.migrated` — response was transformed to a new definition version.
- `response.correction-recorded` — additive correction to a prior submitted response event. The event **MUST** carry `recordKind = "responseCorrection"` and a `data` payload with the prior submission event hash, the corrected field subset, original/corrected field values, correction reason, and neutral authorization reference.
- `field.edit-recorded` — optional event type for deployments that emit one durable event per field edit batch instead of carrying field-level entries only inside `draft.saved`, `autosave.coalesced`, `response.submit-attempted`, `response.amended`, migration, or merge events.

### 8.4 Explicit exclusions

This specification does **not** require event types for:

- individual keystrokes,
- focus/blur changes,
- page navigation,
- every calculation reevaluation,
- or rendering lifecycle events.

---

## 9. Materiality rules

### 9.1 General rule

The ledger is for **material** respondent history.

A processor **MUST NOT** emit separate durable ledger events for every ephemeral UI action.

### 9.2 Material changes

A change is generally material if one or more of the following is true:

- it changes the persisted response state,
- it changes a completion or amendment lifecycle state,
- it adds, removes, or replaces an attachment,
- it changes a respondent-visible calculated outcome that is included in the response,
- it changes validation findings available to the respondent at a save or submit boundary,
- it changes the set of retained values because of non-relevance, migration, or merge resolution,
- or it changes an attestation, proof-of-personhood, DID binding, or assurance fact relied upon for completion.

### 9.3 Autosave coalescing

Implementations **MAY** coalesce frequent autosaves into a smaller number of durable `draft.saved` or `autosave.coalesced` events.

If autosave coalescing is used, the implementation:

- **MUST** preserve the final persisted state represented by the coalesced event,
- **SHOULD** preserve a stable ordering of the material changes included in the event,
- **SHOULD** indicate the coalescing policy in event metadata or implementation documentation.

### 9.4 Field-level changelog materiality

A deployment that enables `changelogMode = "field-level"` treats every persisted field-value delta as material for changelog purposes, even when the edit does not change lifecycle status, validation outcome, or downstream eligibility logic.

Field-level mode still preserves the no-telemetry boundary:

- UI-only edits that are never persisted **MUST NOT** produce durable ledger events.
- Multiple UI edits to the same field **MAY** collapse into one persisted `ChangeSetEntry` when they occur before the same durable save/autosave/submit boundary.
- If an implementation claims field-level changelog support, it **MUST** populate `RespondentLedger.changelogBoundaries` with the durable boundaries at which field deltas are captured.

---

## 10. Interaction with Formspec response semantics

### 10.1 Response pinning

Every ledger event **MUST** record the exact `definitionUrl` and `definitionVersion` that governed the response state at the time of the event.

Processors **MUST NOT** silently reinterpret historical events against a later definition version.

### 10.2 Response status transitions

The ledger **MUST** align response lifecycle events to the core Formspec `Response.status` states:

- `in-progress`
- `completed`
- `amended`
- `stopped`

Where status is changed, the event **SHOULD** include a `ChangeSetEntry` with `op = status-transition`.

### 10.3 Validation snapshots

When validation information is available at save, submit-attempt, completion, amendment, or stop boundaries, the event **SHOULD** contain a validation snapshot summary.

A validation snapshot **SHOULD** include:

- `valid`
- `counts.error`
- `counts.warning`
- `counts.info`
- `generatedAt`
- `resultRefs` or embedded summarized findings

The ledger **MUST NOT** change the underlying meaning of Formspec validation results. It is a capture mechanism, not an alternative validator.

### 10.4 Non-relevant fields

When non-relevant behavior causes values to be removed, nulled, or retained, implementations **SHOULD** record a material event if the persisted response shape or retained values change because of that rule.

Recommended event types:

- `nonrelevant.pruned`
- `draft.saved` with explicit `ChangeSetEntry.reasonCode = nonrelevant-prune`

### 10.5 Calculated values

Calculated values **SHOULD NOT** produce ledger noise for every reevaluation.

A processor **SHOULD** record a ledger change for a calculated value only when all of the following are true:

- the calculated value is included in the persisted response,
- the new value differs materially from the prior persisted value,
- and the change matters to respondent-visible review, downstream logic, or audit meaning.

### 10.6 Prepopulation

When data is hydrated from a parent response, external source, or imported record, the implementation **SHOULD** record `prepopulation.applied` with `valueClass = prepopulated` or `imported` for each material change entry.

If prepopulated values are later edited by the respondent, subsequent changes **SHOULD** use `valueClass = user-input` and a `reasonCode` such as `user-edit-over-prepopulation`.

---

## 11. Amendments, migration, and version evolution

### 11.1 Amendment cycles

When a completed response is reopened:

1. the processor **SHOULD** record `response.amendment-opened`,
2. the active `Response.status` will generally move to `amended` or to implementation-specific workflow around amendment editing,
3. the processor **SHOULD** tag subsequent events with an `amendmentRef`,
4. and the processor **SHOULD** record `response.amended` when the amended version is durably completed.

### 11.2 Migration across definition versions

If a saved response is migrated to a newer Formspec definition version, the original event history **MUST** remain interpretable in terms of the original pinned versions.

The migrating processor:

- **MUST** preserve prior events and their original pinned version tuple,
- **SHOULD** record `response.migrated`,
- **SHOULD** include migration provenance such as `fromDefinitionVersion`, `toDefinitionVersion`, and migration map identifier,
- **SHOULD** mark migration-generated change entries with `valueClass = migration-derived` and an appropriate `reasonCode`.

### 11.3 Interaction with changelog semantics

When a migration depends on a structural changelog or field map, the processor **SHOULD** retain a reference to the changelog or migration artifact used.

This specification does not define the migration format itself; it only defines how migration outcomes are captured in respondent history.

### 11.4 Response corrections

A `response.correction-recorded` event records an additive factual correction to
a prior submitted response. It **MUST NOT** rewrite, delete, or reinterpret the
prior event. The corrected fields are preserved alongside the original values
so a Trellis verifier can produce a correction-preservation report without
granting mutation authority to the verifier.

The event **MUST** carry:

- `recordKind = "responseCorrection"`;
- `data.correctionTargetEventHash`, the hash of the prior submitted response
  event being corrected;
- `data.correctedFieldSet`, a non-empty set of RFC 6901 JSON Pointers into the
  prior submitted response;
- `data.fieldValues[]`, where each `path` **MUST** appear in
  `correctedFieldSet` and each row preserves `originalValue` and
  `correctedValue`;
- `data.reason`, a respondent-visible correction rationale;
- `data.authorizationRef`, a neutral reference to the authorizing act that
  permitted the correction. It may be an algorithm-prefixed hash, URI, or
  implementation-local reference. The Respondent Ledger records the reference
  without owning workflow governance semantics.

The corrected field set is a declared subset, not an open-ended amendment. If a
proposed change affects determination content or fields outside the declared
subset, it is an amendment or supersession under the stack amendment contract,
not a `ResponseCorrection`.

### 11.5 Offline authoring profile

The offline authoring profile covers events that become locally durable before
the processor can submit them to the authoritative service.

A ledger with pending offline work **SHOULD** include `offlineAuthoring`:

- `state` — one of `online`, `pending-local`, `syncing`, `synced`, or
  `conflict`;
- `pendingSince` — when the current local buffer first became durable;
- `lastLocalAuthoredAt` — the most recent `occurredAt` authored locally;
- `lastSyncedAt` — the last server acceptance timestamp, when known;
- `bufferedEventCount` — number of locally durable events not yet accepted by
  the server;
- `firstBufferedSequence` / `lastBufferedSequence` — buffered sequence range,
  when `bufferedEventCount > 0`;
- `chainConstruction` — currently `local-linear`.

Offline events **MUST** preserve authored time. On delayed submit, a server may
set or update acceptance metadata outside the event, but it **MUST NOT** rewrite
`occurredAt` to server receipt time. `recordedAt` remains the time the
processor durably recorded the event; implementations that need a separate
server receipt time **SHOULD** store it outside the canonical event bytes or in
a namespaced extension that is already part of the local canonicalization
profile.

For `chainConstruction = "local-linear"`, buffered events are ordered by their
local durable sequence. Each event's `priorEventHash` points to the immediately
preceding locally canonical event hash, or `null` for the first event in a new
chain. A server **MUST NOT** rebase the hash chain during sync. If the server
cannot accept the chain as submitted, it **MUST** record a rejection or conflict
state instead of silently rewriting event bytes.

---

## 12. Storage and retention model

### 12.1 Storage separation

Implementations **SHOULD** store the ledger separately from the canonical response snapshot even if they expose them together through one API.

Rationale:

- response retrieval remains simple,
- ledger retention and privacy controls can evolve independently,
- append-only guarantees are easier to enforce,
- and integrity sealing can occur without mutating the response body.

### 12.2 Append-only requirement

Ledger events **MUST** be append-only from a logical semantics perspective.

Implementations **MAY** compact, archive, or move physical storage, but they **MUST NOT** rewrite event meaning in a way that misrepresents history.

If an implementation must suppress sensitive historical content after the fact, it **MUST** do so in a way that preserves clear evidence of redaction or policy-based minimization.

### 12.3 Retention and redaction

Implementations **SHOULD** define retention classes for ledger content such as:

- full raw values,
- hashed prior values,
- human-readable summaries,
- integrity-only stubs,
- and legally preserved immutable copies.

When values are redacted or compacted, the implementation **SHOULD** preserve:

- the fact that a change occurred,
- the path and item identity,
- the event timestamp,
- the actor and source category,
- and the policy basis for redaction where disclosable.

---

## 13. Integrity checkpoints

### 13.1 Purpose

A `LedgerCheckpoint` provides optional tamper-evident sealing for a contiguous range of ledger events.

### 13.2 Minimum fields

A checkpoint **SHOULD** contain:

- `checkpointId`
- `ledgerId`
- `fromSequence`
- `toSequence`
- `batchHash`
- `signedAt`

### 13.3 Recommended fields

A checkpoint **MAY** also include:

- `previousCheckpointHash`
- `signature`
- `keyId`
- `anchorRef`
- `algorithm`

### 13.4 Integrity behavior

If `integrityProfile = "chained"` or `"trellis-wrapped"`:

- each retained event **MUST** carry both `priorEventHash` and `eventHash`;
- `priorEventHash` is `null` only for the first event in the chain;
- each checkpoint **SHOULD** seal an ordered contiguous event range,
- checkpoint anchoring **MAY** reference an external organizational audit ledger, transparency log, or notarization service.

`integrityProfile = "none"` means the ledger has no integrity-chain promise and
events **MAY** omit both hashes. A ledger that emits either hash on any retained
event is a chained ledger for that event stream and **MUST** declare
`integrityProfile = "chained"` or `"trellis-wrapped"` before conformance is
claimed.

This specification does not mandate any specific signature suite or external
anchor. The optional `trellis-wrapped` profile value is retained for
compatibility and stack composition, but this base specification assigns only
the response-ledger hash obligations above. Trellis envelope, export, and
certificate checks live in Trellis profile validators.

---

## 14. Recommended JSON shape

The following non-exhaustive example shows one possible document layout:

```json
{
  "$formspecRespondentLedger": "0.1",
  "ledgerId": "ledger-018f6f2f",
  "responseId": "resp-8d0b1e85",
  "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
  "definitionVersion": "2.3.0",
  "status": "completed",
  "createdAt": "2026-03-22T09:00:12Z",
  "lastEventAt": "2026-03-22T10:41:03Z",
  "eventCount": 6,
  "headEventId": "evt-0006",
  "events": [
    {
      "eventId": "evt-0001",
      "sequence": 1,
      "eventType": "session.started",
      "occurredAt": "2026-03-22T09:00:12Z",
      "recordedAt": "2026-03-22T09:00:12Z",
      "responseId": "resp-8d0b1e85",
      "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
      "definitionVersion": "2.3.0",
      "actor": { "kind": "respondent", "id": "usr-17" },
      "source": { "kind": "web", "channelId": "public-portal" }
    },
    {
      "eventId": "evt-0002",
      "sequence": 2,
      "eventType": "prepopulation.applied",
      "occurredAt": "2026-03-22T09:00:14Z",
      "recordedAt": "2026-03-22T09:00:14Z",
      "responseId": "resp-8d0b1e85",
      "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
      "definitionVersion": "2.3.0",
      "actor": { "kind": "system", "id": "eligibility-importer" },
      "source": { "kind": "system-job", "channelId": "prepopulation" },
      "changes": [
        {
          "op": "set",
          "path": "applicant.lastName",
          "itemKey": "applicant_last_name",
          "valueClass": "prepopulated",
          "after": "Rivera",
          "reasonCode": "parent-record-hydration"
        }
      ]
    },
    {
      "eventId": "evt-0003",
      "sequence": 3,
      "eventType": "draft.saved",
      "occurredAt": "2026-03-22T09:14:27Z",
      "recordedAt": "2026-03-22T09:14:27Z",
      "responseId": "resp-8d0b1e85",
      "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
      "definitionVersion": "2.3.0",
      "actor": { "kind": "respondent", "id": "usr-17" },
      "source": { "kind": "web", "channelId": "public-portal" },
      "changes": [
        {
          "op": "replace",
          "path": "household.members[1].monthlyIncome",
          "itemKey": "member_monthly_income",
          "valueClass": "user-input",
          "before": 2400,
          "after": 2800,
          "reasonCode": "user-edit"
        }
      ],
      "validationSnapshot": {
        "valid": false,
        "counts": { "error": 1, "warning": 0, "info": 0 },
        "generatedAt": "2026-03-22T09:14:27Z"
      }
    },
    {
      "eventId": "evt-0004",
      "sequence": 4,
      "eventType": "attachment.added",
      "occurredAt": "2026-03-22T09:31:08Z",
      "recordedAt": "2026-03-22T09:31:08Z",
      "responseId": "resp-8d0b1e85",
      "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
      "definitionVersion": "2.3.0",
      "actor": { "kind": "respondent", "id": "usr-17" },
      "source": { "kind": "web", "channelId": "public-portal" },
      "priorEventHash": "sha256:0e5df0b2c0f30d7e4c5a2d4c8a6c4fffe1c9dfc9aa7b7b64d2f5e14591f7d009",
      "eventHash": "sha256:72df6b4f6ff78ec1f41f43a5c68a1be2114e7338e25a7bde7a7258f5b8bb0fb9",
      "attachmentBinding": {
        "attachment_id": "att_resp-8d0b1e85_documents_paystub_0",
        "slot_path": "documents.paystub[0]",
        "media_type": "application/pdf",
        "byte_length": 43821,
        "attachment_sha256": "sha256:1f74d3a1e85f2f7a6df1e7cf8a580f2e9b5c17231ce0a91d89d8e3bb18c3e19a",
        "payload_content_hash": "sha256:e796c89473ca5db95c63050683cb05b971b8815380e847ef560d32f805459fe6",
        "filename": "paystub-march.pdf",
        "prior_binding_hash": null
      },
      "changes": [
        {
          "op": "add",
          "path": "documents.paystub[0]",
          "itemKey": "documents_paystub",
          "valueClass": "attachment",
          "after": {
            "blobRef": "blob-8aa3",
            "name": "paystub-march.pdf",
            "sha256": "1f74..."
          },
          "reasonCode": "respondent-upload"
        }
      ]
    },
    {
      "eventId": "evt-0005",
      "sequence": 5,
      "eventType": "response.submit-attempted",
      "occurredAt": "2026-03-22T10:40:02Z",
      "recordedAt": "2026-03-22T10:40:02Z",
      "responseId": "resp-8d0b1e85",
      "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
      "definitionVersion": "2.3.0",
      "actor": { "kind": "respondent", "id": "usr-17" },
      "source": { "kind": "web", "channelId": "public-portal" },
      "validationSnapshot": {
        "valid": true,
        "counts": { "error": 0, "warning": 1, "info": 0 },
        "generatedAt": "2026-03-22T10:40:02Z"
      }
    },
    {
      "eventId": "evt-0006",
      "sequence": 6,
      "eventType": "response.completed",
      "occurredAt": "2026-03-22T10:41:03Z",
      "recordedAt": "2026-03-22T10:41:03Z",
      "responseId": "resp-8d0b1e85",
      "definitionUrl": "https://forms.example.gov/intake/housing-assistance",
      "definitionVersion": "2.3.0",
      "actor": { "kind": "respondent", "id": "usr-17" },
      "source": { "kind": "web", "channelId": "public-portal" },
      "changes": [
        {
          "op": "status-transition",
          "path": "$response.status",
          "valueClass": "system-derived",
          "before": "in-progress",
          "after": "completed",
          "reasonCode": "submit-success"
        }
      ],
      "validationSnapshot": {
        "valid": true,
        "counts": { "error": 0, "warning": 1, "info": 0 },
        "generatedAt": "2026-03-22T10:41:03Z"
      }
    }
  ]
}
```

---

## 15. Implementation guidance

### 15.1 Timeline UX

Implementations exposing the ledger to respondents or support staff **SHOULD** render a timeline that:

- groups atomic field changes into save/submit/amendment moments,
- labels prepopulation distinctly from user edits,
- distinguishes attachment mutations from ordinary field edits,
- and shows validation state at save or submit boundaries.

### 15.2 Diff generation

To generate changesets efficiently, implementations **SHOULD** compare the last durable response snapshot to the new durable response snapshot and emit only material deltas.

In `field-level` changelog mode, the same snapshot-diff mechanism **SHOULD** emit one `ChangeSetEntry` per changed response path at the durable boundary. The implementation may coalesce UI activity, but it must not coalesce two different persisted field paths into an uninspectable summary if it claims field-level capture.

### 15.3 Support and dispute workflows

Implementations **SHOULD** be able to answer at least these audit questions from the ledger:

- when the draft was first created,
- when it was resumed,
- which fields materially changed and in what direction,
- when field-level mode is enabled, which durable response paths changed in each edit batch,
- whether the submission was amended after completion,
- what validation state existed at save or submit,
- and whether attachment inventory changed.

### 15.4 Interoperability recommendation

Processors exchanging ledgers across systems **SHOULD** keep raw implementation-specific metadata in namespaced `extensions` fields and preserve unknown extension content on round-trip.

---

## 15A. Recommended deployment profiles

This specification intentionally allows different configurations. Implementations **SHOULD** choose an explicit deployment profile rather than partially enabling features ad hoc.

### 15A.1 Profile A — local/server ledger only

Use this when the goal is respondent history, supportability, and ordinary draft/resume/submit flows.

Recommended characteristics:

- response and ledger stored in ordinary application custody,
- no external anchoring requirement,
- no identity proofing requirement beyond local auth controls,
- value minimization enabled for sensitive prior values.

### 15A.2 Profile B — pseudonymous integrity-anchored ledger

Use this when continuity and tamper-evidence matter, but legal identity disclosure should remain optional.

Recommended characteristics:

- stable `subjectRef` used for continuity,
- signed checkpoints and platform-ledger anchoring enabled,
- response payload may remain off-chain while commitments are anchored,
- identity proofing remains optional and separately attached.

### 15A.3 Profile C — identity-bound high-assurance ledger

Use this when eligibility, regulated workflows, delegated signing, or legal attestations require stronger personhood or identity proofing.

Recommended characteristics:

- `identity-verified` / `attestation.captured` events enabled where policy requires them,
- `privacyTier`, `assuranceLevel`, and `selectiveDisclosureProfile` explicitly governed,
- identity evidence externalized behind protected references rather than embedded raw payloads,
- stronger checkpoint, export, and proof controls enabled according to deployment policy.

Processors **SHOULD NOT** force Profile C requirements into Profile A or B deployments, because doing so would over-collect identity data and make low-friction respondent history harder to adopt.

## 16. Conformance summary

A processor claiming conformance to the Respondent Ledger add-on:

1. **MUST** preserve Formspec `Response` as the canonical current-state document.
2. **MUST** keep ledger history additive and append-only in meaning.
3. **MUST** record exact `definitionUrl` and `definitionVersion` on every event.
4. **MUST** support the required event types defined in this specification when those lifecycle moments occur.
5. **MUST** represent material changes using `ChangeSetEntry` objects with `op`, `path`, and `valueClass`.
6. **MAY** support field-level editing changelog mode; if it claims that mode, it **MUST** declare `changelogMode = "field-level"`, populate `changelogBoundaries`, and emit a `ChangeSetEntry` for each persisted response field path changed at each declared durable boundary.
7. **MUST NOT** require keystroke-level telemetry.
8. **MUST NOT** alter Formspec core semantics through ledger data.
9. **SHOULD** preserve validation snapshots at save, submit, amendment, and stop boundaries.
10. **SHOULD** preserve provider-neutral identity / proof-of-personhood attestation references when those facts are used for completion, delegation, or eligibility-sensitive processing.
11. **SHOULD** support privacy-bounded retention using hashes, summaries, or redaction metadata where necessary.
12. **MUST** enforce `integrityProfile` hash obligations when chaining or Trellis wrapping is declared, and **SHOULD** support checkpointing for higher-assurance environments.

---

## 17. Open follow-on work

This draft intentionally leaves several adjacent deliverables for subsequent work:

- example mappings from existing product audit tables into the canonical ledger model,
- conformance fixtures that exercise the companion schemas,
- canonicalization guidance for hash/signature generation,
- and concrete disclosure-profile registries for export and review workflows.

Companion JSON Schemas for the top-level ledger document and standalone event object are now provided at `schemas/respondent-ledger.schema.json` and `schemas/respondent-ledger-event.schema.json`. Those schemas are intended to encode the canonical wire shape defined here; they do not narrow the broader normative model beyond the constraints stated in this document.

### 17.1 Changelog

- **0.2.0-draft (2026-04-15)** — Added normative L1–L4 assurance taxonomy (§6.6.1); promoted §6.7 to a normative independence invariant between disclosure tier and assurance level; added §6.8 distinguishing authored signatures from recorded attestations; added §2.4 legal-sufficiency disclosure. The wire-format literal `$formspecRespondentLedger` is unchanged at `"0.1"`; a wire-format version bump is a separate compatibility decision.
- **0.1.0-draft (2026-03-22)** — Initial draft.
