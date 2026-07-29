# Quarantined v10 signature evidence

The v10 browser-signature evidence remains unchanged as spike history:

- `signature-verification.json`
- `../../lifecycle-demo-v10/evidence/stage-4-signoff.authored-signature.json`

Neither file is a production conformance vector for the
[Signed Surface Bundle Profile 1.0](../../../specs/bundle/surface-bundle-signing-profile.md).
The spike uses
`formspec.spike-v10.bundle-export.signed-payload.v1`, accepts public-key bytes
from the signature sidecar, and reports unsigned signer metadata. Those choices
showed that the existing COSE and WebCrypto path could detect mutation. They do
not prove publisher authorization, app authorization, or rollback protection.

Production evidence lives in
`packages/formspec-surface-bundle-signing/tests/fixtures/adversarial-vectors.json`
and its package tests. Keep these historical files byte-for-byte unchanged.
