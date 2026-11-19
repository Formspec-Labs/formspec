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
    await page.evaluate(async () => (await import('/surface-drafts-port.ts')).resumePausedSeededStore());
    const after = await other.evaluate(async name => (await import('/surface-drafts-port.ts')).operateSeededStore({ db: name, op: 'inspect' }), db);

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
