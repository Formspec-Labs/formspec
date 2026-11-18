/** @filedesc Run the shared draft storage fixtures against real browser IndexedDB. */
import { expect, test } from '@playwright/test';
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
