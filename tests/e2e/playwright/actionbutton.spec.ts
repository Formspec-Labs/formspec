/** @filedesc Browser E2E coverage for ActionButton actionRef -> hostEvent invocation. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createDemoSubmitResponseActions } from '@formspec-org/engine/demo-fixtures';
import { expect, test } from '@playwright/test';
import { gotoHarness } from '../browser/helpers/harness';

const DEFINITION = {
  $formspec: '1.0',
  version: '1.0.0',
  url: 'urn:test:actionbutton',
  title: 'ActionButton Test',
  items: [
    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
  ],
  shapes: [
    {
      id: 'nameMustBeBob',
      target: '#',
      timing: 'submit',
      constraint: 'name == "Bob"',
      message: 'Name must be Bob',
    },
  ],
};

const COMPONENT = {
  $formspecComponent: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:actionbutton' },
  tree: {
    component: 'Stack',
    children: [
      { component: 'TextInput', bind: 'name' },
      {
        component: 'ActionButton',
        id: 'submitAction',
        actionRef: 'submit-application',
        label: { literal: 'Submit Application' },
        pendingLabel: { literal: 'Submitting...' },
      },
    ],
  },
};

// targetDefinition is REQUIRED by response-actions.schema.json (`required`
// includes targetDefinition). The earlier fixture also carried a partial
// `validation: { profile: 'on-submit' }` override — schema-invalid because
// ValidationOverride => ValidationTuple is closed and requires the full
// (profile, blocking, persistence) tuple. Drop the override; master-table
// inheritance for intent=submit produces the same tuple.
const RESPONSE_ACTIONS = createDemoSubmitResponseActions({
  definitionUrl: DEFINITION.url,
  actionId: 'submit-application',
});

function loadSchema(name: string): any {
  const path = resolve(__dirname, '..', '..', '..', 'schemas', name);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
// Pre-register cross-referenced schemas; modules[] refs Common ModuleRef and
// ValidationOverride refs VM ValidationTuple.
ajv.addSchema(loadSchema('common.schema.json'));
ajv.addSchema(loadSchema('validation-mapping.schema.json'));
const validateResponseActions = ajv.compile(loadSchema('response-actions.schema.json'));

test.describe('ActionButton', () => {
  test.beforeAll(() => {
    // Fail-fast: if the fixture drifts off the schema, the runtime would
    // accept it but the schema gate (and conformance suite) would not.
    const ok = validateResponseActions(RESPONSE_ACTIONS);
    if (!ok) {
      throw new Error(
        'ActionButton E2E fixture violates response-actions schema: '
        + JSON.stringify(validateResponseActions.errors, null, 2),
      );
    }
  });

  test('click invokes resolved Action and emits hostEvent submit detail', async ({ page }) => {
    await gotoHarness(page);
    await page.evaluate(({ definition, component, responseActions }) => {
      const el: any = document.querySelector('formspec-render');
      el.responseActionsDocument = responseActions;
      el.definition = definition;
      el.componentDocument = component;
      el.render();
      el.getEngine().setValue('name', 'Alice');
    }, { definition: DEFINITION, component: COMPONENT, responseActions: RESPONSE_ACTIONS });

    const button = page.locator('button.formspec-submit');
    await expect(button).toHaveText('Submit Application');

    await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      el.setSubmitPending(true);
    });
    await expect(button).toHaveText('Submitting...');
    await expect(button).toBeDisabled();

    await page.evaluate(() => {
      const el: any = document.querySelector('formspec-render');
      el.setSubmitPending(false);
    });
    await expect(button).toHaveText('Submit Application');
    await expect(button).toBeEnabled();

    const detailPromise = page.evaluate(() => new Promise<any>((resolve) => {
      const el: any = document.querySelector('formspec-render');
      el.addEventListener('formspec-submit', (event: CustomEvent) => resolve(event.detail), { once: true });
    }));

    await button.click();
    const detail = await detailPromise;

    expect(detail.response.data.name).toBe('Alice');
    expect(detail.validationReport.valid).toBe(false);
    expect(detail.validationReport.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ shapeId: 'nameMustBeBob', severity: 'error' }),
      ]),
    );
  });

  test('a detached element configured before a later append mounts editable inputs', async ({ page }) => {
    await gotoHarness(page);
    await page.evaluate(async () => {
      const el = document.createElement('formspec-render') as any;
      el.id = 'configured-before-append';
      el.definition = {
        $formspec: '1.0',
        version: '1.0.0',
        url: 'urn:review:mount',
        title: 'Review',
        items: [{ key: 'answer', label: 'Delayed field', type: 'field', dataType: 'string' }],
      };
      await new Promise((resolve) => setTimeout(resolve, 0));
      document.body.append(el);
    });
    const el = page.locator('#configured-before-append');
    await expect(el).toBeAttached();
    await expect(el.getByRole('textbox', { name: 'Delayed field' })).toBeEditable();
  });

  test('WebComponent omits synthetic submit from an unbound sidecar', async ({ page }) => {
    await gotoHarness(page);
    await page.evaluate(() => {
      const el = document.querySelector('formspec-render') as any;
      el.componentDocument = null;
      el.showSubmit = true;
      el.definition = {
        $formspec: '1.0',
        version: '1.0.0',
        url: 'urn:review:submit',
        title: 'Review',
        items: [{ key: 'answer', label: 'Field', type: 'field', dataType: 'string' }],
      };
      el.responseActionsDocument = {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        actions: [{ id: 'send', intent: 'submit', label: { literal: 'Send unbound' }, effects: [{ type: 'hostEvent', eventName: 'checked' }] }],
      };
      (window as any).reviewEvents = [];
      el.addEventListener('checked', () => (window as any).reviewEvents.push('checked'));
    });
    await expect(page.getByRole('textbox', { name: 'Field' })).toBeEditable();
    await expect(page.getByRole('button', { name: 'Send unbound', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).reviewEvents)).toEqual([]);
  });

  test('explicit WebComponent ActionButton rejects an incompatible sidecar', async ({ page }) => {
    await gotoHarness(page);
    await page.evaluate(() => {
      const el = document.querySelector('formspec-render') as any;
      const url = 'urn:fixture:bound';
      el.definition = {
        $formspec: '1.0',
        url,
        version: '1.0.0',
        title: 'Bound',
        items: [{ key: 'answer', label: 'Answer', type: 'field', dataType: 'string' }],
      };
      el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url },
        tree: {
          component: 'Stack',
          children: [
            { component: 'TextInput', bind: 'answer' },
            { component: 'ActionButton', actionRef: 'send', label: { literal: 'Send' } },
          ],
        },
      };
      el.responseActionsDocument = {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        targetDefinition: { url, compatibleVersions: '>=9.0.0' },
        actions: [{ id: 'send', intent: 'review', effects: [{ type: 'hostEvent', eventName: 'review-clicked' }] }],
      };
      (window as any).calls = 0;
      el.addEventListener('review-clicked', () => {
        (window as any).calls += 1;
      });
    });
    await expect(page.getByLabel('Answer', { exact: true })).toBeEditable();
    const button = page.getByRole('button', { name: 'Send', exact: true });
    await expect(button).toBeDisabled();
    expect(await page.evaluate(() => (window as any).calls)).toBe(0);
  });

  for (const tool of [true, false]) {
    for (const replace of [false, true]) {
      test(`WebComponent authored submit action preserves identity (tool=${tool}, replaced=${replace})`, async ({ page }) => {
        await gotoHarness(page);
        const observed = await page.evaluate(async ({ tool, replace }) => {
          const el = document.createElement('formspec-render') as any;
          if (tool) el.setAttribute('tool-name', 'identity');
          el.showSubmit = false;
          const url = 'urn:fixture:identity:browser';
          const doc = (ids: string[]) => ({
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            targetDefinition: { url },
            actions: ids.map((id) => ({
              id,
              intent: 'submit',
              label: { literal: id },
              effects: [{ type: 'hostEvent', eventName: `record-${id}` }],
            })),
          });
          el.definition = { $formspec: '1.0', version: '1.0.0', url, title: 'Identity', items: [] };
          el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url },
            tree: { component: 'ActionButton', id: 'source', actionRef: 'second' },
          };
          el.responseActionsDocument = doc(['first', 'second']);
          document.body.append(el);
          for (let i = 0; i < 60 && !el.querySelector('#source'); i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          const button = el.querySelector('#source') as HTMLButtonElement | null;
          if (!button || button.disabled) throw new Error('Authored button was not enabled');
          const events: string[] = [];
          for (const id of ['first', 'second', 'next']) {
            el.addEventListener(`record-${id}`, () => events.push(id));
          }
          const label = button.textContent;
          if (replace) el.responseActionsDocument = doc(['next']);
          button.click();
          await new Promise((resolve) => setTimeout(resolve, 20));
          el.remove();
          return { events, label };
        }, { tool, replace });
        expect(observed.label).toBe('second');
        expect(observed.events).toEqual(replace ? [] : ['second']);
      });
    }
  }

  for (const [scenario, expected] of [
    ['updated binding and retired button', ['third']],
    ['unbound button, missing submitter and retired button reinserted', []],
    ['disabled click', []],
    ['disabled requestSubmit', []],
    ['replacement with a custom invoker', []],
    ['agent invoked fallback with two submit actions', ['first']],
  ] as const) {
    test(`WebComponent native tool form edge case: ${scenario}`, async ({ page }) => {
      await gotoHarness(page);
      const observed = await page.evaluate(async (scenarioName) => {
        const el = document.createElement('formspec-render') as any;
        const events: string[] = [];
        const url = 'urn:review6:native-edge';
        const doc = (ids: string[]) => ({
          $formspecResponseActions: '1.0',
          version: '1.0.0',
          targetDefinition: { url },
          actions: ids.map((id) => ({
            id,
            intent: 'submit',
            label: { literal: id },
            effects: [{ type: 'hostEvent', eventName: `record-${id}` }],
          })),
        });
        const comp = (id: string) => ({
          $formspecComponent: '1.0',
          version: '1.0.0',
          targetDefinition: { url },
          tree: { component: 'ActionButton', id: 'source', actionRef: id },
        });
        el.setAttribute('tool-name', 'edge');
        el.showSubmit = false;
        el.definition = { $formspec: '1.0', version: '1.0.0', url, title: 'Edge', items: [] };
        el.componentDocument = comp('second');
        el.responseActionsDocument = doc(['first', 'second', 'third']);
        for (const id of ['first', 'second', 'third']) {
          el.addEventListener(`record-${id}`, () => events.push(id));
        }
        document.body.append(el);
        for (let i = 0; i < 60 && !(el.querySelector('#source')?.type === 'submit'); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const oldButton = el.querySelector('#source') as HTMLButtonElement;
        if (!oldButton || oldButton.type !== 'submit' || oldButton.disabled) {
          throw new Error('Native button not ready');
        }
        if (scenarioName === 'updated binding and retired button' || scenarioName.startsWith('unbound button')) {
          el.componentDocument = comp('third');
          await new Promise((resolve) => setTimeout(resolve, 20));
          const newButton = el.querySelector('#source') as HTMLButtonElement;
          if (newButton === oldButton || newButton.textContent !== 'third') {
            throw new Error('Button did not re-render');
          }
          oldButton.click();
          if (scenarioName.startsWith('updated')) {
            newButton.click();
          } else {
            const form = newButton.form!;
            const fake = document.createElement('button');
            fake.type = 'submit';
            fake.dataset.actionRef = 'first';
            form.append(oldButton, fake);
            form.requestSubmit(oldButton);
            form.requestSubmit(fake);
            form.requestSubmit();
          }
        } else if (scenarioName.startsWith('disabled')) {
          el.setSubmitPending(true);
          if (!oldButton.disabled) throw new Error('Pending did not disable the button');
          if (scenarioName === 'disabled click') oldButton.click();
          else oldButton.form!.requestSubmit(oldButton);
        } else if (scenarioName.startsWith('replacement')) {
          el.responseActionInvoker = (input: { actionRef: string }) => {
            events.push(`hook:${input.actionRef}`);
            return {
              status: 'failed',
              resolution: { resolved: false, action: null },
              validationTuple: null,
              detail: null,
              effectTrace: [],
            };
          };
          el.responseActionsDocument = doc(['third']);
          oldButton.click();
        } else {
          let report: Promise<any> | undefined;
          const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
          Object.assign(event, {
            agentInvoked: true,
            respondWith: (promise: Promise<any>) => { report = promise; },
          });
          oldButton.form!.dispatchEvent(event);
          if (!(await report)?.valid) throw new Error('Missing validation report');
        }
        el.remove();
        return events;
      }, scenario);
      expect(observed).toEqual([...expected]);
    });
  }

  for (const [label, before, after, replace, expected] of [
    ['same reference', 1, 1, false, 1],
    ['equivalent replacement', 1, 1, true, 1],
    ['correction while dirty', 2, 1, true, 1],
    ['ambiguity while dirty', 1, 2, true, 0],
  ] as const) {
    test(`WebComponent standalone dirty autosave replacement (${label})`, async ({ page }) => {
      await gotoHarness(page);
      await page.evaluate((count) => {
        const state = window as any;
        const el = document.createElement('formspec-render') as any;
        el.id = 'autosave-check';
        state.observed = [];
        const url = 'urn:review6:edit';
        el.definition = {
          $formspec: '1.0',
          version: '1.0.0',
          url,
          title: 'Test',
          items: [{ key: 'answer', type: 'field', label: 'Recorded answer', dataType: 'string' }],
        };
        state.makeDoc = (n: number) => ({
          $formspecResponseActions: '1.0',
          version: '1.0.0',
          targetDefinition: { url },
          actions: Array.from({ length: n }, (_, index) => ({
            id: `auto${index}`,
            intent: 'autosave',
            effects: [{ type: 'hostEvent', eventName: 'recorded' }],
          })),
        });
        el.responseActionsDocument = state.initialDoc = state.makeDoc(count);
        el.addEventListener('recorded', (event: CustomEvent) => state.observed.push(event.detail.response.data.answer));
        document.body.append(el);
      }, before);
      const field = page.locator('#autosave-check').getByRole('textbox', { name: 'Recorded answer' });
      await expect(field).toBeEditable();
      await field.fill('retained');
      await page.evaluate(([shouldReplace, count]) => {
        const state = window as any;
        const el = document.getElementById('autosave-check') as any;
        el.responseActionsDocument = shouldReplace ? state.makeDoc(count) : state.initialDoc;
      }, [replace, after] as const);
      await page.waitForTimeout(850);
      await expect(field).toHaveValue('retained');
      const events = await page.evaluate(() => (window as any).observed);
      expect(events).toEqual(expected ? ['retained'] : []);
    });
  }

  for (const mode of ['enabled', 'first-legend', 'own-disabled', 'disabled-fieldset', 'aria-only'] as const) {
    test(`WebComponent native tool form respects HTML :disabled state and ARIA: ${mode}`, async ({ page }) => {
      await gotoHarness(page);
      const observed = await page.evaluate(async (variant) => {
        const el = document.createElement('formspec-render') as any;
        const url = 'urn:review7:fieldset-disabled';
        let sent = 0;
        el.setAttribute('tool-name', 'edge');
        el.showSubmit = false;
        el.definition = { $formspec: '1.0', version: '1.0.0', url, title: 'Edge', items: [] };
        el.componentDocument = {
          $formspecComponent: '1.0',
          version: '1.0.0',
          targetDefinition: { url },
          tree: { component: 'ActionButton', id: 'source', actionRef: 'second' },
        };
        el.responseActionsDocument = {
          $formspecResponseActions: '1.0',
          version: '1.0.0',
          targetDefinition: { url },
          actions: [
            { id: 'first', intent: 'submit', label: { literal: 'first' }, effects: [{ type: 'hostEvent', eventName: 'record-first' }] },
            { id: 'second', intent: 'submit', label: { literal: 'second' }, effects: [{ type: 'hostEvent', eventName: 'record-second' }] },
          ],
        };
        el.addEventListener('record-second', () => { sent += 1; });
        document.body.append(el);
        for (let i = 0; i < 60 && !(el.querySelector('#source')?.type === 'submit'); i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        const btn = el.querySelector('#source') as HTMLButtonElement;
        const form = btn.form!;
        if (variant === 'own-disabled') {
          btn.disabled = true;
        } else if (variant === 'aria-only') {
          btn.setAttribute('aria-disabled', 'true');
        } else if (variant === 'disabled-fieldset' || variant === 'first-legend') {
          const fieldset = document.createElement('fieldset');
          fieldset.disabled = true;
          form.append(fieldset);
          if (variant === 'first-legend') {
            const legend = document.createElement('legend');
            legend.append(btn);
            fieldset.append(legend);
          } else {
            fieldset.append(btn);
          }
        }
        const ownDisabled = btn.disabled;
        const effectiveDisabled = btn.matches(':disabled');
        const ariaDisabled = btn.getAttribute('aria-disabled') === 'true';
        form.requestSubmit(btn);
        el.remove();
        return { ownDisabled, effectiveDisabled, ariaDisabled, sent };
      }, mode);
      expect(observed.ownDisabled).toBe(mode === 'own-disabled');
      expect(observed.ariaDisabled).toBe(mode === 'aria-only');
      expect(observed.effectiveDisabled).toBe(mode === 'own-disabled' || mode === 'disabled-fieldset');
      expect(observed.sent, JSON.stringify(observed)).toBe(mode === 'enabled' || mode === 'first-legend' ? 1 : 0);
    });
  }
});
