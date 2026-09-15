/** @filedesc Every declared `$ui` key has a renderer that asks for it — a key nothing reads is a dead promise. */
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

describe('the chrome inventory has no key without a consumer', () => {
    it('finds every $ui key asked for by name in a renderer', () => {
        const sources = rendererSources().map((file) => readFileSync(file, 'utf8')).join('\n');
        const declared = Object.keys(UI_STRINGS);
        const orphans = declared.filter((key) => !sources.includes(`'${key}'`));
        expect(orphans, 'declared but read by no renderer').toEqual([]);
    });
});
