/**
 * @filedesc Exposes the app's own verification path to the probe script. Spike scaffolding — gap ledger `shell-visual-design`.
 *
 * `evidence/signature-verification.json` claims the signature is checked IN THE
 * BROWSER before shell admission or bundle-derived rendering. The only way to
 * publish that claim honestly is to take the numbers from the running app
 * rather than recompute them in Node with a second implementation that could
 * agree by luck. This hands the probe the app's own
 * `verifyBundleSignature`, including the falsification arm.
 *
 * A real shell exports none of this.
 */
import { bundleExport, INPUT_PATHS } from './bundle-input.ts';
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
    };
  }
}

window.__spikeProbe = {
  verify: verifyBundleSignature,
  isTrustworthy,
  hostMayRenderBundle,
  bundleExport,
  inputPaths: INPUT_PATHS,
};
