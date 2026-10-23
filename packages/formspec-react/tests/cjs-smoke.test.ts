import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const currentDir = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(currentDir, '../dist');

describe('CommonJS / CRA-style consumer compatibility (fs-oc8z)', () => {
    it('successfully requires root CJS entry', () => {
        const rootPkg = require(resolve(distDir, 'index.cjs'));
        expect(rootPkg).toBeDefined();
        expect(typeof rootPkg.FormspecForm).toBe('function');
        expect(typeof rootPkg.FormspecProvider).toBe('function');
        expect(typeof rootPkg.useSignal).toBe('function');
        expect(typeof rootPkg.useForm).toBe('function');
        expect(typeof rootPkg.renderSanitizedMarkdown).toBe('function');
    });

    it('successfully requires hooks CJS entry', () => {
        const hooksPkg = require(resolve(distDir, 'hooks.cjs'));
        expect(hooksPkg).toBeDefined();
        expect(typeof hooksPkg.useForm).toBe('function');
        expect(typeof hooksPkg.useSignal).toBe('function');
    });

    it('successfully requires semantic-controls CJS entry', () => {
        const scPkg = require(resolve(distDir, 'semantic-controls.cjs'));
        expect(scPkg).toBeDefined();
        expect(typeof scPkg.createSemanticControlRegistry).toBe('function');
    });
});
