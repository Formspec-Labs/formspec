# `@formspec/signature-port`

The Formspec-facing signature verifier API. It re-exports the generic
`@formspec-org/integrity-signature-port` types and helpers so Formspec callers
share the same verifier requests, receipts, registry types and key resolver.
It introduces no cryptographic implementation or alternate receipt shape.

```ts
import { StaticKeyResolver, keyRefKid } from '@formspec/signature-port';
import type { Verifier, VerificationReceipt } from '@formspec/signature-port';
```

The package ships native ESM JavaScript and declarations through its root
export. `npm run build:signatures` builds the family; `npm run
test:signature-packages` verifies packed packages in an isolated consumer.
