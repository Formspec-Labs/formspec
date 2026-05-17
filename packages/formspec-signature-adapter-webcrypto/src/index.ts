/** @filedesc Formspec facade over the generic WebCrypto signature adapter. */

import {
  WebCryptoVerifier as IntegrityWebCryptoVerifier,
  type WebCryptoVerifierOptions,
} from '@integrity-stack/signature-adapter-webcrypto';

export { decodeCoseSign1 } from '@integrity-stack/signature-adapter-webcrypto';
export type { WebCryptoVerifierOptions } from '@integrity-stack/signature-adapter-webcrypto';

const ADAPTER_ID = 'urn:formspec:adapter:webcrypto@1';
const ADAPTER_VERSION = '0.1.0';
const METHOD_URI_PREFIX = 'urn:formspec:sig-method:';

export class WebCryptoVerifier extends IntegrityWebCryptoVerifier {
  constructor(options: WebCryptoVerifierOptions = {}) {
    super({
      adapterId: ADAPTER_ID,
      adapterVersion: ADAPTER_VERSION,
      methodUriPrefix: METHOD_URI_PREFIX,
      ...options,
    });
  }
}
