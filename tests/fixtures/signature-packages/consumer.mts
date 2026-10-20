/** @filedesc NodeNext type consumer of installed public signature declarations. */
import { WebCryptoVerifier, type WebCryptoVerifierOptions } from '@formspec/signature-adapter-webcrypto';
import { decodeCoseSign1, FORMSPEC_SIG_METHOD_URI_PREFIX, type CoseSign1 } from '@formspec/signature-cose';
import { keyRefRawPublicKey, uri, type Verifier, type VerifyRequest, type VerificationReceipt, type SignatureMethodRegistry } from '@formspec/signature-port';

const options: WebCryptoVerifierOptions = { methodUriPrefix: FORMSPEC_SIG_METHOD_URI_PREFIX };
const verifier: Verifier = new WebCryptoVerifier(options);
export function verify(request: VerifyRequest, registry: SignatureMethodRegistry): Promise<VerificationReceipt> {
  return verifier.verify(request, registry);
}
export function decode(bytes: Uint8Array): CoseSign1 {
  return decodeCoseSign1(bytes);
}
export const key = keyRefRawPublicKey(new Uint8Array([1]));
export const method = uri(`${FORMSPEC_SIG_METHOD_URI_PREFIX}ed25519-cose-sign1@1`);
