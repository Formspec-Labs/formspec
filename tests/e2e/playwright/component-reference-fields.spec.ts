/** @filedesc Renderer-ignore coverage for Component reference-field metadata. */
import { expect, test, type Page } from '@playwright/test';
import { gotoHarness } from '../browser/helpers/harness';

const DEFINITION = {
  $formspec: '1.0',
  version: '1.0.0',
  url: 'urn:test:component-reference-fields-rendering',
  title: 'Component Reference Fields Rendering',
  items: [
    { key: 'applicantName', type: 'field', dataType: 'string', label: 'Applicant name' },
    { key: 'householdSize', type: 'field', dataType: 'integer', label: 'Household size' },
  ],
};

const BASE_COMPONENT = {
  $formspecComponent: '1.1',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:component-reference-fields-rendering' },
  tree: {
    component: 'Stack',
    children: [
      { component: 'Heading', id: 'sectionHeading', level: 2, text: 'Applicant details' },
      { component: 'TextInput', id: 'applicantNameInput', bind: 'applicantName' },
      { component: 'NumberInput', id: 'householdSizeInput', bind: 'householdSize' },
      {
        component: 'Section',
        id: 'reviewSection',
        title: 'Review',
        children: [
          { component: 'Text', id: 'reviewText', text: 'Review your answers before submitting.' },
        ],
      },
    ],
  },
};

function withReferenceMetadata(): typeof BASE_COMPONENT {
  const component = JSON.parse(JSON.stringify(BASE_COMPONENT)) as typeof BASE_COMPONENT;
  const tree = component.tree as Record<string, unknown> & {
    children: Array<Record<string, unknown>>;
  };
  const children = tree.children;
  tree.unitRef = 'identity';
  tree.taskRefs = ['collectIdentity', 'reviewApplication'];
  tree.conceptRefs = [{ id: 'person.identity', source: 'registry' }];
  tree['x-generation'] = {
    source: 'unit:identity',
    strategy: 'unit-to-stack',
    generatedBy: 'component-reference-fields-e2e/1.0.0',
    anchors: ['unit:identity'],
  };
  children[0].unitRef = 'identity';
  children[0].taskRefs = ['collectIdentity'];
  children[1]['x-generation'] = {
    source: 'item:applicantName',
    strategy: 'item-to-input',
    generatedBy: 'component-reference-fields-e2e/1.0.0',
    anchors: ['item:applicantName'],
  };
  children[2].conceptRefs = [{ id: 'household.size', source: 'ontology' }];
  children[3].taskRefs = ['reviewApplication'];
  children[3]['x-generation'] = {
    source: 'task:reviewApplication',
    strategy: 'task-to-section',
    generatedBy: 'component-reference-fields-e2e/1.0.0',
    anchors: ['task:reviewApplication'],
  };
  return component;
}

async function renderSnapshot(page: Page, componentDocument: unknown): Promise<string> {
  await gotoHarness(page);
  await page.evaluate(
    ({ definition, component }) => {
      const renderer = document.querySelector('formspec-render') as any;
      renderer.showSubmit = false;
      renderer.definition = definition;
      renderer.componentDocument = component;
      renderer.render();
    },
    { definition: DEFINITION, component: componentDocument },
  );

  await expect(page.getByRole('heading', { name: 'Applicant details' })).toBeVisible();
  await expect(page.locator('input[name="applicantName"]')).toBeVisible();

  return await page.evaluate(() => {
    const container = document.querySelector('formspec-render .formspec-container');
    if (!container) {
      throw new Error('formspec-render container was not rendered');
    }
    return container.outerHTML;
  });
}

test.describe('Component reference-field rendering', () => {
  test('reference metadata does not change default rendered DOM', async ({ page }) => {
    const warnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning') {
        warnings.push(message.text());
      }
    });

    const baseSnapshot = await renderSnapshot(page, BASE_COMPONENT);
    const metadataSnapshot = await renderSnapshot(page, withReferenceMetadata());

    expect(metadataSnapshot).toBe(baseSnapshot);
    expect(warnings.filter((message) => message.includes('Unsupported Component Document version'))).toEqual([]);
  });
});
