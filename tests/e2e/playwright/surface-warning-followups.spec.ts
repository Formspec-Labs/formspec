/** @filedesc Filing map and workspace Findings count each owed warning follow-up once, and none after it is answered. */
import { expect, test, type Page } from '@playwright/test';

const fixture = '/surface-drafts.html?form&auto&subject&review&warnings&tracker';
const open = (page: Page, name: string) => page.getByRole('navigation').getByRole('link', { name, exact: true }).click();
// By role: the explanation region beside Answer is labelled "Answer is unusual.".
const answer = (page: Page) => page.getByRole('textbox', { name: 'Answer', exact: true });

/** Leave by the app's own link, as a respondent does, so the form commits its pending edit first. */
async function filingMap(page: Page, owed: number) {
  await open(page, 'Overview');
  const tracker = page.locator('[data-slot-type="filing-status"]');
  const row = tracker.locator('.fs-surface-filing__row');
  await expect(row).toBeVisible();
  await expect(tracker.locator('.fs-surface-filing__totals div', { hasText: 'To check' }).locator('dd')).toHaveText(String(owed));
  if (owed) await expect(row.locator('.fs-surface-filing__check')).toHaveText(`${owed} to check`);
  else await expect(row.locator('.fs-surface-filing__check')).toHaveCount(0);
  await expect(row.locator('.fs-surface-filing__status')).toHaveText(owed ? 'In progress' : 'Ready');
}

/**
 * The form's own margin. It re-reads what is owed once typing pauses, so each check names a row or count the
 * last read could not have shown; a margin with nothing owed is read on arrival, which reads at once.
 */
function findings(page: Page) {
  const margin = page.locator('aside.formspec-workspace__findings');
  return {
    toCheck: margin.locator('.formspec-workspace__section-badge--check'),
    rows: margin.locator('li[data-follow-up]'),
    row: (followUp: string) => margin.locator(`li[data-follow-up="${followUp}"]`),
  };
}

/** Nothing owed: the Filing map says so, and so does the margin read on returning to the form. */
async function nothingOwed(page: Page) {
  await filingMap(page, 0);
  await open(page, 'Filing');
  await expect(answer(page)).toBeVisible();
  await expect(findings(page).toCheck).toHaveCount(0);
  await expect(findings(page).rows).toHaveCount(0);
}

test('an owed group acknowledgement counts once on the Filing map and in Findings, which links to its review control', async ({ page }) => {
  await page.goto(`${fixture}#/filing/2025`);
  const margin = findings(page);
  const group = margin.row('UNANSWERED_QUESTIONS');
  // Blank on arrival: Answer and Notes. Answering one leaves one; showing Detail adds another.
  await expect(group).toHaveText('Warning: 2 unanswered questions');
  await answer(page).fill('Initial summary');
  await expect(group).toHaveText('Warning: 1 unanswered question');
  await page.getByLabel('Show detail').check();
  await expect(group).toHaveText('Warning: 2 unanswered questions');
  // Detail and Notes share one code: the respondent owes one acknowledgement, not two.
  await expect(margin.toCheck).toHaveText('1 to check');
  await expect(margin.rows).toHaveCount(1);
  await filingMap(page, 1);

  // The Findings row is the way to the control that answers it.
  await open(page, 'Filing');
  await group.getByRole('link', { name: 'Warning: 2 unanswered questions' }).click();
  const review = page.locator('fieldset[data-explanation-code="UNANSWERED_QUESTIONS"]');
  const accept = review.getByRole('button', { name: 'Accept 2 unanswered questions' });
  await expect(accept).toBeFocused();
  await accept.click();
  await expect(review.getByRole('button', { name: 'Accepted 2 unanswered questions' })).toBeDisabled();

  // Accepting answers the follow-up. The two underlying warnings must not come back as two things to check.
  await open(page, 'Filing');
  await nothingOwed(page);

  // A different answer leaves Detail and Notes blank, so the acknowledgement still covers them. Only the
  // autosave writer saves this summary: without the explanation state it would count the 2 warnings.
  await answer(page).fill('Revised summary');
  await nothingOwed(page);

  // Clearing an answer changes what the acknowledgement covered, so it is owed again, once, for three blanks.
  await answer(page).fill('');
  await expect(group).toHaveText('Warning: 3 unanswered questions');
  await expect(margin.toCheck).toHaveText('1 to check');
  await filingMap(page, 1);
});

test('an owed explanation counts once on both screens, its Findings row reaches its control, and answering clears both', async ({ page }) => {
  await page.goto(`${fixture}&explain#/filing/2025`);
  const margin = findings(page);
  await expect(margin.row('UNANSWERED_QUESTIONS')).toHaveText('Warning: 2 unanswered questions');
  // Notes answered and Detail hidden, so no blank is left; an unusual Answer asks for an explanation instead.
  await page.getByRole('link', { name: 'Follow-up' }).click();
  await page.getByLabel('Notes').fill('Some notes');
  await page.getByRole('link', { name: 'Summary' }).click();
  await answer(page).fill('Unusual');
  const owed = margin.row('unusualAnswer');
  await expect(owed).toHaveText('Warning: Answer: Answer is unusual.');
  await expect(margin.row('UNANSWERED_QUESTIONS')).toHaveCount(0);
  await expect(margin.toCheck).toHaveText('1 to check');
  await filingMap(page, 1);

  await open(page, 'Filing');
  await owed.getByRole('button').click();
  const control = page.locator('[data-shape-id="unusualAnswer"][data-explanation-path="answer"]');
  const explanation = control.locator('textarea');
  await expect(explanation).toBeFocused();
  await explanation.fill('The respondent confirmed it.');
  await control.getByRole('button', { name: 'Use explanation' }).click();
  await expect(control.getByRole('button', { name: 'Explanation entered' })).toBeDisabled();
  await expect(owed).toHaveCount(0);
  await nothingOwed(page);
});
