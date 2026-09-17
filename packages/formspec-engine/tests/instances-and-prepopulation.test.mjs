/** @filedesc Instances and prepopulation: inline instance data is readable via FEL and pre-populates fields */
import test from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';
import { createGrantEngine } from './helpers/grant-app.mjs';

test('should read inline instance data when engine code queries instance paths', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Instance Test',
    items: [{ key: 'name', type: 'field', dataType: 'string', label: 'Name' }],
    instances: {
      patient: {
        data: {
          name: 'John Doe',
          dob: '1990-05-15',
          address: {
            city: 'Portland',
            state: 'OR'
          }
        }
      }
    }
  });

  assert.equal(engine.getInstanceData('patient', 'name'), 'John Doe');
  assert.equal(engine.getInstanceData('patient', 'dob'), '1990-05-15');
  assert.equal(engine.getInstanceData('patient', 'address.city'), 'Portland');
  assert.equal(engine.getInstanceData('patient').address.state, 'OR');
  assert.equal(engine.getInstanceData('nonexistent', 'foo'), undefined);
});

test('should resolve instance() FEL values when binds reference external instance data', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'Instance FEL Test',
    items: [{ key: 'greeting', type: 'field', dataType: 'string', label: 'Greeting' }],
    instances: {
      defaults: {
        data: { greeting: 'Hello, World!' }
      }
    },
    binds: [{ path: 'greeting', calculate: "instance('defaults', 'greeting')" }]
  });

  assert.equal(engine.signals.greeting.value, 'Hello, World!');
});

test('should pre-populate initial values when prePopulate instance mapping is configured', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'PrePopulate Test',
    items: [
      {
        key: 'patientName',
        type: 'field',
        dataType: 'string',
        label: 'Patient Name',
        prePopulate: { instance: 'patient', path: 'name' }
      },
      {
        key: 'dob',
        type: 'field',
        dataType: 'string',
        label: 'DOB',
        prePopulate: { instance: 'patient', path: 'dob', editable: false }
      },
      {
        key: 'notes',
        type: 'field',
        dataType: 'string',
        label: 'Notes'
      }
    ],
    instances: {
      patient: {
        data: { name: 'Jane Smith', dob: '1985-03-20' }
      }
    }
  });

  assert.equal(engine.signals.patientName.value, 'Jane Smith');
  assert.equal(engine.signals.dob.value, '1985-03-20');
  assert.equal(engine.signals.notes.value, '');
  assert.equal(engine.readonlySignals.dob.value, true);
  assert.equal(engine.readonlySignals.patientName.value, false);
});

test('should compose prePopulate readonly and bind readonly rules when editable is false', () => {
  const engine = new FormEngine({
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title: 'PrePopulate Readonly Compose',
    items: [
      { key: 'toggle', type: 'field', dataType: 'boolean', label: 'Toggle', initialValue: false },
      {
        key: 'field1',
        type: 'field',
        dataType: 'string',
        label: 'Field1',
        prePopulate: { instance: 'data', path: 'val', editable: false }
      },
      {
        key: 'field2',
        type: 'field',
        dataType: 'string',
        label: 'Field2',
        prePopulate: { instance: 'data', path: 'val' }
      }
    ],
    instances: {
      data: { data: { val: 'prepopulated' } }
    },
    binds: [{ path: 'field2', readonly: 'toggle == true' }]
  });

  const field1Readonly = engine.readonlySignals.field1.value;
  const field2ReadonlyBefore = engine.readonlySignals.field2.value;

  engine.setValue('toggle', true);
  const field2ReadonlyAfter = engine.readonlySignals.field2.value;

  assert.equal(field1Readonly, true);
  assert.equal(field2ReadonlyBefore, false);
  assert.equal(field2ReadonlyAfter, true);
});

test('should make grant-app agencyData instance data accessible', () => {
  const engine = createGrantEngine();
  const data = engine.instanceData?.agencyData;

  assert.ok(data);
  assert.equal(data.maxAward, 500000);
  assert.equal(data.fiscalYear, 'FY2026');
});

test('should have prePopulate property on orgName referencing agencyData instance', () => {
  const engine = createGrantEngine();
  const applicantInfo = engine.definition.items.find(item => item.key === 'applicantInfo');
  const orgName = applicantInfo?.children?.find(field => field.key === 'orgName');
  const prePop = orgName?.prePopulate;

  assert.ok(prePop);
  assert.equal(prePop.instance, 'agencyData');
  assert.equal(prePop.path, 'orgName');
  assert.equal(prePop.editable, true);
});

function seedFromRowsDefinition({
  title,
  minRepeat = 0,
  maxRepeat,
  recordItems,
  prePopulate = { instance: 'record', path: 'name' },
  instances,
  wrap = false,
}) {
  const group = {
    key: 'rows',
    type: 'group',
    repeatable: true,
    minRepeat,
    seedFrom: { instance: 'record', path: 'items' },
    children: [{
      key: 'name',
      type: 'field',
      dataType: 'string',
      ...(prePopulate ? { prePopulate } : {}),
    }],
  };
  if (maxRepeat !== undefined) {
    group.maxRepeat = maxRepeat;
  }
  return {
    $formspec: '1.0',
    url: 'http://example.org/test',
    version: '1.0.0',
    title,
    items: wrap ? [{ key: 'section', type: 'group', children: [group] }] : [group],
    instances: instances ?? { record: { data: { items: recordItems } } },
  };
}

test('should seed repeatable rows from instance array with relative prePopulate', () => {
  const engine = new FormEngine(seedFromRowsDefinition({
    title: 'SeedFrom Test',
    wrap: true,
    recordItems: [{ name: 'ACME CORP' }, { name: 'WIDGETS INC' }],
    prePopulate: { instance: 'record', path: 'name', editable: false },
  }));

  assert.equal(engine.repeats['section.rows'].value, 2);
  assert.equal(engine.signals['section.rows[0].name'].value, 'ACME CORP');
  assert.equal(engine.signals['section.rows[1].name'].value, 'WIDGETS INC');
  assert.equal(engine.readonlySignals['section.rows[0].name'].value, true);
});

test('should leave repeat at minRepeat when seedFrom instance array is missing', () => {
  const engine = new FormEngine(seedFromRowsDefinition({
    title: 'SeedFrom Missing',
    recordItems: null,
    prePopulate: undefined,
  }));

  assert.equal(engine.repeats.rows.value, 0);
});

test('should not apply seedFrom after loadResponseData supplies repeat rows', async () => {
  const engine = new FormEngine(seedFromRowsDefinition({
    title: 'SeedFrom Host Wins',
    recordItems: [{ name: 'A' }, { name: 'B' }],
  }));

  assert.equal(engine.repeats.rows.value, 2);
  engine.loadResponseData({ rows: [{ name: 'HostOnly' }] });
  assert.equal(engine.repeats.rows.value, 1);
  assert.equal(engine.signals['rows[0].name'].value, 'HostOnly');
});

test('constructor responseData host row wins over seedFrom', () => {
  const engine = new FormEngine(seedFromRowsDefinition({
    title: 'Host Row',
    recordItems: [{ name: 'A' }, { name: 'B' }],
  }), { responseData: { rows: [{ name: 'HostOnly' }] } });

  assert.equal(engine.repeats.rows.value, 1);
  assert.equal(engine.signals['rows[0].name'].value, 'HostOnly');
});

test('should seed repeat rows after async instance source fetch', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ items: [{ name: 'ACME CORP' }, { name: 'WIDGETS INC' }] }),
  });
  try {
    const engine = new FormEngine(seedFromRowsDefinition({
      title: 'Async SeedFrom',
      instances: { record: { source: 'https://example.org/record.json' } },
    }));

    assert.equal(engine.repeats.rows.value, 0);
    await engine.waitForInstanceSources();
    assert.equal(engine.repeats.rows.value, 2);
    assert.equal(engine.signals['rows[0].name'].value, 'ACME CORP');
    assert.equal(engine.signals['rows[1].name'].value, 'WIDGETS INC');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('constructor responseData empty array wins over seedFrom', () => {
  const engine = new FormEngine(seedFromRowsDefinition({
    title: 'Empty Host Array',
    recordItems: [{ name: 'A' }, { name: 'B' }],
  }), { responseData: { rows: [] } });

  assert.equal(engine.repeats.rows.value, 0);
});

test('removing every seeded row does not re-seed on evaluate', () => {
  const engine = new FormEngine(seedFromRowsDefinition({
    title: 'Delete All',
    recordItems: [{ name: 'A' }, { name: 'B' }],
  }));

  assert.equal(engine.repeats.rows.value, 2);
  engine.removeRepeatInstance('rows', 1);
  engine.removeRepeatInstance('rows', 0);
  assert.equal(engine.repeats.rows.value, 0);
  const data = engine.getResponse().data;
  assert.ok(data.rows === undefined || (Array.isArray(data.rows) && data.rows.length === 0));
});

test('seedFrom respects maxRepeat cap and minRepeat padding with empty extra rows', () => {
  const capped = new FormEngine(seedFromRowsDefinition({
    title: 'Max Cap',
    maxRepeat: 1,
    recordItems: [{ name: 'A' }, { name: 'B' }],
  }));
  assert.equal(capped.repeats.rows.value, 1);
  assert.equal(capped.signals['rows[0].name'].value, 'A');

  const padded = new FormEngine(seedFromRowsDefinition({
    title: 'Min Pad',
    minRepeat: 3,
    recordItems: [{ name: 'A' }],
  }));
  assert.equal(padded.repeats.rows.value, 3);
  assert.equal(padded.signals['rows[0].name'].value, 'A');
  assert.ok(padded.signals['rows[1].name'].value === '' || padded.signals['rows[1].name'].value == null);
  assert.ok(padded.signals['rows[2].name'].value === '' || padded.signals['rows[2].name'].value == null);
});
