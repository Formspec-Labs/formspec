/** @filedesc E2E: section and field rhythm — each adapter's own gaps when the Theme is silent, the Theme's tokens when set. */
import { test, expect, type Page } from '@playwright/test';
import { gotoHarness, mountDefinition } from './helpers/harness';

const URL = 'urn:test:section-spacing';

const DEFINITION = {
  $formspec: '1.0',
  url: URL,
  version: '1.0.0',
  title: 'Section spacing',
  items: [
    { key: 'first', type: 'field', dataType: 'string', label: 'First question' },
    { key: 'second', type: 'field', dataType: 'string', label: 'Second question' },
    {
      key: 'address', type: 'group', label: 'Mailing address',
      children: [
        { key: 'street', type: 'field', dataType: 'string', label: 'Street' },
        { key: 'city', type: 'field', dataType: 'string', label: 'City' },
      ],
    },
  ],
};

async function mount(page: Page, adapter: string, tokens?: Record<string, string>): Promise<void> {
  await gotoHarness(page);
  await page.evaluate(({ name, url, tokens }) => {
    (window as any).globalRegistry.setAdapter(name);
    if (tokens) {
      (document.querySelector('formspec-render') as any).themeDocument = {
        $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url }, tokens,
      };
    }
  }, { name: adapter, url: URL, tokens });
  await mountDefinition(page, DEFINITION);
  await page.waitForSelector('formspec-render [data-name="address.city"]');
}

/** Gaps between the rendered boxes: question to question, question to the section's box, and inside the section. */
function gaps(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector('formspec-render')!;
    const box = (selector: string) => form.querySelector(selector)!.getBoundingClientRect();
    // The group's own box: both adapters mark a group root `formspec-themed-group` (the platform selector).
    const title = form.querySelector('.formspec-themed-group')!.getBoundingClientRect();
    return {
      question: Math.round(box('[data-name="second"]').top - box('[data-name="first"]').bottom),
      section: Math.round(title.top - box('[data-name="second"]').bottom),
      inside: Math.round(box('[data-name="address.city"]').top - box('[data-name="address.street"]').bottom),
    };
  });
}

test.describe('USWDS rhythm', () => {
  const stylesApplied = (page: Page) => expect
    .poll(() => page.locator('formspec-render .formspec-container').evaluate((el) => getComputedStyle(el).maxWidth))
    .toBe('480px');

  test("with no rhythm tokens, questions and sections take USWDS's own margins", async ({ page }) => {
    await mount(page, 'uswds');
    await stylesApplied(page);
    expect(await gaps(page)).toEqual({ question: 24, section: 48, inside: 24 });
  });

  test('the Theme retunes each rhythm on its own', async ({ page }) => {
    await mount(page, 'uswds', { 'spacing.field': '2rem', 'spacing.section': '4rem' });
    await stylesApplied(page);
    expect(await gaps(page)).toEqual({ question: 32, section: 64, inside: 32 });
  });
});

test.describe('default skin rhythm', () => {
  test('a section sits a section gap below the question before it, questions a field gap apart', async ({ page }) => {
    await mount(page, 'default', { 'spacing.field': '0.75rem', 'spacing.section': '2.5rem' });
    await expect.poll(() => page.locator('formspec-render .formspec-container')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--formspec-default-skin'))).toBe('1');
    const measured = await gaps(page);
    expect(measured.question).toBe(12);
    expect(measured.section).toBe(40);
  });
});

/** Ten required questions, then a Save draft button: a message on any of them must move nothing below it. */
const RESERVED = {
  $formspec: '1.0',
  url: 'urn:test:reserved-message-line',
  version: '1.0.0',
  title: 'Reserved message line',
  items: Array.from({ length: 10 }, (_, i) => ({ key: `q${i}`, type: 'field', dataType: 'string', label: `Question ${i}` })),
  binds: Array.from({ length: 10 }, (_, i) => ({ path: `q${i}`, required: 'true' })),
};

async function mountReserved(page: Page, tokens?: Record<string, string>): Promise<void> {
  await gotoHarness(page);
  await page.evaluate(({ url, tokens }) => {
    (window as any).globalRegistry.setAdapter('default');
    if (tokens) {
      (document.querySelector('formspec-render') as any).themeDocument = {
        $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url }, tokens,
      };
    }
  }, { url: RESERVED.url, tokens });
  await mountDefinition(page, RESERVED);
  await page.waitForSelector('formspec-render [data-name="q9"]');
  await page.evaluate(() => {
    const last = document.querySelector('formspec-render [data-name="q9"]')!;
    const save = document.createElement('button');
    save.id = 'save-draft';
    save.textContent = 'Save draft';
    last.after(save);
  });
}

/** Question 0's control-to-next-question gap, its reserved line, and where the later boxes sit. */
function reservedLayout(page: Page) {
  return page.evaluate(() => {
    const form = document.querySelector('formspec-render')!;
    const rect = (el: Element) => el.getBoundingClientRect();
    const first = form.querySelector('[data-name="q0"]')!;
    return {
      gap: rect(form.querySelector('[data-name="q1"]')!).top - rect(first.querySelector('input')!).bottom,
      line: rect(first.querySelector('.formspec-error')!).height,
      tops: [...form.querySelectorAll('[data-name^="q"], #save-draft')].map((el) => Math.round(rect(el).top * 10) / 10),
      messages: [...form.querySelectorAll('.formspec-error')].filter((el) => el.textContent!.trim()).length,
    };
  });
}

test.describe('default skin reserved message line', () => {
  test('one reserved message line, not a gap plus a line, separates two questions', async ({ page }) => {
    await mountReserved(page);
    const { gap, line } = await reservedLayout(page);
    expect(line).toBeGreaterThan(12);
    expect(gap).toBeCloseTo(line, 1);
  });

  test('the select focus outline clears the first line of its validation message', async ({ page }) => {
    await gotoHarness(page);
    await mountDefinition(page, {
      ...RESERVED,
      items: [{ key: 'method', type: 'field', dataType: 'choice', label: 'Contact method',
        options: [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }] }],
      binds: [{ path: 'method', required: 'true' }],
    });
    const field = page.locator('[data-name="method"]');
    const select = field.locator('select');
    await page.keyboard.press('Tab');
    await select.focus();
    await page.locator('formspec-render').evaluate((form) => (form as any).touchAllFields());
    await expect(field.locator('.formspec-error')).not.toBeEmpty();
    await expect(select).toBeFocused();
    const clearances = await field.evaluate((element) => {
      const text = document.createRange();
      text.selectNodeContents(element.querySelector('.formspec-error')!);
      const textTop = text.getBoundingClientRect().top;
      return [...element.querySelectorAll(':focus-within')].flatMap(node => {
        const style = getComputedStyle(node);
        if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) < 3) return [];
        const ringBottom = node.getBoundingClientRect().bottom + parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        return [textTop - ringBottom];
      });
    });
    expect(clearances.length).toBeGreaterThan(0);
    expect(Math.min(...clearances)).toBeGreaterThanOrEqual(0);
  });

  test('messages appearing on every question move no question and not the button after them', async ({ page }) => {
    await mountReserved(page);
    const before = await reservedLayout(page);
    await page.evaluate(() => (document.querySelector('formspec-render') as any).touchAllFields());
    await expect.poll(async () => (await reservedLayout(page)).messages).toBe(10);
    expect((await reservedLayout(page)).tops).toEqual(before.tops);
  });

  test('a field gap taller than the line is the floor between questions', async ({ page }) => {
    await mountReserved(page, { 'spacing.field': '2rem' });
    const { gap, line } = await reservedLayout(page);
    expect(line).toBeCloseTo(32, 1);
    expect(gap).toBeCloseTo(32, 1);
  });

  test('a question with nothing visible after it keeps its message inside its card', async ({ page }) => {
    // Hung into a gap that is not there, a 2rem line left a repeat card through its 1rem padding.
    const url = 'urn:test:reserved-line-in-card';
    await gotoHarness(page);
    await page.evaluate((url) => {
      (window as any).globalRegistry.setAdapter('default');
      (document.querySelector('formspec-render') as any).themeDocument = {
        $formspecTheme: '1.0', version: '1.0.0', targetDefinition: { url }, tokens: { 'spacing.field': '2rem' },
      };
    }, url);
    await mountDefinition(page, {
      $formspec: '1.0', url, version: '1.0.0', title: 'Card',
      items: [{
        key: 'rows', type: 'group', label: 'Rows', repeatable: true, minRepeat: 1,
        children: ['a', 'b', 'followUp'].map((key) => ({ key, type: 'field', dataType: 'string', label: key })),
      }],
      binds: [{ path: 'rows.b', required: 'true' }, { path: 'rows.followUp', relevant: 'false' }],
    });
    await page.evaluate(() => (document.querySelector('formspec-render') as any).touchAllFields());
    const edges = await page.evaluate(() => {
      const card = document.querySelector('formspec-render .formspec-repeat-instance')!;
      const message = card.querySelector('[data-name$="b"] > .formspec-error')!;
      return { message: message.getBoundingClientRect().bottom, text: message.textContent!.trim(), card: card.getBoundingClientRect().bottom };
    });
    expect(edges.text).not.toBe('');
    expect(edges.message).toBeLessThanOrEqual(edges.card);
  });

  test("a Stack's authored gap, however small, never puts a message on the next question", async ({ page }) => {
    // Renderers write an authored gap inline; hung into a 12px gap that was really 0 or 8px, a message
    // overlapped the next question by 12px or 4px.
    const url = 'urn:test:reserved-line-authored-gap';
    const stack = (gap: string, keys: string[]) => ({ component: 'Stack', gap, children: keys.map((bind) => ({ component: 'TextInput', bind })) });
    await gotoHarness(page);
    await page.evaluate(({ url, tree }) => {
      (window as any).globalRegistry.setAdapter('default');
      (document.querySelector('formspec-render') as any).componentDocument = {
        $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url }, tree,
      };
    }, { url, tree: { component: 'Stack', children: [stack('0', ['a', 'b']), stack('0.5rem', ['c', 'd'])] } });
    const keys = ['a', 'b', 'c', 'd'];
    await mountDefinition(page, {
      $formspec: '1.0', url, version: '1.0.0', title: 'Authored gaps',
      items: keys.map((key) => ({ key, type: 'field', dataType: 'string', label: `Question ${key}` })),
      binds: keys.map((path) => ({ path, required: 'true' })),
    });
    await page.evaluate(() => (document.querySelector('formspec-render') as any).touchAllFields());
    await expect.poll(() => page.evaluate(() =>
      [...document.querySelectorAll('formspec-render .formspec-error')].filter((el) => el.textContent!.trim()).length)).toBe(4);
    const clearance = await page.evaluate(() => {
      const form = document.querySelector('formspec-render')!;
      const field = (key: string) => form.querySelector(`[data-name="${key}"]`)!;
      const below = (key: string, next: string) => {
        const message = field(key).querySelector(':scope > .formspec-error')!;
        return { text: message.textContent!.trim(), gap: field(next).getBoundingClientRect().top - message.getBoundingClientRect().bottom };
      };
      return { zero: below('a', 'b'), half: below('c', 'd') };
    });
    expect(clearance.zero.text).not.toBe('');
    expect.soft(clearance.zero.gap).toBeGreaterThanOrEqual(0);
    expect.soft(clearance.half.gap).toBeGreaterThanOrEqual(0);
  });

  test("an assistant-filled question keeps its message inside the question's tinted box", async ({ page }) => {
    // The renderer marks a field the assistant wrote (assist-spec §8); a hung message crossed the box's bottom edge.
    await mountReserved(page);
    await page.evaluate(() => {
      document.querySelector('formspec-render [data-name="q0"]')!.setAttribute('data-formspec-agent-filled', '');
      (document.querySelector('formspec-render') as any).touchAllFields();
    });
    await expect.poll(() => page.evaluate(() =>
      document.querySelector('formspec-render [data-name="q0"] > .formspec-error')!.textContent!.trim())).not.toBe('');
    const edges = await page.evaluate(() => {
      const field = document.querySelector('formspec-render [data-name="q0"]')!;
      const message = field.querySelector(':scope > .formspec-error')!;
      return { box: field.getBoundingClientRect().bottom, message: message.getBoundingClientRect().bottom };
    });
    expect(edges.message).toBeLessThanOrEqual(edges.box);
  });
});
