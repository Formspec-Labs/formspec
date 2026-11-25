/** @filedesc Synthetic 450-field workspace Definition benchmark (fs-3kek): measures per-edit and Submit evaluation latency. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FormEngine } from '../dist/index.js';
import { getWasmModule } from '../dist/wasm-bridge-runtime.js';

/**
 * Build a neutral synthetic 452-field workspace Definition matching the fs-3kek profile:
 * - 5 sections, Section 1 holding 180 fields (25 repeatable rows x 7 fields + 5 section aggregates)
 * - 4 additional sections holding 68 fields each (10 rows x 6 fields + 8 section aggregates)
 * - Row-level and section-level calculated aggregates
 * - 100 Submit-timing warning Shapes (acknowledge / explain / confirm) + optional continuous warning Shape
 */
export function buildSyntheticLargeWorkspaceDefinition({
    withExplanations = true,
    withContinuousWarning = true,
} = {}) {
    const items = [];
    const binds = [];
    const shapes = [];

    // Section 1: 25 rows x 7 fields = 175 row fields + 5 aggregate fields = 180 fields
    items.push({
        key: 'roster',
        type: 'group',
        label: 'Program roster',
        children: [
            {
                key: 'entries',
                type: 'group',
                label: 'Entries',
                repeatable: true,
                minRepeat: 25,
                children: [
                    { key: 'title', type: 'field', dataType: 'string', label: 'Entry title' },
                    { key: 'q1', type: 'field', dataType: 'integer', label: 'Quarter 1' },
                    { key: 'q2', type: 'field', dataType: 'integer', label: 'Quarter 2' },
                    { key: 'q3', type: 'field', dataType: 'integer', label: 'Quarter 3' },
                    { key: 'q4', type: 'field', dataType: 'integer', label: 'Quarter 4' },
                    { key: 'subtotal', type: 'field', dataType: 'integer', label: 'Row subtotal' },
                    { key: 'note', type: 'field', dataType: 'string', label: 'Notes' },
                ],
            },
            { key: 'totalQ1', type: 'field', dataType: 'integer', label: 'Total Q1' },
            { key: 'totalQ2', type: 'field', dataType: 'integer', label: 'Total Q2' },
            { key: 'totalQ3', type: 'field', dataType: 'integer', label: 'Total Q3' },
            { key: 'totalQ4', type: 'field', dataType: 'integer', label: 'Total Q4' },
            { key: 'grandTotal', type: 'field', dataType: 'integer', label: 'Grand total' },
        ],
    });
    binds.push(
        { path: 'roster.entries[*].subtotal', calculate: 'coalesce($q1, 0) + coalesce($q2, 0) + coalesce($q3, 0) + coalesce($q4, 0)' },
        { path: 'roster.totalQ1', calculate: 'sum($roster.entries[*].q1)' },
        { path: 'roster.totalQ2', calculate: 'sum($roster.entries[*].q2)' },
        { path: 'roster.totalQ3', calculate: 'sum($roster.entries[*].q3)' },
        { path: 'roster.totalQ4', calculate: 'sum($roster.entries[*].q4)' },
        { path: 'roster.grandTotal', calculate: 'sum($roster.entries[*].subtotal)' },
    );

    // Sections 2..5: 4 x (10 rows x 6 fields + 8 summary/aggregate fields) = 272 fields (total = 452)
    for (let s = 2; s <= 5; s++) {
        const sec = `section${s}`;
        items.push({
            key: sec,
            type: 'group',
            label: `Section ${s}`,
            children: [
                {
                    key: 'rows',
                    type: 'group',
                    label: `Rows ${s}`,
                    repeatable: true,
                    minRepeat: 10,
                    children: [
                        { key: 'label', type: 'field', dataType: 'string', label: 'Row label' },
                        { key: 'a', type: 'field', dataType: 'integer', label: 'Count A' },
                        { key: 'b', type: 'field', dataType: 'integer', label: 'Count B' },
                        { key: 'c', type: 'field', dataType: 'integer', label: 'Count C' },
                        { key: 'rowSum', type: 'field', dataType: 'integer', label: 'Row sum' },
                        { key: 'comment', type: 'field', dataType: 'string', label: 'Comment' },
                    ],
                },
                { key: 'sumA', type: 'field', dataType: 'integer', label: 'Sum A' },
                { key: 'sumB', type: 'field', dataType: 'integer', label: 'Sum B' },
                { key: 'sumC', type: 'field', dataType: 'integer', label: 'Sum C' },
                { key: 'secTotal', type: 'field', dataType: 'integer', label: 'Section total' },
                { key: 'summary1', type: 'field', dataType: 'string', label: 'Summary 1' },
                { key: 'summary2', type: 'field', dataType: 'string', label: 'Summary 2' },
                { key: 'summary3', type: 'field', dataType: 'string', label: 'Summary 3' },
                { key: 'summary4', type: 'field', dataType: 'string', label: 'Summary 4' },
            ],
        });
        binds.push(
            { path: `${sec}.rows[*].rowSum`, calculate: 'coalesce($a, 0) + coalesce($b, 0) + coalesce($c, 0)' },
            { path: `${sec}.sumA`, calculate: `sum($${sec}.rows[*].a)` },
            { path: `${sec}.sumB`, calculate: `sum($${sec}.rows[*].b)` },
            { path: `${sec}.sumC`, calculate: `sum($${sec}.rows[*].c)` },
            { path: `${sec}.secTotal`, calculate: `sum($${sec}.rows[*].rowSum)` },
        );
    }

    // 100 Submit-timing warning Shapes:
    // - 80 acknowledge (blank checks across scalar/repeat targets)
    // - 15 explain (threshold checks)
    // - 5 confirm (zero checks)
    const submitTargets = [
        'roster.entries[*].title',
        'roster.entries[*].note',
        'roster.entries[*].q1',
        'roster.entries[*].q2',
        'roster.entries[*].q3',
        'roster.entries[*].q4',
    ];
    for (let s = 2; s <= 5; s++) {
        submitTargets.push(
            `section${s}.rows[*].label`,
            `section${s}.rows[*].comment`,
            `section${s}.summary1`,
            `section${s}.summary2`,
            `section${s}.summary3`,
            `section${s}.summary4`,
        );
    }
    for (let i = 0; i < 80; i++) {
        const target = submitTargets[i % submitTargets.length];
        shapes.push({
            id: `submitAck${i}`,
            target,
            severity: 'warning',
            timing: 'submit',
            code: 'UNANSWERED_QUESTIONS',
            ...(withExplanations ? { explanation: 'acknowledge' } : { explanation: 'none' }),
            constraint: 'present($)',
            message: `Unanswered check ${i}.`,
        });
    }
    const numericTargets = [
        'roster.entries[*].q1',
        'roster.entries[*].q2',
        'roster.entries[*].q3',
        'roster.entries[*].q4',
        'roster.grandTotal',
        'section2.secTotal',
        'section3.secTotal',
        'section4.secTotal',
        'section5.secTotal',
    ];
    for (let i = 0; i < 15; i++) {
        shapes.push({
            id: `submitExplain${i}`,
            target: numericTargets[i % numericTargets.length],
            severity: 'warning',
            timing: 'submit',
            code: `LARGE_VALUE_${i}`,
            ...(withExplanations ? { explanation: 'explain' } : { explanation: 'none' }),
            constraint: 'empty($) or $ < 1000',
            message: `Large value warning ${i}.`,
        });
    }
    for (let i = 0; i < 5; i++) {
        shapes.push({
            id: `submitConfirm${i}`,
            target: numericTargets[i % numericTargets.length],
            severity: 'warning',
            timing: 'submit',
            code: `ZERO_VALUE_${i}`,
            ...(withExplanations ? { explanation: 'confirm' } : { explanation: 'none' }),
            constraint: 'empty($) or $ != 0',
            message: `Zero value confirmation ${i}.`,
        });
    }

    if (withContinuousWarning) {
        shapes.push({
            id: 'liveRangeWarning',
            target: 'roster.entries[*].q1',
            severity: 'warning',
            timing: 'continuous',
            code: 'LIVE_HIGH_Q1',
            ...(withExplanations ? { explanation: 'explain' } : { explanation: 'none' }),
            constraint: 'empty($) or $ <= 500',
            message: 'Quarter 1 value exceeds 500.',
        });
    }

    return {
        $formspec: '1.0',
        url: 'urn:bench:synthetic-450-workspace',
        version: '1.0.0',
        title: 'Synthetic 450-field workspace',
        formPresentation: { pageMode: 'workspace' },
        ...(withExplanations ? { warningExplanation: 'acknowledge' } : {}),
        items,
        binds,
        shapes,
    };
}

function summarize(samples) {
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    return { mean, p50, p95, min: sorted[0], max: sorted[sorted.length - 1] };
}

describe('Synthetic 450-field workspace benchmark (fs-3kek)', () => {
    it('profiles per-edit setValue, WASM boundary, and Submit evaluation breakdown', () => {
        const definition = buildSyntheticLargeWorkspaceDefinition();
        const engine = new FormEngine(definition);
        try {
            const fieldCount = engine.getFieldPaths().length;
            assert.equal(fieldCount, 452);

            // Seed initial values so aggregates have active numeric inputs.
            for (let row = 0; row < 25; row++) {
                engine.setValue(`roster.entries[${row}].q1`, 10 + row);
            }

            // Warmup
            for (let i = 0; i < 5; i++) {
                engine.setValue('roster.entries[0].q1', 100 + i);
            }

            // Measure pure setValue (live edit)
            const editSamples = [];
            for (let i = 0; i < 15; i++) {
                const start = performance.now();
                engine.setValue('roster.entries[0].q1', 200 + i);
                editSamples.push(performance.now() - start);
            }
            const editStats = summarize(editSamples);

            // Breakdown of JSON.stringify + raw WASM evaluateDefinition + JSON.parse
            const wasm = getWasmModule();
            const dataObj = engine.getDraftSnapshot().data;
            const ctxObj = { nowIso: new Date().toISOString(), instances: {}, registryDocuments: [] };
            let tStringifyDef = 0;
            let tStringifyData = 0;
            let tWasmEval = 0;
            let tParseResult = 0;
            let defBytes = 0;
            let resBytes = 0;
            const runs = 10;
            for (let i = 0; i < runs; i++) {
                let t0 = performance.now();
                const defStr = JSON.stringify(definition);
                tStringifyDef += performance.now() - t0;
                defBytes = defStr.length;

                t0 = performance.now();
                const dataStr = JSON.stringify(dataObj);
                const ctxStr = JSON.stringify(ctxObj);
                tStringifyData += performance.now() - t0;

                t0 = performance.now();
                const resStr = wasm.evaluateDefinition(defStr, dataStr, ctxStr, undefined);
                tWasmEval += performance.now() - t0;
                resBytes = resStr.length;

                t0 = performance.now();
                JSON.parse(resStr);
                tParseResult += performance.now() - t0;
            }

            // Measure separate Submit reads vs combined getSubmitEvaluation() (single Submit evaluation)
            const submitReportSamples = [];
            const explanationSamples = [];
            const singleSubmitSamples = [];
            for (let i = 0; i < 5; i++) {
                engine.setValue('roster.entries[0].q1', 300 + i);
                const t1 = performance.now();
                const reportOnly = engine.getEvaluatedFormState({ profile: 'on-submit' });
                submitReportSamples.push(performance.now() - t1);

                const t2 = performance.now();
                const explOnly = engine.getExplanationState();
                explanationSamples.push(performance.now() - t2);

                engine.setValue('roster.entries[0].q1', 310 + i);
                const t3 = performance.now();
                const combined = engine.getSubmitEvaluation();
                singleSubmitSamples.push(performance.now() - t3);
                assert.equal(combined.evaluated.fields.length, reportOnly.fields.length);
                assert.equal(combined.explanations.groups.length, explOnly.groups.length);
            }
            const submitStats = summarize(submitReportSamples);
            const explStats = summarize(explanationSamples);
            const combinedStats = summarize(singleSubmitSamples);

            console.log(`  [fs-3kek engine] fields=${fieldCount}, shapes=${definition.shapes.length}, defJSON=${(defBytes / 1024).toFixed(1)}KB, resJSON=${(resBytes / 1024).toFixed(1)}KB`);
            console.log(`  [fs-3kek engine] setValue: mean=${editStats.mean.toFixed(2)}ms p50=${editStats.p50.toFixed(2)}ms p95=${editStats.p95.toFixed(2)}ms`);
            console.log(`  [fs-3kek engine] split(avg): stringifyDef=${(tStringifyDef / runs).toFixed(2)}ms stringifyData=${(tStringifyData / runs).toFixed(2)}ms wasmEval=${(tWasmEval / runs).toFixed(2)}ms parseRes=${(tParseResult / runs).toFixed(2)}ms`);
            console.log(`  [fs-3kek engine] on-submit getEvaluatedFormState: mean=${submitStats.mean.toFixed(2)}ms p50=${submitStats.p50.toFixed(2)}ms`);
            console.log(`  [fs-3kek engine] getExplanationState (uncached): mean=${explStats.mean.toFixed(2)}ms p50=${explStats.p50.toFixed(2)}ms`);
            console.log(`  [fs-3kek engine] getSubmitEvaluation (single Submit eval): mean=${combinedStats.mean.toFixed(2)}ms p50=${combinedStats.p50.toFixed(2)}ms`);

            assert.equal(engine.signals['roster.entries[0].subtotal'].value, 314);
            if (process.env.FORMSPEC_BENCH_STRICT === '1') {
                assert.ok(editStats.p50 < 50, `setValue p50 ${editStats.p50.toFixed(2)}ms exceeded 50ms budget`);
            }
        } finally {
            engine.dispose();
        }
    });

    it('measures getExplanationState on a 450-field Definition with no explanation modes', () => {
        const definition = buildSyntheticLargeWorkspaceDefinition({ withExplanations: false });
        const engine = new FormEngine(definition);
        try {
            assert.equal(engine.hasWarningExplanations(), false);
            const first = engine.getExplanationState();
            const samples = [];
            for (let i = 0; i < 5; i++) {
                engine.setValue('roster.entries[0].q1', 10 + i);
                const start = performance.now();
                const state = engine.getExplanationState();
                samples.push(performance.now() - start);
                assert.equal(state, first);
                assert.equal(state.instances.length, 0);
                assert.equal(state.groups.length, 0);
            }
            const stats = summarize(samples);
            console.log(`  [fs-3kek engine] no-explanation getExplanationState: mean=${stats.mean.toFixed(2)}ms p50=${stats.p50.toFixed(2)}ms`);
            assert.ok(stats.p50 < 5, `no-explanation getExplanationState p50 ${stats.p50.toFixed(2)}ms exceeded 5ms fast-path budget`);
        } finally {
            engine.dispose();
        }
    });
});
