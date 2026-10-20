/** @filedesc Formspec facade over the generic WebCrypto signature adapter. */

import { FORMSPEC_SIG_METHOD_URI_PREFIX } from '@formspec/signature-cose';

import {
  WebCryptoVerifier as IntegrityWebCryptoVerifier,
  type WebCryptoVerifierOptions,
} from '@formspec-org/integrity-signature-adapter-webcrypto';

export { decodeCoseSign1 } from '@formspec-org/integrity-signature-adapter-webcrypto';
export type { WebCryptoVerifierOptions } from '@formspec-org/integrity-signature-adapter-webcrypto';

const ADAPTER_ID = 'urn:formspec:adapter:webcrypto@1';
const ADAPTER_VERSION = '0.1.0';

export class WebCryptoVerifier extends IntegrityWebCryptoVerifier {
  constructor(options: WebCryptoVerifierOptions = {}) {
    super({
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      methodUriPrefix: FORMSPEC_SIG_METHOD_URI_PREFIX,
      ...options,
    });
  }
}
