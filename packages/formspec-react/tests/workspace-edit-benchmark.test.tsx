/** @filedesc Synthetic 450-field React Workspace typing benchmark (fs-3kek). */
import React, { act } from 'react';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import type { FormDefinition } from '@formspec-org/types';
import { FormspecForm, type WalkBridgeElement } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

function buildSyntheticLargeWorkspaceDefinition(): FormDefinition {
    const items: Record<string, unknown>[] = [];
    const binds: Record<string, unknown>[] = [];
    const shapes: Record<string, unknown>[] = [];

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

    const submitTargets = [
        'roster.entries[*].title', 'roster.entries[*].note',
        'roster.entries[*].q1', 'roster.entries[*].q2', 'roster.entries[*].q3', 'roster.entries[*].q4',
    ];
    for (let s = 2; s <= 5; s++) {
        submitTargets.push(
            `section${s}.rows[*].label`, `section${s}.rows[*].comment`,
            `section${s}.summary1`, `section${s}.summary2`, `section${s}.summary3`, `section${s}.summary4`,
        );
    }
    for (let i = 0; i < 80; i++) {
        shapes.push({
            id: `submitAck${i}`, target: submitTargets[i % submitTargets.length],
            severity: 'warning', timing: 'submit', code: 'UNANSWERED_QUESTIONS',
            explanation: 'acknowledge', constraint: 'present($)', message: `Unanswered check ${i}.`,
        });
    }
    const numericTargets = [
        'roster.entries[*].q1', 'roster.entries[*].q2', 'roster.entries[*].q3', 'roster.entries[*].q4',
        'roster.grandTotal', 'section2.secTotal', 'section3.secTotal', 'section4.secTotal', 'section5.secTotal',
    ];
    for (let i = 0; i < 15; i++) {
        shapes.push({
            id: `submitExplain${i}`, target: numericTargets[i % numericTargets.length],
            severity: 'warning', timing: 'submit', code: `LARGE_VALUE_${i}`,
            explanation: 'explain', constraint: 'empty($) or $ < 1000', message: `Large value warning ${i}.`,
        });
    }
    for (let i = 0; i < 5; i++) {
        shapes.push({
            id: `submitConfirm${i}`, target: numericTargets[i % numericTargets.length],
            severity: 'warning', timing: 'submit', code: `ZERO_VALUE_${i}`,
            explanation: 'confirm', constraint: 'empty($) or $ != 0', message: `Zero value confirmation ${i}.`,
        });
    }
    shapes.push({
        id: 'liveRangeWarning', target: 'roster.entries[*].q1',
        severity: 'warning', timing: 'continuous', code: 'LIVE_HIGH_Q1',
        explanation: 'explain', constraint: 'empty($) or $ <= 500', message: 'Quarter 1 value exceeds 500.',
    });

    return {
        $formspec: '1.0',
        url: 'urn:bench:synthetic-450-workspace',
        version: '1.0.0',
        title: 'Synthetic 450-field workspace',
        formPresentation: { pageMode: 'workspace' },
        warningExplanation: 'acknowledge',
        items,
        binds,
        shapes,
    } as unknown as FormDefinition;
}

function stats(samples: number[]) {
    const sorted = [...samples].sort((a, b) => a - b);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    return { mean, p50, p95 };
}

describe('450-field Workspace keystroke benchmark (fs-3kek)', () => {
    it('measures per-edit time and Submit evaluations before warning, with live warning, and after Submit', () => {
        const definition = buildSyntheticLargeWorkspaceDefinition();
        const engine = createFormEngine(definition);
        try {
            const host = actRender(<FormspecForm engine={engine} />);
            const input = host.querySelector<HTMLInputElement>('[data-name="roster.entries[0].q1"] input')!;
            expect(input).not.toBeNull();
            const setInput = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
            const typeValue = (val: string) => {
                const start = performance.now();
                act(() => {
                    setInput.call(input, val);
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                });
                return performance.now() - start;
            };

            const explanationReads = vi.spyOn(engine, 'getExplanationState');

            // Phase 1: clean edits before any live warning or Submit
            const cleanSamples: number[] = [];
            explanationReads.mockClear();
            for (let i = 0; i < 6; i++) {
                cleanSamples.push(typeValue(String(10 + i)));
            }
            const cleanReads = explanationReads.mock.calls.length;

            // Phase 2: live warning active (q1 > 500)
            typeValue('600');
            const liveWarnSamples: number[] = [];
            explanationReads.mockClear();
            for (let i = 0; i < 6; i++) {
                liveWarnSamples.push(typeValue(String(601 + i)));
            }
            const liveWarnReads = explanationReads.mock.calls.length;

            // Phase 3: after Submit with warnings (return q1 below live warning threshold)
            typeValue('100');
            const root = host.querySelector<WalkBridgeElement>('[data-formspec-render-root]')!;
            act(() => { root.submit?.({ emitEvent: false }); });
            const postSubmitSamples: number[] = [];
            explanationReads.mockClear();
            for (let i = 0; i < 6; i++) {
                postSubmitSamples.push(typeValue(String(101 + i)));
            }
            const postSubmitReads = explanationReads.mock.calls.length;

            const sClean = stats(cleanSamples);
            const sLive = stats(liveWarnSamples);
            const sPost = stats(postSubmitSamples);
            console.log(`  [fs-3kek react] clean edit:       mean=${sClean.mean.toFixed(2)}ms p50=${sClean.p50.toFixed(2)}ms p95=${sClean.p95.toFixed(2)}ms explanationReads=${cleanReads}`);
            console.log(`  [fs-3kek react] live-warn edit:   mean=${sLive.mean.toFixed(2)}ms p50=${sLive.p50.toFixed(2)}ms p95=${sLive.p95.toFixed(2)}ms explanationReads=${liveWarnReads}`);
            console.log(`  [fs-3kek react] post-submit edit: mean=${sPost.mean.toFixed(2)}ms p50=${sPost.p50.toFixed(2)}ms p95=${sPost.p95.toFixed(2)}ms explanationReads=${postSubmitReads}`);
        } finally {
            engine.dispose();
        }
    }, 60_000);
});
