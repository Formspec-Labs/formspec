import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { gotoHarness, mountDefinition } from './helpers/harness';

const ROOT = path.resolve(__dirname, '../../../');
const FIXTURE_DIR = path.join(ROOT, 'tests/e2e/fixtures/kitchen-sink-holistic');
const DEFINITION_V1 = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'definition.v1.json'), 'utf8'));
const THEME = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'theme.json'), 'utf8'));
const COMPONENT = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'component.json'), 'utf8'));

function normalizeDefinitionForEngine(definition: any): any {
  const normalized = JSON.parse(JSON.stringify(definition));
  if (normalized.optionSets && typeof normalized.optionSets === 'object') {
    for (const [key, value] of Object.entries(normalized.optionSets as Record<string, any>)) {
      if (value && typeof value === 'object' && Array.isArray((value as any).options)) {
        normalized.optionSets[key] = (value as any).options;
      }
    }
  }
  return normalized;
}

test.describe('Kitchen Sink Holistic UI Coverage', () => {
  test('component + theme runtime works with wizard and data-table flows', async ({ page }) => {
    await gotoHarness(page);
    await mountDefinition(page, normalizeDefinitionForEngine(DEFINITION_V1));
    await page.evaluate(
      ({ themeDoc, componentDoc }) => {
        const renderer: any = document.querySelector('formspec-render');
        renderer.skipScreener();
        renderer.themeDocument = themeDoc;
        renderer.componentDocument = componentDoc;
      },
      { themeDoc: THEME, componentDoc: COMPONENT }
    );

    await expect(page.locator('.formspec-wizard')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
    await page.fill('input[name="fullName"]', 'Component User');
    await page.locator('.formspec-wizard-next').click();
    await expect(page.locator('h2', { hasText: 'Financial' })).toBeVisible();
    await page.locator('button.formspec-datatable-add').click();

    const repeatCount = await page.evaluate(() => {
      const renderer: any = document.querySelector('formspec-render');
      return renderer.getEngine().repeats.lineItems.value;
    });
    expect(repeatCount).toBeGreaterThanOrEqual(2);
  });

  test('component `when` stays distinct from core `relevant`', async ({ page }) => {
    const componentDoc = JSON.parse(JSON.stringify(COMPONENT));
    const profileChildren = componentDoc?.tree?.children?.[0]?.children?.[0]?.children;
    if (!Array.isArray(profileChildren)) {
      throw new Error('Unexpected component fixture shape for when-vs-relevant test');
    }
    const conditionalGroup = profileChildren.find((node: any) => node?.component === 'ConditionalGroup');
    if (!conditionalGroup) {
      throw new Error('ConditionalGroup fixture not found');
    }
    conditionalGroup.when = "profileMode = 'advanced'";

    await gotoHarness(page);
    await mountDefinition(page, normalizeDefinitionForEngine(DEFINITION_V1));
    await page.evaluate(
      ({ themeDoc, nextComponentDoc }) => {
        const renderer: any = document.querySelector('formspec-render');
        renderer.skipScreener();
        renderer.themeDocument = themeDoc;
        renderer.componentDocument = nextComponentDoc;
      },
      { themeDoc: THEME, nextComponentDoc: componentDoc }
    );

    // Case A: when=false + relevant=true => UI hidden but data still participates.
    await page.selectOption('select[name="profileMode"]', 'basic');
    await page.locator('input[name="vipEnabled"]').check();
    await page.evaluate(() => {
      const renderer: any = document.querySelector('formspec-render');
      renderer.getEngine().setValue('vipCode', 'WHEN-HIDDEN');
    });
    await expect(page.locator('input[name="vipCode"]')).toBeHidden();

    const whenFalseRelevantTrue = await page.evaluate(() => {
      const renderer: any = document.querySelector('formspec-render');
      const engine = renderer.getEngine();
      const input = document.querySelector('input[name="vipCode"]') as HTMLInputElement | null;
      const fieldWrapper = input?.closest('.formspec-field');
      const whenWrapper = input?.closest('.formspec-when');
      const response = engine.getResponse({ profile: 'on-submit' });
      return {
        whenHidden: whenWrapper?.classList.contains('formspec-hidden') ?? null,
        fieldHidden: fieldWrapper?.classList.contains('formspec-hidden') ?? null,
        relevant: engine.relevantSignals.vipCode?.value ?? null,
        hasVipCode: Object.prototype.hasOwnProperty.call(response.data, 'vipCode'),
        vipCode: response.data.vipCode,
      };
    });

    expect(whenFalseRelevantTrue.whenHidden).toBe(true);
    expect(whenFalseRelevantTrue.fieldHidden).toBe(false);
    expect(whenFalseRelevantTrue.relevant).toBe(true);
    expect(whenFalseRelevantTrue.hasVipCode).toBe(true);
    expect(whenFalseRelevantTrue.vipCode).toBe('WHEN-HIDDEN');

    // Case B: when=true + relevant=false => definition-level relevance suppresses participation.
    await page.selectOption('select[name="profileMode"]', 'advanced');
    await page.locator('input[name="vipEnabled"]').uncheck();
    await expect(page.locator('input[name="vipCode"]')).toBeHidden();

    const whenTrueRelevantFalse = await page.evaluate(() => {
      const renderer: any = document.querySelector('formspec-render');
      const engine = renderer.getEngine();
      const input = document.querySelector('input[name="vipCode"]') as HTMLInputElement | null;
      const fieldWrapper = input?.closest('.formspec-field');
      const whenWrapper = input?.closest('.formspec-when');
      const response = engine.getResponse({ profile: 'on-submit' });
      return {
        whenHidden: whenWrapper?.classList.contains('formspec-hidden') ?? null,
        fieldHidden: fieldWrapper?.classList.contains('formspec-hidden') ?? null,
        relevant: engine.relevantSignals.vipCode?.value ?? null,
        hasVipCode: Object.prototype.hasOwnProperty.call(response.data, 'vipCode'),
      };
    });

    expect(whenTrueRelevantFalse.whenHidden).toBe(false);
    expect(whenTrueRelevantFalse.fieldHidden).toBe(true);
    expect(whenTrueRelevantFalse.relevant).toBe(false);
    expect(whenTrueRelevantFalse.hasVipCode).toBe(false);
  });
});
