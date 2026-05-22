/**
 * @filedesc Playwright DOM capture for Examples / USWDS Grant Form — USWDS Adapter.
 * Run: `npm run storybook` then `npx playwright test -c playwright.storybook.config.ts tests/storybook/uswds-grant-story-dom.spec.ts`
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';

const STORY_PATH = '/?path=/story/examples-uswds-grant-form--with-uswds-adapter';

test.describe('USWDS Grant story DOM', () => {
    test('pull preview iframe DOM and pierce formspec-render', async ({ page, baseURL }, testInfo) => {
        const url = `${baseURL}${STORY_PATH}`;
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        await page.getByRole('link', { name: 'USWDS Adapter' }).waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

        const previewFrame = page.frameLocator('iframe[title="storybook-preview-iframe"]');
        await previewFrame.locator('#storybook-root, body').first().waitFor({ state: 'attached', timeout: 30_000 });

        await previewFrame.locator('formspec-render').first().waitFor({ state: 'attached', timeout: 30_000 });
        await previewFrame
            .locator('#field-applicant_section-org_name')
            .first()
            .waitFor({ state: 'attached', timeout: 30_000 });

        const shellReport = await previewFrame.locator('body').evaluate(() => {
            const shadows: Array<{
                hostTag: string;
                hostId: string;
                shadowChildTags: string[];
                shadowInnerHTMLLength: number;
            }> = [];
            const walk = (root: ParentNode) => {
                const els = root.querySelectorAll('*');
                for (const el of els) {
                    if (!(el instanceof Element)) continue;
                    const sr = el.shadowRoot;
                    if (!sr) continue;
                    shadows.push({
                        hostTag: el.tagName.toLowerCase(),
                        hostId: el.id || '',
                        shadowChildTags: [...sr.children].map((c) => c.tagName.toLowerCase()),
                        shadowInnerHTMLLength: sr.innerHTML.length,
                    });
                    walk(sr);
                }
            };
            walk(document.body);
            const root = document.getElementById('storybook-root');
            return {
                bodyHTMLLength: document.body.innerHTML.length,
                storybookRootHTMLLength: root?.innerHTML.length ?? 0,
                storybookRootPreview: (root?.innerHTML ?? '').slice(0, 6000),
                openShadowHosts: shadows,
            };
        });

        const report = await previewFrame.locator('formspec-render').first().evaluate((el: Element) => {
            const fr = el as HTMLElement & { shadowRoot?: ShadowRoot };
            const sr = fr.shadowRoot;
            const pick = (root: ParentNode, sel: string) => root.querySelector(sel);
            const count = (root: ParentNode, sel: string) => root.querySelectorAll(sel).length;

            const org = fr.querySelector('#field-applicant_section-org_name') as HTMLInputElement | null;
            const panels = fr.querySelectorAll('.formspec-wizard-panel');
            const visiblePanel = [...panels].find((p) => !p.classList.contains('formspec-hidden'));

            const stackGridRows = [...fr.querySelectorAll('.formspec-stack.grid-row')].map((row, index) => {
                const cs = getComputedStyle(row);
                return {
                    index,
                    className: row.className,
                    display: cs.display,
                    flexDirection: cs.flexDirection,
                    flexWrap: cs.flexWrap,
                };
            });

            return {
                formspecRender: {
                    childElementCount: fr.childElementCount,
                    innerHTMLLength: fr.innerHTML.length,
                    innerHTMLPreview: fr.innerHTML.slice(0, 4000),
                },
                shadowRoot: sr
                    ? {
                          innerHTMLLength: sr.innerHTML.length,
                          innerHTML: sr.innerHTML,
                      }
                    : null,
                /** Live cascade: USWDS rows must flex in row direction; `column` here matches collapsed grant-form layout. */
                stackGridRowComputedStyles: stackGridRows,
                queriesOnLightDom: {
                    formspecContainer: !!pick(fr, '.formspec-container'),
                    wizard: !!pick(fr, '.formspec-wizard'),
                    wizardPanelCount: count(fr, '.formspec-wizard-panel'),
                    usaSectionCount: count(fr, 'section.usa-section'),
                    usaFormGroupCount: count(fr, '.usa-form-group'),
                    usaInputCount: count(fr, '.usa-input'),
                    stackGridRowCount: stackGridRows.length,
                    orgInputExists: !!org,
                    orgInputName: org?.getAttribute('name') ?? null,
                    orgInputId: org?.id ?? null,
                },
                visibleWizardPanel: visiblePanel
                    ? {
                          className: visiblePanel.className,
                          innerHTMLLength: visiblePanel.innerHTML.length,
                          innerHTML: visiblePanel.innerHTML.slice(0, 25_000),
                      }
                    : null,
            };
        });

        const outDir = path.join(testInfo.outputDir, 'uswds-grant-dom');
        fs.mkdirSync(outDir, { recursive: true });
        const fullReport = { url, shellReport, formspecReport: report };
        fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(fullReport, null, 2), 'utf8');
        fs.writeFileSync(path.join(outDir, 'storybook-root-preview.html'), shellReport.storybookRootPreview, 'utf8');
        if (report.visibleWizardPanel) {
            fs.writeFileSync(
                path.join(outDir, 'visible-wizard-panel-inner.html'),
                report.visibleWizardPanel.innerHTML,
                'utf8'
            );
        }
        fs.writeFileSync(
            path.join(outDir, 'formspec-render-inner-preview.html'),
            report.formspecRender.innerHTMLPreview,
            'utf8'
        );

        await testInfo.attach('uswds-grant-dom-report.json', {
            path: path.join(outDir, 'report.json'),
            contentType: 'application/json',
        });

        expect(report.queriesOnLightDom.orgInputExists, 'Organization Legal Name input should exist').toBe(true);
        expect(report.queriesOnLightDom.wizardPanelCount).toBeGreaterThan(0);
        expect(report.queriesOnLightDom.usaInputCount).toBeGreaterThan(0);
        expect(report.shadowRoot?.innerHTML).toContain('slot');
        expect(report.stackGridRowComputedStyles.length, 'grant form should render USWDS stack rows').toBeGreaterThan(0);

        const firstRow = report.stackGridRowComputedStyles[0];
        expect(
            firstRow.flexDirection,
            'Live Storybook: first .formspec-stack.grid-row must use row flex for USWDS 12-col layout (column = primitives cascade bug).'
        ).toBe('row');

        const themeGridCellClasses = await previewFrame.locator('formspec-render').first().evaluate((fr) => {
            const row = fr.querySelector('.formspec-wizard-panel > .grid-row.grid-gap');
            if (!row) return null;
            return [...row.children].map((c) => (c as HTMLElement).className);
        });
        expect(themeGridCellClasses, 'theme page grid row should exist inside the wizard panel').not.toBeNull();
        expect(themeGridCellClasses![0], 'first applicant region is span 8 → tablet:grid-col-8 on cell').toContain(
            'tablet:grid-col-8',
        );
        expect(themeGridCellClasses![1], 'second region is span 4').toContain('tablet:grid-col-4');

        const usaFormMax = await previewFrame
            .locator('form.usa-form')
            .first()
            .evaluate((el) => getComputedStyle(el).maxWidth);
        const maxPx = parseFloat(usaFormMax);
        expect(
            usaFormMax === 'none' || usaFormMax === '100%' || (Number.isFinite(maxPx) && maxPx >= 500),
            `Live Storybook: .usa-form max-width should not be USWDS mobile cap (~320px); got ${usaFormMax}`
        ).toBe(true);
    });
});
