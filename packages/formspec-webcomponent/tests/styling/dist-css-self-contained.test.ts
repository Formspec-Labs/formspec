/** @filedesc The CSS this package ships must stand alone — bundlers copy it without following @import or url(). */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PKG = resolve(__dirname, '../..');
const SCRIPT = resolve(PKG, '../../scripts/copy-layout-css-assets.mjs');

let layoutCss: string;
let defaultCss: string;

beforeAll(() => {
    // Run the package's own build step, so this asserts the emitted bytes rather than the sources.
    const out = mkdtempSync(join(tmpdir(), 'formspec-css-'));
    execFileSync(process.execPath, [SCRIPT, 'src', out, '../formspec-layout/src'], { cwd: PKG });
    layoutCss = readFileSync(join(out, 'formspec-layout.css'), 'utf8');
    defaultCss = readFileSync(join(out, 'formspec-default.css'), 'utf8');
});

describe('built CSS', () => {
    it('leaves no @import behind', () => {
        expect(layoutCss).not.toMatch(/@import/);
        expect(defaultCss).not.toMatch(/@import/);
    });

    it('references no external url()', () => {
        expect(layoutCss).not.toMatch(/url\(\s*(?!['"]?data:)/);
        expect(defaultCss).not.toMatch(/url\(\s*(?!['"]?data:)/);
    });

    it('carries the structural rules in formspec-layout.css', () => {
        expect(layoutCss).toContain('.formspec-hidden');
        expect(layoutCss).toContain('@media');
    });

    it('carries the skin, and only the skin, in formspec-default.css', () => {
        expect(defaultCss).toContain('.formspec-field {');
        // The element links formspec-layout.css for every adapter — the skin must not repeat it.
        expect(defaultCss).not.toContain('.formspec-hidden {');
    });
});
