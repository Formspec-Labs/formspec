/** @filedesc The host page is one self-contained HTML string: documents inline, nothing that could close the script around them. */
import { describe, expect, it } from 'vitest';
import { renderHostPage } from '@formspec-org/webcomponent/host';

const definition = (title: string) => ({
    $formspec: '1.0', url: 'urn:test:host', version: '1.0.0', status: 'draft', title,
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
}) as never;

describe('host page', () => {
    it('inlines the documents and makes no external reference', () => {
        const html = renderHostPage({ definition: definition('Plain'), locale: 'fr', locales: [] });
        expect(html).toContain('<html lang="fr">');
        expect(html).toContain('id="formspec-host-config"');
        expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/i);
        expect(html).not.toMatch(/https?:\/\/[^"'\s<)]*\.(js|css|wasm)/);
    });

    it('is English when no Locale says otherwise, so the page itself has a language', () => {
        expect(renderHostPage({ definition: definition('Plain') })).toContain('<html lang="en">');
    });

    it('cannot be broken out of by a document that contains </script> or <!--', () => {
        const title = '</script><script>window.pwned=1</script><!-- x';
        const html = renderHostPage({ definition: definition(title) });
        const config = /<script type="application\/json" id="formspec-host-config">([\s\S]*?)<\/script>/.exec(html)![1];
        expect(config).not.toContain('<');
        expect(JSON.parse(config).definition.title).toBe(title);
        expect(html).not.toContain('<script>window.pwned');
        expect(html.match(/<title>[^<]*<\/title>/)![0]).not.toContain('<script');
    });
});

describe('print page', () => {
    const receipt = { heading: 'Submission <receipt>', facts: [{ label: 'Hash', value: 'sha256:"x"' }], verify: 'Compute the SHA-256.' };

    it('shows the receipt after the form, escaped, and only in print mode', () => {
        const printed = renderHostPage({ definition: definition('Plain'), readOnly: true, receipt });
        expect(printed).toContain('<h1 id="formspec-receipt-heading">Submission &#60;receipt&#62;</h1>');
        expect(printed).toContain('<dt>Hash</dt><dd>sha256:&#34;x&#34;</dd>');
        expect(printed.indexOf('formspec-host-root')).toBeLessThan(printed.indexOf('formspec-receipt-heading'));
        expect(printed).toContain('data-formspec-layer="print"');
        const plain = renderHostPage({ definition: definition('Plain'), receipt });
        expect(plain).not.toContain('formspec-receipt-heading');
        expect(plain).not.toContain('data-formspec-layer="print"');
    });
});

describe('host page in a browser', () => {
    it('draws the form from the pinned documents and requests nothing but itself', async () => {
        const { chromium } = await import('@playwright/test');
        const { createServer } = await import('node:http');
        const html = renderHostPage({
            definition: definition('Plain'),
            locales: [{ $formspecLocale: '2.0', version: '1.0.0', locale: 'fr', target: { kind: 'definition', url: 'urn:test:host' }, strings: { 'name.label': 'Nom' } }] as never,
            locale: 'fr',
        });
        const server = createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const browser = await chromium.launch();
        try {
            const page = await browser.newPage();
            const requests: string[] = [];
            page.on('request', (r) => requests.push(r.url()));
            await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
            await page.waitForSelector('html[data-formspec-host]', { state: 'attached' });
            expect(await page.getAttribute('html', 'data-formspec-host')).toBe('ready');
            expect(await page.locator('formspec-render label').first().textContent()).toContain('Nom');
            expect(await page.getAttribute('formspec-render', 'lang')).toBe('fr');
            expect(requests).toHaveLength(1);
        } finally {
            await browser.close();
            server.close();
        }
    });
});
