/** @filedesc React FormspecForm reuses validation from the single capture returned by a fenced responseActionInvoker (fs-6zl7). */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React, { act } from 'react';
import {
    initFormspecEngine,
    createFormEngine,
    createDemoSubmitResponseActions,
    resolveResponseAction,
    resolveResponseActionValidationTuple,
} from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0' as const,
    url: 'urn:test:single-capture-react',
    version: '1.0.0',
    title: 'Single Capture React',
    items: [
        { key: 'title', type: 'field' as const, dataType: 'string' as const, label: 'Title' },
    ],
    binds: [
        { path: 'title', required: 'true' },
    ],
};

describe('FormspecForm single-capture validation reuse (fs-6zl7)', () => {
    it('records and focuses validation from the fenced invoker detail without running a second validation', async () => {
        const engine = createFormEngine(definition);
        const doc = createDemoSubmitResponseActions({ definitionUrl: definition.url });
        const snapshotSpy = vi.spyOn(engine, 'getResponseSnapshot');

        // Fenced invoker captures ONCE itself (simulating a single fenced server/draft capture)
        // and returns blocked with that exact detail without calling submitPorts.submit a second time.
        const fencedInvoker = vi.fn(async (input: any) => {
            const resolution = resolveResponseAction(input.document, input.actionRef, input.nodeId);
            const validationTuple = resolveResponseActionValidationTuple(resolution.action!);
            const captured = engine.getResponseSnapshot({ profile: 'on-submit' }, 'on-submit');
            return {
                status: 'blocked' as const,
                resolution,
                validationTuple,
                detail: captured,
                effectTrace: [],
            };
        });

        const container = actRender(
            <FormspecForm
                engine={engine}
                responseActionsDocument={doc}
                responseActionInvoker={fencedInvoker}
                onSubmit={() => {}}
            />,
        );

        const submitBtn = container.querySelector<HTMLButtonElement>('button.formspec-submit')!;
        await act(async () => {
            submitBtn.click();
            await Promise.resolve();
        });

        // Exactly ONE capture occurred across the entire submit flow!
        expect(fencedInvoker).toHaveBeenCalledTimes(1);
        expect(snapshotSpy).toHaveBeenCalledTimes(1);
        // Validation from that exact single capture drove focus and summary display.
        expect(document.activeElement).toBe(container.querySelector('input[name="title"]'));
        engine.dispose();
    });
});
