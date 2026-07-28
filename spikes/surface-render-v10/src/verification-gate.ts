/**
 * @filedesc Host-owned render permission derived from verification context.
 */

export type VerificationVerdict = 'verified' | 'failed' | 'unverified';
export type VerificationDeployment = 'verifying' | 'authoring-preview';

export function canonicalVerificationVerdict(
  adapterResult: 'verified' | 'failed' | 'unsupported',
): VerificationVerdict {
  return adapterResult === 'unsupported' ? 'unverified' : adapterResult;
}

/**
 * Decide whether bundle-derived output may render.
 *
 * A signed input requires `verified` in every deployment. An unsigned input may
 * render only in an authoring preview that labels it `unverified`.
 */
export function hostMayRenderBundle(input: {
  deployment: VerificationDeployment;
  signed: boolean;
  verdict: VerificationVerdict;
}): boolean {
  if (input.signed) return input.verdict === 'verified';
  return input.deployment === 'authoring-preview' && input.verdict === 'unverified';
}
