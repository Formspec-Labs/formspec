/** @filedesc E2E for the theme RepeatCards presentation: one card per instance, add, remove, Locale row text. */
import { test, expect } from '@playwright/test';
import { gotoHarness } from './helpers/harness';

const DEFINITION = {
    $formspec: '1.0',
    url: 'urn:test:repeat-cards',
    version: '1.0.0',
    title: 'Weekly certification',
    items: [
        {
            key: 'jobs',
            type: 'group',
            label: 'Job',
            repeatable: true,
            minRepeat: 1,
            maxRepeat: 3,
            children: [
                { key: 'employer', type: 'field', dataType: 'string', label: "Employer's name" },
                { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours worked' },
            ],
        },
    ],
};

const THEME = {
    $formspecTheme: '1.0',
    version: '1.0.0',
    items: { jobs: { widget: 'RepeatCards' } },
};

const LOCALE = {
    $formspecLocale: '2.0',
    locale: 'en',
    version: '1.0.0',
    target: { kind: 'definition', url: 'urn:test:repeat-cards' },
    strings: {
        'jobs.rowLabel': 'Job {{@index}}',
        'jobs.addLabel': 'Add another job',
        'jobs.removeLabel': 'Remove this job',
    },
};

async function mountCards(page: import('@playwright/test').Page) {
    await gotoHarness(page);
    await page.evaluate(({ definition, theme, locale }) => {
        const renderer: any = document.querySelector('formspec-render');
        renderer.themeDocument = theme;
        renderer.localeDocuments = locale;
        renderer.locale = 'en';
        renderer.definition = definition;
    }, { definition: DEFINITION, theme: THEME, locale: LOCALE });
    await page.waitForSelector('.formspec-card');
}

test.describe('RepeatCards', () => {
    test('draws one card per job and grows by one on Add', async ({ page }) => {
        await mountCards(page);

        await expect(page.locator('.formspec-card')).toHaveCount(1);
        await expect(page.locator('.formspec-card-title').first()).toHaveText('Job 1');
        await expect(page.locator('.formspec-repeat-add')).toHaveText('Add another job');

        await page.locator('.formspec-repeat-add').click();
        await expect(page.locator('.formspec-card')).toHaveCount(2);
        await expect(page.locator('.formspec-card-title').nth(1)).toHaveText('Job 2');
        // Add lands the person in the new row, not back at the top of the form.
        await expect(page.locator('.formspec-card').nth(1).locator('input').first()).toBeFocused();
    });

    test('removes the card a person asked to remove, and its data with it', async ({ page }) => {
        await mountCards(page);
        await page.locator('.formspec-repeat-add').click();

        await page.locator('.formspec-card').nth(0).locator('input').first().fill('ACME CORP');
        await page.locator('.formspec-card').nth(1).locator('input').first().fill('GLOBEX');
        await expect(page.locator('.formspec-repeat-remove')).toHaveCount(2);

        await page.locator('.formspec-repeat-remove').nth(0).click();
        await expect(page.locator('.formspec-card')).toHaveCount(1);
        await expect(page.locator('.formspec-card input').first()).toHaveValue('GLOBEX');

        const data = await page.evaluate(() => {
            const renderer: any = document.querySelector('formspec-render');
            return renderer.getEngine().getResponse().data;
        });
        expect(data.jobs).toHaveLength(1);
        expect(data.jobs[0].employer).toBe('GLOBEX');
    });

    test('hides Add at maxRepeat and drops Remove at minRepeat', async ({ page }) => {
        await mountCards(page);

        await expect(page.locator('.formspec-repeat-remove')).toHaveCount(0);
        await page.locator('.formspec-repeat-add').click();
        await page.locator('.formspec-repeat-add').click();
        await expect(page.locator('.formspec-card')).toHaveCount(3);
        await expect(page.locator('.formspec-repeat-add')).toBeHidden();
    });
});
