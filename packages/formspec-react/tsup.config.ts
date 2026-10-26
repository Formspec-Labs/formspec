import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        hooks: 'src/hooks.ts',
        'semantic-controls': 'src/semantic-controls.ts',
    },
    format: ['esm', 'cjs'],
    // CJS too: without it each CJS entry embeds its own copy of src/context.tsx,
    // so a root FormspecProvider and a `/hooks` hook see different contexts.
    splitting: true,
    dts: true,
    sourcemap: true,
    clean: true,
    // ESM-only dependencies are bundled so the CJS output can require them.
    // CommonJS dependencies (sanitize-html, and postcss beneath it) stay
    // external: bundled into the ESM output, their require("path") throws.
    noExternal: [
        'canonicalize',
        '@noble/hashes',
        'marked',
    ],
    external: [
        'react',
        'react-dom',
        '@preact/signals-core',
        '@formspec-org/engine',
        '@formspec-org/layout',
        '@formspec-org/types',
    ],
});
