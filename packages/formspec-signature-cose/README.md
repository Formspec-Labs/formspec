# `@formspec/signature-cose`

Formspec's response and receipt signing bindings over
`@formspec-org/integrity-cose`. The generic package owns COSE encoding, decoding,
and protected-header checks; this package owns the distinct Formspec method URI
prefixes and the existing `protectedHeaderBytes` public name.

`FORMSPEC_SIG_METHOD_URI_PREFIX` selects response signatures.
`FORMSPEC_RECEIPT_METHOD_URI_PREFIX` selects receipt signatures. Pass the expected
prefix to `decodeCoseSign1WithMethodUri` or `extractMethodUri`: cross-domain reuse
must fail. The WebCrypto facade consumes the response prefix from this package,
so callers do not repeat the namespace literal.

This binding layer stays because those namespaces express Formspec profile
meaning. It adds no signature algorithm and does not replace the generic COSE
implementation. The signature-method registry and receipt-signing profile own
which exact methods and signed bytes are supported.

```js
import {
  decodeCoseSign1WithMethodUri,
  FORMSPEC_SIG_METHOD_URI_PREFIX,
} from '@formspec/signature-cose';

const { cose, methodUri } = decodeCoseSign1WithMethodUri(
  signatureBytes,
  FORMSPEC_SIG_METHOD_URI_PREFIX,
);
```

The package ships native ESM JavaScript and declarations. Import its package
root; source and private build paths are not public exports. In the repository,
`npm run build:signatures` builds the signature family in dependency order and
`npm run test:signature-packages` checks actual tarballs in an isolated consumer.
