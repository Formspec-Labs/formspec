/** @filedesc Node ESM consumers can import every built dist entry (no bundled CommonJS require). */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');

/**
 * Imports `entry` in a fresh Node process: vitest resolves `import()` itself, so
 * only a child process sees what a plain `node` ESM consumer sees. A CommonJS
 * dependency bundled into the ESM output fails here with "Dynamic require of …".
 */
function exportTypes(entry: string, names: string[]): Record<string, string> {
    const url = pathToFileURL(resolve(distDir, entry)).href;
    const script = `const m = await import(${JSON.stringify(url)});`
        + `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map((n) => [n, typeof m[n]]))));`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
    return JSON.parse(out);
}

describe('Node ESM consumer compatibility', () => {
    it('imports the root ESM entry', () => {
        expect(exportTypes('index.js', ['FormspecForm', 'FormspecProvider', 'useForm', 'renderSanitizedMarkdown']))
            .toEqual({ FormspecForm: 'function', FormspecProvider: 'function', useForm: 'function', renderSanitizedMarkdown: 'function' });
    });

    it('imports the hooks ESM entry', () => {
        expect(exportTypes('hooks.js', ['useForm', 'useSignal'])).toEqual({ useForm: 'function', useSignal: 'function' });
    });

    it('imports the semantic-controls ESM entry', () => {
        expect(exportTypes('semantic-controls.js', ['createSemanticControlRegistry']))
            .toEqual({ createSemanticControlRegistry: 'function' });
    });
});
