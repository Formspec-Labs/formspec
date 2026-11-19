/** @filedesc Run the shared draft storage fixtures against real browser IndexedDB. */
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { draftPortConformance } from '../../../packages/formspec-surface/src/draft-port-conformance';

test('review reads the last saved Response with Definition wording for each filing subject', async ({ page }) => {
  const fixture = '/surface-drafts.html?form&auto&subject&review';
  for (const [year, answer] of [[2025, 'First filing'], [2026, 'Second filing']] as const) {
    await page.goto(`${fixture}#/filing/${year}`);
    await page.getByLabel('Answer').fill(answer);
    await page.locator('.formspec-repeat-add').click();
    await page.getByLabel('Row value').fill(`Row ${year}`);
    await page.getByRole('link', { name: 'Review draft' }).click();
    const review = page.getByRole('region', { name: 'Review your saved answers' });
    await expect(review.locator('[data-response-path="answer"]')).toHaveText(`Answer${answer}`);
    await expect(review.locator('[data-response-path="rows[0].row"]')).toHaveText(`Row valueRow ${year}`);
  }
  await page.goto(`${fixture}#/review/2025`);
  await expect(page.locator('[data-response-path="answer"] dd')).toHaveText('First filing');
  await page.goto(`${fixture}#/review/2027`);
  await expect(page.locator('[data-draft-review-reason="absent"]')).toBeVisible();
  await page.goto(`${fixture}&version=2.0.0#/review/2025`);
  await expect(page.locator('[data-draft-review-reason="version-mismatch"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Review your saved answers' })).toHaveCount(0);
});

for (const name of Object.keys(draftPortConformance)) {
  test(name, async ({ page }) => {
    await page.goto('/surface-drafts.html');
    await page.evaluate(async name => {
      const fixture = await import('/surface-drafts-port.ts');
      await fixture.runConformance(name);
    }, name);
  });
}

test('the tracker reads an IndexedDB roster through filing and reload', async ({ page }) => {
  const fixture = '/surface-drafts.html?form&subject&tracker&submit&roster';
  await page.goto(`${fixture}#/overview/2025`);
  const band = page.locator('details[data-filing-band]');
  const alpha = band.locator('a[aria-describedby][href*="/filing/2025?"]');
  const denied = band.locator('a[aria-describedby][href*="/filing/2027?"]');
  const waiting = band.getByRole('list', { name: 'Waiting for' });
  await expect(alpha).toHaveAccessibleDescription(/^Not started/);
  await expect(denied).toHaveAccessibleDescription('Progress unavailable');
  await expect(waiting.getByRole('listitem')).toHaveText(['Alpha']);
  const audit = await new AxeBuilder({ page }).include('details[data-filing-band]').analyze();
  expect(audit.violations).toEqual([]);
  await page.getByRole('button', { name: 'File directory', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Directory filed' })).toBeVisible();
  await page.reload();
  await expect(waiting.getByRole('listitem')).toHaveText(['Alpha']);
  await alpha.click();
  await page.getByLabel('Answer').fill('Filed member answer');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(alpha).toHaveAccessibleDescription('Filed');
  await page.reload();
  await expect(alpha).toHaveAccessibleDescription('Filed');
  await expect(band.getByText(/^Receipt reference: urn:uuid:/)).toHaveCount(1);
  await expect(waiting).toHaveCount(0);
  await page.goto(`${fixture}#/help`);
  await expect(band.getByRole('heading', { name: 'Members' })).toBeVisible();
  await expect(band.getByText('Progress unavailable', { exact: true })).toBeVisible();
  await expect(band.locator('a[aria-describedby][href*="/filing/2099?"]')).toBeVisible();
  await expect(alpha).toHaveCount(0);
});

test('starts two filing units and resumes each address after reload', async ({ page }) => {
  const overview = '/overview/2025';
  await page.goto(`/surface-drafts.html?form&minted#${overview}`);
  const visit = (path: string) => page.evaluate(hash => { window.location.hash = hash; }, path);
  const answer = page.getByLabel('Answer');
  const addresses: string[] = [];
  for (const value of ['First unit', 'Second unit']) {
    await page.getByRole('button', { name: 'New filing' }).click();
    await expect(page).toHaveURL(/#\/filing\/2025\/[^?]+\?slot=form/);
    const address = new URL(page.url()).hash;
    addresses.push(address);
    await expect(answer).toHaveValue('');
    await answer.fill(value);
    await visit(overview);
    await expect(page.getByRole('button', { name: 'New filing' })).toBeVisible();
    await visit(address);
    await expect(answer).toHaveValue(value);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
    await visit(overview);
  }
  expect(new Set(addresses).size).toBe(2);
  for (const [index, address] of addresses.entries()) {
    await visit(address);
    await page.reload();
    await expect(answer).toHaveValue(index === 0 ? 'First unit' : 'Second unit');
  }
});

test('upgrades IndexedDB and creates one unit per attempt across tabs', async ({ page, context }) => {
  await page.goto('/surface-drafts.html');
  await page.evaluate(async () => (await import('/surface-drafts-port.ts')).seedVersionTwoDraft());
  const other = await context.newPage();
  await other.goto('/surface-drafts.html');
  const start = (tab: typeof page, id: string) => tab.evaluate(
    async attempt => (await import('/surface-drafts-port.ts')).startUnit(attempt), id,
  );
  const [first, duplicate] = await Promise.all([start(page, 'same-attempt'), start(other, 'same-attempt')]);
  expect(first).toMatchObject({ status: 'started' });
  expect(duplicate).toEqual(first);
  const second = await start(other, 'separate-attempt');
  if (first.status !== 'started' || second.status !== 'started') throw new Error('Unable to initialize both units');
  expect(first.subject.id).not.toBe(second.subject.id);

  await page.reload();
  const legacy = await page.evaluate(async () => (await import('/surface-drafts-port.ts')).loadUnit());
  expect(legacy).toMatchObject({ status: 'loaded', draft: { revision: 'version-two-draft' } });
  for (const { subject } of [first, second]) {
    const opened = await page.evaluate(async id => (await import('/surface-drafts-port.ts')).loadUnit(id), subject);
    expect(opened).toMatchObject({ status: 'initialized' });
  }
});

test('retains unsaved edits when the host recreates the same preview edition list', async ({ page }) => {
  await page.goto('/surface-drafts.html?form');
  const answer = page.getByLabel('Answer');
  await answer.fill('unsaved');
  await page.evaluate(() => window.dispatchEvent(new Event('rerender-draft-fixture')));
  await expect(page.locator('[data-fixture-render="1"]')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible();
  await expect(answer).toHaveValue('unsaved');
});

for (const keepEdits of [false, true]) {
  test(`two tabs resolve a conflict by ${keepEdits ? 'keeping edits' : 'loading the newer version'}`, async ({ page, context }) => {
    await page.goto('/surface-drafts.html?form');
    const other = await context.newPage();
    await other.goto('/surface-drafts.html?form');
    await page.getByLabel('Answer').fill('winner');
    await other.getByLabel('Answer').fill('loser');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
    await other.getByRole('button', { name: 'Save draft' }).click();
    const conflict = other.getByRole('status').filter({ hasText: 'This form was changed somewhere else' });
    await expect(conflict).toHaveCount(1);
    await expect(other.getByLabel('Answer')).toHaveValue('loser');

    const action = keepEdits ? 'Keep my changes' : 'Load the newer version';
    const choice = other.getByRole('button', { name: action, exact: true });
    const confirm = other.getByRole('button', { name: keepEdits ? 'Confirm overwrite' : 'Confirm discard' });
    await choice.press('Enter');
    await expect(confirm).toBeFocused();
    const controls = other.getByRole('group', { name: /This form was changed somewhere else/ });
    await expect(controls).toContainText(keepEdits ? 'Replace the saved version' : 'Discard your edits');
    await expect(confirm).toHaveAccessibleDescription(/This form was changed somewhere else/);
    await other.getByRole('button', { name: 'Cancel', exact: true }).press('Enter');
    await expect(choice).toBeFocused();
    await expect(other.getByLabel('Answer')).toHaveValue('loser');
    await page.reload();
    await expect(page.getByLabel('Answer')).toHaveValue('winner');

    await choice.press('Enter');
    await confirm.press('Enter');
    await expect(other.getByLabel('Answer')).toHaveValue(keepEdits ? 'loser' : 'winner');
    await expect(other.getByRole('form', { name: 'Filing' })).toBeFocused();
    await expect(other.getByText(keepEdits ? 'Draft saved in this browser.' : 'Newer draft loaded.')).toBeVisible();
    await expect(conflict).toHaveCount(0);
    await page.reload();
    await expect(page.getByLabel('Answer')).toHaveValue(keepEdits ? 'loser' : 'winner');

    await other.getByLabel('Answer').fill('follow-up');
    await other.getByRole('button', { name: 'Save draft' }).click();
    await expect(other.getByText('Draft saved in this browser.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Answer')).toHaveValue('follow-up');
  });
}

test('refused navigation returns focus to the named conflict controls each time', async ({ page, context }) => {
  const path = '/surface-drafts.html?form&auto';
  await page.goto(path);
  const other = await context.newPage();
  await other.goto(path);
  await expect(other.getByLabel('Answer')).toHaveValue('');
  await page.getByLabel('Answer').fill('winner');
  await expect(page.getByRole('banner').getByRole('status')).toHaveText('Draft saved in this browser.');
  await other.getByLabel('Answer').fill('retained edit');
  await expect(other.getByRole('banner').getByRole('status')).toHaveText(/This form was changed somewhere else/);

  const overview = other.getByRole('link', { name: 'Overview' });
  const controls = other.getByRole('group', { name: /This form was changed somewhere else/ });
  for (let attempt = 0; attempt < 2; attempt++) {
    await overview.press('Enter');
    await expect(controls).toBeFocused();
    await expect(other.getByLabel('Answer')).toHaveValue('retained edit');
  }
});

test('restores a hidden answer and an empty repeat row after reload', async ({ page }) => {
  await page.goto('/surface-drafts.html?form');
  const show = page.getByLabel('Show detail');
  const detail = page.getByLabel('Detail', { exact: true });
  const row = page.getByLabel('Row value');
  await show.click();
  await detail.fill('retained detail');
  await show.click();
  await expect(detail).toHaveCount(0);
  await page.locator('.formspec-repeat-add').click();
  await expect(row).toHaveValue('');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
  await page.reload();
  await expect(row).toHaveValue('');
  await expect(detail).toHaveCount(0);
  await show.click();
  await expect(detail).toHaveValue('retained detail');
});

test('preview confirms restart after a version change', async ({ page }) => {
  await page.goto('/surface-drafts.html?form');
  await page.getByLabel('Answer').fill('old answer');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
  await page.goto('/surface-drafts.html?form&version=2.0.0');
  await expect(page.getByLabel('Answer')).toHaveCount(0);
  const restart = page.getByRole('button', { name: 'Discard draft and restart', exact: true });
  const confirm = page.getByRole('button', { name: 'Confirm discard and restart', exact: true });
  const mismatch = 'This draft was saved with a different version of the form.';
  await expect(page.getByRole('group', { name: mismatch })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(restart).toBeFocused();
  await restart.press('Enter');
  await expect(confirm).toBeFocused();
  await expect(page.getByRole('group', { name: mismatch })).toBeVisible();
  await expect(confirm).toHaveAccessibleDescription(mismatch);
  await expect(page.getByLabel('Answer')).toHaveCount(0);
  await page.getByRole('button', { name: 'Keep draft' }).press('Enter');
  await expect(restart).toBeFocused();
  await restart.press('Enter');
  await confirm.press('Enter');
  await expect(page.getByLabel('Answer')).toHaveValue('');
  await expect(page.getByRole('form', { name: 'Filing' })).toBeFocused();
  await page.goto('/surface-drafts.html?form');
  await expect(page.getByLabel('Answer')).toHaveValue('');
});

test('a refused departure flush holds the form and history preserves the unsaved answer', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&auto#/overview');
  await page.getByRole('link', { name: 'Filing' }).click();
  await page.getByLabel('Answer').fill('keep this');
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = () => { throw new DOMException('Unavailable', 'SecurityError'); };
    window.addEventListener('restore-storage', () => { indexedDB.open = open; }, { once: true });
  });
  await page.getByRole('link', { name: 'Overview' }).click();
  await expect(page.getByText('Draft could not be saved.')).toBeVisible();
  await expect(page.getByLabel('Answer')).toHaveValue('keep this');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('Answer')).toHaveValue('keep this');
  await page.evaluate(() => window.dispatchEvent(new Event('restore-storage')));
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Answer')).toHaveValue('keep this');
});

test('successful autosave announces once and restores the last edit', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&auto');
  await page.getByLabel('Answer').fill('first');
  await page.getByLabel('Answer').fill('second');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved in this browser.' })).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('Answer')).toHaveValue('second');
});

test('auto-placed form actions omit autosave button while background autosave still saves and announces', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&auto&submit&autoButtons');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit report', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as I go' })).toHaveCount(0);
  await expect(page.locator('button[data-action-ref="autosave"]')).toHaveCount(0);

  await page.getByLabel('Answer').fill('background saved');
  await expect(page.getByRole('status').filter({ hasText: 'Draft saved in this browser.' })).toHaveCount(1);
  await page.reload();
  await expect(page.getByLabel('Answer')).toHaveValue('background saved');
});

test('explicitly authored autosave ActionButton saves and advances its Surface transition without a duplicate shell button', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave');
  await expect(page.getByRole('button', { name: 'Checkpoint now', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Overview/i })).toHaveCount(0);

  await page.getByLabel('Answer').fill('checkpointed answer');
  await page.getByRole('button', { name: 'Checkpoint now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('manual save-draft intent button does not advance a transition bound by exact ID save-draft to a hidden autosave action', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&idCollision');
  await page.getByLabel('Answer').fill('manual save stays on filing');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Filing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0);
});

test('responsive authored checkpoint is the only transition control at a wide breakpoint and adapts on resize', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/surface-drafts.html?form&authoredAutosave&responsiveProbe#/filing');
  await expect(page.getByRole('button', { name: 'Responsive checkpoint', exact: true })).toBeVisible();
  const controls = page.getByRole('button', { name: /^(Responsive checkpoint|Continue to Overview)$/ });
  await expect(controls).toHaveCount(1);

  await page.setViewportSize({ width: 500, height: 800 });
  await expect(page.getByRole('button', { name: 'Continue to Overview', exact: true })).toBeVisible();
  await expect(controls).toHaveCount(1);

  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.getByRole('button', { name: 'Responsive checkpoint', exact: true })).toBeVisible();
  await expect(controls).toHaveCount(1);
  await page.getByRole('button', { name: 'Responsive checkpoint', exact: true }).click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('theme page leaves a single working control to fire the bound checkpoint transition', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&themeProbe#/filing');
  await expect(page.getByText('Themed page probe', { exact: true })).toBeVisible();
  const controls = page.getByRole('button', { name: /^(Checkpoint now|Continue to Overview)$/ });
  await expect(controls).toHaveCount(1);
  await controls.first().click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('background edit stays on the filing route in a Surface without a draft writer until the authored button is clicked', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
  const button = page.getByRole('button', { name: 'Checkpoint now', exact: true });
  await expect(button).toBeVisible();
  await page.getByLabel('Answer').fill('typing only');
  await page.waitForTimeout(900);
  await expect(page).toHaveURL(/#\/filing(?:\?|$)/);

  await button.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

for (const which of ['styled', 'conditional', 'visibility', 'upperDisplay', 'autoModal'] as const) {
  test(`a ${which} hidden authored checkpoint leaves exactly one working transition`, async ({ page }) => {
    await page.goto(`/surface-drafts.html?form&authoredAutosave&${which}#/filing`);
    await expect(page.getByLabel('Answer')).toBeEditable();
    await expect(page.getByRole('button', { name: 'Checkpoint now', exact: true })).toHaveCount(0);
    const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
    await expect(fallback).toHaveCount(1);
    await fallback.click();
    await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
  });
}

for (const writer of [true, false] as const) {
  test(`reports ambiguous autosave to the Surface diagnostic observer ${writer ? 'with writer' : 'without writer'}`, async ({ page }) => {
    await page.goto(`/surface-drafts.html?form&auto&ambiguous${writer ? '' : '&withoutWriter'}#/filing`);
    await page.getByLabel('Answer').fill('edited');
    await page.waitForTimeout(850);
    const seen = await page.evaluate(() => ({
      diagnostics: (window as unknown as { observedDiagnostics?: unknown[] }).observedDiagnostics ?? [],
      deliveries: (window as unknown as { numDeliveries?: number }).numDeliveries ?? 0,
    }));
    expect(seen.deliveries).toBeGreaterThan(0);
    expect(JSON.stringify(seen.diagnostics)).toContain('ambiguous-autosave-action');
  });
}

test('reports ambiguous autosave again when returning to a saved draft with browser Back', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&auto&ambiguous#/filing');
  const matches = () =>
    page.evaluate(
      () =>
        ((window as unknown as { currentDiagnostics?: Array<{ code?: string; details?: { reason?: string } }> }).currentDiagnostics ?? [])
          .filter((d) => d.code === 'BUNDLE-DOCUMENT-SHAPE' && d.details?.reason === 'ambiguous-autosave-action').length,
    );
  await expect.poll(matches).toBe(1);
  await page.getByLabel('Answer', { exact: true }).fill('Preserved value');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Draft saved in this browser.', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    location.hash = '/overview';
  });
  await expect(page.getByLabel('Answer', { exact: true })).toHaveCount(0);
  await expect.poll(matches).toBe(0);
  await page.goBack();
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('Preserved value');
  await expect.poll(matches).toBe(1);
});

test('opens the draft for the resolved filing unit', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&subject#/filing/2025');
  await page.getByLabel('Answer').fill('2025 answer');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
  await page.goto('/surface-drafts.html?form&subject#/filing/2026');
  await expect(page.getByLabel('Answer')).toHaveValue('');
  await page.getByLabel('Answer').fill('2026 answer');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();
  await page.goto('/surface-drafts.html?form&subject#/filing/2025');
  await expect(page.getByLabel('Answer')).toHaveValue('2025 answer');
});

test('the tracker reads and refreshes the saved subject from a second tab', async ({ page, context }) => {
  await page.goto('/surface-drafts.html?form&subject&tracker#/overview');
  const task = page.locator('[data-slot-type="filing-status"]').getByRole('link', { name: 'Filing', exact: true });
  await expect(task).toHaveAccessibleDescription(/^Not started\b/);
  const other = await context.newPage();
  await other.goto('/surface-drafts.html?form&subject&tracker#/filing/2025');
  await other.getByLabel('Answer').fill('qualified answer');
  await other.getByRole('button', { name: 'Save draft' }).click();
  await expect(other.getByText('Draft saved in this browser.')).toBeVisible();
  await expect(task).toHaveAccessibleDescription('Ready');
  await task.click();
  await expect(page.getByLabel('Answer')).toHaveValue('qualified answer');
});

test('another tab refreshes counts and stale restart cannot delete its newer commit', async ({ page, context }) => {
  await page.goto('/surface-drafts.html');
  const other = await context.newPage();
  await other.goto('/surface-drafts.html');
  for (const tab of [page, other]) {
    await tab.evaluate(async () => (await import('/surface-drafts-port.ts')).watchPreviewCommits());
  }
  const first = await page.evaluate(async () => (await import('/surface-drafts-port.ts')).savePreview(null, 'old'));
  expect(first.status).toBe('saved');
  if (first.status !== 'saved') throw new Error('No first revision');
  const mismatch = await other.evaluate(async () => (await import('/surface-drafts-port.ts')).loadPreview('2.0.0'));
  expect(mismatch).toMatchObject({ status: 'version-mismatch', revision: first.revision });
  const next = await page.evaluate(async revision => (await import('/surface-drafts-port.ts')).savePreview(revision, ''), first.revision);
  expect(next.status).toBe('saved');
  if (next.status !== 'saved') throw new Error('No replacement revision');

  await expect.poll(() => other.evaluate(async () => (await import('/surface-drafts-port.ts')).previewCommits())).toBe(2);
  await expect.poll(() => page.evaluate(async () => (await import('/surface-drafts-port.ts')).previewCommits())).toBe(2);
  await expect(other.evaluate(async revision => (await import('/surface-drafts-port.ts')).restartPreview(revision), first.revision))
    .resolves.toEqual({ status: 'conflict' });
  await expect(other.evaluate(async () => (await import('/surface-drafts-port.ts')).readPreviewSummary()))
    .resolves.toMatchObject({ status: 'current', form: { filled: 0 } });
  await expect(other.evaluate(async revision => (await import('/surface-drafts-port.ts')).restartPreview(revision), next.revision))
    .resolves.toEqual({ status: 'discarded' });
  await expect(page.evaluate(async () => (await import('/surface-drafts-port.ts')).readPreviewSummary()))
    .resolves.toEqual({ status: 'absent' });
  await expect(page.evaluate(async () => (await import('/surface-drafts-port.ts')).loadPreview('1.0.0')))
    .resolves.toEqual({ status: 'absent' });
});

test('preview Submit produces a labeled filing and receipt that survive reload', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&subject&tracker&submit#/filing/2025');
  await page.getByLabel('Answer').fill('annual response');
  await page.getByRole('button', { name: 'Submit report' }).click();
  await page.getByRole('link', { name: 'Overview' }).click();
  const tracker = page.locator('[data-slot-type="filing-status"]');
  const task = tracker.getByRole('link', { name: 'Filing', exact: true });
  await expect(task).toHaveAccessibleDescription(/^Filed\b/);
  const receipt = tracker.getByText(/^Receipt reference: urn:uuid:/);
  await expect(receipt).toBeVisible();
  const original = await receipt.textContent();
  await expect(tracker.getByText('Preview filing. Nothing was sent.')).toBeVisible();
  await expect(tracker.locator('[aria-live]')).toHaveCount(0);
  await page.reload();
  await expect(task).toHaveAccessibleDescription(/^Filed\b/);
  await expect(receipt).toHaveText(original!);
  await page.goto('/surface-drafts.html?form&subject&tracker&submit#/overview?edition=edition-b');
  await expect(page.locator('[data-slot-type="filing-status"]').getByRole('link', { name: 'Filing', exact: true }))
    .toHaveAccessibleDescription(/^Not started\b/);
});


test('writes exactly the submitted JSON and keeps the draft when a duplicate filing is refused', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  const result = await page.evaluate(async () => (await import('/surface-drafts-port.ts')).fileExactPreview());
  expect(result.filing).toMatchObject({ status: 'filed', receiptRef: 'urn:report:exact' });
  expect(result.duplicate).toEqual({ status: 'duplicate-response' });
  expect(result.storedText).toBe(result.exactText);
  expect(result.draft.status).toBe('loaded');
});

test('a form reads an accepted filing and current sibling, retaining its open pin after a newer filing', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&hydration');
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('old/draft');
  await expect(page.getByLabel('Detail', { exact: true })).toHaveValue('old');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('banner').getByRole('status')).toContainText(/saved/i);
  await page.getByRole('button', { name: 'File updated directory' }).click();
  await expect(page.getByRole('button', { name: 'Updated filing stored' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Answer', { exact: true })).toHaveValue('old/updated');
});

test('native Back and Forward retain an unsaved draft in its original edition', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&submit');
  const edition = page.locator('select[data-surface-edition]');
  await edition.selectOption('edition-b');
  await expect(edition).toHaveValue('edition-b');
  const answer = page.getByLabel('Answer');
  await answer.fill('Only in the second edition');
  await page.goBack();
  await expect(edition).toHaveValue('edition');
  await expect(answer).toHaveValue('');
  await page.goForward();
  await expect(edition).toHaveValue('edition-b');
  await expect(answer).toHaveValue('Only in the second edition');
});

for (const [name, returned] of [['filed', false], ['returned', true]] as const) {
  test(`fresh ${name} correction seed survives edit, reload, discard, and reload`, async ({ page }) => {
    await page.goto('/__formspec-e2e-health');
    const db = `formspec-seed-correction-${name}`;
    const before = await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'inspect' as const, returned });
    expect(before).toMatchObject({
      status: 'loaded',
      data: { first: { answer: 'Seeded' } },
      draft: { status: 'current', form: { ready: false }, sections: { first: { filled: 1 }, next: { filled: 0 } } },
      filing: name,
      current: { first: { answer: 'Seeded' } },
      completed: { first: { answer: 'Filed answer' } },
    });
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'save' as const, returned }))
      .toMatchObject({ status: 'saved' });
    await page.reload();
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'inspect' as const, returned }))
      .toMatchObject({ data: { first: { answer: 'My edit' } } });
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'discard' as const, returned }))
      .toMatchObject({ status: 'discarded' });
    await page.reload();
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'inspect' as const, returned }))
      .toMatchObject({ status: 'absent', filing: name, current: { first: { answer: 'Filed answer' } } });
  });
}

for (const [legacyVersion, action, expected] of [[2, 'discard', 'discarded'], [3, 'submit', 'filed']] as const) {
  test(`v${legacyVersion} upgrade preserves existing edit and ${action} stays cleared after reload`, async ({ page }) => {
    await page.goto('/__formspec-e2e-health');
    const db = `formspec-seed-upgrade-v${legacyVersion}`;
    await page.evaluate(async args => (await import('/surface-drafts-port.ts')).seedLegacyDatabaseForUpgrade(args.db, args.legacyVersion), { db, legacyVersion });
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'inspect' as const }))
      .toMatchObject({ status: 'loaded', data: { first: { answer: 'Existing edit' } } });
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: action }))
      .toMatchObject({ status: expected });
    await page.reload();
    expect(await page.evaluate(async args => (await import('/surface-drafts-port.ts')).operateSeededStore(args), { db, op: 'inspect' as const }))
      .toMatchObject({ status: 'absent' });
  });
}

test('seeded summary store persists counts only without field state or validation messages, and minted/cleared seeds survive reload', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const row = await page.evaluate(async () => (await import('/surface-drafts-port.ts')).inspectSeededSummaryStore('formspec-seed-summary-only'));
  expect(row).not.toHaveProperty('seededEvaluated');
  expect(JSON.stringify(row)).not.toMatch(/first\.answer|next\.second|Required/);
  expect(Object.keys(row).sort()).toEqual(['definitionVersion', 'plans']);

  const clearDb = 'formspec-seed-clear';
  expect(await page.evaluate(async db => (await import('/surface-drafts-port.ts')).operateSeededStore({ db, op: 'clear' }), clearDb))
    .toMatchObject({ status: 'saved' });
  await page.reload();
  expect(await page.evaluate(async db => (await import('/surface-drafts-port.ts')).operateSeededStore({ db, op: 'inspect' }), clearDb))
    .toMatchObject({ status: 'loaded', data: {} });

  expect(await page.evaluate(async () => (await import('/surface-drafts-port.ts')).operateMintedSeed('read'))).toBe('loaded');
  expect(await page.evaluate(async () => (await import('/surface-drafts-port.ts')).operateMintedSeed('restart'))).toEqual({ status: 'discarded' });
  await page.reload();
  expect(await page.evaluate(async () => (await import('/surface-drafts-port.ts')).operateMintedSeed('read'))).toBe('initialized');
});

test('a discard between observing an owned row and consuming the seed stays discarded across tabs', async ({ page, context }) => {
  const other = await context.newPage();
  try {
    await Promise.all([page.goto('/__formspec-e2e-health'), other.goto('/__formspec-e2e-health')]);
    const db = 'formspec-seed-two-tab-discard';
    await page.evaluate(async name => (await import('/surface-drafts-port.ts')).seedLegacyDatabaseForUpgrade(name, 3), db);
    await page.evaluate(async name => (await import('/surface-drafts-port.ts')).startSeededStorePausingBeforeSecondOpen(name), db);

    expect(await other.evaluate(async name => (await import('/surface-drafts-port.ts')).discardUnseededStore(name), db))
      .toEqual({ status: 'discarded' });
    const concurrent = await other.evaluate(async name => (await import('/surface-drafts-port.ts')).operateSeededStore({ db: name, op: 'inspect' }), db);
    const { ownershipReads } = await page.evaluate(async () => (await import('/surface-drafts-port.ts')).resumePausedSeededStore());
    const after = await other.evaluate(async name => (await import('/surface-drafts-port.ts')).operateSeededStore({ db: name, op: 'inspect' }), db);

    expect(ownershipReads).toBe(2);
    expect(concurrent.status).toBe('absent');
    expect(after.status).toBe('absent');
  } finally {
    await other.close();
  }
});

test('correcting a refused profile imports its corrected first fixture on reload', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const db = 'formspec-seed-rejected-profile-retry';
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).initializeRejectedOrCorrectedProfile(name, false), db))
    .toBe('rejected');
  await page.reload();
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).initializeRejectedOrCorrectedProfile(name, true), db))
    .toBe('corrected');
});

test('a profile rejected during preparation commits no seed marker, even beside an owned legacy edit', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const db = 'formspec-seed-mixed-rejected';
  await page.evaluate(async name => (await import('/surface-drafts-port.ts')).seedLegacyDatabaseForUpgrade(name, 3), db);
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).initializeRejectedOrCorrectedProfile(name, false), db))
    .toBe('rejected');
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).readRawStore(name, 'seeds'), db)).toEqual([]);
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).readRawStore(name, 'summaries'), db)).toEqual([]);
});

test('a dependent seed pins the upstream row that actually committed when a user saves it during preparation', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const observed = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).concurrentUpstreamSaveDuringSeed('formspec-seed-concurrent-upstream'));
  expect(observed.saved).toBe('saved');
  expect(observed.parentId).toBe('user-a');
  expect(observed.parent).toEqual({ answer: 'Actual user edit' });
  expect(observed.pin).toEqual(observed.parent);
  expect(observed.selectedIds).toEqual(['user-a']);
  expect(observed.seeds).toBe(2);
});

test('a save stores only the closed count fields, whatever progress members the caller attaches', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const { saved, rows } = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).saveEnrichedSummary('formspec-seed-enriched-save'));
  expect(saved).toBe('saved');
  expect(JSON.stringify(rows)).not.toMatch(/first\.answer|Validation message|fieldPath/);
  expect(rows).toEqual([{
    definitionVersion: '1.0.0',
    plans: [{
      planId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      progress: { status: 'current', form: { total: 1, filled: 0, toFix: 1, toCheck: 0, ready: false }, sections: { main: { total: 1, filled: 0, toFix: 1, toCheck: 0 } } },
    }],
  }]);
});

test('a populated v3 summary is rebuilt as counts only during initialization and stays available to the tracker', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const db = 'formspec-seed-upgrade-v3-summary';
  await page.evaluate(async name => (await import('/surface-drafts-port.ts')).seedLegacyDatabaseForUpgrade(name, 3, true), db);
  const view = await page.evaluate(async name => (await import('/surface-drafts-port.ts')).operateSeededStore({ db: name, op: 'inspect' }), db);
  expect(view).toMatchObject({ status: 'loaded', data: { first: { answer: 'Existing edit' } }, draft: { status: 'current', sections: { first: { filled: 1 } } } });
  const raw = await page.evaluate(async name => (await import('/surface-drafts-port.ts')).readRawStore(name, 'summaries'), db);
  expect(JSON.stringify(raw)).not.toMatch(/first\.answer|next\.second/);
  expect(raw).toEqual([{ definitionVersion: '1.0.0', plans: [expect.objectContaining({ planId: expect.stringMatching(/^sha256:/) })] }]);
});

test('dependent seed never retains a parent created and discarded during preparation', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const result = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).transientParentDuringSeed('formspec-seed-transient-parent'));
  expect(result).toMatchObject({
    saved: 'saved',
    discarded: 'discarded',
    childAfterDiscard: 'absent',
    parent: 'absent',
    child: 'loaded',
  });
  expect(result.pin?.records).toEqual([]);
});

test('rechecks a changed scope on an apparent at-open pin refusal when a concurrent filing commits', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const result = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).concurrentFilingDuringPinRefusal('formspec-seed-recheck-refusal'));
  expect(result).toEqual({
    concurrent: 'filed',
    first: 'opened',
    pin: { answer: 'user' },
  });
});

test('v3 upgrade keeps committed counts evaluated against an unpinned upstream Response', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const result = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).v3UpgradeUnpinnedUpstream('formspec-seed-v3-unpinned'));
  expect(result.before.form).toMatchObject({ total: 1, filled: 0, ready: false });
  expect(result.after).toEqual(result.before);
  expect(JSON.stringify(result.rows)).not.toContain('detail');
});

test('refused browser storage opens a preview with no draft fixtures while rejecting profiles with drafts', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const result = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).blockedStoragePreviewEdition());
  expect(result.unseeded).toEqual({ result: 'opened', draft: 'unavailable' });
  expect(result.seeded).toMatch(/SecurityError|Storage disabled/i);
});

test('selected stored parent sharing a Response ID with a child fixture never reports a false self-cycle', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const result = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).storedParentSharedResponseId('formspec-seed-shared-id'));
  expect(result.winner).toMatchObject({ status: 'available', value: { answer: 'Stored parent' } });
  expect(result.collisionResult).not.toMatch(/cyclic/i);
  expect(result.collisionResult).toMatch(/Response ID "shared-id"/i);
  expect(result.seedsAfterCollision).toBe(1);
  expect(result.uniqueChildPin).toEqual({ answer: 'Stored parent' });
});

test('only declared section IDs persist for a plan while canonicalDraftProgress preserves __proto__ and nullable counts', async ({ page }) => {
  await page.goto('/__formspec-e2e-health');
  const result = await page.evaluate(async () =>
    (await import('/surface-drafts-port.ts')).saveOffPlanSectionKey('formspec-seed-off-plan-section'));
  expect(result.saved).toBe('saved');
  expect(JSON.stringify(result.rows)).not.toContain('first.answer');
  expect(result.read).toEqual({
    status: 'current',
    form: { total: 1, filled: 0, toFix: null, toCheck: null, ready: null },
    sections: { main: { total: 1, filled: 0, toFix: null, toCheck: null } },
  });
  expect(result.protoForm).toMatchObject({ toFix: null, toCheck: null, ready: null });
  expect(result.protoSections).toEqual(['__proto__', 'normal']);
});

test('an open tracker refreshes after another tab first imports a scenario draft for its edition', async ({ page, context }) => {
  const fixture = '/surface-drafts.html?form&subject&tracker';
  const task = (tab: typeof page) => tab.locator('[data-slot-type="filing-status"]').getByRole('link', { name: 'Filing', exact: true });
  await page.goto(`${fixture}#/overview`);
  await expect(task(page)).toHaveAccessibleDescription(/^Not started/);
  const other = await context.newPage();
  try {
    await other.goto(`${fixture}&seed#/overview`);
    await expect(task(other)).toHaveAccessibleDescription(/^(Ready|In progress)/i);
    await expect(task(page)).toHaveAccessibleDescription(/^(Ready|In progress)/i, { timeout: 2500 });
  } finally {
    await other.close();
  }
});

test('a failed seeded edition open after a summary read abort leaves an open tracker unchanged, and a retry updates it once', async ({ page, context }) => {
  const fixture = '/surface-drafts.html?form&subject&tracker';
  const task = (tab: typeof page) => tab.locator('[data-slot-type="filing-status"]').getByRole('link', { name: 'Filing', exact: true });
  await page.goto(`${fixture}#/overview`);
  await expect(task(page)).toHaveAccessibleDescription('Not started, 4 questions');
  await page.evaluate(() => {
    const win = window as unknown as { __seedCommitCount?: number; __seedChannel?: BroadcastChannel };
    win.__seedCommitCount = 0;
    win.__seedChannel = new BroadcastChannel('formspec-drafts:formspec-surface-drafts:edition');
    win.__seedChannel.addEventListener('message', () => {
      win.__seedCommitCount = (win.__seedCommitCount ?? 0) + 1;
    });
  });

  const seeder = await context.newPage();
  try {
    await seeder.addInitScript(() => {
      if (sessionStorage.getItem('fs-b648-summary-abort-done')) return;
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        const tx = Reflect.apply(transaction, this, args) as IDBTransaction;
        const names = [...tx.objectStoreNames];
        if (this.name === 'formspec-surface-drafts' && tx.mode === 'readonly' &&
            names.length === 2 && names.includes('editable') && names.includes('summaries')) {
          sessionStorage.setItem('fs-b648-summary-abort-done', '1');
          IDBDatabase.prototype.transaction = transaction;
          queueMicrotask(() => tx.abort());
        }
        return tx;
      };
    });

    const failure = seeder.waitForEvent('pageerror', { predicate: err => /abort/i.test(err.message) });
    await seeder.goto(`${fixture}&seed#/overview`);
    await failure;
    await expect(task(seeder)).toHaveCount(0);
    await expect(task(page)).toHaveAccessibleDescription('Not started, 4 questions');
    expect(await page.evaluate(() => (window as unknown as { __seedCommitCount?: number }).__seedCommitCount)).toBe(0);

    await seeder.reload();
    await expect(task(seeder)).toHaveAccessibleDescription(/^(Ready|In progress)/i);
    await expect(task(page)).toHaveAccessibleDescription(/^(Ready|In progress)/i, { timeout: 2500 });
    expect(await page.evaluate(() => (window as unknown as { __seedCommitCount?: number }).__seedCommitCount)).toBe(1);
  } finally {
    await page.evaluate(() => {
      (window as unknown as { __seedChannel?: BroadcastChannel }).__seedChannel?.close();
    });
    await seeder.close();
  }
});

for (const [variant, expected] of [
  ['inherited', 'fallback'],
  ['override', 'checkpoint'],
  ['display-precedence', 'fallback'],
  ['initial', 'checkpoint'],
  ['var', 'fallback'],
] as const) {
  test(`Filing fallback matches computed ancestor CSS visibility (${variant})`, async ({ page }) => {
    await page.goto(`/surface-drafts.html?form&authoredAutosave&visibilityCase=nested&variant=${variant}#/filing`);
    await expect(page.getByLabel('Answer', { exact: true })).toBeEditable();
    const checkpoint = page.getByRole('button', { name: 'Checkpoint now', exact: true });
    const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
    await expect(checkpoint).toHaveCount(expected === 'checkpoint' ? 1 : 0);
    await expect(fallback).toHaveCount(expected === 'fallback' ? 1 : 0);
    await (expected === 'fallback' ? fallback : checkpoint).click();
    await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
  });
}

for (const variant of ['true', 'false', 'dismiss'] as const) {
  test(`Filing fallback tracks button-triggered and dismissed auto Modal (${variant})`, async ({ page }) => {
    await page.goto(`/surface-drafts.html?form&authoredAutosave&visibilityCase=modal&variant=${variant}#/filing`);
    const checkpoint = page.getByRole('button', { name: 'Checkpoint now', exact: true });
    const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
    const trigger = page.getByRole('button', { name: 'Open checkpoint', exact: true });
    if (variant === 'true') {
      await expect(fallback).toHaveCount(0);
      await trigger.click();
      await expect(checkpoint).toBeVisible();
      await checkpoint.click();
    } else {
      if (variant === 'dismiss') {
        await expect(checkpoint).toBeVisible();
        await expect(fallback).toHaveCount(0);
        await page.locator('button.formspec-modal-close').click();
      }
      await expect(page.getByLabel('Answer', { exact: true })).toBeEditable();
      await expect(checkpoint).toHaveCount(0);
      await expect(trigger).toHaveCount(0);
      await expect(fallback).toHaveCount(1);
      await fallback.click();
    }
    await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
  });
}

test('resizing across a CSS media query immediately updates Surface fallback reachability', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter&media#/filing');
  const checkpoint = page.getByRole('button', { name: 'Checkpoint now', exact: true });
  const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  await expect(checkpoint).toBeVisible();
  await expect(fallback).toHaveCount(0);

  await page.setViewportSize({ width: 520, height: 700 });
  await expect(checkpoint).toHaveCount(0);
  await expect(fallback).toHaveCount(1);
  await fallback.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('CSS content-visibility:hidden ancestor suppresses authored control and surfaces Surface fallback', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter&content#/filing');
  await expect(page.getByLabel('Answer', { exact: true })).toBeEditable();
  const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  const button = page.locator('button[data-action-ref="autosave"]');
  expect(await button.evaluate((el) => el.checkVisibility({ visibilityProperty: true }))).toBe(false);
  await expect(fallback).toHaveCount(1);
  await fallback.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('two independent tabbed slots with identical authored Tabs id keep distinct tab IDs and no duplicate fallback', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter&multiTabs#/filing');
  const tabs = page.getByRole('tab', { name: 'Second tab', exact: true });
  const checkpoint = page.getByRole('button', { name: 'Checkpoint now', exact: true });
  const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  await expect(tabs).toHaveCount(2);
  const tabIds = await tabs.evaluateAll((els) => els.map((el) => el.id));
  expect(tabIds[0]).not.toBe(tabIds[1]);
  await expect(fallback).toHaveCount(0);
  await tabs.nth(1).click();
  await expect(checkpoint).toBeVisible();
  await expect(fallback).toHaveCount(0);
  await checkpoint.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('navigating away from Filing disconnects the reachability observer and close listener cleanly', async ({ page }) => {
  await page.addInitScript(() => {
    const counts = ((window as unknown as { reachLifecycle?: Record<string, number> }).reachLifecycle = {
      observe: 0,
      disconnect: 0,
      add: 0,
      remove: 0,
    });
    const active = new Set<MutationObserver>();
    const isSlot = (node: unknown) => node instanceof HTMLElement && node.style.display === 'contents';
    const origObserve = MutationObserver.prototype.observe;
    const origDisconnect = MutationObserver.prototype.disconnect;
    MutationObserver.prototype.observe = function (target, options) {
      if (isSlot(target)) {
        active.add(this);
        counts.observe += 1;
      }
      return origObserve.call(this, target, options);
    };
    MutationObserver.prototype.disconnect = function () {
      if (active.delete(this)) counts.disconnect += 1;
      return origDisconnect.call(this);
    };
    const origAdd = EventTarget.prototype.addEventListener;
    const origRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (type, ...args) {
      if (type === 'close' && isSlot(this)) counts.add += 1;
      return origAdd.call(this, type, ...args);
    };
    EventTarget.prototype.removeEventListener = function (type, ...args) {
      if (type === 'close' && isSlot(this)) counts.remove += 1;
      return origRemove.call(this, type, ...args);
    };
  });
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
  const checkpoint = page.getByRole('button', { name: 'Checkpoint now', exact: true });
  await expect(checkpoint).toBeVisible();
  await checkpoint.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
  const counts = await page.evaluate(() => (window as unknown as { reachLifecycle?: Record<string, number> }).reachLifecycle);
  expect(counts?.observe).toBeGreaterThan(0);
  expect(counts?.observe).toBe(counts?.disconnect);
  expect(counts?.add).toBeGreaterThan(0);
  expect(counts?.add).toBe(counts?.remove);
});

test('an overriding author stylesheet restores the checkpoint as the only Filing transition', async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '[style*="content-visibility"] { content-visibility: visible !important; }';
    document.addEventListener('DOMContentLoaded', () => document.head.append(style));
  });
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter&content#/filing');
  const button = page.getByRole('button', { name: 'Checkpoint now', exact: true });
  const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  await expect(button).toBeVisible();
  const observed = await button.evaluate((el) => {
    const ancestor = el.closest<HTMLElement>('[style*="content-visibility"]')!;
    return {
      specified: ancestor.style.getPropertyValue('content-visibility').trim(),
      computed: getComputedStyle(ancestor).contentVisibility,
      visible: el.checkVisibility({ visibilityProperty: true }),
    };
  });
  expect(observed).toEqual({ specified: 'hidden', computed: 'visible', visible: true });
  await expect(fallback).toHaveCount(0, { timeout: 2000 });
  await button.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('narrow viewport hiding the outer Surface slot shell leaves one reachable transition outside it', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = '@media (max-width: 600px) { .fs-surface-slot[data-slot-type="definition-form"] { display: none !important; } }';
    document.addEventListener('DOMContentLoaded', () => document.head.append(style));
  });
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
  const button = page.getByRole('button', { name: 'Checkpoint now', exact: true });
  const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  await expect(button).toBeVisible();
  await expect(fallback).toHaveCount(0);

  await page.setViewportSize({ width: 520, height: 700 });
  const observed = await page.evaluate(() => {
    const slot = document.querySelector<HTMLElement>('.fs-surface-slot[data-slot-type="definition-form"]')!;
    const btn = document.querySelector<HTMLElement>('button[data-action-ref="autosave"]')!;
    return {
      slot: getComputedStyle(slot).display === 'none' ? 'hidden' : 'visible',
      checkpointReachable: btn.checkVisibility({ visibilityProperty: true }),
    };
  });
  expect(observed).toEqual({ slot: 'hidden', checkpointReachable: false });
  await expect(fallback).toHaveCount(1, { timeout: 2000 });
  await fallback.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

for (const mode of ['button-aria', 'shell-fieldset', 'shell-inert'] as const) {
  test(`host disabling checkpoint (${mode}) immediately surfaces fallback without waiting for resize`, async ({ page }) => {
    if (mode === 'shell-fieldset') {
      await page.addInitScript(() => {
        const insert = Node.prototype.appendChild;
        Node.prototype.appendChild = function <T extends Node>(child: T): T {
          if (child instanceof HTMLElement && child.matches('.fs-surface-slot[data-slot-type="definition-form"]')) {
            const wrapper = document.createElement('fieldset');
            wrapper.id = 'host-filing-fieldset';
            insert.call(wrapper, child);
            insert.call(this, wrapper);
            return child;
          }
          return insert.call(this, child) as T;
        };
      });
    }
    await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
    const checkpoint = page.locator('button[data-action-ref="autosave"]');
    const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
    await expect(checkpoint).toBeEnabled();
    await expect(fallback).toHaveCount(0);
    const state = await checkpoint.evaluate((btn, kind) => {
      const el = btn as HTMLButtonElement;
      const slot = btn.closest<HTMLElement>('.fs-surface-slot')!;
      if (kind === 'button-aria') btn.setAttribute('aria-disabled', 'true');
      else if (kind === 'shell-inert') slot.inert = true;
      else (btn.closest('#host-filing-fieldset') as HTMLFieldSetElement).disabled = true;
      el.blur();
      el.focus();
      return {
        focusable: document.activeElement === el,
        nativeDisabled: el.matches(':disabled'),
        ariaDisabled: el.getAttribute('aria-disabled'),
      };
    }, mode);
    if (mode === 'shell-fieldset') expect(state.nativeDisabled).toBe(true);
    if (mode === 'shell-inert') expect(state.focusable).toBe(false);
    if (mode === 'button-aria') await expect(checkpoint).toBeDisabled();
    await expect(fallback).toHaveCount(1, { timeout: 1000 });
    await fallback.click();
    await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
  });
}

test('all reachability observers including the shared ancestor observer disconnect when Filing unmounts', async ({ page }) => {
  await page.addInitScript(() => {
    const tracked = new Set<MutationObserver>();
    const disconnected = new Set<MutationObserver>();
    const targets = new Set<string>();
    const originalObserve = MutationObserver.prototype.observe;
    const originalDisconnect = MutationObserver.prototype.disconnect;
    MutationObserver.prototype.observe = function (target, opts) {
      if (target instanceof HTMLElement && opts?.attributes && opts.attributeFilter?.includes('open') && opts.attributeFilter?.includes('hidden')) {
        tracked.add(this);
        targets.add(target.tagName);
      }
      return originalObserve.call(this, target, opts);
    };
    MutationObserver.prototype.disconnect = function () {
      if (tracked.has(this)) disconnected.add(this);
      return originalDisconnect.call(this);
    };
    (window as unknown as { reviewObserver?: () => unknown }).reviewObserver = () => ({
      count: tracked.size,
      stopped: disconnected.size,
      targets: [...targets],
    });
  });
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
  const checkpoint = page.locator('button[data-action-ref="autosave"]');
  await expect(checkpoint).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { reviewObserver: () => { count: number; stopped: number; targets: string[] } }).reviewObserver());
  expect(before.targets).toContain('HTML');
  expect(before.count).toBeGreaterThan(before.stopped);
  await checkpoint.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
  const after = await page.evaluate(() => (window as unknown as { reviewObserver: () => { count: number; stopped: number } }).reviewObserver());
  expect(after.count).toBe(after.stopped);
});

test('wrapping an already-mounted slot in a disabled fieldset immediately toggles fallback without resizing', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
  const checkpoint = page.locator('button[data-action-ref="autosave"]');
  const footer = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  await expect(checkpoint).toBeVisible();
  await expect(footer).toHaveCount(0);

  const flip = (enabled: boolean) =>
    checkpoint.evaluate((el, isEnabled) => {
      const slot = el.closest<HTMLElement>('.fs-surface-slot')!;
      let fieldset = slot.closest<HTMLFieldSetElement>('fieldset[data-host]');
      if (!fieldset) {
        fieldset = document.createElement('fieldset');
        fieldset.dataset.host = 'filing';
        slot.before(fieldset);
        fieldset.append(slot);
      }
      fieldset.disabled = !isEnabled;
    }, enabled);

  await flip(false);
  await expect(checkpoint).toBeDisabled();
  await expect(footer).toHaveCount(1, { timeout: 1200 });
  await footer.click({ trial: true });

  await flip(true);
  await expect(checkpoint).toBeEnabled();
  await expect(footer).toHaveCount(0, { timeout: 1200 });
  await checkpoint.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

test('CSS interactivity:inert on the outer slot surfaces the fallback immediately while keeping the footer usable', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
  const checkpoint = page.locator('button[data-action-ref="autosave"]');
  const footer = page.getByRole('button', { name: 'Continue to Overview', exact: true });
  await expect(checkpoint).toBeVisible();
  await expect(footer).toHaveCount(0);

  const state = await checkpoint.evaluate((el) => {
    const button = el as HTMLButtonElement;
    const slot = button.closest<HTMLElement>('.fs-surface-slot')!;
    slot.style.setProperty('interactivity', 'inert');
    button.blur();
    button.focus();
    return {
      supported: CSS.supports('interactivity', 'inert'),
      computed: getComputedStyle(slot).getPropertyValue('interactivity').trim(),
      focusable: document.activeElement === button,
    };
  });
  expect(state.supported).toBe(true);
  expect(state.computed).toBe('inert');
  expect(state.focusable).toBe(false);
  await expect(footer).toHaveCount(1, { timeout: 1200 });
  await footer.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});

for (const backgroundInert of [false, true]) {
  test(`an open native modal checkpoint routes to Overview (background inert = ${backgroundInert})`, async ({ page }) => {
    await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter&visibilityCase=modal&variant=true#/filing');
    await page.getByRole('button', { name: 'Open checkpoint', exact: true }).click();
    const checkpoint = page.getByRole('button', { name: 'Checkpoint now', exact: true });
    const footer = page.locator('.fs-surface-transitions button');
    await expect(checkpoint).toBeVisible();
    const state = await checkpoint.evaluate((el, inert) => {
      const button = el as HTMLButtonElement;
      const slot = button.closest<HTMLElement>('.fs-surface-slot')!;
      slot.inert = inert;
      button.blur();
      button.focus();
      return {
        modal: button.closest('dialog')?.matches(':modal') ?? false,
        slotInert: slot.inert,
        focusable: document.activeElement === button,
      };
    }, backgroundInert);
    expect(state).toEqual({ modal: true, slotInert: backgroundInert, focusable: true });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(footer).toHaveCount(0);
    await checkpoint.click();
    await expect(page).toHaveURL(/#\/overview(?:\?|$)/, { timeout: 1500 });
  });
}
