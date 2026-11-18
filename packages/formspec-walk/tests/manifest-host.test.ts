/** @filedesc Run emitted manifest specs on two synthetic host routes and inspect the CLI summary. */
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { renderHostPage } from '@formspec-org/webcomponent/host';
import { expect, it } from 'vitest';

it('attributes a host-only axe violation to the visit form and keeps both forms’ walk results', async () => {
    const fixture = resolve(__dirname, 'fixtures/manifest');
    const scratch = mkdtempSync(join(process.env.FORMSPEC_WALK_TEST_SCRATCH ?? tmpdir(), 'manifest-host-'));
    const pages = new Map(['contact', 'visit'].map(id => {
        const definition = JSON.parse(readFileSync(join(fixture, id + '.json'), 'utf8'));
        const html = renderHostPage({ definition });
        return [id, id === 'visit' ? html.replace('</body>', '<button id="unnamed"></button></body>') : html];
    }));
    const host = createServer((request, response) => {
        const body = pages.get(request.url!.slice(1));
        response.writeHead(body ? 200 : 404, { 'Content-Type': 'text/html' }).end(body);
    });
    try {
        await new Promise<void>(ready => host.listen(0, '127.0.0.1', ready));
        symlinkSync(resolve(__dirname, '../../../node_modules'), join(scratch, 'node_modules'), 'dir');
        writeFileSync(join(scratch, 'package.json'), '{"type":"module"}');
        writeFileSync(join(scratch, 'playwright.config.mjs'), 'export default { testDir: "./specs", workers: 1 };');
        const cli = (...args: string[]) => promisify(execFile)(process.execPath,
            [resolve(__dirname, '../bin/formspec-walk.mjs'), ...args], { cwd: scratch });
        await cli('emit', '--manifest', join(fixture, 'package-manifest.json'), '--all', '--out-dir', 'specs',
            '--url-template', `http://127.0.0.1:${(host.address() as AddressInfo).port}/{formId}`, '--axe',
            '--from', resolve(__dirname, '../dist/index.js'));
        await expect(cli('test', '--summary', 'summary.json')).rejects.toMatchObject({ code: 1 });
        const summary = JSON.parse(readFileSync(join(scratch, 'summary.json'), 'utf8'));
        expect(summary).toMatchObject({ status: 'failed', executed: 8, errors: [] });
        const byId = new Map<string, any>(summary.forms.map((form: any) => [form.formId, form]));
        for (const id of ['contact', 'visit']) {
            const form = byId.get(id);
            expect(form.tests).toHaveLength(4);
            expect(form.tests.every((test: any) => test.attempts.length === 1)).toBe(true);
            expect(form.axe).toHaveLength(1);
            expect(form.axe[0].status).toBe('completed');
        }
        expect(byId.get('contact').axe[0].violations.some((v: any) => v.rule === 'button-name')).toBe(false);
        expect(byId.get('visit').axe[0].violations).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'button-name' })]));
        expect(byId.get('visit').uncovered).toEqual(expect.arrayContaining([expect.stringContaining('place: constraint')]));

        // A host fallback that serves the contact form at the visit URL must produce a failed scan.
        pages.set('visit', pages.get('contact')!);
        await expect(cli('test', 'visit.spec.ts', '--grep', 'axe accessibility', '--summary', 'wrong-form.json'))
            .rejects.toMatchObject({ code: 1 });
        const refused = JSON.parse(readFileSync(join(scratch, 'wrong-form.json'), 'utf8'));
        expect(refused.forms[0]).toMatchObject({ formId: 'visit', axe: [
            { status: 'failed', failure: { message: expect.stringContaining('urn:example:visit') } },
        ] });
    } finally {
        host.close();
        rmSync(scratch, { recursive: true, force: true });
    }
});
