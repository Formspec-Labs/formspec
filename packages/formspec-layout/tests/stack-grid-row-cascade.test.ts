/**
 * @filedesc Ensures layout primitives exclude `formspec-stack.grid-row` from forced column flex (USWDS adapter combines both classes on one node),
 * and that the default skin's rhythm rule for the same stack keeps the same `:not(.grid-row)` guard (ADR 0064 decision 3 — gaps live in the skin,
 * not the structural sheet, but the specificity trick that keeps USWDS's own `.grid-row.grid-gap` gap winning travels with the selector).
 *
 * **Computed-style truth:** `tests/storybook/uswds-grant-story-dom.spec.ts` probes the live Storybook iframe at
 * `examples-uswds-grant-form--with-uswds-adapter` and asserts `getComputedStyle(.formspec-stack.grid-row).flexDirection === 'row'`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

describe('formspec-stack + USWDS grid-row (source contract)', () => {
    it('vertical stack column flex is scoped with :not(.grid-row)', () => {
        const testDir = dirname(fileURLToPath(import.meta.url));
        const primitivesPath = join(testDir, '../src/styles/layout.primitives.css');
        const css = readFileSync(primitivesPath, 'utf8');
        // Comments (e.g. "Match specificity of `.formspec-stack:not(.grid-row)` above…") mention the
        // selector in prose without declaring a rule for it — strip them before counting rule occurrences.
        const codeOnly = css.replace(/\/\*[\s\S]*?\*\//g, '');

        const notGridIdx = codeOnly.indexOf('.formspec-stack:not(.grid-row)');
        expect(notGridIdx, 'primitives must scope column stack to :not(.grid-row)').toBeGreaterThan(-1);

        const slice = codeOnly.slice(notGridIdx, notGridIdx + 400);
        expect(slice).toContain('flex-direction: column');

        // Structure only: the gap rule for this selector no longer lives in primitives (ADR 0064 decision 3).
        const secondNotGrid = codeOnly.indexOf('.formspec-stack:not(.grid-row)', notGridIdx + 1);
        expect(secondNotGrid, 'primitives must not repeat :not(.grid-row) for a gap rule').toBe(-1);
    });

    it('default skin rhythm rule for the stack keeps the same :not(.grid-row) guard', () => {
        const testDir = dirname(fileURLToPath(import.meta.url));
        const basePath = join(testDir, '../src/styles/default.base.css');
        const css = readFileSync(basePath, 'utf8');

        const notGridIdx = css.indexOf('.formspec-stack:not(.grid-row)');
        expect(notGridIdx, 'default skin gap rule must also use :not(.grid-row)').toBeGreaterThan(-1);
        expect(css.slice(notGridIdx, notGridIdx + 120)).toContain('gap:');
    });
});
