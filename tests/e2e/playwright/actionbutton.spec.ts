/** @filedesc Browser E2E coverage for ActionButton actionRef -> hostEvent invocation. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
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
const RESPONSE_ACTIONS = {
  $formspecResponseActions: '1.0',
  version: '1.0.0',
  targetDefinition: { url: DEFINITION.url },
  actions: [
    {
      id: 'submit-application',
      intent: 'submit',
      effects: [
        { type: 'hostEvent', eventName: 'formspec-submit' },
      ],
    },
  ],
};

function loadSchema(name: string): any {
  const path = resolve(__dirname, '..', '..', '..', 'schemas', name);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
// Pre-register cross-referenced schemas; ValidationOverride $refs VM ValidationTuple.
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
});
