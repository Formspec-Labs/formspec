import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        hooks: 'src/hooks.ts',
        'semantic-controls': 'src/semantic-controls.ts',
    },
    format: ['esm', 'cjs'],
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
