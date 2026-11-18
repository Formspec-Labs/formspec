/** @filedesc A package manifest emits checks for each host route and preserves their evidence. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const dirs: string[] = [];
function scratch() {
    const dir = mkdtempSync(join(process.env.FORMSPEC_WALK_TEST_SCRATCH ?? tmpdir(), 'manifest-'));
    dirs.push(dir);
    return dir;
}
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function emit(dir: string, ...args: string[]) {
    return spawnSync(process.execPath, [resolve(__dirname, '../bin/formspec-walk.mjs'), 'emit',
        '--manifest', resolve(__dirname, 'fixtures/manifest/package-manifest.json'), '--all',
        '--url-template', '/preview/{slug}?form={formId}', '--out-dir', dir, ...args], { encoding: 'utf8' });
}

it('emits the authored checks and optional axe pass on both host URLs', () => {
    const dir = scratch();
    const result = emit(dir, '--axe');
    expect(result.status, result.stderr).toBe(0);
    expect(readdirSync(dir).sort()).toEqual(['contact.spec.ts', 'visit.spec.ts']);
    const visit = readFileSync(join(dir, 'visit.spec.ts'), 'utf8');
    expect(visit).toContain('/preview/book-visit?form=visit');
    expect(visit).toContain('Meeting place');
    expect(visit).toContain('checkAccessibility(page');
    expect(visit).toContain('needs a violating value');
    expect(readFileSync(join(dir, 'contact.spec.ts'), 'utf8')).toContain('/preview/contact-us?form=contact');
    expect(emit(dir).status).toBe(0);
    expect(readFileSync(join(dir, 'visit.spec.ts'), 'utf8')).not.toContain('checkAccessibility(page');
});

it('refuses a locale absent from an all-forms request before writing specs', () => {
    const dir = scratch();
    const result = emit(dir, '--locale', 'en');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('visit): no Locale document for en');
    expect(readdirSync(dir)).toEqual([]);
});
