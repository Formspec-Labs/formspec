/** @filedesc The walk runner cannot turn zero execution or collection failures into a pass. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
const cli = path.resolve(__dirname, '../bin/formspec-walk.mjs');
const config = path.resolve(__dirname, 'fixtures/runner/playwright.config.ts');
function run(grep: string, args: string[] = [], duplicate = false) {
    return spawnSync(process.execPath, [cli, 'test', '--config', config, '--grep', `${grep}$`, ...args], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8', env: { ...process.env, WALK_RUN_DUPLICATE: duplicate ? '1' : '' },
    });
}
it('runs a passing test through the installed Playwright runner', () => {
    const result = run('pass');
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('1 passed');
});
it('fails ordinary test failures', () => { expect(run('failure').status).not.toBe(0); });
it('fails an all-skipped run', () => {
    const result = run('skip');
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('no tests executed');
});
it('fails empty discovery even with Playwright pass-with-no-tests and a reporter override', () => {
    const result = run('absent', ['--pass-with-no-tests', '--reporter=dot']);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('no tests executed');
});
it('preserves collection failures when no tests ran', () => {
    const result = run('duplicate', [], true);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('duplicate test title');
});

it('lists tests without requiring execution', () => {
    const result = run('pass', ['--list']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('1 test');
});

it('allows a shard with no assigned tests', () => {
    const result = run('pass', ['--shard=2/2']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
});

it('still fails an all-skipped nonempty shard', () => {
    const result = run('skip', ['--shard=1/1']);
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('no tests executed');
});

it.each([
    ['list', ['--list'], 0],
    ['empty shard', ['--shard=2/2'], 0],
    ['all skipped', ['--grep=skip$'], 1],
] as const)('supports a directly configured reporter: %s', (_name, args, status) => {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.resolve('@playwright/test/cli')),
        'test', '--config', config, ...args], {
        cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
        env: { ...process.env, WALK_DIRECT_REPORTER: path.resolve(__dirname, '../dist/reporter.js') },
    });
    expect(result.status, result.stdout + result.stderr).toBe(status);
});

it('retains interrupted and timed-out outcomes without promoting them to failure or success', async () => {
    const { default: Reporter } = await import('../src/reporter.js');
    for (const status of ['failed', 'interrupted', 'timedout'] as const) {
        const reporter = new Reporter();
        expect(await reporter.onEnd({ status, startTime: new Date(), duration: 1 })).toBeUndefined();
    }
});
