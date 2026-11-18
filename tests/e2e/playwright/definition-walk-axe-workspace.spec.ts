/** @filedesc Axe coverage of each section in the React workspace. */
import { expect, test } from '@playwright/test';
import { checkAccessibility } from '../../../packages/formspec-walk/src/index';
import { definition, mixedRepeatDefinition } from '../fixtures/definition-walk-workspace.definition';

const documents = { definition };
const fixture = '/definition-walk-workspace.html';
const timeoutMs = 30_000;

test('axe visits all three workspace sections through their links and finds the last section violation', async ({ page }) => {
  const report = await checkAccessibility(page, {
    documents,
    open: async p => {
      await p.goto(`${fixture}?links`);
      await expect(p.getByRole('link', { name: 'Introduction' })).toHaveAttribute('aria-current', 'location');
    },
    timeoutMs,
  });

  expect(report.status, report.failure?.message).toBe('completed');
  const labels = report.violations.filter(finding => finding.rule === 'label');
  expect(labels.map(finding => finding.state)).toEqual(['page-3', 'errors-3', 'reveal-details.extra']);
  expect(labels[2].nodes.map(node => node.html)).toContainEqual(expect.stringContaining('details.extra'));
  expect(report.pages).toEqual({ kind: 'workspace', expectedMin: 3, drawn: 3, visited: 3, revealedFields: 1 });
  expect(report.states.map(state => state.id)).toEqual([
    'page-1', 'page-2', 'page-3', 'errors-1', 'errors-2', 'errors-3', 'reveal-details.extra',
  ]);
});

for (const gap of ['missing', 'unresponsive'] as const) {
  test(`axe reports the ${gap} workspace section and continues to the next section`, async ({ page }) => {
    const report = await checkAccessibility(page, {
      documents,
      open: async p => {
        await p.goto(fixture);
        await p.getByRole('button', { name: 'Instructions' }).evaluate((button, gap) => {
          if (gap === 'missing') button.remove();
          else button.addEventListener('click', event => event.stopPropagation());
        }, gap);
      },
      timeoutMs,
    });

    expect(report.status).toBe('failed');
    expect(report.failure?.reason, report.failure?.message).toBe('pages');
    expect(report.pages).toMatchObject({ kind: 'workspace', expectedMin: 3, drawn: gap === 'missing' ? 2 : 3, visited: 2 });
    expect(report.needsReview).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'formspec-unreached-section', nodes: [expect.objectContaining({ target: ['instructions'] })] }),
    ]));
    expect(report.violations.some(finding => finding.state === 'page-3' && finding.rule === 'label')).toBe(true);
  });
}

test('axe checks a continuous workspace with no authored section IDs', async ({ page }) => {
  const report = await checkAccessibility(page, {
    documents: { definition: { ...documents.definition, items: [], binds: [] } },
    open: async p => { await p.goto(`${fixture}?continuous`); },
    timeoutMs,
  });
  expect(report.status, report.failure?.message).toBe('completed');
  expect(report.pages).toMatchObject({ kind: 'workspace', expectedMin: 1, drawn: 1, visited: 1 });
  expect(report.states.map(state => state.id)).toEqual(['page-1', 'errors-1']);
});

test('axe reports a workspace section missing from the supplied documents', async ({ page }) => {
  const report = await checkAccessibility(page, {
    documents,
    open: async p => { await p.goto(`${fixture}?extraSection`); },
    timeoutMs,
  });
  expect(report.status).toBe('failed');
  expect(report.failure?.reason).toBe('pages');
  expect(report.pages).toMatchObject({ kind: 'workspace', expectedMin: 3, drawn: 4, visited: 3 });
  expect(report.needsReview).toEqual(expect.arrayContaining([
    expect.objectContaining({ rule: 'formspec-unreached-section', nodes: [expect.objectContaining({ target: ['more'] })] }),
  ]));
});

test('axe reveals and checks the hidden repeat instance even when its sibling is already visible', async ({ page }) => {
  const report = await checkAccessibility(page, {
    documents: { definition: mixedRepeatDefinition },
    open: async p => { await p.goto(`${fixture}?mixedRepeat`); },
    timeoutMs,
  });
  expect(report.status, report.failure?.message).toBe('completed');
  const labels = (state: string) => report.violations.find(finding => finding.rule === 'label' && finding.state === state)?.nodes.map(node => node.html);
  expect(labels('page-3')).toEqual([expect.stringContaining('details.rows[1].entry')]);
  expect(labels('reveal-details.rows[0].entry')).toContainEqual(expect.stringContaining('details.rows[0].entry'));
  expect(report.pages?.revealedFields).toBe(1);
  await expect(page.locator('[data-name="details.rows[0].entry"]')).toHaveCount(0);
});
