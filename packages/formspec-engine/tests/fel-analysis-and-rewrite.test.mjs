/** @filedesc FEL static analysis and rewrite: analyzeFEL, dependency extraction, reference rewriting, extension validation */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeFEL,
  getBuiltinFELFunctionCatalog,
  getFELDependencies,
  rewriteFELReferences,
  validateExtensionUsage,
} from '../dist/index.js';
import { wasmRewriteFELReferences, wasmRewriteMessageTemplate } from '../dist/wasm-bridge-tools.js';

test('analyzeFEL reports parse errors with location metadata', () => {
  const analysis = analyzeFEL('$a +');
  assert.equal(analysis.valid, false);
  assert.equal(analysis.errors.length > 0, true);
  assert.equal(typeof analysis.errors[0].line, 'number');
  assert.equal(typeof analysis.errors[0].column, 'number');
  assert.equal(typeof analysis.errors[0].message, 'string');
  assert.equal(typeof analysis.errors[0].offset, 'number');
  const span = analysis.errors[0].span;
  if (span != null) {
    assert.equal(typeof span.start, 'number');
    assert.equal(typeof span.end, 'number');
  }
});

test('getFELDependencies ignores references inside strings and comments', () => {
  const expression = "$price + 1 /* $ignored */ + concat('$literal', $qty)";
  const deps = getFELDependencies(expression);
  assert.deepEqual(deps.sort(), ['price', 'qty']);
});

test('rewriteFELReferences rewrites only parsed references', () => {
  const expression = "$old + concat('$old', \"@instance('oldInst')\") /* $old */";
  const result = rewriteFELReferences(expression, {
    rewriteFieldPath(path) {
      return path === 'old' ? 'renamed' : path;
    },
    rewriteInstanceName(name) {
      return name === 'oldInst' ? 'renamedInst' : name;
    },
  });
  assert.equal(result, "$renamed + concat('$old', \"@instance('oldInst')\") /* $old */");
});

test('rewriteFELReferences rewrites instance references only in @instance calls', () => {
  const expression = "@instance('patient').name + '@instance(\"patient\")' + @patientVar";
  const result = rewriteFELReferences(expression, {
    rewriteInstanceName(name) {
      return name === 'patient' ? 'person' : name;
    },
    rewriteVariable(name) {
      return name === 'patientVar' ? 'personVar' : name;
    },
  });
  assert.equal(result, "@instance('person').name + '@instance(\"patient\")' + @personVar");
});

test('rewriteFELReferences rewrites navigation targets only for literal first arguments', () => {
  const expression = "prev(concat('amount', @suffix)) + next('amount')";
  const result = rewriteFELReferences(expression, {
    rewriteNavigationTarget(name) {
      return name === 'amount' ? 'pref_amount' : name;
    },
  });
  assert.equal(result, "prev(concat('amount', @suffix)) + next('pref_amount')");
});

test('wasmRewriteFELReferences preserves non-reference source text and quote style', () => {
  const expression = 'prev( /* keep */ "members" , $member.total ) + $foo /* tail */ + @instance(\'census\').name + @current.total + @var_name';
  const result = wasmRewriteFELReferences(expression, {
    fieldPaths: {
      'member.total': 'household.memberTotal',
      foo: 'bar',
    },
    currentPaths: {
      total: 'summary.total',
    },
    instanceNames: {
      census: 'demographics',
    },
    variables: {
      var_name: 'renamed_var',
    },
    navigationTargets: {
      'prev:members': 'householdMembers',
    },
  });

  assert.equal(
    result,
    'prev( /* keep */ "householdMembers" , $household.memberTotal ) + $bar /* tail */ + @instance(\'demographics\').name + @current.summary.total + @renamed_var',
  );
});

test('wasmRewriteMessageTemplate rewrites only valid interpolation expressions', () => {
  const message = 'Total {{ $amount /* keep */ }}; invalid {{ $ + }}; current {{ @current.total }}.';
  const result = wasmRewriteMessageTemplate(message, {
    fieldPaths: {
      amount: 'totals.amount',
    },
    currentPaths: {
      total: 'summary.total',
    },
  });

  assert.equal(
    result,
    'Total {{ $totals.amount /* keep */ }}; invalid {{ $ + }}; current {{ @current.summary.total }}.',
  );
});

test('getBuiltinFELFunctionCatalog is sourced from the runtime stdlib', () => {
  const catalog = getBuiltinFELFunctionCatalog();
  const names = catalog.map((entry) => entry.name);
  assert.equal(names.includes('sum'), true);
  assert.equal(names.includes('countWhere'), true);
  assert.equal(names.includes('instance'), true);
});

test('catalog entries include signature and description', () => {
  const catalog = getBuiltinFELFunctionCatalog();
  const sum = catalog.find((e) => e.name === 'sum');
  assert.ok(sum);
  assert.equal(typeof sum.signature, 'string');
  assert.equal(typeof sum.description, 'string');
  assert.ok(sum.signature.includes('->'), 'signature should include return type arrow');
});

test('every catalog entry has signature and description', () => {
  const catalog = getBuiltinFELFunctionCatalog();
  for (const entry of catalog) {
    assert.ok(entry.signature, `${entry.name} missing signature`);
    assert.ok(entry.description, `${entry.name} missing description`);
  }
});

test('contains vs selected descriptions disambiguate their use cases', () => {
  const catalog = getBuiltinFELFunctionCatalog();
  const contains = catalog.find((e) => e.name === 'contains');
  const selected = catalog.find((e) => e.name === 'selected');
  assert.ok(contains.description.toLowerCase().includes('substring'));
  assert.ok(selected.description.toLowerCase().includes('choice'));
});

test('dateDiff signature documents argument order', () => {
  const catalog = getBuiltinFELFunctionCatalog();
  const dateDiff = catalog.find((e) => e.name === 'dateDiff');
  assert.ok(dateDiff.description.includes('laterDate'));
  assert.ok(dateDiff.description.includes('earlierDate'));
});

test('validateExtensionUsage reports unresolved/deprecated/retired extension entries', () => {
  const issues = validateExtensionUsage(
    [
      {
        type: 'field',
        key: 'email',
        label: 'Email',
        dataType: 'string',
        'x-unknown': true,
        extensions: {
          'x-deprecated': true,
          'x-retired': true,
        },
      },
    ],
    {
      resolveEntry(name) {
        if (name === 'x-deprecated') {
          return { name, category: 'constraint', status: 'deprecated' };
        }
        if (name === 'x-retired') {
          return { name, category: 'constraint', status: 'retired' };
        }
        return undefined;
      },
    },
  );

  assert.equal(issues.some((issue) => issue.code === 'UNRESOLVED_EXTENSION'), true);
  assert.equal(issues.some((issue) => issue.code === 'EXTENSION_DEPRECATED'), true);
  assert.equal(issues.some((issue) => issue.code === 'EXTENSION_RETIRED'), true);
});
