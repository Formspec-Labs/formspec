/** @filedesc Schema linting: lintDocument detects document types and validates against built-in schemas */
import test from 'node:test';
import assert from 'node:assert/strict';
import { lintDocument } from '../dist/index.js';
import { wasmPlanSchemaValidation } from '../dist/wasm-bridge-tools.js';

test('detects unknown document type and returns E100-style error', () => {
  const result = lintDocument({ foo: 1 });
  assert.equal(result.documentType, null);
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics.length, 1);
  assert.ok(result.diagnostics[0].message.includes('determine document type'));
  assert.equal(result.diagnostics[0].path, '$');
});

test('definition: valid minimal definition passes', () => {
  const doc = {
    $formspec: '1.0',
    url: 'https://example.com/form',
    version: '1.0.0',
    status: 'draft',
    title: 'Test',
    items: [{ key: 'x', type: 'field', label: 'X', dataType: 'string' }],
  };
  const result = lintDocument(doc);
  assert.equal(result.documentType, 'definition');
  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.length, 0);
});

test('definition: invalid document returns schema errors', () => {
  const result = lintDocument({ $formspec: '1.0' });
  assert.equal(result.documentType, 'definition');
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.length > 0);
  assert.ok(result.diagnostics.some((e) => e.path === '$' || e.message.includes('required')));
});

test('component: valid minimal component document passes', () => {
  const doc = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.com/def' },
    tree: { component: 'Stack', children: [{ component: 'TextInput', bind: 'name' }] },
  };
  const result = lintDocument(doc);
  assert.equal(result.documentType, 'component');
  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.length, 0);
});

test('component: invalid node produces per-node error with path', () => {
  const doc = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.com/def' },
    tree: {
      component: 'Stack',
      children: [
        { component: 'TextInput', bind: 'name' },
        { component: 'TextInput', bind: 123 }, // bind must be string
      ],
    },
  };
  const result = lintDocument(doc);
  assert.equal(result.documentType, 'component');
  assert.ok(result.diagnostics.length > 0);
  const bindError = result.diagnostics.find((e) => e.message.includes('string') || e.path.includes('children'));
  assert.ok(bindError, 'expected an error on the invalid bind');
});

test('component: shallow + per-node completes quickly on large tree (no hang)', () => {
  const children = [];
  for (let i = 0; i < 200; i++) {
    children.push({ component: 'TextInput', bind: `field_${i}` });
  }
  const doc = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.com/def' },
    tree: { component: 'Stack', children },
  };
  const start = Date.now();
  const result = lintDocument(doc);
  const elapsed = Date.now() - start;
  assert.equal(result.documentType, 'component');
  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.length, 0);
  assert.ok(elapsed < 5000, `validation should complete in under 5s (took ${elapsed}ms)`);
});

test('component: custom component template tree is validated', () => {
  const doc = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.com/def' },
    tree: { component: 'Page', title: 'Root', children: [] },
    components: {
      BadCustom: {
        tree: { component: 'TextInput', bind: 999 },
      },
    },
  };
  const result = lintDocument(doc);
  assert.equal(result.documentType, 'component');
  assert.ok(result.diagnostics.length > 0);
  assert.ok(
    result.diagnostics.some((e) => e.path.includes('components') && e.path.includes('BadCustom')),
    'expected error under components.BadCustom'
  );
});

test('planSchemaValidation honors explicit documentType when provided', () => {
  const doc = { $formspec: '1.0', url: 'https://x.com', version: '1.0', status: 'draft', title: 'T', items: [] };
  const plan = wasmPlanSchemaValidation(doc, 'definition');
  assert.equal(plan.documentType, 'definition');
  assert.equal(plan.mode, 'document');
});

test('component: circular tree reference fails fast on JSON serialization', () => {
  // Build a component tree with a circular reference
  const child = { component: 'Stack', children: [] };
  const parent = { component: 'Card', children: [child] };
  child.children.push(parent); // cycle: child -> parent -> child -> ...
  const doc = {
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.com/def' },
    tree: parent,
  };
  const start = Date.now();
  assert.throws(() => lintDocument(doc), /circular/i);
  assert.ok(Date.now() - start < 2000, 'circular structures should fail quickly');
});

test('wasmPlanSchemaValidation enumerates component tree targets', () => {
  const plan = wasmPlanSchemaValidation({
    $formspecComponent: '1.0',
    version: '1.0.0',
    targetDefinition: { url: 'https://example.com/def' },
    tree: {
      component: 'Page',
      children: [{ component: 'TextInput', bind: 'name' }],
    },
    components: {
      CustomCard: {
        tree: {
          component: 'Stack',
          children: [{ component: 'TextInput', bind: 'email' }],
        },
      },
    },
  });

  assert.equal(plan.documentType, 'component');
  assert.equal(plan.mode, 'component');
  assert.deepEqual(
    plan.componentTargets.map((target) => target.pointer),
    [
      '/tree',
      '/tree/children/0',
      '/components/CustomCard/tree',
      '/components/CustomCard/tree/children/0',
    ],
  );
});

test('wasmPlanSchemaValidation preserves explicit schema-only document types', () => {
  const validationResultPlan = wasmPlanSchemaValidation({
    path: 'field',
    severity: 'error',
    constraintKind: 'required',
    message: 'Required',
  }, 'validation_result');
  assert.equal(validationResultPlan.documentType, 'validation_result');
  assert.equal(validationResultPlan.mode, 'document');

  const felFunctionsPlan = wasmPlanSchemaValidation({
    version: '1.0.0',
    functions: [],
  }, 'fel_functions');
  assert.equal(felFunctionsPlan.documentType, 'fel_functions');
  assert.equal(felFunctionsPlan.mode, 'document');
});
