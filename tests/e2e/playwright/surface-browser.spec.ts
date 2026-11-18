/** @filedesc Native browser navigation and color-scheme checks for Surface. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAxePass, Walk } from '@formspec-org/walk';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { SURFACE_APPEARANCE_SCRIPT } from '../../../packages/formspec-surface-react/src/browser-appearance';

test('hash links survive reload and Back/Forward while section changes preserve the form', async ({ page }) => {
  await page.goto('/surface-browser.html');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Overview – Example filing');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).not.toBeFocused();
  await page.getByRole('link', { name: 'Filing', exact: true }).click();
  await expect(page).toHaveTitle('Filing – Example filing');
  await expect(page.getByRole('heading', { name: 'Filing', exact: true })).toBeFocused();
  const contact = page.getByRole('textbox', { name: 'Contact name' });
  await contact.fill('Example');
  await page.getByRole('link', { name: 'Details' }).click();
  await expect(page).toHaveURL(/#\/filing\/ny\?slot=filing&section=details$/);
  await expect(contact).toHaveValue('Example');
  await page.goBack();
  await expect(page.locator('[data-fixture-section]')).toHaveText('intro');
  await expect(contact).toHaveValue('Example');
  await page.goForward();
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await expect(contact).toHaveValue('Example');
  await page.reload();
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await expect(page.getByRole('link', { name: 'Filing', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('the browser restores appearance and announces one draft save result', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/surface-browser.html#/filing/ny');
  const app = page.locator('.fs-surface-app');
  const form = page.locator('.formspec-container');
  await expect(page.locator('article')).toHaveAttribute('data-tenant-theme', 'admitted');
  await expect(app).toHaveCSS('--formspec-color-primary', '#123456');
  await expect(app).toHaveCSS('--formspec-font-weight-medium', '550');
  await expect(form).toHaveCSS('color-scheme', 'dark');
  await expect(app).toHaveCSS('color-scheme', 'dark');
  await page.getByLabel('Appearance').selectOption('light');
  await page.reload();
  await expect(page.getByLabel('Appearance')).toHaveValue('light');
  await expect(form).toHaveCSS('color-scheme', 'light');
  await expect(app).toHaveCSS('color-scheme', 'light');
  await page.evaluate(() => {
    document.documentElement.dataset.fsAppearance = 'light';
    document.body.dataset.fsAppearance = 'dark';
  });
  await expect(form).toHaveCSS('color-scheme', 'dark');
  await expect(app).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('article')).toHaveCSS('color-scheme', 'dark');
  await page.evaluate(() => document.body.removeAttribute('data-fs-appearance'));
  await expect(form).toHaveCSS('color-scheme', 'light');
  await page.getByRole('button', { name: 'Save draft' }).click();
  const notices = app.locator('[role="status"], [aria-live="polite"]').filter({ hasText: /\S/ });
  await expect(notices).toHaveCount(1);
  await expect(notices).toHaveText('Completed.');
  await expect(form.getByRole('status')).toHaveText('Completed.');
  await page.getByRole('link', { name: 'Staff' }).click();
  await expect(page.locator('article')).toHaveAttribute('data-tenant-theme', 'refused');
  await expect(app).not.toHaveCSS('--formspec-color-primary', '#123456');
  await expect(app).not.toHaveCSS('--formspec-font-weight-medium', '550');
  await expect(notices).toHaveCount(0);
});

test('the head script applies saved appearance before the Surface mounts', async ({ page }) => {
  const css = readFileSync(resolve(__dirname, '../../../packages/formspec-surface-react/src/formspec-surface.css'), 'utf8');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('formspec:surface-appearance:v1', 'dark'));
  await page.route('**/surface-browser.html?prepaint', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><head>
      <script>${SURFACE_APPEARANCE_SCRIPT}</script><style>${css}</style>
      </head><body><div id="root"></div></body></html>`,
  }));
  await page.goto('/surface-browser.html?prepaint');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
  await expect(page.locator('#root')).toBeEmpty();
});

test('hash anchors use native focus and keep the routed form through history and reload', async ({ page }) => {
  await page.goto('/surface-browser.html#/filing/ny?slot=filing&section=details');
  const contact = page.getByRole('textbox', { name: 'Contact name' });
  await contact.fill('Example');
  await page.getByRole('link', { name: 'Skip to report controls' }).click();
  await expect(page).toHaveURL(/#fixture-anchor$/);
  await expect(page.locator('#fixture-anchor')).toBeFocused();
  await expect(contact).toHaveValue('Example');
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.goBack();
  await expect(page).toHaveURL(/#fixture-anchor$/);
  await expect(contact).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
});

test('history links reload under a base path and modified clicks leave the original page', async ({ page, context }) => {
  // Serve the app shell for all document addresses under the history mount.
  await context.route('**/surface-browser-history/**', async route => {
    const url = new URL('/surface-browser.html', route.request().url());
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  await page.goto('/surface-browser-history/');
  const filing = page.getByRole('link', { name: 'Filing', exact: true });
  await expect(filing).toHaveAttribute('href', '/surface-browser-history/filing/ny');
  const modifier = await page.evaluate(() => navigator.platform.startsWith('Mac') ? 'Meta' : 'Control');
  const [opened] = await Promise.all([
    context.waitForEvent('page'),
    filing.click({ modifiers: [modifier] }),
  ]);
  await expect(opened.getByRole('textbox', { name: 'Contact name' })).toBeVisible();
  await expect(page).toHaveURL(/\/surface-browser-history\/$/);

  await filing.click();
  await page.getByRole('link', { name: 'Details' }).click();
  await page.reload();
  await expect(page).toHaveURL(/\/surface-browser-history\/filing\/ny\?slot=filing&section=details$/);
  await expect(page.locator('[data-fixture-section]')).toHaveText('details');
  await page.goBack();
  await expect(page.locator('[data-fixture-section]')).toHaveText('intro');
  await page.getByRole('link', { name: 'Root route' }).click();
  await expect(page.getByRole('heading', { name: 'Root route' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Root route' })).toBeVisible();
});

const alternatingSections = ['Before you start', 'Introduction', 'Review checklist', 'Details'];

for (const mode of ['wizard', 'tabs']) {
  test(`alternating Items have meaningful ${mode} section names`, async ({ page }) => {
    await page.goto(`/surface-browser.html?alternating=${mode}#/filing/ny`);
    const labels = mode === 'wizard' ? page.locator('.formspec-wizard-step-label') : page.getByRole('tab');
    await expect(labels).toHaveText(alternatingSections);
    if (mode === 'wizard') await page.getByRole('button', { name: 'Next step', exact: true }).click();
    else await page.getByRole('tab', { name: 'Introduction' }).click();
    await expect(page.getByRole('textbox', { name: 'Contact name' })).toBeVisible();
  });
}

test('alternating Items share section names across the filing tracker, workspace and page title', async ({ page }) => {
  await page.goto('/surface-browser.html?alternating=workspace&tracker');
  const firstRow = page.locator('.fs-surface-filing__row').first();
  await firstRow.locator('summary').click();
  const sectionLinks = firstRow.locator('.fs-surface-filing__sections a');
  await expect(sectionLinks).toHaveText(alternatingSections.map(name => `${name} 0 of 1 answered`));
  await sectionLinks.filter({ hasText: 'Review checklist' }).click();
  await expect(page).toHaveURL(/section=keep$/);
  await expect(page).toHaveTitle('Review checklist – Filing – Example filing');
  await expect(page.getByText('Keep these records.')).toBeVisible();
  const rail = page.locator('.formspec-workspace__navigation');
  await expect(rail.getByRole('link')).toHaveText(alternatingSections);
  await rail.getByRole('link', { name: 'Details' }).click();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await expect(page.getByText('Save a copy after filing.')).toBeVisible();
  const walk = await Walk.open(page, {});
  try {
    expect(await walk.show('reviewer')).toBe(true);
    await expect(page).toHaveTitle('Review checklist – Filing – Example filing');
    await expect(page.getByRole('textbox', { name: 'Reviewer name' })).toBeVisible();
  } finally {
    await walk.sr.stop();
  }
});

test('unassigned Theme Items keep their workspace section through browser navigation', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&themePages#/filing/ny?slot=filing&section=theme-intro');
  const intro = page.getByRole('heading', { name: 'Contact details' });
  const remainder = page.getByRole('heading', { name: 'Additional items' });
  await expect(intro).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(remainder).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible();
  await expect(page).toHaveTitle('Additional items – Filing – Example filing');
  // The trailing section takes its ID from the first unassigned Item.
  await expect(page).toHaveURL(/slot=filing&section=details$/);
  await expect(page.getByRole('link', { name: 'Additional items', exact: true })).toHaveAttribute('href', /slot=filing&section=details$/);
  await page.goBack();
  await expect(intro).toBeFocused();
  await page.goForward();
  await expect(remainder).toBeFocused();
  await page.reload();
  await expect(remainder).toBeVisible();
  await page.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(intro).toBeFocused();

  const definition = await page.locator('[data-formspec-render-root]').evaluate(root =>
    (root as HTMLElement & { engine: { getDefinition: () => unknown } }).engine.getDefinition());
  const axe = await runAxePass(page, { documents: {
    definition,
    theme: { pages: [{ id: 'theme-intro', title: 'Contact details', regions: [{ key: 'intro', span: 12 }] }] },
  } });
  expect(axe.pages).toMatchObject({ kind: 'workspace', expectedMin: 2, drawn: 2, visited: 2 });
});

test('the filing tracker links to the trailing section of unassigned Theme Items', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&themePages&tracker');
  const firstRow = page.locator('.fs-surface-filing__row').first();
  await firstRow.locator('summary').click();
  const trailingSection = firstRow.locator('.fs-surface-filing__sections a').filter({ hasText: 'Additional items' });
  await expect(trailingSection).toHaveAttribute('href', /slot=filing&section=details$/);
  await expect(firstRow.locator('.fs-surface-filing__segment[title^="Additional items"]')).toHaveAttribute(
    'href', /slot=filing&section=details$/,
  );
  await trailingSection.click();
  await expect(page.getByRole('heading', { name: 'Additional items', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible();
});

test('the authored workspace updates focus and title through section links and browser history', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace#/filing/ny?slot=filing&section=stale');
  const contact = page.getByRole('textbox', { name: 'Contact name' });
  const intro = page.getByRole('heading', { name: 'Introduction', exact: true });
  const details = page.getByRole('heading', { name: 'Details', exact: true });
  await expect(intro).toBeVisible();
  await expect(page).toHaveTitle('Introduction – Filing – Example filing');
  await contact.fill('Example');
  await page.getByRole('link', { name: 'Details', exact: true }).click();
  await expect(page).toHaveURL(/#\/filing\/ny\?slot=filing&section=details$/);
  await expect(details).toBeFocused();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await expect(contact).toHaveCount(0);
  await page.goBack();
  await expect(intro).toBeFocused();
  await expect(page).toHaveTitle('Introduction – Filing – Example filing');
  await expect(contact).toHaveValue('Example');
  await page.goForward();
  await expect(details).toBeFocused();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await page.reload();
  await expect(details).toBeVisible();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page).toHaveTitle('Overview – Example filing');
});

test('only the workspace selected by the URL moves focus when a route has multiple forms', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&twoForms#/filing/ny?slot=additional&section=details');
  const first = page.locator('[data-slot="filing"]');
  const second = page.locator('[data-slot="additional"]');
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  await first.getByRole('link', { name: 'Introduction', exact: true }).click();
  await expect(first.getByRole('heading', { name: 'Introduction', exact: true })).toBeFocused();
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  await first.getByRole('link', { name: 'Details', exact: true }).click();
  await expect(first.getByRole('heading', { name: 'Details', exact: true })).toBeFocused();
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveTitle('Introduction – Filing – Example filing');
  await page.goBack();
  await expect(second.getByRole('heading', { name: 'Details', exact: true })).toBeFocused();
  await expect(page).toHaveTitle('Details – Filing – Example filing');
});

test('workspace search announces results and relates them to the search box', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace#/filing/ny');
  const search = page.getByRole('searchbox', { name: 'Search questions' });
  const navigation = page.locator('.formspec-workspace__navigation');
  const status = navigation.getByRole('status');
  const results = navigation.getByRole('list', { name: 'Search questions' });
  await expect(status).toBeEmpty();
  await search.fill('notes');
  await expect(status).toHaveText('Matching questions (1)');
  await expect(search).toHaveAccessibleDescription('Matching questions (1)');
  await expect(results.getByRole('button', { name: 'Notes Details' })).toBeVisible();
  await expect(search).toHaveAttribute('aria-controls', (await results.getAttribute('id'))!);
  await search.fill('no such question');
  await expect(status).toHaveText('No matching questions.');
  await expect(search).toHaveAccessibleDescription('No matching questions.');
  await search.clear();
  await expect(status).toBeEmpty();
});

test('workspace stacks when its Surface column is narrow on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('/surface-browser.html?workspace#/filing/ny');
  const workspace = page.locator('.formspec-workspace');
  const slot = page.locator('[data-slot="filing"]');
  const columns = () => workspace.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
  await slot.evaluate(node => { node.style.inlineSize = '64rem'; });
  await expect.poll(columns).toBe(3);
  await slot.evaluate(node => { node.style.inlineSize = '32rem'; });
  await expect.poll(columns).toBe(1);
});

test('Definition Walk uses the workspace bridge for choices, page changes, repeats and validation', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace#/filing/ny');
  const walk = await Walk.open(page, {});
  try {
    const choice = page.getByLabel('Filing type');
    await choice.selectOption('revision');
    await expect(choice).toHaveValue('revision');
    expect(await walk.show('details.rows[0].entry')).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Entry' })).toBeVisible();
    await page.getByRole('button', { name: 'Add Rows' }).click();
    await expect(page.getByRole('textbox', { name: 'Entry' })).toHaveCount(2);
    expect(await walk.show('intro.contact')).toBe(true);
    await expect(choice).toHaveValue('revision');
    expect(await walk.summary([{ path: 'details.notes', label: 'Notes' }])).toBe(1);
    expect(walk.findings).toEqual([]);
    await expect(page.getByRole('textbox', { name: 'Notes' })).toBeFocused();
  } finally {
    await walk.sr.stop();
  }
});

test('Definition Walk opens a workspace before any question is mounted', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&displayFirst#/filing/ny');
  await expect(page.getByRole('heading', { name: 'Instructions' })).toBeVisible();
  await expect(page.locator('[data-name]')).toHaveCount(0);
  const walk = await Walk.open(page, {});
  try {
    expect(await walk.show('intro.contact')).toBe(true);
    await expect(page.getByRole('textbox', { name: 'Contact name' })).toBeVisible();
  } finally {
    await walk.sr.stop();
  }
});

test('Definition Walk waits for a control in an empty React root outside workspace', async ({ page }) => {
  await Walk.open(page, {
    mount: async () => {
      await page.setContent('<div data-formspec-render-root style="min-height: 1rem"></div>');
      await page.evaluate(() => {
        window.setTimeout(() => {
          const root = document.querySelector<HTMLElement>('[data-formspec-render-root]')!;
          root.dataset.summaryReadyBeforeControl = String(root.hasAttribute('show-validation-summary'));
          root.innerHTML = '<input data-name="contact">';
        }, 750);
      });
    },
  });
  await expect(page.locator('[data-formspec-render-root]')).toHaveAttribute('data-summary-ready-before-control', 'false');
});

test('Definition Walk finds the right empty repeat when two workspace sections use the same Add label', async ({ page }) => {
  await page.goto('/surface-browser.html?workspace&emptyRepeat#/filing/ny');
  const walk = await Walk.open(page, {});
  try {
    await walk.repeat('details.rows', {
      firstField: 'details.rows.entry', rowName: 'Rows', addLabel: 'Add Rows', removeLabel: 'Remove Rows 1',
    });
    expect(walk.findings).toEqual([]);
    await expect(page.getByRole('button', { name: 'Add Rows' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Entry' })).toHaveCount(0);
    expect(await walk.live('intro.otherRows.otherEntry')).toBeUndefined();
  } finally {
    await walk.sr.stop();
  }
});

test('filing-status exposes task progress and opens its section disclosure by keyboard', async ({ page }) => {
  await page.goto('/surface-browser.html?tracker');
  const tracker = page.locator('[data-slot-type="filing-status"]');
  const task = tracker.getByRole('link', { name: 'Filing', exact: true });
  await expect(task).toHaveAccessibleDescription('In progress');
  await expect(tracker.getByText('Have the contact details ready.')).toBeVisible();
  const strip = tracker.locator('.fs-surface-filing__strip');
  await expect(strip).toHaveCount(3);
  await expect(strip.first()).toHaveAttribute('aria-hidden', 'true');
  const row = task.locator('xpath=ancestor::li[1]');
  const summary = row.locator('details > summary');
  // The form name distinguishes otherwise identical section counts in a screen reader.
  await expect(summary).toHaveAccessibleName('Sections (2) Filing');
  await expect(tracker.locator('details > summary').nth(2)).toHaveAccessibleName('Sections (3) Annual report');
  await expect(summary).toHaveCSS('display', 'list-item');
  await expect(summary).toHaveCSS('list-style-type', 'disclosure-closed');
  const section = tracker.getByRole('link', { name: 'Report details 2 of 4 answered 1 to fix 2 to check', exact: true });
  await expect(section).toHaveCount(0);
  await expect(strip.first().locator('[data-finding="fix"]')).toHaveCount(1);
  await expect(strip.first().locator('[data-finding="check"]')).toHaveCount(1);
  await expect(strip.first().locator('[data-finding="fix"]')).toHaveCSS('border-block-start-style', 'solid');
  await expect(strip.first().locator('[data-finding="check"]')).toHaveCSS('border-block-start-style', 'dashed');
  const fix = row.locator('.fs-surface-filing__counts .fs-surface-filing__fix');
  const check = row.locator('.fs-surface-filing__counts .fs-surface-filing__check');
  expect(await fix.evaluate(node => getComputedStyle(node).color)).not.toBe(await check.evaluate(node => getComputedStyle(node).color));
  const [filing, roster, report] = await strip.evaluateAll(strips => strips.map(element => {
    const { width, height } = element.getBoundingClientRect();
    return { width, height, segments: Array.from(element.children, segment => segment.getBoundingClientRect().width) };
  }));
  expect(filing.height).toBeCloseTo(36);
  expect(filing.width / report.width).toBeCloseTo(Math.sqrt(3 / 12));
  expect(roster.width / report.width).toBeCloseTo(Math.sqrt(1 / 12));
  expect(filing.segments[1] / filing.segments[0]).toBeCloseTo(2);
  expect(filing.segments.reduce((a, b) => a + b)).toBeLessThan(filing.width);
  await expect(tracker.getByText('Not started, 1 question')).toBeVisible();
  await expect(tracker.locator('.fs-surface-filing__totals dl dd').first()).toHaveText('14 of 18');
  await expect(tracker.locator('[aria-live], [role="status"]')).toHaveCount(0);
  await task.focus();
  await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Space');
  await expect(row.locator('details')).toHaveAttribute('open', '');
  await expect(summary).toHaveCSS('list-style-type', 'disclosure-open');
  const item = section.locator('..');
  await expect(item).toContainText('2 of 4 answered');
  await expect(item).toContainText('1 to fix');
  await expect(item).toContainText('2 to check');
  await page.keyboard.press('Tab');
  await expect(section).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/filing\/ny\?slot=filing&section=report-details$/);
  await expect(page.locator('[data-fixture-section]')).toHaveText('report-details');
  await expect(page.getByRole('textbox', { name: 'Contact name' })).toBeVisible();
});

test('a pointer click on a strip segment follows its section link', async ({ page }) => {
  await page.goto('/surface-browser.html?tracker');
  const tracker = page.locator('[data-slot-type="filing-status"]');
  const section = tracker.locator('details a').filter({ hasText: /^Certification\b/ });
  const href = await section.getAttribute('href');
  await tracker.locator('.fs-surface-filing__strip').first().locator('.fs-surface-filing__segment').nth(1).click();
  expect(new URL(page.url()).hash).toBe(href);
  await expect(page.locator('[data-fixture-section]')).toHaveText('certification');
});

test('a modified click opens a hidden strip link in a new tab', async ({ page, context }) => {
  await page.goto('/surface-browser.html?tracker');
  const segment = page.locator('.fs-surface-filing__strip').first().locator('a').first();
  const task = page.getByRole('link', { name: 'Filing', exact: true });
  await task.focus();
  await expect(segment).toHaveAttribute('tabindex', '-1');
  await expect(segment).toHaveAttribute('title', 'Report details: 2 of 4 answered, 1 to fix, 2 to check');
  await expect(segment).toHaveAttribute('href', '#/filing/ny?slot=filing&section=report-details');
  const overview = page.url();
  const [tab] = await Promise.all([
    context.waitForEvent('page'),
    segment.click({ modifiers: ['ControlOrMeta'] }),
  ]);
  await expect(tab.locator('[data-fixture-section]')).toHaveText('report-details');
  await expect(tab).toHaveURL(/#\/filing\/ny\?slot=filing&section=report-details$/);
  await expect(page).toHaveURL(overview);
  await expect(task).toBeFocused();
  await tab.close();
});

test('forced colors retain the answered fill and both kinds of findings', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/surface-browser.html?tracker');
  const strip = page.locator('.fs-surface-filing__strip').first();
  const segment = strip.locator('.fs-surface-filing__segment').first();
  await expect(segment.locator('.fs-surface-filing__fill')).toHaveCSS('width', /^(?!0px$).+/);
  const [background, fill, fix, check] = await strip.evaluate(node => {
    const color = (selector: string, property: string) =>
      getComputedStyle(node.querySelector(selector)!).getPropertyValue(property);
    return [
      color('.fs-surface-filing__segment', 'background-color'),
      color('.fs-surface-filing__fill', 'background-color'),
      color('[data-finding="fix"]', 'border-block-start-color'),
      color('[data-finding="check"]', 'border-block-start-color'),
    ];
  });
  expect(fill).not.toBe(background);
  expect(fix).not.toBe(background);
  expect(check).not.toBe(background);
  await expect(strip.locator('[data-finding="fix"]')).toHaveCSS('border-block-start-style', 'solid');
  await expect(strip.locator('[data-finding="check"]')).toHaveCSS('border-block-start-style', 'dashed');
});

test('tracker columns follow the container width and wrap expanded section links', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/surface-browser.html?tracker');
  const row = page.locator('.fs-surface-filing__row').first();
  await expect(row.getByText('2 of 5 answered', { exact: true })).toBeVisible();
  const positions = () => row.locator(':scope > div').evaluateAll(
    columns => columns.map(column => ({ x: column.getBoundingClientRect().x, y: column.getBoundingClientRect().y })),
  );
  const [form, sections, progress] = await positions();
  expect(form!.x).toBeLessThan(sections!.x);
  expect(sections!.x).toBeLessThan(progress!.x);
  await row.locator('summary').click();
  const sectionItems = row.locator('.fs-surface-filing__sections li');
  const [first, second] = await sectionItems.evaluateAll(items => items.map(item => item.getBoundingClientRect().y));
  expect(first).toEqual(second);

  const tracker = page.locator('.fs-surface-filing');
  await tracker.evaluate(node => { node.style.inlineSize = '320px'; });
  const narrow = await positions();
  expect(narrow.map(column => column.x)).toEqual([form!.x, form!.x, form!.x]);
  expect(narrow[0]!.y).toBeLessThan(narrow[1]!.y);
  expect(narrow[1]!.y).toBeLessThan(narrow[2]!.y);
});

for (const [variant, formCount] of [['small', 3], ['large', 12]] as const) {
  test(`filing tracker fits desktop and mobile with ${formCount} forms`, async ({ page }) => {
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/surface-browser.html?tracker=${variant}`);
      const rows = page.locator('.fs-surface-filing__row');
      await expect(rows).toHaveCount(formCount);
      await expect(page.locator('.fs-surface-filing__totals dd')).toHaveCount(3);
      const columns = rows.first().locator(':scope > div');
      const x = await columns.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x));
      expect(new Set(x).size).toBe(width === 1280 ? 3 : 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      if (variant === 'large') {
        const sectionCounts = await rows.evaluateAll(elements => elements.map(
          row => row.querySelectorAll('.fs-surface-filing__sections a').length,
        ));
        expect(sectionCounts).toEqual([10, 11, 12, 13, 14, 15, 10, 11, 12, 13, 14, 15]);
        await expect(rows.locator('details:not([open])')).toHaveCount(formCount);
        const firstRow = rows.first();
        const height = () => firstRow.evaluate(element => element.getBoundingClientRect().height);
        const closedHeight = await height();
        const summary = firstRow.locator('summary');
        // The visible count also carries the form name for assistive technology.
        await expect(summary).toHaveAccessibleName('Sections (10) Eligible entity list');
        await summary.click();
        expect(await height()).toBeGreaterThan(closedHeight);
        const linkLines = await firstRow.locator('.fs-surface-filing__sections li').evaluateAll(
          items => new Set(items.map(item => item.getBoundingClientRect().y)).size,
        );
        expect(linkLines).toBeGreaterThan(1);
        await summary.click();
        await expect(firstRow.locator('details')).not.toHaveAttribute('open');
      }
      const screenshotDir = process.env.FORMSPEC_FILING_SCREENSHOT_DIR;
      if (screenshotDir) await page.screenshot({ path: join(screenshotDir, `filing-${formCount}-${width}.png`), fullPage: true });
    }
  });
}

test('the authored tracker band follows navigation and remembers a viewer’s disclosure after reload', async ({ page }) => {
  await page.goto('/surface-browser.html?tracker=band');
  const band = page.locator('details[data-filing-band]');
  await expect(band).toHaveCount(1);
  await expect(page.locator('[data-slot-type="filing-status"]')).toHaveCount(1);
  await band.getByRole('link', { name: 'Filing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Filing', exact: true })).toBeVisible();
  await expect(band).toHaveCount(1);
  const task = band.getByRole('link', { name: 'Filing', exact: true });
  await expect(task).toHaveAccessibleDescription('In progress');
  await expect(band.locator('[aria-live], [role="status"]')).toHaveCount(0);
  const audit = await new AxeBuilder({ page }).include('details[data-filing-band]').analyze();
  expect(audit.violations).toEqual([]);
  await band.locator(':scope > summary').press('Enter');
  await expect(task).toBeHidden();
  await page.reload();
  await expect(band.locator(':scope > summary')).toHaveText('Filing map');
  await expect(band).not.toHaveAttribute('open', '');
  await page.goto('/surface-browser.html?tracker=band&viewer=second');
  await expect(band).toHaveAttribute('open', '');
});

test('an untitled tracker band has a named keyboard disclosure', async ({ page }) => {
  await page.goto('/surface-browser.html?tracker=band&untitled');
  const band = page.locator('details[data-filing-band]');
  const disclosure = band.locator(':scope > summary');
  await expect(disclosure).toHaveText('Filing map');
  await disclosure.press('Space');
  await expect(band.getByRole('link', { name: 'Filing', exact: true })).toBeHidden();
});
