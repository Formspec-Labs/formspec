---
title: Formspec WYSIWYS Ceremony
version: 1.0.0-draft.1
date: 2026-05-25
status: draft
---

# Formspec WYSIWYS Ceremony v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Schema:** `schemas/wysiwys-ceremony.schema.json` (`https://formspec.org/schemas/wysiwys-ceremony/1.0`)
**Companion to:** Signature Method Registry, Verification Receipt, ADR-0136 `DocumentArtifact` / `SignatureSurface`, and ADR-0141 rendering-service contracts

## Status of This Document

This document defines the SC-5 WYSIWYS Ceremony sidecar. WYSIWYS means "what you
see is what you sign": the signer sees the exact signature surface whose bytes
are committed by the signature artifact.

This is a UI-requirements annex over existing signature and rendering contracts.
It does not define a new cryptographic signature method, rendering service,
Response wire format, `DocumentArtifact`, or `SignatureSurface`.

## 1. Purpose and Scope

A WYSIWYS Ceremony document declares the signature surfaces and user-action
requirements that a signer ceremony must satisfy before collecting an authored
signature.

In scope:

- ceremony requirements for named ADR-0136 `SignatureSurface` references;
- references to ADR-0136 `DocumentArtifact` identities and hash fields for the signed preimage;
- exact-preimage display requirement;
- scroll-to-end gate;
- per-field affirmative action;
- prohibition of single-click adopt-and-sign;
- prohibition of bulk apply;
- prohibition of typed-name-only as the sole act.

Out of scope:

- cryptographic suite choice;
- COSE, HPKE, or Trellis envelope formats;
- rendering-service implementation;
- biometric, passkey, or identity-provider UX;
- formspec-web runtime behavior.

## 2. Document Structure

A WYSIWYS Ceremony document is JSON identified by
`$formspecWysiwysCeremony: "1.0"` and validated by
`schemas/wysiwys-ceremony.schema.json`.

Required fields:

| Field | Meaning |
|---|---|
| `$formspecWysiwysCeremony` | Document type and spec-version marker. |
| `version` | Version of this ceremony document. |
| `targetDefinition` | Formspec Definition this sidecar applies to. |
| `signatureSurfaces` | One or more named surfaces that can be signed. |

Each signature-surface annex row declares:

- `signatureSurfaceContract: "ADR-0136.SignatureSurface"`;
- `surfaceRef`, which resolves to an existing ADR-0136 `SignatureSurface.surfaceId` or URI;
- `preimageBinding.documentArtifactContract: "ADR-0136.DocumentArtifact"`;
- `preimageBinding.documentArtifactRef`, which resolves to an existing ADR-0136 `DocumentArtifact.artifactId` or `artifactRef`;
- `preimageBinding.hashField`, which is the existing `contentHash` or `presentationHash` field used for the visual preimage commitment;
- `preimageBinding.authoredSignatureBinding: "AuthoredSignature.documentHash"`;
- `requirements.displayExactPreimage: true`;
- `requirements.scrollGate.required: true`;
- `requirements.affirmativeAction.mode: "per-field"`;
- `requirements.singleClickAdoptAndSign: "forbidden"`;
- `requirements.bulkApply: "forbidden"`;
- `requirements.typedNameAsSoleAct: "forbidden"`;
- at least one required ceremony field.

## 3. Exact Preimage

The ceremony MUST display the same ADR-0136 `DocumentArtifact` whose selected
hash field is bound through `AuthoredSignature.documentHash`. If a renderer
produces multiple media variants such as HTML and PDF, the referenced
`DocumentArtifact` determines which artifact is being signed.

The ceremony sidecar does not decide how a renderer computes bytes and does not
define its own digest object. It records the upstream artifact reference and the
upstream hash-field name (`contentHash` or `presentationHash`) the ceremony is
accountable for showing. Rendering-service provenance, when declared, uses the
contract identifier `ADR-0141.RenderingService`.

## 4. Scroll Gate

A signature surface MUST require a scroll gate. The gate completes only after
the signer has had an opportunity to observe the full surface. Implementations
MAY choose `end-of-surface` or `all-pages-observed` completion semantics, but
they MUST NOT collect the signature before the gate is complete.

## 5. Affirmative Action

Every signature or initial field that contributes to the ceremony MUST require a
separate affirmative act. A single click that adopts all fields and signs the
surface is non-conforming.

Typed-name capture MAY be one input to a ceremony, but typed-name-only capture
MUST NOT be the sole affirmative act for a WYSIWYS ceremony.

## 6. Conformance

A conforming WYSIWYS Ceremony processor:

1. MUST validate the sidecar against `schemas/wysiwys-ceremony.schema.json`.
2. MUST reject a ceremony row that does not bind to
   `ADR-0136.SignatureSurface` and `ADR-0136.DocumentArtifact`.
3. MUST reject a ceremony surface that permits bulk apply.
4. MUST reject a ceremony surface that permits single-click adopt-and-sign.
5. MUST reject a ceremony surface whose scroll gate is absent or disabled.
6. MUST reject a ceremony surface with no required ceremony fields.
7. MUST NOT infer cryptographic validity from UI ceremony conformance.
