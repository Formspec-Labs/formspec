/**
 * @filedesc Guards ADR 0064 decision 3: `layout.primitives.css` owns structure only — gaps and margins
 * are the default skin's rhythm now (`default.base.css` / `default.surfaces.css` / `default.navigation.css`),
 * under the same spacing tokens. A `gap`, `margin`, or `padding` declaration creeping back into the
 * structural sheet is a rhythm regression even when it renders identically today.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

describe('layout.primitives.css carries structure only (ADR 0064 decision 3)', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const primitivesPath = join(testDir, '../src/styles/layout.primitives.css');
    const css = readFileSync(primitivesPath, 'utf8');

    // The sr-only/file-input-hidden clip technique's `margin: -1px` and `padding: 0` are part of
    // hiding an element without `display: none` (so it stays in the accessibility tree) — not rhythm.
    // Strip that one declaration block before scanning for anything else.
    const SR_ONLY_BLOCK = /\.formspec-sr-only,\s*\n\.formspec-file-input-hidden\s*\{[^}]*\}/;

    function stripExemptBlocks(source: string): string {
        const match = source.match(SR_ONLY_BLOCK);
        if (!match) {
            throw new Error('sr-only/file-input-hidden block not found — has it moved or been renamed?');
        }
        return source.slice(0, match.index) + source.slice(match.index! + match[0].length);
    }

    it('has no gap declaration outside the sr-only exemption', () => {
        const scanned = stripExemptBlocks(css);
        expect(scanned).not.toMatch(/\bgap\s*:/);
    });

    it('has no margin declaration outside the sr-only exemption', () => {
        const scanned = stripExemptBlocks(css);
        expect(scanned).not.toMatch(/\bmargin(?:-\w+)?\s*:/);
    });

    it('has no padding declaration outside the sr-only exemption', () => {
        const scanned = stripExemptBlocks(css);
        expect(scanned).not.toMatch(/\bpadding(?:-\w+)?\s*:/);
    });

    it('still exempts the sr-only clip technique itself', () => {
        expect(css).toMatch(/margin:\s*-1px/);
        expect(css).toMatch(/padding:\s*0;/);
    });
});
