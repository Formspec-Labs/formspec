/** @filedesc Playwright can collect emitted specs with duplicate and truncated authored labels. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { derivePlan, emitSpec } from '../src/index.js';

it('collects every generated test rather than refusing duplicate titles', () => {
    const field = (key: string, label: string) => ({ key, type: 'field', dataType: 'choice', label, options: [{ value: 'a', label: 'Agency' }] });
    const long = 'A long shared question prefix '.repeat(5);
    const definition = { $formspec: '1.0', url: 'urn:test:emitted-titles', version: '1.0.0', title: 'Titles', items: [
        { key: 'a', type: 'group', label: 'Indicators', children: [field('comments', 'Comments')] },
        { key: 'b', type: 'group', label: 'Indicators', children: [field('comments', 'Comments')] },
        { key: 'c', type: 'group', label: 'Indicators (b)', children: [field('comments', 'Comments')] },
        field('x', `${long}one`), field('y', `${long}two`),
        { key: 'u', type: 'group', children: [field('same', 'Shared')] },
        { key: 'v', type: 'group', children: [field('same', 'Shared')] },
    ] } as never;
    const scratch = mkdtempSync(join(process.env.FORMSPEC_WALK_TEST_SCRATCH ?? tmpdir(), 'walk-collection-'));
    try {
        const spec = emitSpec(derivePlan(definition), definition, { url: 'http://127.0.0.1:1', source: 'titles', command: 'emit', from: resolve(__dirname, '../dist/index.js') });
        writeFileSync(join(scratch, 'emitted.spec.mts'), spec.replace("from '@playwright/test'", `from '${fileURLToPath(import.meta.resolve('@playwright/test'))}'`));
        const config = join(scratch, 'playwright.config.mjs');
        writeFileSync(config, `export default ${JSON.stringify({ testDir: scratch, testMatch: '*.spec.mts', reporter: 'list' })};`);
        const collected = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('@playwright/test/cli')), 'test', '--config', config, '--list'], { encoding: 'utf8' });
        expect(collected.status, collected.stdout + collected.stderr).toBe(0);
        expect(collected.stdout).toContain('Total: 9 tests in 1 file');
    } finally { rmSync(scratch, { recursive: true, force: true }); }
});
