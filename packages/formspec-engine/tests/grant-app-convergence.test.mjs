/** @filedesc Grant fixtures retain URI, demand validation, and source fallback behavior across consumers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FormEngine } from '../dist/index.js';

const root = new URL('../../../', import.meta.url);
const fixturePaths = [
  'examples/grant-application/definition.json',
  'benchmarks/tasks/grant-application/reference/definition.json',
  'packages/formspec-engine/tests/fixtures/grant-app-definition.json',
];
const read = path => readFileSync(new URL(path, root), 'utf8');
const registryEntries = JSON.parse(read('registries/formspec-common.registry.json')).entries;
const submission = JSON.parse(read('examples/grant-application/fixtures/sample-submission.json')).data;

// Equality protects convergence; the execution controls below protect its meaning.
test('grant definitions are identical for example, benchmark, and engine consumers', () => {
  for (const path of fixturePaths.slice(1)) assert.equal(read(path), read(fixturePaths[0]), path);
});

for (const path of fixturePaths) {
  test(`${path}: URI and demand validation preserve a clean submit report`, async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 503 }));
    t.mock.method(console, 'error', () => {});
    const definition = JSON.parse(read(path));
    FormEngine.instanceSourceCache.delete(definition.instances.priorYearData.source);
    const engine = new FormEngine(definition, { registryEntries });
    t.after(() => engine.dispose());
    engine.loadResponseData(structuredClone(submission));
    const outcomes = await engine.waitForInstanceSources();
    assert.equal(outcomes.priorYearData.status, 'unavailable');
    assert.deepEqual(engine.instanceData.priorYearData, definition.instances.priorYearData.data,
      'failed remote lookup must retain authored inline fallback');
    assert.equal(definition.items.find(item => item.key === 'applicantInfo').children
      .find(item => item.key === 'projectWebsite').dataType, 'uri');
    const report = engine.getValidationReport({ profile: 'on-submit' });
    assert.equal(report.valid, true);
    assert.deepEqual(report.counts, { error: 0, warning: 0, info: 0 });
    assert.deepEqual(engine.getResponse({ profile: 'on-submit' }).validationResults, []);

    // A URN is a valid URI but intentionally fails the website's HTTP(S) recommendation.
    engine.setValue('applicantInfo.projectWebsite', 'urn:example:grant-project');
    for (const profile of ['live', 'on-submit']) {
      const scheduled = engine.getValidationReport({ profile });
      assert.equal(scheduled.valid, true);
      assert.deepEqual(scheduled.counts, { error: 0, warning: 0, info: 0 }, profile);
    }
    const demand = engine.evaluateShape('websiteFormat');
    assert.equal(demand.length, 1);
    assert.equal(demand[0].severity, 'info');
    assert.equal(demand[0].message,
      'Project website should start with http:// or https://. Current value: urn:example:grant-project');
    engine.setValue('applicantInfo.projectWebsite', 'https://example.org/project');
    assert.deepEqual(engine.evaluateShape('websiteFormat'), []);
  });

  test(`${path}: static source loads once and reuses the admitted value`, async t => {
    const definition = JSON.parse(read(path));
    const source = definition.instances.priorYearData.source;
    assert.equal(source, 'https://api.example.gov/responses/2024/{entityId}');
    assert.equal(definition.instances.priorYearData.static, true);
    FormEngine.instanceSourceCache.delete(source);
    t.after(() => FormEngine.instanceSourceCache.delete(source));
    const remote = { priorAwardAmount: 310000, performanceRating: 'excellent' };
    const fetch = t.mock.method(globalThis, 'fetch', async url => {
      assert.equal(url, source);
      return { ok: true, json: async () => remote };
    });
    const first = new FormEngine(definition, { registryEntries });
    t.after(() => first.dispose());
    assert.equal((await first.waitForInstanceSources()).priorYearData.status, 'loaded');
    assert.deepEqual(first.instanceData.priorYearData, remote);
    const second = new FormEngine(JSON.parse(read(path)), { registryEntries });
    t.after(() => second.dispose());
    assert.equal((await second.waitForInstanceSources()).priorYearData.status, 'loaded');
    assert.deepEqual(second.instanceData.priorYearData, remote);
    assert.equal(fetch.mock.callCount(), 1, 'static source must not refetch in the next engine');
  });
}
