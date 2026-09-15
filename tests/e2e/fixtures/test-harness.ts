/** @filedesc E2E test harness entry point: registers formspec-render and exposes engine globals. */
import { FormspecRender } from '../../../packages/formspec-webcomponent/src/index';
// Import from the same package path as formspec-webcomponent so both share
// a single WASM module instance. Using relative source paths would create a
// separate module graph entry and the webcomponent would see uninitialized WASM.
import {
    FormEngine,
    assembleDefinitionSync,
    initFormspecEngine,
    initFormspecEngineTools,
    isFormspecEngineInitialized,
    createFormEngine,
    tokenizeFEL,
} from '@formspec-org/engine';

customElements.define('formspec-render', FormspecRender);

const renderer = document.createElement('formspec-render');
document.getElementById('app')?.appendChild(renderer);
(window as any).renderer = renderer;

// Expose engine utilities for E2E tests
(window as any).FormEngine = FormEngine;
(window as any).assembleDefinitionSync = assembleDefinitionSync;

// Initialize WASM eagerly so browser tests can assert the Rust runtime is available.
initFormspecEngine().then(() => {
    console.log('[formspec] Engine initialized successfully');
    (window as any).__wasmReady = true;
}).catch((err) => {
    console.warn('[formspec] Engine initialization failed:', err);
    (window as any).__wasmReady = false;
});

// Expose readiness check and factory for tests
(window as any).isFormspecEngineInitialized = isFormspecEngineInitialized;
(window as any).createFormEngine = createFormEngine;
/** For Playwright WASM split tests (tools load after explicit init). */
(window as any).initFormspecEngineTools = initFormspecEngineTools;
(window as any).tokenizeFEL = tokenizeFEL;
