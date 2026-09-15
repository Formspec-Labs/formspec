/** @filedesc Vitest configuration for the formspec-webcomponent package (happy-dom environment). */
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        // The element links its adapter + theme stylesheets; tests assert the links, never the bytes.
        environmentOptions: { happyDOM: { settings: { disableCSSFileLoading: true } } },
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/setup.mjs'],
    },
});
