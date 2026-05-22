/** @filedesc Shape composition and timing: and/or composition, activation ordering, and reactive shape re-evaluation */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';

test('should fail validation when any and-composed expression fails', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'And Shape Test',
    items: [
      { key: 'age', type: 'field', dataType: 'integer', label: 'Age', initialValue: 25 },
      { key: 'income', type: 'field', dataType: 'integer', label: 'Income', initialValue: 50000 }
    ],
    shapes: [
      {
        id: 'eligibility',
        target: '#',
        message: 'Not eligible',
        and: ['age >= 18', 'income >= 30000']
      }
    ]
  });

  const reportWhenBothPass = engine.getValidationReport();
  engine.setValue('age', 15);
  const reportWhenOneFails = engine.getValidationReport();

  assert.equal(reportWhenBothPass.valid, true);
  assert.equal(reportWhenOneFails.valid, false);
  assert.equal(reportWhenOneFails.results.filter((result) => result.shapeId === 'eligibility').length, 1);
});

test('should pass validation when at least one or-composed expression passes', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Or Shape Test',
    items: [
      { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
      { key: 'phone', type: 'field', dataType: 'string', label: 'Phone' }
    ],
    shapes: [
      {
        id: 'contactRequired',
        target: '#',
        message: 'Provide email or phone',
        or: ['present(email)', 'present(phone)']
      }
    ]
  });

  const reportWhenNoneProvided = engine.getValidationReport();
  engine.setValue('phone', '555-1234');
  const reportWhenOneProvided = engine.getValidationReport();

  assert.equal(reportWhenNoneProvided.valid, false);
  assert.equal(reportWhenOneProvided.valid, true);
});

test('should fail validation when a not-composed expression becomes true', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Not Shape Test',
    items: [
      { key: 'startDate', type: 'field', dataType: 'string', label: 'Start', initialValue: '2024-01-01' },
      { key: 'endDate', type: 'field', dataType: 'string', label: 'End', initialValue: '2024-12-31' }
    ],
    shapes: [
      {
        id: 'noSameDate',
        target: '#',
        message: 'Start and end must differ',
        not: 'startDate == endDate'
      }
    ]
  });

  const reportWhenDifferent = engine.getValidationReport();
  engine.setValue('endDate', '2024-01-01');
  const reportWhenSame = engine.getValidationReport();

  assert.equal(reportWhenDifferent.valid, true);
  assert.equal(reportWhenSame.valid, false);
});

test('should pass validation only when exactly one xone expression passes', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Xone Shape Test',
    items: [
      { key: 'optA', type: 'field', dataType: 'boolean', label: 'A', initialValue: false },
      { key: 'optB', type: 'field', dataType: 'boolean', label: 'B', initialValue: false },
      { key: 'optC', type: 'field', dataType: 'boolean', label: 'C', initialValue: false }
    ],
    shapes: [
      {
        id: 'exactlyOne',
        target: '#',
        message: 'Select exactly one option',
        xone: ['optA == true', 'optB == true', 'optC == true']
      }
    ]
  });

  const reportWhenNoneSelected = engine.getValidationReport();
  engine.setValue('optA', true);
  const reportWhenOneSelected = engine.getValidationReport();
  engine.setValue('optB', true);
  const reportWhenTwoSelected = engine.getValidationReport();

  assert.equal(reportWhenNoneSelected.valid, false);
  assert.equal(reportWhenOneSelected.valid, true);
  assert.equal(reportWhenTwoSelected.valid, false);
});

test('should include shape context values when shape validation fails', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Context Test',
    items: [{ key: 'amount', type: 'field', dataType: 'integer', label: 'Amount', initialValue: 150 }],
    shapes: [
      {
        id: 'maxAmount',
        target: '#',
        constraint: 'amount <= 100',
        message: 'Amount exceeds maximum',
        context: {
          actualAmount: 'amount',
          limit: '100'
        }
      }
    ]
  });

  const report = engine.getValidationReport();
  const shapeResult = report.results.find((result) => result.shapeId === 'maxAmount');

  assert.equal(report.valid, false);
  assert.ok(shapeResult?.context);
  assert.equal(shapeResult?.context?.actualAmount, 150);
  assert.equal(shapeResult?.context?.limit, 100);
});

test('should evaluate submit-timed shapes only when validation mode is submit', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Timing Test',
    items: [{ key: 'agreed', type: 'field', dataType: 'boolean', label: 'Agree', initialValue: false }],
    shapes: [
      {
        id: 'mustAgree',
        target: '#',
        timing: 'submit',
        constraint: 'agreed == true',
        message: 'Must agree to terms'
      }
    ]
  });

  const continuousReport = engine.getValidationReport();
  const submitReport = engine.getValidationReport({ profile: 'on-submit' });
  const submitResponse = engine.getResponse({ profile: 'on-submit' });

  assert.equal(continuousReport.valid, true);
  assert.equal(submitReport.valid, false);
  assert.equal(submitReport.results.length, 1);
  assert.equal(submitResponse.status, 'in-progress');
});

// ── Shape ID references in composition ───────────────────────────────

test('and-composition resolves shape ID references (both pass)', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Shape Ref And Test',
    items: [
      { key: 'age', type: 'field', dataType: 'integer', label: 'Age', initialValue: 25 },
      { key: 'income', type: 'field', dataType: 'integer', label: 'Income', initialValue: 50000 },
    ],
    shapes: [
      { id: 'ageCheck', target: '#', constraint: 'age >= 18', message: 'Too young' },
      { id: 'incomeCheck', target: '#', constraint: 'income >= 30000', message: 'Income too low' },
      { id: 'composite', target: '#', message: 'Not eligible', and: ['ageCheck', 'incomeCheck'] },
    ],
  });

  const report = engine.getValidationReport();
  assert.equal(report.valid, true, 'Both referenced shapes pass — composite should pass');
});

test('and-composition resolves shape ID references (one fails)', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Shape Ref And Fail Test',
    items: [
      { key: 'age', type: 'field', dataType: 'integer', label: 'Age', initialValue: 15 },
      { key: 'income', type: 'field', dataType: 'integer', label: 'Income', initialValue: 50000 },
    ],
    shapes: [
      { id: 'ageCheck', target: '#', constraint: 'age >= 18', message: 'Too young' },
      { id: 'incomeCheck', target: '#', constraint: 'income >= 30000', message: 'Income too low' },
      { id: 'composite', target: '#', message: 'Not eligible', and: ['ageCheck', 'incomeCheck'] },
    ],
  });

  const report = engine.getValidationReport();
  const compositeErr = report.results.find(r => r.shapeId === 'composite');
  assert.ok(compositeErr, 'Composite should fail when referenced shape fails');
});

test('or-composition resolves shape ID references', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Shape Ref Or Test',
    items: [
      { key: 'email', type: 'field', dataType: 'string', label: 'Email' },
      { key: 'phone', type: 'field', dataType: 'string', label: 'Phone', initialValue: '555-1234' },
    ],
    shapes: [
      { id: 'hasEmail', target: '#', constraint: 'present(email)', message: 'No email' },
      { id: 'hasPhone', target: '#', constraint: 'present(phone)', message: 'No phone' },
      { id: 'hasContact', target: '#', message: 'Provide email or phone', or: ['hasEmail', 'hasPhone'] },
    ],
  });

  const report = engine.getValidationReport();
  const contactErr = report.results.find(r => r.shapeId === 'hasContact');
  assert.equal(contactErr, undefined, 'Or-composite should pass when one referenced shape passes');
});

test('not-composition resolves shape ID reference', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Shape Ref Not Test',
    items: [
      { key: 'blacklisted', type: 'field', dataType: 'boolean', label: 'Blacklisted', initialValue: false },
    ],
    shapes: [
      { id: 'isBlacklisted', target: '#', constraint: 'blacklisted == true', message: 'Is blacklisted' },
      { id: 'notBlacklisted', target: '#', message: 'Must not be blacklisted', not: 'isBlacklisted' },
    ],
  });

  // blacklisted = false → isBlacklisted fails → not(isBlacklisted) passes
  const report = engine.getValidationReport();
  const notErr = report.results.find(r => r.shapeId === 'notBlacklisted');
  assert.equal(notErr, undefined, 'not-composite should pass when referenced shape fails');
});

test('mixed shape ID refs and inline FEL in and-composition', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Mixed Ref Test',
    items: [
      { key: 'age', type: 'field', dataType: 'integer', label: 'Age', initialValue: 25 },
      { key: 'income', type: 'field', dataType: 'integer', label: 'Income', initialValue: 50000 },
    ],
    shapes: [
      { id: 'ageCheck', target: '#', constraint: 'age >= 18', message: 'Too young' },
      { id: 'composite', target: '#', message: 'Not eligible', and: ['ageCheck', 'income >= 30000'] },
    ],
  });

  const report = engine.getValidationReport();
  assert.equal(report.valid, true, 'Mixed refs and FEL should both work in and-composition');
});

test('should evaluate demand-timed shapes only when evaluateShape() is called', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Demand Test',
    items: [{ key: 'code', type: 'field', dataType: 'string', label: 'Code' }],
    shapes: [
      {
        id: 'codeCheck',
        target: '#',
        timing: 'demand',
        constraint: 'present(code)',
        message: 'Code is required for this check'
      }
    ]
  });

  const continuousReport = engine.getValidationReport();
  const submitReport = engine.getValidationReport({ profile: 'on-submit' });
  const demandFailures = engine.evaluateShape('codeCheck');

  engine.setValue('code', 'ABC123');
  const demandAfterValue = engine.evaluateShape('codeCheck');

  assert.equal(continuousReport.valid, true);
  assert.equal(submitReport.valid, true);
  assert.equal(demandFailures.length, 1);
  assert.equal(demandAfterValue.length, 0);
});
