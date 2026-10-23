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
    noExternal: [
        'canonicalize',
        '@noble/hashes',
        'sanitize-html',
        'marked',
        'dompurify',
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
