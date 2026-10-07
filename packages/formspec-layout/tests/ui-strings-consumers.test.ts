/** @filedesc Chrome keys have framework consumers or exercised public-hook host scenarios. */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { UI_STRINGS } from '../src/index.js';

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Every renderer source file: the web component, the adapters, and the React renderer. */
function rendererSources(): string[] {
    const roots = ['formspec-webcomponent/src', 'formspec-adapters/src', 'formspec-react/src', 'formspec-layout/src'];
    const walk = (dir: string): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const path = join(dir, entry.name);
            if (entry.isDirectory()) return walk(path);
            return /\.tsx?$/.test(entry.name) ? [path] : [];
        });
    // Not the inventory itself: it names every key by definition, which would make this test vacuous.
    return roots
        .flatMap((root) => walk(join(PACKAGES, root)))
        .filter((file) => !file.endsWith('ui-strings.ts'));
}

describe('chrome keys have framework consumers or exercised public-hook host scenarios', () => {
    it('finds every $ui key in a framework renderer or a concrete public-hook call', () => {
        const sources = rendererSources().map((file) => readFileSync(file, 'utf8')).join('\n');
        // Only concrete calls in the public-host scenario count; assertions and key lists do not.
        const hostScenario = readFileSync(join(PACKAGES, 'formspec-react/tests/ui-chrome-strings.test.tsx'), 'utf8');
        const exercised = new Set([...hostScenario.matchAll(/chrome\('([^']+)'(?:,|\))/g)].map(match => match[1]));
        const declared = Object.keys(UI_STRINGS);
        const orphans = declared.filter((key) => !sources.includes(`'${key}'`) && !exercised.has(key));
        expect(orphans, 'declared but read by no renderer').toEqual([]);
    });
});
