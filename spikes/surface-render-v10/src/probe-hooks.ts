/**
 * @filedesc Exposes the app's own verification path to the probe script. Spike scaffolding — gap ledger `shell-visual-design`.
 *
 * `evidence/signature-verification-current.json` records that the signature is
 * checked IN THE BROWSER before shell admission or bundle-derived rendering.
 * The only way to publish that claim honestly is to take the numbers from the
 * running app rather than recompute them in Node with a second implementation
 * that could agree by luck. This hands the probe the app's own verifier, exact
 * embedded input text, and falsification arm.
 *
 * A real shell exports none of this.
 */
import { bundleExport, INPUT_PATHS, RAW_INPUTS } from './bundle-input.ts';
import { isTrustworthy, verifyBundleSignature } from './verify.ts';
import { hostMayRenderBundle } from './verification-gate.ts';

declare global {
  interface Window {
    __spikeProbe?: {
      verify: typeof verifyBundleSignature;
      isTrustworthy: typeof isTrustworthy;
      hostMayRenderBundle: typeof hostMayRenderBundle;
      bundleExport: typeof bundleExport;
      inputPaths: typeof INPUT_PATHS;
      rawInputs: typeof RAW_INPUTS;
    };
  }
}

window.__spikeProbe = {
  verify: verifyBundleSignature,
  isTrustworthy,
  hostMayRenderBundle,
  bundleExport,
  inputPaths: INPUT_PATHS,
  rawInputs: RAW_INPUTS,
};
