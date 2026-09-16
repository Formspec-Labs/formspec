/** @filedesc Extended engine features: formPresentation metadata, label contexts, migrations, and miscellaneous engine surface */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('should return formPresentation metadata when the definition includes formPresentation', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Presentation Test',
    items: [],
    formPresentation: {
      layout: 'wizard',
      theme: 'dark'
    }
  });

  assert.deepEqual(engine.formPresentation, { layout: 'wizard', theme: 'dark' });
  assert.equal(engine.formPresentation.layout, 'wizard');
});

test('should return null formPresentation when the definition omits formPresentation', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'No Presentation',
    items: []
  });

  assert.equal(engine.formPresentation, null);
});

test('should resolve pdf and csv labels when those contexts are active', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Label Context Test',
    items: [
      {
        key: 'name',
        type: 'field',
        dataType: 'string',
        label: 'Name',
        labels: {
          pdf: 'Applicant Name',
          csv: 'applicant_name',
          short: 'Name'
        }
      },
      {
        key: 'email',
        type: 'field',
        dataType: 'string',
        label: 'Email'
      }
    ]
  });

  const items = engine.getDefinition().items;

  const defaultLabel = engine.getLabel(items[0]);
  engine.setLabelContext('pdf');
  const pdfLabel = engine.getLabel(items[0]);
  engine.setLabelContext('csv');
  const csvLabel = engine.getLabel(items[0]);
  engine.setLabelContext(null);
  const clearedLabel = engine.getLabel(items[0]);

  assert.equal(defaultLabel, 'Name');
  assert.equal(pdfLabel, 'Applicant Name');
  assert.equal(csvLabel, 'applicant_name');
  assert.equal(clearedLabel, 'Name');
});

test('should fall back to default labels when context-specific label is missing', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Label Fallback Test',
    items: [
      {
        key: 'email',
        type: 'field',
        dataType: 'string',
        label: 'Email Address',
        labels: {
          pdf: 'Email (PDF)'
        }
      },
      {
        key: 'phone',
        type: 'field',
        dataType: 'string',
        label: 'Phone Number'
      }
    ]
  });

  const [emailItem, phoneItem] = engine.getDefinition().items;
  engine.setLabelContext('csv');

  assert.equal(engine.getLabel(emailItem), 'Email Address');
  assert.equal(engine.getLabel(phoneItem), 'Phone Number');
});

test('migrates a response from an earlier version through the Definition\'s migrations (core §6.7)', () => {
  // v2 of a form: the v1 flat `employer` and decimal `hours` moved into a repeat row; v1's `severance`
  // question is gone; `consent` is new and defaults to false.
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '2.0.0',
    title: 'Migration Test',
    items: [
      { key: 'fullName', type: 'field', dataType: 'string', label: 'Full Name' },
      { key: 'jobs', type: 'group', label: 'Jobs', repeatable: true, children: [
        { key: 'employer', type: 'field', dataType: 'string', label: 'Employer' },
        { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours' },
        { key: 'minutes', type: 'field', dataType: 'integer', label: 'Minutes' },
      ] },
      { key: 'consent', type: 'field', dataType: 'boolean', label: 'Consent' },
    ],
    migrations: { from: { '1.0.0': {
      description: 'name → fullName; one job became a repeat; hours split; severance removed',
      fieldMap: [
        { source: 'name', target: 'fullName', transform: 'preserve' },
        { source: 'employer', target: 'jobs[0].employer', transform: 'preserve' },
        { source: 'hours', target: 'jobs[0].hours', transform: 'expression', expression: 'floor($)' },
        { source: 'hours', target: 'jobs[0].minutes', transform: 'expression', expression: 'round(($ - floor($)) * 60, 0)' },
        { source: 'severance', target: null, transform: 'drop' },
      ],
      defaults: { consent: false },
    } } },
  });

  const source = { name: 'John Doe', employer: 'ACME', hours: 7.5, severance: 'yes', email: 'john@example.com' };
  const result = engine.migrateResponse(source, '1.0.0');

  assert.equal(result.fullName, 'John Doe');
  assert.deepEqual(result.jobs, [{ employer: 'ACME', hours: 7, minutes: 30 }]);
  assert.equal(result.consent, false, 'a default fills a new field');
  assert.equal(result.name, undefined, 'a preserved source does not also carry forward');
  assert.equal(result.severance, undefined, 'dropped by rule');
  assert.equal(result.email, undefined, 'not an item of this version, so not carried forward');
  assert.equal(source.hours, 7.5, 'the source is untouched');
});

test('leaves a response alone when no migration names its version', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '2.0.0',
    title: 'Migration Test',
    items: [{ key: 'a', type: 'field', dataType: 'string', label: 'A' }],
    migrations: { from: { '1.0.0': { fieldMap: [{ source: 'b', target: 'a', transform: 'preserve' }] } } },
  });
  assert.deepEqual(engine.migrateResponse({ b: 'x' }, '1.5.0'), { b: 'x' });
});

test('an expression rule reads the whole source through @source', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '3.0.0',
    title: 'Migration Transform Context',
    items: [
      { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
      { key: 'nickname', type: 'field', dataType: 'string', label: 'Nickname' },
    ],
    migrations: { from: { '1.0.0': { fieldMap: [
      { source: 'givenName', target: 'name', transform: 'preserve' },
      { source: 'givenName', target: 'nickname', transform: 'expression', expression: "upper($) & ' / ' & @source.familyName" },
    ] } } },
  });

  const result = engine.migrateResponse({ givenName: 'alice', familyName: 'Liddell', nickname: 'legacy' }, '1.0.0');

  assert.equal(result.name, 'alice');
  assert.equal(result.nickname, 'ALICE / Liddell');
});
