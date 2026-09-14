/** @filedesc Performance baseline for batch FormEngine — measures creation and setValue latency. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FormEngine } from '../dist/index.js';

const fixturePath = resolve(import.meta.dirname, '../../../tests/e2e/fixtures/kitchen-sink-holistic/definition.v2.json');
const definition = JSON.parse(readFileSync(fixturePath, 'utf-8'));

function average(times) {
    return times.reduce((a, b) => a + b, 0) / times.length;
}

function trimmedAverage(sortedTimes, trimPercent = 0.05) {
    const trimCount = Math.floor(sortedTimes.length * trimPercent);
    const trimmed = sortedTimes.slice(trimCount, sortedTimes.length - trimCount);
    return average(trimmed.length > 0 ? trimmed : sortedTimes);
}

describe('Performance baseline', () => {
    it('should initialize engine under 250ms', () => {
        const start = performance.now();
        const engine = new FormEngine(definition);
        const elapsed = performance.now() - start;
        console.log(`  Engine creation: ${elapsed.toFixed(2)}ms`);
        // Kitchen-sink is large; CI and cold JIT vary widely (especially after WASM layout changes).
        assert.ok(elapsed < 250, `Engine creation took ${elapsed.toFixed(2)}ms (budget: 250ms)`);
        engine.dispose();
    });

    it('should keep steady-state setValue under 10ms across 100 iterations', () => {
        const engine = new FormEngine(definition);
        const fieldKey = 'fullName';

        const times = [];
        for (let i = 0; i < 100; i++) {
            const start = performance.now();
            engine.setValue(fieldKey, `test-${i}`);
            times.push(performance.now() - start);
        }

        const sorted = [...times].sort((a, b) => a - b);
        const avg = average(times);
        const steadyStateAvg = trimmedAverage(sorted);
        const p50 = sorted[Math.floor(times.length * 0.5)];
        const p99 = sorted[Math.floor(times.length * 0.99)];

        console.log(
            `  setValue avg: ${avg.toFixed(2)}ms, steady avg: ${steadyStateAvg.toFixed(2)}ms, p50: ${p50.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`,
        );
        assert.ok(steadyStateAvg < 10, `Steady-state setValue took ${steadyStateAvg.toFixed(2)}ms (budget: 10ms)`);
        engine.dispose();
    });

    it('should handle getResponse under 10ms', () => {
        const engine = new FormEngine(definition);
        engine.setValue('fullName', 'Alice');
        engine.setValue('budget', 1000);

        const times = [];
        for (let i = 0; i < 100; i++) {
            const start = performance.now();
            engine.getResponse();
            times.push(performance.now() - start);
        }

        const avg = average(times);
        const sorted = [...times].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(times.length * 0.99)];

        console.log(`  getResponse avg: ${avg.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);
        assert.ok(avg < 10, `Average getResponse took ${avg.toFixed(2)}ms (budget: 10ms)`);
        engine.dispose();
    });

    it('should handle getValidationReport under 10ms', () => {
        const engine = new FormEngine(definition);
        engine.setValue('fullName', 'Alice');

        const times = [];
        for (let i = 0; i < 100; i++) {
            const start = performance.now();
            engine.getValidationReport();
            times.push(performance.now() - start);
        }

        const avg = average(times);
        const sorted = [...times].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(times.length * 0.99)];

        console.log(`  getValidationReport avg: ${avg.toFixed(2)}ms, p99: ${p99.toFixed(2)}ms`);
        assert.ok(avg < 10, `Average getValidationReport took ${avg.toFixed(2)}ms (budget: 10ms)`);
        engine.dispose();
    });

    it('should resolve 200 repeat-row labels and ad-hoc FEL reads without rebuilding context per segment', () => {
        const rows = 200;
        const engine = new FormEngine({
            $formspec: '1.0',
            url: 'urn:perf:repeat-context',
            version: '1.0.0',
            title: 'Repeat context',
            items: [{
                key: 'rows',
                type: 'group',
                label: 'Rows',
                repeatable: true,
                minRepeat: rows,
                children: [
                    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
                    { key: 'note', type: 'display', label: 'Row {{@index}} of {{@count}}: {{$name}}' },
                ],
            }],
        });

        const start = performance.now();
        for (let i = 0; i < rows; i++) {
            engine.getItemLabelSignal(`rows[${i}].note`).value;
            engine.compileExpression('$name', `rows[${i}]`)();
        }
        const elapsed = performance.now() - start;

        console.log(`  ${rows} row labels (3 segments) + ${rows} compileExpression: ${elapsed.toFixed(0)}ms`);
        assert.equal(engine.getItemLabelSignal('rows[199].note').value, 'Row 200 of 200: ');
        // 800 FEL evaluations; per-segment context rebuilds made this O(rows² · fields) (~7s on an M-series laptop).
        assert.ok(elapsed < 1500, `repeat-row FEL reads took ${elapsed.toFixed(0)}ms (budget: 1500ms)`);
    });
});
