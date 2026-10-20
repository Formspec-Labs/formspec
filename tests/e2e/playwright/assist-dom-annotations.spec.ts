/** @filedesc Current Assist §8 DOM metadata on actual default, USWDS and Tailwind controls. */
import { test, expect, type Page } from '@playwright/test';
import { gotoHarness } from '../browser/helpers/harness';

const url = 'urn:test:assist-dom';
const options = [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }];
const fields = [
  { key: 'name', dataType: 'string', label: 'Legal name', hint: 'Use your **legal** name.', component: 'TextInput' },
  { key: 'email', dataType: 'string', label: 'Email', extensions: { 'x-assist-email': true }, component: 'TextInput' },
  { key: 'notes', dataType: 'string', label: 'Project **narrative**', component: 'TextInput', maxLines: 3 },
  { key: 'region', dataType: 'choice', label: 'Region', options, component: 'Select' },
  { key: 'kind', dataType: 'choice', label: 'Kind', hint: 'Choose **one**.', options, component: 'RadioGroup' },
  { key: 'topics', dataType: 'multiChoice', label: 'Topics', options, component: 'CheckboxGroup' },
  { key: 'agree', dataType: 'boolean', label: 'Agree', component: 'Toggle' },
  { key: 'amount', dataType: 'money', label: 'Amount', component: 'MoneyInput' },
  { key: 'birthDate', dataType: 'date', label: 'Birth date', component: 'DatePicker' },
  { key: 'count', dataType: 'integer', label: 'Count', component: 'NumberInput' },
  { key: 'range', dataType: 'decimal', label: 'Range', component: 'Slider' },
  { key: 'rating', dataType: 'integer', label: 'Rating', component: 'Rating' },
  { key: 'upload', dataType: 'attachment', label: 'Document', component: 'FileUpload' },
  { key: 'signature', dataType: 'attachment', label: 'Signature', component: 'Signature' },
  { key: 'longHint', dataType: 'string', label: 'Long context', hint: '**Context** ' + '😀'.repeat(200), component: 'TextInput' },
];
const definition = {
  $formspec: '1.0', url, version: '1.0.0', title: 'Assist browser fixture',
  description: '**Apply** ' + '😀'.repeat(600),
  items: [...fields.map(({ component, maxLines, ...field }) => ({ ...field, type: 'field' })),
    { key: 'people', type: 'group', label: 'People', repeatable: true, minRepeat: 1, children: [
      { key: 'personName', type: 'field', dataType: 'string', label: 'Person name' },
    ] }],
  binds: [{ path: 'name', required: 'true', constraint: 'length($) >= 3', constraintMessage: 'At least three characters.' },
    { path: 'kind', required: 'true' }, { path: 'topics', required: 'true' }],
};
const component = {
  $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url },
  tree: { component: 'Stack', children: [
    ...fields.map(field => ({ component: field.component, bind: field.key, ...('maxLines' in field ? { maxLines: field.maxLines } : {}) })),
    { component: 'RepeatGroup', bind: 'people', children: [{ component: 'TextInput', bind: 'personName' }] },
    { component: 'ActionButton', actionRef: 'submit', label: { literal: 'Send application' } },
  ] },
};

async function mount(page: Page, adapter: string, declarative = false) {
  await gotoHarness(page, '/');
  await page.evaluate(({ definition, component, adapter, declarative }) => {
    const renderer = (window as any).renderer;
    if (declarative) renderer.setAttribute('tool-name', 'application.fill');
    renderer.adapter = adapter;
    renderer.registryDocuments = { $formspecRegistry: '1.1', publisher: { name: 'Assist test' }, published: '2026-10-20', entries: [
      { name: 'x-assist-email', category: 'property', version: '1.0.0', status: 'stable', description: 'Email input metadata',
        compatibility: { formspecVersion: '>=1.0.0' }, metadata: { inputMode: 'email', autocomplete: 'email' } },
    ] };
    renderer.componentDocument = component;
    renderer.responseActionsDocument = { $formspecResponseActions: '1.0', version: '1.0.0',
      targetDefinition: { url: definition.url }, actions: [{ id: 'submit', intent: 'submit', effects: [{ type: 'hostEvent', eventName: 'submitted' }] }] };
    renderer.definition = definition;
  }, { definition, component, adapter, declarative });
  expect(await page.evaluate(() => (window as any).renderer.resolvedAdapterName)).toBe(adapter);
  await expect(page.locator('[data-name="name"] input')).toBeVisible();
  // The actual USWDS date module enhances asynchronously; include its native hidden + visible inputs.
  if (adapter === 'uswds') await expect(page.locator('.usa-date-picker__external-input')).toHaveCount(1);
}

for (const adapter of ['default', 'uswds', 'tailwind']) {
  test(`${adapter}: passive identity and every named native control stay annotated`, async ({ page }) => {
    await mount(page, adapter);
    const root = page.locator('[data-formspec-form]');
    await expect(root).toHaveJSProperty('tagName', 'DIV');
    await expect(root).toHaveAttribute('data-formspec-url', url);
    await expect(root).toHaveAttribute('data-formspec-version', '1.0.0');
    await expect(root).toHaveAttribute('data-formspec-title', 'Assist browser fixture');
    await expect(root).not.toHaveAttribute('toolname');
    await expect(root).not.toHaveAttribute('toolautosubmit');
    const metadata = await root.locator('input[name],select[name],textarea[name]').evaluateAll(controls => controls.map(control => ({
      name: control.getAttribute('name'), description: control.getAttribute('toolparamdescription'),
      tag: control.tagName, type: control.getAttribute('type'), labels: Array.from((control as HTMLInputElement).labels ?? []).map(label => label.textContent),
      describedBy: control.getAttribute('aria-describedby'),
    })));
    expect(metadata.length).toBeGreaterThan(fields.length - 2); // Rating and Signature use non-native widgets.
    for (const control of metadata) {
      expect(control.name).toBeTruthy();
      expect(control.description, JSON.stringify(control)).toBeTruthy();
      expect([...control.description!].length).toBeLessThanOrEqual(150);
      expect(control.description).not.toMatch(/\*\*|<[^>]+>/);
    }
    for (const name of ['name', 'email', 'notes', 'region', 'kind', 'topics', 'agree', 'birthDate', 'count', 'range', 'upload', 'longHint']) {
      expect(metadata.some(control => control.name === name), name).toBe(true);
    }
    expect(metadata.some(control => control.name === 'people[0].personName')).toBe(true);
    await expect(page.getByRole('slider', { name: 'Rating', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: /^Signature canvas/ })).toBeVisible();
    // Money is an existing compound native control; both parts retain the field's context.
    expect(metadata.filter(control => control.name?.startsWith('amount__')).map(control => control.description))
      .toEqual(expect.arrayContaining(['Amount']));
    await expect(page.locator('input[name="name"]')).toHaveAttribute('toolparamdescription', 'Use your legal name.');
    await expect(page.locator('textarea[name="notes"]')).toHaveAttribute('toolparamdescription', 'Project narrative');
    // Existing registry metadata supplies best-effort native autocomplete; no ontology-to-token resolver is claimed.
    await expect(page.locator('input[name="email"]')).toHaveAttribute('autocomplete', 'email');
    await expect(page.locator('input[name="email"]')).toHaveAttribute('type', 'email');
    expect(metadata.find(control => control.name === 'name')!.labels?.length).toBeGreaterThan(0);
    expect(metadata.find(control => control.name === 'name')!.describedBy).toBeTruthy();
    await expect(page.getByRole('radiogroup', { name: 'Kind *', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Topics required', exact: true }).first()).toBeVisible();

    await page.evaluate(() => {
      const renderer = (window as any).renderer;
      renderer.localeDocuments = { $formspecLocale: '2.0', version: '1.0.0', locale: 'fr', target: { kind: 'definition', url: 'urn:test:assist-dom' },
        strings: { 'name.hint': 'Votre **nom** officiel.', 'notes.label': 'Récit' } };
      renderer.locale = 'fr';
    });
    await expect(page.locator('input[name="name"]')).toHaveAttribute('toolparamdescription', 'Votre nom officiel.');
    await expect(page.locator('textarea[name="notes"]')).toHaveAttribute('toolparamdescription', 'Récit');
    await page.evaluate(() => (window as any).renderer.getEngine().setValue('name', 'A', { source: 'assist' }));
    await expect(page.locator('[data-name="name"]')).toHaveAttribute('data-formspec-agent-filled', '');
    await expect(page.locator('input[name="name"]')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-formspec-assist-announcer]')).toContainText('filled by your assistant');
    await page.locator('input[name="name"]').fill('Respondent name');
    await expect(page.locator('[data-name="name"]')).not.toHaveAttribute('data-formspec-agent-filled');
    await page.screenshot({ path: test.info().outputPath(adapter + '-annotations.png'), fullPage: true });
  });

  test(`${adapter}: wizard native submission is available only on the final section`, async ({ page }) => {
    await gotoHarness(page, '/');
    await page.evaluate(({ adapter, url }) => {
      const renderer = (window as any).renderer;
      renderer.setAttribute('tool-name', 'wizard.fill');
      renderer.adapter = adapter;
      renderer.responseActionsDocument = { $formspecResponseActions: '1.0', version: '1.0.0', targetDefinition: { url },
        actions: [{ id: 'submit', intent: 'submit', effects: [{ type: 'hostEvent', eventName: 'submitted' }] }] };
      renderer.componentDocument = { $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url }, tree: { component: 'Stack', children: [
        { component: 'Section', title: 'Applicant', children: [{ component: 'TextInput', bind: 'name' }] },
        { component: 'Section', title: 'Review', children: [{ component: 'Text', text: 'Review your application.' }] },
      ] } };
      renderer.definition = { $formspec: '1.0', url, version: '1.0.0', title: 'Wizard',
        items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }], formPresentation: { pageMode: 'wizard' } };
      (window as any).submitInvocations = 0;
      const original = renderer.invokeAction.bind(renderer);
      renderer.invokeAction = (...args: unknown[]) => { (window as any).submitInvocations++; return original(...args); };
    }, { adapter, url });
    expect(await page.evaluate(() => (window as any).renderer.resolvedAdapterName)).toBe(adapter);
    const submit = page.locator('.formspec-submit');
    await expect(submit).toHaveAttribute('type', 'button');
    await page.locator('input[name="name"]').fill('Applicant');
    await page.locator('input[name="name"]').press('Enter');
    expect(await page.evaluate(() => (window as any).submitInvocations)).toBe(0);
    await page.evaluate(() => ((window as any).renderer.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(await page.evaluate(() => (window as any).submitInvocations)).toBe(0);
    await page.getByRole('button', { name: /^Next(?: step)?$/ }).click();
    await expect(submit).toHaveAttribute('type', 'submit');
    await submit.click();
    expect(await page.evaluate(() => (window as any).submitInvocations)).toBe(1);
    await page.getByRole('button', { name: /^Previous(?: step)?$/ }).click();
    await expect(submit).toHaveAttribute('type', 'button');
  });

  test(`${adapter}: declarative annotations require opt-in and preserve native submission boundaries`, async ({ page }) => {
    await mount(page, adapter, true);
    const root = page.locator('[data-formspec-form]');
    await expect(root).toHaveJSProperty('tagName', 'FORM');
    await expect(root).toHaveAttribute('toolname', 'application.fill');
    await expect(root).toHaveAttribute('novalidate', '');
    await expect(root).not.toHaveAttribute('toolautosubmit');
    const description = await root.getAttribute('tooldescription');
    expect([...description!].length).toBe(500);
    expect(description).toMatch(/^Apply /);
    expect(description).not.toContain('**');
    await expect(page.locator('input[name="name"]')).toHaveAttribute('required', '');
    for (const radio of await page.locator('input[name="kind"]').all()) await expect(radio).toHaveAttribute('required', '');
    for (const checkbox of await page.locator('input[name="topics"]').all()) await expect(checkbox).not.toHaveAttribute('required');
    const submit = page.getByRole('button', { name: 'Send application' });
    await expect(submit).toHaveAttribute('type', 'submit');
    await page.evaluate(() => {
      const renderer = (window as any).renderer;
      (window as any).submitInvocations = 0;
      const original = renderer.invokeAction.bind(renderer);
      renderer.invokeAction = (...args: unknown[]) => { (window as any).submitInvocations++; return original(...args); };
      const event = new SubmitEvent('submit', { bubbles: true, cancelable: true });
      (window as any).implicitSubmitCancelled = !renderer.querySelector('form').dispatchEvent(event);
    });
    expect(await page.evaluate(() => (window as any).implicitSubmitCancelled)).toBe(true);
    expect(await page.evaluate(() => (window as any).submitInvocations)).toBe(0);
    await submit.click();
    expect(await page.evaluate(() => (window as any).submitInvocations)).toBe(1);
  });
}
