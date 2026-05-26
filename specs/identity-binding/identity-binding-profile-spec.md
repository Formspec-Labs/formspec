---
title: Formspec Identity Binding Profile
version: 1.0.0-draft.1
date: 2026-05-25
depends_on:
  - specs/core/spec.md
---

# Formspec Identity Binding Profile v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Schema:** `schemas/identity-binding-profile.schema.json` (`https://formspec.org/schemas/identity-binding-profile/1.0`)
**Companion to:** Formspec Response authored signatures, Respondent Ledger identity attestation, Signature Method Registry, ADR-0140 identity attestation, ADR-0143 WebAuthn signature-method profile, and formspec-web ADR-0007 `IdentityProvider`

## Status of This Document

This document defines the SC-4 Identity Binding Profile sidecar. It declares how
a deployment binds identity evidence from an identity provider, passkey
ceremony, credential wallet, or agent registry into provider-neutral Formspec
identity surfaces.

The first normative binding is the WebAuthn/FIDO2/passkey profile needed by
FW-0031 passkey-first signing. The profile uses the WebAuthn challenge as an
assent-and-identity binding to the existing Formspec signed-payload digest. It
does not claim that WebAuthn directly signs the Formspec document bytes.

## Prior-Art Pass

The shape is deliberately narrow and composes existing contracts:

- WebAuthn Level 3 defines relying-party scoped public-key credentials,
  client-supplied `clientDataJSON`, authenticator-supplied `authenticatorData`,
  and `userVerification` requirements:
  <https://www.w3.org/TR/webauthn-3/>.
- ADR-0140 defines the normalized identity-attestation fields Formspec,
  WOS, and Trellis share.
- ADR-0143 defines the WebAuthn/passkey signature-method profile, including the
  `formspec.webauthn.challenge.v1` challenge domain separator and the split
  between native WebAuthn assertion evidence and server-attested validation
  evidence.
- formspec-web ADR-0007 defines the `IdentityProvider` port and requires
  provider-native identity payloads to be normalized before downstream use.

## 1. Purpose and Scope

An Identity Binding Profile document lets a Definition or deployment say which
identity-binding profiles are available and how processors map their evidence
into existing Formspec fields.

In scope:

- local profile identifiers and purposes;
- allowed subject kind (`human`, `agent`, `organization`, `device`, `service`,
  or `x-*`);
- provider-neutral binding method family;
- assurance floor and optional NIST IAL/AAL/FAL floor;
- existing Formspec evidence-field bindings;
- WebAuthn relying-party, origin, user-verification, challenge, artifact, and
  Response-field bindings;
- optional FW-0048 composition hint for dual-passkey duress credentials.

Out of scope:

- provider tokens, OIDC claims, WebAuthn assertion bytes, credential private
  material, passkey enrollment UX, or credential recovery;
- a new Response, Respondent Ledger, SignatureArtifact, ValidationArtifact, or
  Trellis bundle wire format;
- signature verification algorithms beyond the WebAuthn challenge-binding
  profile stated here;
- jurisdiction-specific legal sufficiency or identity-proofing policy.

## 2. Document Structure

An Identity Binding Profile document is JSON identified by
`$formspecIdentityBindingProfile: "1.0"` and validated by
`schemas/identity-binding-profile.schema.json`.

Required fields:

| Field | Meaning |
|---|---|
| `$formspecIdentityBindingProfile` | Document type and spec-version marker. |
| `version` | Version of this profile document. |
| `profileId` | Stable URI for this profile document. |
| `targetDefinition` | Formspec Definition this sidecar applies to. |
| `profiles` | One or more identity-binding profiles. |

Each `profiles[]` row declares:

- `id`, unique within the document;
- `purpose`, such as `respondent-signature`, `filer-authentication`,
  `reviewer-authentication`, `agent-filing`, or `session-continuity`;
- `subjectKind`, identifying the class of subject the profile may bind;
- `bindingMethod`, identifying the provider-neutral method family;
- `assuranceFloor`, using the existing provider-neutral assurance taxonomy;
- `evidenceBindings`, naming the existing Formspec fields where evidence
  references and normalized binding output land;
- method-specific configuration such as `webAuthn` when
  `bindingMethod: "webauthn"`.

## 3. Evidence Binding Discipline

The sidecar records bindings to existing Formspec surfaces. It MUST NOT carry
provider-native tokens or method-native cryptographic evidence. Identity Binding
Profile documents are closed sidecars: they do not define `extensions` slots at
the document, profile, or method-specific level, because arbitrary extension
payloads could smuggle raw WebAuthn assertions, credential identifiers, provider
tokens, or other native evidence under innocuous keys.

For every profile:

- `evidenceBindings.identityClaimEvidenceRef` MUST be
  `IdentityClaim.evidenceRef`;
- `evidenceBindings.authoredSignatureIdentityBinding` MUST be
  `AuthoredSignature.identityBinding`;
- `evidenceBindings.externalAttestationRef` MUST be
  `AuthoredSignature.identityBinding.externalAttestationRef`;
- `evidenceBindings.ledgerAttestationEvidenceRef`, when present, MUST be
  `RespondentLedger.identityAttestation.evidenceRef`.

The profile describes where evidence is referenced. The evidence itself lives in
provider, signature-artifact, validation-artifact, ledger, or bundle records
owned by their existing contracts.

## 4. WebAuthn Binding

A profile with `bindingMethod: "webauthn"` MUST include a `webAuthn` object.

The WebAuthn binding declares:

- `rpId`, the relying-party identifier expected by verification;
- `origins`, the HTTPS origin allowlist for `clientDataJSON.origin`;
- `userVerification: "required"`, so the authenticator performs per-act local
  user verification;
- optional `credentialRegistryRef`, which maps credential IDs to normalized
  subject identity, assurance metadata, and any deployment-side credential
  labels;
- `challengeBinding`, which defines how the WebAuthn challenge is bound to
  Formspec signed-payload identity;
- `assertionBinding`, which references the upstream artifact kinds that carry
  native WebAuthn evidence and verifier verdicts.

`rpId` MUST be a WebAuthn relying-party identifier, not a URL. It MUST be a
host-like domain name such as `springfield.gov`; `localhost` is allowed for
local development. It MUST NOT include a scheme, path, query, fragment,
whitespace, or other URL syntax.

Each `origins[]` value MUST be an HTTPS origin only: `https://` plus host and an
optional port. It MUST NOT include a path, query, fragment, credentials, or
non-HTTPS scheme.

Each origin host MUST be inside the RP ID scope: it MUST equal `rpId` or be a
subdomain of `rpId`. The only local-development exception is `rpId:
"localhost"`, which allows `https://localhost` origins with optional ports. This
profile does not authorize unrelated-origin WebAuthn Level 3 related-origin
validation; deployments that need that feature require a future explicit profile
field and verifier rule.

The WebAuthn profile MUST NOT embed `authenticatorData`, `clientDataJSON`,
`signature`, `credentialId`, `attestationObject`, or raw provider tokens in the
sidecar. Those bytes belong in `SignatureArtifact(kind="webauthn")` or related
evidence records.

## 5. Challenge Binding

For SC-4 WebAuthn profiles, `clientDataJSON.challenge` is the base64url-encoded
SHA-256 digest of a JCS canonical structure:

`base64url(sha-256(jcs(canonicalChallengeStructure)))`.

The canonical challenge structure MUST include:

- domain separator `formspec.webauthn.challenge.v1`;
- `AuthoredSignature.signedPayload.digest`;
- expected origin;
- expected RP ID;
- signer identifier;
- signing-intent URI;
- fresh single-use nonce;
- posture snapshot identifier;
- signature-method registry snapshot identifier.

This binding means the passkey ceremony proves passkey-backed assent to the
existing Formspec signed-payload digest. It does not make WebAuthn a COSE_Sign1
replacement and does not change the signed-payload profile.

## 6. Artifact and Response Bindings

The SC-4 WebAuthn profile pins these artifact bindings:

| Field | Required value |
|---|---|
| `webAuthn.assertionBinding.signatureMethod` | `urn:formspec:sig-method:webauthn-fido2@1` |
| `webAuthn.assertionBinding.signatureArtifactKind` | `webauthn` |
| `webAuthn.assertionBinding.validationArtifactKind` | `webauthn-server-attestation` |
| `webAuthn.assertionBinding.responseIdentityBindingMethod` | `webauthn` |

`SignatureArtifact(kind="webauthn")` is the cryptographic-truth record: it
stores the authenticator assertion bytes. `ValidationArtifact(kind="webauthn-server-attestation")`
is a server verdict for downstream consumers that need a verifier-attested
COSE-shaped artifact. The Identity Binding Profile references those contracts;
it does not define either artifact.

`AuthoredSignature.identityBinding.method` uses the existing Response
provider-neutral method value `webauthn`.

## 7. Coercion-Aware Composition

`webAuthn.duressCredentialSupport` is an optional composition hint for FW-0048.

`unsupported` means the provider does not advertise a duress-credential
convention. `dual-passkey-convention` means the provider's credential registry
can distinguish normal and duress credentials after a standard WebAuthn
ceremony. This is a convention on top of WebAuthn, not a WebAuthn protocol
extension.

The SC-4 sidecar does not route duress signals, define recipient keys, or alter
receipt visibility. FW-0048/FW-0059 and downstream Trellis/WOS routing own those
semantics.

## 8. Agent and Filer Identity

Profiles may declare `purpose: "agent-filing"` or
`purpose: "filer-authentication"` and may set `subjectKind: "agent"` or another
non-human subject class. This is how FW-0058-style agent identity and FW-0037
filer identity reuse the same binding discipline without inventing parallel
provider-specific payloads.

The profile only declares the evidence binding. Authorization, role authority,
case admission, and legal capacity are separate host or WOS concerns.

## 9. Conformance

A conforming Identity Binding Profile processor:

1. MUST validate the sidecar against
   `schemas/identity-binding-profile.schema.json`.
2. MUST reject a `bindingMethod: "webauthn"` profile that omits `webAuthn`.
3. MUST reject a `webAuthn` profile whose `userVerification` is not `required`.
4. MUST reject a `webAuthn` profile whose `rpId` is not a host-like WebAuthn RP
   ID or is expressed as a URL.
5. MUST reject a `webAuthn` profile whose origins are not HTTPS origins, or that
   include path, query, fragment, credentials, or non-origin URL syntax.
6. MUST reject a profile that embeds raw WebAuthn assertion bytes or provider
   tokens as sidecar fields or inside any `extensions` payload.
7. MUST bind WebAuthn challenges through
   `formspec.webauthn.challenge.v1` and
   `AuthoredSignature.signedPayload.digest`.
8. MUST treat `duressCredentialSupport` only as a discovery/composition hint,
   not as routing, receipt, or safety-team policy.
9. MUST NOT infer identity proofing, signer authority, or legal sufficiency from
   profile conformance alone.
