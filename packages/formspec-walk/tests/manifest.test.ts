/** @filedesc A package manifest emits checks for each host route and preserves their evidence. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import WalkReporter from '../src/reporter.js';

const dirs: string[] = [];
function scratch() {
    const dir = mkdtempSync(join(process.env.FORMSPEC_WALK_TEST_SCRATCH ?? tmpdir(), 'manifest-'));
    dirs.push(dir);
    return dir;
}
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    delete process.env.FORMSPEC_WALK_SUMMARY;
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

it('reports attempts, structured evidence and global errors with the run verdict', async () => {
    const path = join(scratch(), 'summary.json');
    process.env.FORMSPEC_WALK_SUMMARY = path;
    const reporter = new WalkReporter();
    const attachment = (name: string, data: unknown) => ({ name, body: Buffer.from(JSON.stringify(data)) });
    const result = { status: 'failed', retry: 0, errors: [{ message: 'failed assertion' }], attachments: [
        attachment('formspec-walk', { findings: ['wrong label'], uncovered: ['remote options'] }),
        attachment('formspec-axe', { status: 'failed', failure: { reason: 'pages' } }),
    ] };
    const test = { title: 'label', titlePath: () => ['contact', 'label'], outcome: () => 'unexpected',
        annotations: [{ type: 'formspec-form', description: 'contact' }, { type: 'formspec-uncovered', description: 'static gap' }],
        results: [result], location: { file: 'contact.spec.ts' } };
    reporter.onBegin({} as never, { allTests: () => [test] } as never);
    reporter.onTestEnd(test as never, result as never);
    reporter.onError({ message: 'worker failed' });
    await reporter.onEnd({ status: 'failed' } as never);
    const summary = JSON.parse(readFileSync(path, 'utf8'));
    expect(summary).toMatchObject({ status: 'failed', errors: ['worker failed'], forms: [{
        formId: 'contact', findings: ['wrong label'], uncovered: ['static gap', 'remote options'],
        axe: [{ status: 'failed', failure: { reason: 'pages' } }],
        tests: [{ outcome: 'unexpected', attempts: [{ status: 'failed', errors: ['failed assertion'] }] }],
    }] });
});
