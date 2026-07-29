# Quarantined v10 signature evidence

`signature-verification.json` is the frozen browser measurement captured by
commit `84f41b84e43c4a6aa0a3edda02fcef193f3a2bd1`. Keep that file byte-for-byte
unchanged. It measured these exact Git objects:

| Input | Git blob | Raw SHA-256 |
|---|---|---|
| Stage-4 bundle export | `f8cfe5b4f8ea23101c1ca4cafc41f6589c576f3b` | `3c9de7925fbc6190f6a3e0fc9129d177bbe4e4a432fdce1f6df6227049592353` |
| Stage-4 authored signature | `a855ecaf7fcc993357e328f61df2f80e7fbd2d91` | `4cb695def9b831756dc33c6648505225256eb7a87c0351922ab4ecf37579abc0` |
| Browser measurement | `475cfc9418709f0406d0376cf447c736b2022987` | `d5826a1b4c92bb95e4f3211802f349fd22863265445edc5a50fad5dfdd962029` |

The lifecycle spike regenerates its stage-4 paths, so those live files no longer
identify the historical browser run. The Git objects above preserve the old
inputs. `signature-verification-current.json` records a fresh browser run against
the current stage-4 bytes, including both raw input hashes.

Neither browser measurement is a production conformance vector for the
[Signed Surface Bundle Profile 1.0](../../../specs/bundle/surface-bundle-signing-profile.md).
The spike uses
`formspec.spike-v10.bundle-export.signed-payload.v1`, accepts public-key bytes
from the signature sidecar, and reports unsigned signer metadata. Those choices
showed that the existing COSE and WebCrypto path could detect mutation. They do
not prove publisher authorization, app authorization, or rollback protection.

Production evidence lives in
`packages/formspec-surface-bundle-signing/tests/fixtures/adversarial-vectors.json`
and its package tests.
