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
  const task = page.locator('[data-slot-type="form-status"]').getByRole('link', { name: 'Filing', exact: true });
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
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  const tracker = page.locator('[data-slot-type="form-status"]');
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
  await expect(page.locator('[data-slot-type="form-status"]').getByRole('link', { name: 'Filing', exact: true }))
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
  // The v3->v4 upgrade backfills an unknown-progress placeholder for the pre-existing owned legacy edit,
  // while the rejected seed profile commits no seed markers, no seeded drafts, and no computed plans.
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).readRawStore(name, 'summaries'), db))
    .toEqual([{ definitionVersion: '1.0.0', plans: null }]);
  expect(await page.evaluate(async name => (await import('/surface-drafts-port.ts')).readRawStore(name, 'editable'), db))
    .toHaveLength(1);
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
  const task = (tab: typeof page) => tab.locator('[data-slot-type="form-status"]').getByRole('link', { name: 'Filing', exact: true });
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
  const task = (tab: typeof page) => tab.locator('[data-slot-type="form-status"]').getByRole('link', { name: 'Filing', exact: true });
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

test('draft-review route acknowledges grouped blank-answer warnings, jumps across sections, and shows set difference', async ({ page }) => {
  const fixture = '/surface-drafts.html?form&auto&subject&review&warnings';
  await page.goto(`${fixture}#/filing/2025`);
  await page.getByLabel('Answer').fill('Initial summary');
  await page.getByLabel('Show detail').check();
  await page.getByRole('link', { name: 'Review draft' }).click();

  const panel = page.locator('fieldset[data-explanation-code="UNANSWERED_QUESTIONS"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Accept 2 unanswered questions' })).toBeEnabled();

  const audit = await new AxeBuilder({ page }).include('fieldset[data-explanation-code="UNANSWERED_QUESTIONS"]').analyze();
  expect(audit.violations).toEqual([]);

  await panel.getByRole('button', { name: 'Accept 2 unanswered questions' }).click();
  await expect(panel.getByRole('button', { name: 'Accepted 2 unanswered questions' })).toBeDisabled();

  await panel.getByRole('link', { name: 'Detail' }).click();
  await expect(page.locator('.formspec-workspace__content[data-formspec-section="followup"]')).toBeVisible();
  await page.getByLabel('Detail').fill('Provided detail');

  await page.getByRole('link', { name: 'Summary' }).click();
  await page.getByLabel('Answer').fill('');
  await page.getByRole('link', { name: 'Review draft' }).click();

  await expect(panel.locator('.formspec-warning-acknowledgement-added')).toHaveText('Newly unanswered: Answer');
  await expect(panel.locator('.formspec-warning-acknowledgement-removed')).toHaveText('Now answered: Detail');
  await panel.getByRole('button', { name: 'Accept 2 unanswered questions' }).click();
  await expect(panel.getByRole('button', { name: 'Accepted 2 unanswered questions' })).toBeDisabled();
});

test('explicit-save respondent cannot commit unsaved edits from review and preserves them on return', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&subject&review&warnings#/filing/2025');
  // By role: after Save draft the form also shows the "unanswered questions" region, whose name contains "answer".
  const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
  await answer.fill('Shown as answered on the committed review');
  await page.getByLabel('Show detail').check();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('banner').getByRole('status')).toContainText('Draft saved');

  // Keep one unsaved edit in this form's retained writer. Only explicitly saved data belongs to the review.
  await answer.fill('');
  await page.getByRole('link', { name: 'Review draft' }).click();
  const group = page.locator('fieldset[data-explanation-code="UNANSWERED_QUESTIONS"]');
  await expect(group.getByRole('button', { name: 'Accept 2 unanswered questions' })).toBeEnabled();
  expect(await group.getByRole('link').allTextContents()).toEqual(['Detail', 'Notes']);

  await group.getByRole('button', { name: 'Accept 2 unanswered questions' }).click();
  await expect.poll(async () =>
    (await group.getByRole('button').innerText()).startsWith('Accepted ') ||
    /conflict|changed somewhere else|could not be saved|save failed|could not save/i.test(
      await page.getByRole('banner').getByRole('status').innerText(),
    ),
  ).toBeTruthy();
  expect(await group.innerText()).not.toContain('Accepted 3 unanswered questions');

  // Returning to the form must preserve the unsaved edit in the retained writer.
  await page.getByRole('link', { name: 'Filing', exact: true }).click();
  await expect(page.getByLabel('Answer')).toHaveValue('');
});

test('a respondent review link carries its field path and focuses the requested second field on the destination section', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&auto&subject&review&warnings#/filing/2025');
  await page.getByLabel('Answer').fill('Summary filed');
  await page.getByLabel('Show detail').check();
  await page.getByRole('link', { name: 'Review draft' }).click();

  const group = page.locator('fieldset[data-explanation-code="UNANSWERED_QUESTIONS"]');
  const detail = group.getByRole('link', { name: 'Detail' });
  const notes = group.getByRole('link', { name: 'Notes' });
  const detailHref = await detail.getAttribute('href');
  const notesHref = await notes.getAttribute('href');
  expect(detailHref).toBeTruthy();
  expect(notesHref).toBeTruthy();
  expect(notesHref).not.toBe(detailHref);

  await notes.click();
  await expect(page.locator('.formspec-workspace__content[data-formspec-section="followup"]')).toBeVisible();
  await expect(page.getByLabel('Notes')).toBeFocused({ timeout: 2000 });
});

test('a year-scoped overview tracker selects the covering multi-year period plan without period keys in the overview URL', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&periodRange&submit#/years/2025');
  const tracker = page.locator('[data-slot-type="form-status"]');
  const unmatched = tracker.locator('[role="link"][aria-disabled="true"]', { hasText: 'Period Plan' });
  await expect(unmatched).toHaveAccessibleDescription('Subject unavailable');

  // Save a 2024-2026 period plan draft on its multi-year route, then verify /years/2025 links directly to it.
  await page.goto('/surface-drafts.html?form&periodRange&submit#/plans/2024/2026');
  await page.getByLabel('Answer').fill('Three-year plan');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved in this browser.')).toBeVisible();

  const recordGetAllStores = () => {
    const win = window as unknown as { reviewStores?: string[] };
    win.reviewStores = [];
    const original = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      win.reviewStores!.push(this.name);
      return original.apply(this, args);
    };
  };
  await page.addInitScript(recordGetAllStores);
  await page.evaluate(recordGetAllStores);

  await page.goto('/surface-drafts.html?form&periodRange&submit#/years/2025');
  const planLink = tracker.getByRole('link', { name: 'Period Plan', exact: true });
  await expect(planLink).toHaveAttribute('href', '#/plans/2024/2026?slot=form&edition=edition');
  await expect(planLink).toHaveAccessibleDescription('Ready');
  const readStores = await page.evaluate(() => (window as unknown as { reviewStores?: string[] }).reviewStores ?? []);
  expect(readStores).not.toContain('editable');
  expect(readStores).not.toContain('filings');

  // A year outside 2024-2026 or another preview edition finds no covering period plan.
  await page.goto('/surface-drafts.html?form&periodRange&submit#/years/2030');
  await expect(tracker.locator('[role="link"][aria-disabled="true"]', { hasText: 'Period Plan' }))
    .toHaveAccessibleDescription('Subject unavailable');
  await page.goto('/surface-drafts.html?form&periodRange&submit#/years/2025?edition=edition-b');
  await expect(tracker.locator('[role="link"][aria-disabled="true"]', { hasText: 'Period Plan' }))
    .toHaveAccessibleDescription('Subject unavailable');

  // Clicking the resolved link on /years/2025 opens /plans/2024/2026 and submitting updates /years/2025 to Filed.
  await page.goto('/surface-drafts.html?form&periodRange&submit#/years/2025');
  await planLink.click();
  await expect(page.getByLabel('Answer')).toHaveValue('Three-year plan');
  await page.getByRole('button', { name: 'Submit report' }).click();
  const statusAnnouncements = page.getByRole('status').filter({ hasText: /\S/ });
  await expect(statusAnnouncements).toHaveCount(1);
  await expect(statusAnnouncements).toContainText('Submitted');
  await page.goto('/surface-drafts.html?form&periodRange&submit#/years/2025');
  await expect(tracker.getByRole('link', { name: 'Period Plan', exact: true }))
    .toHaveAccessibleDescription(/^Filed\b/);
  await expect(tracker.getByText(/^Receipt reference: urn:uuid:/)).toBeVisible();
  await expect(tracker.getByRole('link', { name: 'Period Plan', exact: true }))
    .toHaveAttribute('href', '#/plans/2024/2026?slot=form&edition=edition');
});

test('upgrades a version-3 browser filing or draft into v5 summaries and fails closed on incomplete, tampered, orphaned, or mismatched v3 records', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  const upgradedFiling = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-filing'),
  );
  expect(upgradedFiling.dbVersion).toBe(5);
  expect(upgradedFiling.exact).toMatchObject({
    filing: { status: 'filed', receiptRef: 'urn:v3:filed', responseHash: upgradedFiling.responseHash },
  });
  expect(upgradedFiling.range).toMatchObject({
    subjectMatch: 'matched',
    subject: { type: 'urn:test:v3-plan', keys: { first_period: 2024, last_period: 2026 } },
    filing: { status: 'filed', receiptRef: 'urn:v3:filed', responseHash: upgradedFiling.responseHash },
  });

  const upgradedDraft = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-draft'),
  );
  expect(upgradedDraft.dbVersion).toBe(5);
  expect(upgradedDraft.exact).toMatchObject({
    draft: { status: 'current', form: { filled: 1, total: 1, ready: true } },
    filing: { status: 'none' },
  });
  expect(upgradedDraft.range).toMatchObject({
    subjectMatch: 'matched',
    subject: { type: 'urn:test:v3-plan', keys: { first_period: 2024, last_period: 2026 } },
    draft: { status: 'current', form: { filled: 1, total: 1, ready: true } },
    filing: { status: 'none' },
  });

  const upgradedInitialized = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-initialized-minted'),
  );
  expect(upgradedInitialized.dbVersion).toBe(5);
  expect(upgradedInitialized.exact).toEqual({
    draft: { status: 'unavailable' },
    filing: { status: 'none' },
  });
  expect(upgradedInitialized.range).toEqual({
    subjectMatch: 'matched',
    subject: { type: 'urn:test:v3-plan', keys: { first_period: 2024, last_period: 2026, unit: 'minted-v3-unit-1' } },
    draft: { status: 'unavailable' },
    filing: { status: 'none' },
  });

  const upgradedPrepared = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-prepared-draft'),
  );
  expect(upgradedPrepared.dbVersion).toBe(5);
  expect(upgradedPrepared.loaded).toMatchObject({ status: 'loaded', draft: { revision: 'v3-prepared-1' } });
  expect(upgradedPrepared.selectedCurrent).toMatchObject({ status: 'available', value: { answer: 'prepared-in-v3' } });
  expect(upgradedPrepared.selectedCompleted).toMatchObject({ status: 'available', none: true });

  const upgradedV2ThroughV3 = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-v2-through-v3'),
  );
  expect(upgradedV2ThroughV3.dbVersion).toBe(5);
  expect(upgradedV2ThroughV3.loaded).toMatchObject({ status: 'loaded', draft: { revision: 'version-two-draft', responseJson: '{}' } });

  const upgradedHistorical = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-historical-filing-new-subject'),
  );
  expect(upgradedHistorical.dbVersion).toBe(5);
  expect(upgradedHistorical.other).toEqual({ draft: { status: 'absent' }, filing: { status: 'none' } });

  const upgradedImplicitMissing = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-implicit-missing-summary'),
  );
  expect(upgradedImplicitMissing.dbVersion).toBe(5);
  expect(upgradedImplicitMissing.loaded).toMatchObject({ status: 'loaded', draft: { revision: 'v3-rev-1' } });
  expect(upgradedImplicitMissing.exact).toEqual({ draft: { status: 'unavailable' }, filing: { status: 'none' } });

  const upgradedHistoricalStart = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-start-same-names-new-type'),
  );
  expect(upgradedHistoricalStart.dbVersion).toBe(5);
  expect(upgradedHistoricalStart.other).toEqual({ draft: { status: 'absent' }, filing: { status: 'none' } });

  const upgradedRealRestart = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('valid-start-real-restart'),
  );
  expect(upgradedRealRestart.dbVersion).toBe(5);
  expect(upgradedRealRestart.loaded).toMatchObject({ status: 'initialized' });
  expect(upgradedRealRestart.other).toEqual({ draft: { status: 'absent' }, filing: { status: 'none' } });

  const upgradedExtraPlanField = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling('plan-extra-field'),
  );
  expect(upgradedExtraPlanField.dbVersion).toBe(5);
  expect(upgradedExtraPlanField.exact).toEqual({
    draft: { status: 'current', form: { filled: 1, total: 1, toFix: 0, toCheck: 0, ready: true }, sections: {} },
    filing: { status: 'none' },
  });
  expect(upgradedExtraPlanField.exact?.draft).not.toHaveProperty('reviewLabel');
  expect(JSON.stringify(upgradedExtraPlanField.rawSummaries)).not.toContain('reviewLabel');

  for (const mode of [
    'incomplete-filing',
    'corrupt-filing',
    'changed-answer',
    'wrong-hash',
    'orphan-with-start',
    'wrong-draft-definition',
    'wrong-snapshot-url',
    'missing-snapshot-data',
    'invalid-plan-id',
    'start-wrong-definition',
    'start-extra-issued-key',
    'start-unknown-version',
    'start-known-type-change',
    'bad-pins',
    'missing-revision',
    'missing-snapshot',
    'negative-count',
    'missing-form',
    'start-no-version',
    'start-no-parents',
  ] as const) {
    const refused = await page.evaluate(
      async (m) => (await import('/surface-drafts-port.ts')).upgradeVersionThreeFiling(m),
      mode,
    );
    expect(refused.dbVersion, mode).toBe(3);
    expect(refused.exact, mode).toEqual({ draft: { status: 'unavailable' }, filing: { status: 'unavailable' } });
    expect(refused.range, mode).toEqual({ draft: { status: 'unavailable' }, filing: { status: 'unavailable' } });
    expect(refused.loaded, mode).toEqual({ status: 'unavailable' });
  }
});

test('upgrades an existing main 5-store version-4 database to version 5, retaining receipts, plans, and seed markers while enabling new filings', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  const migrated = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).upgradeMainFiveStoreV4Database(),
  );
  expect(migrated.dbVersion).toBe(5);
  expect(migrated.storeNames).toContain('filingSummaries');
  expect(migrated.exactFiling).toMatchObject({
    draft: { status: 'absent' },
    filing: { status: 'filed', receiptRef: 'urn:main-v4:receipt-1', responseHash: migrated.firstHash, sample: 'preview-submit', review: 'available', comments: [] },
  });
  expect(migrated.rangeFiling).toMatchObject({
    subjectMatch: 'matched',
    subject: { type: 'urn:test:v4-plan', keys: { first_period: 2024, last_period: 2026 } },
    filing: { status: 'filed', receiptRef: 'urn:main-v4:receipt-1', responseHash: migrated.firstHash },
  });
  expect(migrated.exactDraft).toMatchObject({
    draft: { status: 'current', form: { filled: 1, total: 1, toFix: 0, toCheck: 0, ready: true }, sections: {} },
    filing: { status: 'none' },
  });
  expect(migrated.rangeDraft).toMatchObject({
    subjectMatch: 'matched',
    subject: { type: 'urn:test:v4-draft', keys: { first_period: 2027, last_period: 2029 } },
    draft: { status: 'current', form: { filled: 1, total: 1, toFix: 0, toCheck: 0, ready: true }, sections: {} },
    filing: { status: 'none' },
  });
  expect(JSON.stringify([migrated.rawSummariesBeforeSave, migrated.exactDraft, migrated.rangeDraft])).not.toContain('reviewLabel');
  expect(migrated.exactDraft?.draft).toEqual({ status: 'current', form: { total: 1, filled: 1, toFix: 0, toCheck: 0, ready: true }, sections: {} });
  expect(migrated.rangeDraft?.draft).toEqual({ status: 'current', form: { total: 1, filled: 1, toFix: 0, toCheck: 0, ready: true }, sections: {} });
  expect(migrated.seedsCount).toBe(1);
  expect(migrated.secondFiling).toMatchObject({ status: 'filed', receiptRef: 'urn:main-v4:receipt-2' });
  expect(migrated.afterSecondFiling).toMatchObject({
    filing: { status: 'filed', receiptRef: 'urn:main-v4:receipt-2' },
  });
});

test('recovers restarted seeded minted drafts from main v4 without blocking unrelated forms', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  for (const [restart, includeFixture] of [[false, true], [true, true], [true, false]] as const) {
    const result = await page.evaluate(
      async ([flag, withFix]) => (await import('/surface-drafts-port.ts')).upgradeMainSeededMintedDraft(flag, withFix),
      [restart, includeFixture] as const,
    );
    expect(result.dbVersion, `restart=${restart} fixture=${includeFixture}`).toBe(5);
    expect(result.loaded, `restart=${restart} fixture=${includeFixture}`).toBe(restart ? 'initialized' : 'loaded');
    expect(result.other, `restart=${restart} fixture=${includeFixture}`).toBe('absent');
    expect(result.seedsCount, `restart=${restart} fixture=${includeFixture}`).toBe(1);
    if (includeFixture) {
      expect(result.range, `restart=${restart} fixture=${includeFixture}`).toMatchObject({
        subjectMatch: 'matched',
        subject: { type: 'urn:synthetic:unit', keys: { unit: 'fixed-id' } },
      });
    } else {
      expect(result.exact, 'restart=true without fixture').toEqual({ draft: { status: 'unavailable' }, filing: { status: 'none' } });
      expect(result.range, 'restart=true without fixture keeps range unavailable').toEqual({ draft: { status: 'unavailable' }, filing: { status: 'unavailable' } });
    }
  }
});

test('keeps range discovery unavailable for unresolved seeded rows, recovers when owner fixture returns, and rejects missing markers or invalid addresses', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  for (const mode of ['no-marker', 'no-marker-fixture', 'bad-marker', 'bad-address'] as const) {
    const refused = await page.evaluate(
      async (m) => (await import('/surface-drafts-port.ts')).upgradeMainSeededEdgeCase(m),
      mode,
    );
    expect(refused.dbVersion, mode).toBe(4);
    expect(refused.sibling, mode).toBe('unavailable');
  }
  for (const mode of ['range-unresolved', 'two'] as const) {
    const unresolved = await page.evaluate(
      async (m) => (await import('/surface-drafts-port.ts')).upgradeMainSeededEdgeCase(m),
      mode,
    );
    expect(unresolved.dbVersion, mode).toBe(5);
    expect(unresolved.sibling, mode).toBe('absent');
    expect(unresolved.load, mode).toBe('initialized');
    expect(unresolved.editable, mode).not.toHaveProperty('subject');
    expect(unresolved.summary, mode).not.toHaveProperty('subject');
    expect(unresolved.exact, mode).toEqual({ draft: { status: 'unavailable' }, filing: { status: 'none' } });
    expect(unresolved.range?.draft.status, mode).toBe('unavailable');
    expect(unresolved.range?.subjectMatch, mode).not.toBe('matched');
    expect(unresolved.range, mode).not.toHaveProperty('subject');
  }
  for (const mode of ['edition-return', 'edition-return-filing'] as const) {
    const recovered = await page.evaluate(
      async (m) => (await import('/surface-drafts-port.ts')).upgradeMainSeededEdgeCase(m),
      mode,
    );
    expect(recovered.dbVersion, mode).toBe(5);
    expect(recovered.sibling, mode).toBe('absent');
    expect(recovered.load, mode).toBe('initialized');
    expect(recovered.editable?.revision, mode).toBe(recovered.originalRevision);
    expect(recovered.editable, mode).not.toHaveProperty('responseJson');
    expect(recovered.summary?.plans, mode).toBeNull();
    expect(recovered.seed, mode).toEqual({ seeded: true });
    expect(recovered.range, mode).toMatchObject({
      subjectMatch: 'matched',
      subject: { type: 'urn:review:plan', keys: { year: 2025, unit: 'first' } },
    });
  }
});

test('validates main v4 start and editable version histories per Core 6.2 across all algorithms, restarts, older bundles, bridges, and sibling scopes', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  type VersionCase = {
    label: string;
    issued: string;
    active: string;
    algorithm: 'semver' | 'date' | 'integer' | 'natural';
    restart: boolean;
    want: 4 | 5;
    expectedLoad?: 'initialized' | 'loaded' | 'version-mismatch' | 'unavailable';
    expectedRetry?: 'started' | 'conflict' | 'unavailable';
    altered?: string;
    foreign?: boolean;
    save?: boolean;
    activeAlgorithm?: 'semver' | 'date' | 'integer' | 'natural';
    legacyV3Summary?: boolean;
  };
  // Adopted owner policy (review8 final.md:36 + review9 final.md:35):
  // - In v4, neither `{ seeded: true }` + empty editable (also written by returning fixtures for user-owned
  //   drafts without restart) nor `{ plans: null }` nor saved editables can distinguish a genuine restart
  //   from an altered start attempt, and v4 omitted each historical pin's issuing versionAlgorithm (so a valid
  //   Core 6.2 natural label such as '1.0' has the same stored representation as malformed SemVer).
  // - Quarantine ambiguous v4 mismatches per-unit (`unverifiedStartHistory: true`, v5, sibling open, unit
  //   unavailable across exact/range/current/completed) and reserve DB-wide rollback (v4) for demonstrable
  //   corruption (invalid Core 6.2 syntax under every algorithm, e.g. empty version string, or schema/key corruption).
  const cases: readonly VersionCase[] = [
    // Unambiguous clean v4 records -> v5 without quarantine.
    { label: 'identical pin', issued: '1.2.3', active: '1.2.3', algorithm: 'semver', restart: false, want: 5, expectedLoad: 'initialized', expectedRetry: 'started' },
    { label: 'newer locally stored, older bundle opened', issued: '2.0.0', active: '1.0.0', algorithm: 'semver', restart: false, want: 5, expectedLoad: 'version-mismatch' },
    { label: 'algorithm change from integer to semver (untouched)', issued: '009', active: '2.0.0', algorithm: 'integer', activeAlgorithm: 'semver', restart: false, want: 5, expectedLoad: 'version-mismatch' },
    { label: 'v3->v4 bridge load (legacy summary intact)', issued: '1.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '1.0.0', want: 5, legacyV3Summary: true, expectedLoad: 'initialized' },
    { label: 'saved authentic', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, save: true, want: 5, expectedLoad: 'loaded', expectedRetry: 'started' },
    // Ambiguous v4 start/editable mismatches (incl. marked restarts, cross-algorithm restarts, and historical labels) -> per-unit quarantine (v5, sibling open).
    { label: 'multi-digit upward', issued: '1.9.12', active: '1.10.0', algorithm: 'semver', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'prerelease numeric upward', issued: '2.0.0-rc.2', active: '2.0.0-rc.11', algorithm: 'semver', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'prerelease into release', issued: '2.0.0-beta', active: '2.0.0', algorithm: 'semver', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'genuine downgrade via main restart', issued: '2.0.0', active: '1.0.0', algorithm: 'semver', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'equal precedence distinct build via main restart', issued: '2.0.0+first', active: '2.0.0+second', algorithm: 'semver', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'integer numeric transition', issued: '9', active: '10', algorithm: 'integer', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'integer with leading zero from main', issued: '009', active: '10', algorithm: 'integer', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'calendar date transition', issued: '2024.02.29', active: '2024.03.01', algorithm: 'date', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'valid century day', issued: '2000.02.29', active: '2025.01.01', algorithm: 'date', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'natural real restart', issued: 'spring', active: 'winter', algorithm: 'natural', restart: true, want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'integer restart, neighbor opens first', issued: '9', active: '10', algorithm: 'integer', restart: true, want: 5, foreign: true },
    { label: 'date restart, neighbor opens first', issued: '2024.02.29', active: '2024.03.01', algorithm: 'date', restart: true, want: 5, foreign: true },
    { label: 'natural restart, neighbor opens first', issued: 'spring', active: 'winter', algorithm: 'natural', restart: true, want: 5, foreign: true },
    { label: 'bridge-ready / untouched earlier start', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '1.0.0', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'future semver in untouched start', issued: '1.0.0', active: '1.0.0', algorithm: 'semver', restart: false, altered: '9.0.0', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'unissued natural label in untouched start', issued: 'winter', active: 'winter', algorithm: 'natural', restart: false, altered: 'never-issued', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'saved no restart inconsistent attempt', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, save: true, altered: '1.0.0', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical natural-compatible label 1.0 in untouched start', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '1.0', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical label 1.0.0-rc..2', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '1.0.0-rc..2', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical label 2.0.0-01', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '2.0.0-01', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical label 1.0.0+a..b', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '1.0.0+a..b', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical natural label no-version', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: 'no-version', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical label 1.0.1.1', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '1.0.1.1', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'historical label 2025.02.30', issued: '2025.03.01', active: '2025.03.01', algorithm: 'date', restart: false, altered: '2025.02.30', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'marked historical label 1.0', issued: '1.0.0', active: '2.0.0', algorithm: 'semver', restart: true, altered: '1.0', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'marked historical label 1.0.0-rc..2', issued: '1.0.0', active: '2.0.0', algorithm: 'semver', restart: true, altered: '1.0.0-rc..2', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'marked historical label 2.0.0-01', issued: '1.0.0', active: '2.0.0', algorithm: 'semver', restart: true, altered: '2.0.0-01', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'marked historical label 1.0.0+a..b', issued: '1.0.0', active: '2.0.0', algorithm: 'semver', restart: true, altered: '1.0.0+a..b', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    { label: 'marked historical label 1900.02.29', issued: '2024.01.01', active: '2025.01.01', algorithm: 'date', restart: true, altered: '1900.02.29', want: 5, expectedLoad: 'unavailable', expectedRetry: 'unavailable' },
    // Demonstrable corruption (invalid Core 6.2 syntax under every algorithm) -> atomic DB-wide rollback (v4).
    { label: 'empty version string in attempt', issued: '2.0.0', active: '2.0.0', algorithm: 'semver', restart: false, altered: '', want: 4 },
    { label: 'marked empty version string in attempt', issued: '1.0.0', active: '2.0.0', algorithm: 'semver', restart: true, altered: '', want: 4 },
  ];
  for (const c of cases) {
    const observed = await page.evaluate(
      async (args) => (await import('/surface-drafts-port.ts')).upgradeMainV4VersionPath(args),
      {
        issued: c.legacyV3Summary ? '2.0.0' : c.issued,
        active: c.active,
        algorithm: c.algorithm,
        restart: c.restart,
        altered: c.altered,
        foreign: c.foreign,
        save: c.save,
        activeAlgorithm: c.activeAlgorithm,
        legacyV3Summary: c.legacyV3Summary,
      },
    );
    expect(observed.dbVersion, c.label).toBe(c.want);
    if (c.want === 5) {
      expect(observed.sibling, c.label).toBe('absent');
      if (!c.foreign && c.expectedLoad) {
        expect(observed.load, c.label).toBe(c.expectedLoad);
      }
      if (!c.foreign && c.expectedRetry) {
        expect(observed.retry, c.label).toBe(c.expectedRetry);
      }
      if (c.expectedLoad === 'unavailable') {
        expect(observed.exact?.draft.status, c.label).toBe('unavailable');
        expect(observed.exact?.filing.status, c.label).toBe('unavailable');
        expect(observed.range?.draft.status, c.label).toBe('unavailable');
        expect(observed.range?.subjectMatch, c.label).not.toBe('matched');
        expect(observed.range, c.label).not.toHaveProperty('subject');
        expect(observed.currentSelect, c.label).toBe('unavailable');
        expect(observed.quarantinedRestart, c.label).toBe('unavailable');
      }
    }
  }
});

test('direct browser filing store reads cold range summaries on a fresh uninitialized page using summary stores only', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  const result = await page.evaluate(
    async () => (await import('/surface-drafts-port.ts')).coldDirectBrowserRead(),
  );
  expect(result.observation).toMatchObject({
    subjectMatch: 'matched',
    subject: { type: 'urn:test:cold-plan', keys: { start_year: 2024, end_year: 2026 } },
    filing: { status: 'filed', receiptRef: 'urn:cold:browser-direct' },
  });
  expect(result.getAllStores).toContain('filingSummaries');
  expect(result.getAllStores).not.toContain('filings');
  expect(result.getAllStores).not.toContain('editable');
  expect(result.rawJsonParseDuringRead).toBe(0);
});

test('enforces per-unit quarantine across exact filings, range reads, current, and completed selections while keeping healthy sibling units available', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  const unavailable = { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } };
  for (const mode of [
    'integer-untouched',
    'integer-restarted',
    'integer-restarted-historical',
    'owned-fixture-marker',
    'restart',
    'restart-save',
    'bridge-ready',
  ] as const) {
    const r = await page.evaluate(
      async (m) => (await import('/surface-drafts-port.ts')).upgradeMainV4QuarantineScope(m),
      mode,
    );
    expect(r.version, mode).toBe(5);
    expect(r.siblingAnswer, mode).toBe('kept');
    expect(r.revisionRetained, mode).toBe(true);
    expect(r.goodRange, mode).toBe('matched');
    expect(r.healthySelection, mode).toMatchObject({ status: 'available', none: false, value: { x: 'healthy' } });
    if (mode === 'integer-untouched') {
      expect(r.load, mode).toBe('version-mismatch');
      expect(r.flags, mode).toEqual([undefined, undefined]);
      expect(r.exact?.draft.status, mode).toBe('stale');
      expect(r.exact?.filing.status, mode).toBe('filed');
      expect(r.ownCompleted?.status, mode).toBe('available');
    } else {
      expect(r.flags, mode).toEqual([true, true]);
      expect(r.load, mode).toBe('unavailable');
      expect(r.retry, mode).toBe('unavailable');
      expect(r.save, mode).toBe('unavailable');
      expect(r.restart, mode).toBe('unavailable');
      expect(r.submit, mode).toBe('unavailable');
      expect(r.ownCurrent, mode).toBe('unavailable');
      expect(r.ownCompleted, mode).toEqual({ status: 'unavailable' });
      expect(r.exact, mode).toEqual(unavailable);
      expect(r.range, mode).toEqual(unavailable);
    }
  }
});

test('retains unresolved row Definition version during range discovery and rejects planted legacy quarantine markers', async ({ page }) => {
  await page.goto('/surface-drafts.html');
  const unavailable = { draft: { status: 'unavailable' }, filing: { status: 'unavailable' } };
  for (const mode of ['compatible', 'historical-type-change'] as const) {
    const r = await page.evaluate(
      async (m) => (await import('/surface-drafts-port.ts')).upgradeMainUnresolvedTypeChange(m),
      mode,
    );
    expect(r.version, mode).toBe(5);
    expect(r.range, mode).toEqual(unavailable);
    if (mode === 'compatible') {
      expect(r.unrelated?.subjectMatch, mode).toBe('none');
    }
  }
  for (const dbVer of [2, 3, 4] as const) {
    for (const [store, value] of [['clean', null], ['editable', true], ['summaries', false]] as const) {
      const r = await page.evaluate(
        async (args) => (await import('/surface-drafts-port.ts')).upgradePlantedQuarantineFlag(args.dbVer, args.store, args.value),
        { dbVer, store, value },
      );
      if (store === 'clean') {
        expect(r, `v${dbVer} clean`).toEqual({ version: 5, sibling: 'absent' });
      } else {
        expect(r, `v${dbVer} ${store}`).toEqual({ version: dbVer, sibling: 'unavailable' });
      }
    }
  }
});

for (const delayed of [false, true]) {
  test(`reattached slot observes the new fieldset and releases all observers (two frames detached = ${delayed})`, async ({ page }) => {
    await page.addInitScript(() => {
      const seen = new Set<MutationObserver>();
      const active = new Set<MutationObserver>();
      const observe = MutationObserver.prototype.observe;
      const disconnect = MutationObserver.prototype.disconnect;
      MutationObserver.prototype.observe = function (el, config) {
        if (config?.attributeFilter?.includes('open') && config.attributeFilter.includes('hidden')) {
          seen.add(this);
          active.add(this);
        }
        return observe.call(this, el, config);
      };
      MutationObserver.prototype.disconnect = function () {
        active.delete(this);
        return disconnect.call(this);
      };
      Object.assign(window, { review10Observers: () => ({ total: seen.size, active: active.size }) });
    });
    await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
    const checkpoint = page.locator('button[data-action-ref="autosave"]');
    const footer = page.locator('.fs-surface-transitions button');
    await expect(checkpoint).toBeVisible();
    await expect(footer).toHaveCount(0);
    await checkpoint.evaluate(async (el, waitFrames) => {
      const slot = el.closest<HTMLElement>('.fs-surface-slot')!;
      const host = document.createElement('fieldset');
      host.dataset.review10 = 'host';
      slot.before(host);
      slot.remove();
      if (waitFrames) {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      host.append(slot);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      host.disabled = true;
    }, delayed);
    await expect(checkpoint).toBeDisabled();
    await expect(footer).toHaveCount(1, { timeout: 1200 });
    await footer.click({ trial: true });
    await page.locator('fieldset[data-review10]').evaluate((el) => { (el as HTMLFieldSetElement).disabled = false; });
    await expect(footer).toHaveCount(0, { timeout: 1200 });
    await checkpoint.click();
    await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
    const observers = await page.evaluate(() => (window as unknown as { review10Observers: () => { total: number; active: number } }).review10Observers());
    expect(observers.total).toBeGreaterThan(2);
    expect(observers.active).toBe(0);
  });
}

for (const inertAncestor of [false, true]) {
  test(`route matches actual user input when the button explicitly sets CSS interactivity auto (ancestor inert = ${inertAncestor})`, async ({ page }) => {
    await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter#/filing');
    const checkpoint = page.locator('button[data-action-ref="autosave"]');
    const fallback = page.getByRole('button', { name: 'Continue to Overview', exact: true });
    await expect(checkpoint).toBeVisible();
    await expect(fallback).toHaveCount(0);

    await checkpoint.evaluate((el, isInert) => {
      const button = el as HTMLButtonElement;
      button.style.setProperty('interactivity', 'auto');
      button.closest<HTMLElement>('.fs-surface-slot')!.style.setProperty('interactivity', isInert ? 'inert' : 'auto');
    }, inertAncestor);
    const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await settle();
    const state = await checkpoint.evaluate((el) => {
      const button = el as HTMLButtonElement;
      button.blur();
      button.focus();
      const rect = button.getBoundingClientRect();
      const x = rect.x + rect.width / 2;
      const y = rect.y + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        focused: document.activeElement === button,
        hitButton: hit === button || button.contains(hit),
        x,
        y,
      };
    });
    const beforeResize = await fallback.count();
    await page.mouse.click(state.x, state.y);
    await settle();
    const afterClick = new URL(page.url()).hash;
    await page.setViewportSize({ width: 1010, height: 700 });
    await settle();
    const afterResize = await fallback.count();
    if (!inertAncestor) {
      expect(state.focused).toBe(true);
      expect(state.hitButton).toBe(true);
      await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
    } else {
      expect(state.focused).toBe(false);
      expect(state.hitButton).toBe(false);
      expect(afterClick).toBe('#/filing');
      expect(beforeResize).toBe(1);
      expect(afterResize).toBe(1);
      await fallback.click();
      await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
    }
  });
}

test('modal exemption stops at an explicitly inert dialog', async ({ page }) => {
  await page.goto('/surface-drafts.html?form&authoredAutosave&withoutWriter&visibilityCase=modal&variant=true#/filing');
  await page.getByRole('button', { name: 'Open checkpoint', exact: true }).click();
  const checkpoint = page.locator('button[data-action-ref="autosave"]');
  const footer = page.locator('.fs-surface-transitions button');
  await expect(checkpoint).toBeVisible();
  await checkpoint.evaluate((el) => {
    el.closest<HTMLElement>('.fs-surface-slot')!.inert = true;
    el.closest('dialog')!.inert = true;
  });
  await expect(footer).toHaveCount(1);
  await checkpoint.evaluate((el) => { el.closest('dialog')!.inert = false; });
  await expect(footer).toHaveCount(0);
  await checkpoint.click();
  await expect(page).toHaveURL(/#\/overview(?:\?|$)/);
});
