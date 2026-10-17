/** @filedesc initFormspecEngine({ wasmBytes }) instantiates from the bytes the host supplies, in a fresh process (a hosted page has no file to read or URL to fetch). */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const init = resolve(root, 'dist/init-formspec-engine.js');
const wasm = resolve(root, 'wasm-pkg-runtime/formspec_wasm_runtime_bg.wasm');
const run = (code) => execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', cwd: root });

test('the supplied bytes are the module that starts', () => {
    const out = run(`
        import { readFileSync } from 'node:fs';
        import { initFormspecEngine, isFormspecEngineInitialized } from ${JSON.stringify(init)};
        await initFormspecEngine({ wasmBytes: readFileSync(${JSON.stringify(wasm)}) });
        console.log(isFormspecEngineInitialized());
    `);
    assert.equal(out.trim(), 'true');
});

test('bytes that are not a wasm module fail the start instead of falling back to the file', () => {
    const out = run(`
        import { initFormspecEngine, isFormspecEngineInitialized } from ${JSON.stringify(init)};
        const failed = await initFormspecEngine({ wasmBytes: new Uint8Array([0, 1, 2, 3]) }).then(() => false, () => true);
        console.log(failed, isFormspecEngineInitialized());
    `);
    assert.equal(out.trim(), 'true false');
});

test('the wasm file is a public export, for page builders that inline it', () => {
    assert.equal(createRequire(import.meta.url).resolve('@formspec-org/engine/wasm-runtime'), wasm);
});
