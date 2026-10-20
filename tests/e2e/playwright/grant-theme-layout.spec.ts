/** @filedesc Actual grant Theme pages remain navigable and retain data across responsive layouts. */
import { expect, test, type Page } from '@playwright/test';
import { loadGrantArtifacts } from '../browser/helpers/grant-app';
import { gotoHarness } from '../browser/helpers/harness';

const titles = ['Applicant Info', 'Project Narrative', 'Budget', 'Project Phases', 'Subcontractors', 'Review & Submit'];

async function mount(page: Page, withComponent = false, withPages = true) {
  const missingAssets: string[] = [];
  page.on('response', response => { if (response.status() === 404) missingAssets.push(response.url()); });
  await page.route('https://api.example.gov/**', route => route.fulfill({ status: 503, body: '{}' }));
  await gotoHarness(page, '/');
  const stylesheet = page.waitForResponse(response => new URL(response.url()).pathname === '/examples/grant-application/grant-bridge.css');
  await page.evaluate(({ definition, theme, component, registry, withComponent, withPages }) => {
    const renderer = (window as any).renderer;
    renderer.registryDocuments = registry;
    renderer.themeDocument = withPages ? theme : { ...theme, pages: undefined };
    renderer.componentDocument = withComponent ? component : null;
    renderer.definition = definition;
    renderer.skipScreener();
  }, { ...loadGrantArtifacts(), withComponent, withPages });
  const css = await stylesheet;
  expect(css.status()).toBe(200);
  expect(css.headers()['content-type']).toContain('text/css');
  await expect(page.locator('.formspec-wizard-panel')).toHaveCount(6);
  await page.evaluate(() => document.fonts.ready);
  return missingAssets;
}

const visiblePanel = (page: Page) => page.locator('.formspec-wizard-panel:not(.formspec-hidden)');

test('Theme-only grant pages preserve data and support navigation across every breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const missingAssets = await mount(page);
  const orgName = page.locator('[data-name="applicantInfo.orgName"] input');
  await orgName.fill('Responsive Grant Organization');
  const region = visiblePanel(page).locator('[style*="grid-column"]').first();
  // Default expanded navigation must not make the new page grid wider than its container.
  expect(await region.evaluate(el => el.getBoundingClientRect().width - el.parentElement!.getBoundingClientRect().width)).toBeLessThan(1);

  for (const [width, placement] of [
    [375, '1 / span 12'], [479, '1 / span 12'], [480, '1 / span 12'],
    [767, '1 / span 12'], [768, '2 / span 10'], [1023, '2 / span 10'],
    [1024, '3 / span 8'], [1279, '3 / span 8'], [1280, '3 / span 8'],
    [767, '1 / span 12'], [375, '1 / span 12'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    if (width < 768 && await page.getByRole('button', { name: 'Collapse navigation' }).count()) {
      await page.getByRole('button', { name: 'Collapse navigation' }).click();
      await expect(page.locator('.formspec-wizard-sidenav')).toHaveCSS('width', '48px');
    }
    await expect(region).toHaveCSS('grid-column', placement);
    await expect(orgName).toHaveValue('Responsive Grant Organization');
    const geometry = await region.evaluate(el => {
      const region = el.getBoundingClientRect();
      const grid = el.parentElement!.getBoundingClientRect();
      return { width: region.width, gridWidth: grid.width, inset: region.left - grid.left, gridColumns: getComputedStyle(el.parentElement!).gridTemplateColumns, regionMinWidth: getComputedStyle(el).minWidth };
    });
    if (width >= 768) {
      expect(geometry.width).toBeLessThan(geometry.gridWidth);
      expect(geometry.inset).toBeGreaterThan(1);
    } else {
      expect(Math.abs(geometry.width - geometry.gridWidth), JSON.stringify({ width, ...geometry })).toBeLessThan(1);
    }
  }

  // Existing breakpoint re-renders reset wizard selection (also reproduced without Theme pages).
  // Re-navigate through the UI and check retained data; page-selection persistence is separate.
  await page.locator('button.formspec-wizard-next').click();
  const projectTitle = page.locator('[data-name="projectNarrative.projectTitle"] input');
  await projectTitle.fill('Responsive project');
  for (const [width, placement] of [[768, '2 / span 10'], [1024, '3 / span 8'], [1280, '3 / span 8'], [375, '1 / span 12']] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.locator('.formspec-wizard-sidenav-item').nth(1).click();
    await expect(visiblePanel(page)).toHaveAttribute('aria-label', 'Project Narrative');
    await expect(region).toHaveCSS('grid-column', placement);
    await expect(projectTitle).toHaveValue('Responsive project');
  }
  await page.locator('button.formspec-wizard-prev').click();

  for (const title of titles) {
    await expect(visiblePanel(page)).toHaveAttribute('aria-label', title);
    if (title !== titles.at(-1)) await page.locator('button.formspec-wizard-next').click();
  }
  for (let step = titles.length - 2; step >= 0; step--) {
    await page.locator('button.formspec-wizard-prev').click();
    await expect(visiblePanel(page)).toHaveAttribute('aria-label', titles[step]);
  }
  await expect(orgName).toHaveValue('Responsive Grant Organization');
  expect(await page.evaluate(() => (window as any).renderer.getEngine().getResponse().data.applicantInfo.orgName))
    .toBe('Responsive Grant Organization');
  expect(missingAssets).toEqual([]);
});

test('explicit grant Component pages keep precedence over Theme pages', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const baselineMissing = await mount(page, true, false);
  const gridGeometry = () => visiblePanel(page).locator('.formspec-grid').evaluateAll(grids => grids.map(el => ({
    columns: getComputedStyle(el).gridTemplateColumns, gap: getComputedStyle(el).columnGap,
    width: el.getBoundingClientRect().width, left: el.getBoundingClientRect().left,
  })));
  const priorColumns = await gridGeometry();
  const missingAssets = await mount(page, true);
  await expect(page.locator('.formspec-wizard-sidenav-label')).toHaveText(titles);
  expect(await gridGeometry())
    .toEqual(priorColumns);
  await page.locator('button.formspec-wizard-next').click();
  await expect(visiblePanel(page)).toHaveAttribute('aria-label', 'Project Narrative');
  await page.locator('button.formspec-wizard-prev').click();
  await expect(visiblePanel(page)).toHaveAttribute('aria-label', 'Applicant Info');
  await expect(page.locator('section[id^="grant-web-"]')).toHaveCount(0);
  expect(baselineMissing).toEqual([]);
  expect(missingAssets).toEqual([]);
});
