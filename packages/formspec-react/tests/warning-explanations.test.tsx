/** @filedesc An individual warning accepts its localized answer at the concrete repeat path. */
import React, { act } from 'react';
import { signal } from '@preact/signals-core';
import { describe, it, expect, vi } from 'vitest';
import { FormspecContext, type FormspecContextValue } from '../src/context';
import { WarningExplanations } from '../src/warning-explanations';
import { actRender } from './render-utils';

it('submits a localized explanation for one warning and reopens it when the basis changes', () => {
    const instance = { shapeId: 'variance', path: 'rows[1].amount', mode: 'explain', basis: 'b',
        message: 'Unusual total', current: false, text: 'Previous reason' };
    const instanceState = signal([instance]);
    const save = vi.fn(() => { instanceState.value = [{ ...instance, current: true }]; });
    const ctx = { latestSubmit: signal({}), touchedVersion: signal(1), isTouched: () => true,
        engine: { shapeResults: {}, localeSignal: signal(0), getFieldVM: () => ({}),
            getExplanationState: () => ({ instances: instanceState.value }),
            resolveLocaleString: (key: string, fallback: string) => key === '$shape.variance.explanationPrompt' ? 'Why did this change?' : fallback,
            setExplanation: save } } as unknown as FormspecContextValue;
    const el = actRender(<FormspecContext.Provider value={ctx}>
        <WarningExplanations path={instance.path}/>
    </FormspecContext.Provider>);
    expect(el.querySelector('legend')?.textContent).toBe('Unusual total');
    expect(el.querySelector('label')?.textContent).toContain('Why did this change?');
    expect(el.querySelector('textarea')?.value).toBe('Previous reason');
    act(() => { el.querySelector('button')!.click(); });
    expect(save).toHaveBeenCalledWith('variance', 'rows[1].amount', { text: 'Previous reason' });
    expect(el.querySelector('button')?.disabled).toBe(true);
    act(() => { instanceState.value = [{ ...instance, basis: 'c' }]; });
    expect(el.querySelector('button')?.disabled).toBe(false);
});

it('renders grouped blank-answer acknowledgement with field jump links and set difference after changes', () => {
    const groupsState = signal([{
        code: 'CSBG_NOT_ANSWERED',
        paths: ['outcome', 'topic', 'venue'],
        current: false,
        added: ['outcome', 'topic', 'venue'],
        removed: [] as string[],
    }]);
    const entriesState = signal<unknown[]>([]);
    const acknowledge = vi.fn((code: string) => {
        entriesState.value = [{ group: true, code, paths: groupsState.value[0]!.paths, basis: 'g1' }];
        groupsState.value = [{ ...groupsState.value[0]!, current: true, added: [], removed: [] }];
    });
    const labels: Record<string, string> = {
        outcome: 'Outcome',
        partner: 'Partner',
        topic: 'Topic',
        venue: 'Venue',
    };
    const ctx = {
        latestSubmit: signal({}),
        touchedVersion: signal(1),
        isTouched: () => true,
        engine: {
            shapeResults: {},
            localeSignal: signal(0),
            getFieldVM: (path: string) => labels[path] ? ({ id: `field-${path}`, label: signal(labels[path]!) }) : undefined,
            getItemLabelSignal: (path: string) => labels[path] ? signal(labels[path]!) : undefined,
            getDefinition: () => ({ title: 'Workshop report' }),
            getExplanationState: () => ({
                instances: [],
                groups: groupsState.value,
                entries: entriesState.value,
            }),
            resolveLocaleString: (_key: string, fallback: string) => fallback,
            acknowledge,
            setExplanation: vi.fn(),
        },
    } as unknown as FormspecContextValue;

    const el = actRender(
        <div className="formspec-theme-scope">
            <div data-name="venue"><input id="field-venue" /></div>
            <FormspecContext.Provider value={ctx}>
                <WarningExplanations />
            </FormspecContext.Provider>
        </div>,
    );

    const group = el.querySelector<HTMLFieldSetElement>('fieldset[data-explanation-code="CSBG_NOT_ANSWERED"]');
    expect(group).not.toBeNull();
    expect(group?.querySelector('legend')?.textContent).toBe('3 unanswered questions');
    const links = [...group!.querySelectorAll('a')];
    expect(links.map(a => a.textContent)).toEqual(['Outcome', 'Topic', 'Venue']);
    expect(links[2]?.getAttribute('href')).toBe('#field-venue');
    expect(group?.textContent).not.toContain('Newly unanswered');

    act(() => { links[2]!.click(); });
    expect(document.activeElement?.id).toBe('field-venue');

    const button = group!.querySelector('button')!;
    expect(button.textContent).toBe('Accept 3 unanswered questions');
    act(() => { button.click(); });
    expect(acknowledge).toHaveBeenCalledWith('CSBG_NOT_ANSWERED');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Accepted 3 unanswered questions');

    act(() => {
        groupsState.value = [{
            code: 'CSBG_NOT_ANSWERED',
            paths: ['outcome', 'partner', 'topic'],
            current: false,
            added: ['partner'],
            removed: ['venue'],
        }];
    });
    expect(group?.textContent).toContain('Newly unanswered');
    expect(group?.textContent).toContain('Partner');
    expect(group?.textContent).toContain('Now answered');
    expect(group?.textContent).toContain('Venue');
    expect(group!.querySelector('button')?.disabled).toBe(false);
});

it('exposes grouped acknowledgement from wizard fallback Submit and jumps back to another step', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const onSubmit = vi.fn();
    try {
        const el = actRender(
            <FormspecForm
                definition={workshop as any}
                engine={engine}
                componentDocument={component}
                onSubmit={onSubmit}
            />,
        );
        const next = el.querySelector<HTMLButtonElement>('.formspec-wizard-next');
        expect(next).not.toBeNull();
        act(() => { next!.click(); });

        const submit = el.querySelector<HTMLButtonElement>('.formspec-wizard-submit');
        expect(submit).not.toBeNull();
        act(() => { submit!.click(); });

        expect(onSubmit).toHaveBeenCalledOnce();
        expect(onSubmit.mock.calls[0]![0].validationReport.results.some((v: any) => v.code === 'EXPLANATION_REQUIRED')).toBe(true);

        const acceptBtn = [...el.querySelectorAll('button')].find(b => b.textContent?.startsWith('Accept '));
        expect(acceptBtn).toBeDefined();

        const venueLink = [...el.querySelectorAll<HTMLAnchorElement>('.formspec-warning-acknowledgement a')]
            .find(a => a.textContent === 'Venue');
        expect(venueLink).toBeDefined();
        act(() => { venueLink!.click(); });

        expect(el.querySelector('[data-name="venue"]')).not.toBeNull();
        expect(document.activeElement?.closest('[data-name="venue"]')).not.toBeNull();
    } finally {
        engine.dispose();
    }
});

it('can retry wizard fallback Submit after accepting the only outstanding warning without throwing uncaught', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const onSubmit = vi.fn();
    try {
        const el = actRender(
            <FormspecForm
                definition={workshop as any}
                engine={engine}
                componentDocument={component}
                onSubmit={onSubmit}
            />,
        );
        const next = el.querySelector<HTMLButtonElement>('.formspec-wizard-next');
        expect(next).not.toBeNull();
        act(() => { next!.click(); });

        const submit = el.querySelector<HTMLButtonElement>('.formspec-wizard-submit');
        expect(submit).not.toBeNull();
        act(() => { submit!.click(); });

        expect(onSubmit).toHaveBeenCalledOnce();
        expect(onSubmit.mock.calls[0]![0].validationReport.results.some((v: any) => v.code === 'EXPLANATION_REQUIRED')).toBe(true);

        const acceptBtn = [...el.querySelectorAll('button')].find(b => b.textContent?.startsWith('Accept '));
        expect(acceptBtn).toBeDefined();
        act(() => { acceptBtn!.click(); });
        expect(engine.getExplanationState().groups[0]!.current).toBe(true);

        const unhandled: string[] = [];
        const listener = (event: ErrorEvent) => {
            unhandled.push(event.message);
            event.preventDefault();
        };
        window.addEventListener('error', listener);
        try {
            act(() => { submit!.click(); });
            expect(unhandled).toEqual([]);
            expect(onSubmit).toHaveBeenCalledTimes(2);
            expect(onSubmit.mock.calls[1]![0].response.status).toBe('in-progress');
            expect(el.querySelector('[role="status"]')?.textContent).toMatch(/save/i);
            expect(() => engine.getResponseSnapshot({ profile: 'on-submit' })).toThrow(/server stamps/i);
        } finally {
            window.removeEventListener('error', listener);
        }
    } finally {
        engine.dispose();
    }
});

it('waits for responseActionInvoker autosave to stamp pending warning answers before emitting completed wizard Submit', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;
    const autosaveDoc = {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        scope: 'response',
        targetDefinition: { url: workshop.url },
        actions: [{
            id: 'autosave-draft',
            intent: 'autosave',
            label: { literal: 'Save draft' },
            validation: { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' },
            effects: [{ type: 'hostEvent', eventName: 'draft-saved' }],
        }],
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const onSubmit = vi.fn();
    const invoker = vi.fn(async () => {
        const stamped = engine.getExplanationEntries().map(entry => ({
            ...entry,
            author: { id: 'respondent-1' },
            recorded: '2026-11-19T00:00:00Z',
        }));
        engine.acceptSavedExplanations(stamped as any);
        return {
            actionId: 'autosave-draft',
            status: 'completed' as const,
            detail: engine.getResponseSnapshot({ profile: 'off' }, 'off'),
            effects: [],
            preconditions: [],
        };
    });
    try {
        const el = actRender(
            <FormspecForm
                definition={workshop as any}
                engine={engine}
                componentDocument={component}
                responseActionsDocument={autosaveDoc}
                responseActionInvoker={invoker}
                onSubmit={onSubmit}
            />,
        );
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
        const submit = el.querySelector<HTMLButtonElement>('.formspec-wizard-submit')!;
        act(() => { submit.click(); });
        const acceptBtn = [...el.querySelectorAll('button')].find(b => b.textContent?.startsWith('Accept '))!;
        act(() => { acceptBtn.click(); });

        await act(async () => {
            submit.click();
            await Promise.resolve();
        });
        expect(invoker).toHaveBeenCalledOnce();
        expect(onSubmit).toHaveBeenCalledTimes(2);
        expect(onSubmit.mock.calls[1]![0].response.status).toBe('completed');
        expect(onSubmit.mock.calls[1]![0].response.explanations).toHaveLength(1);
        expect(onSubmit.mock.calls[1]![0].response.explanations[0].author.id).toBe('respondent-1');
    } finally {
        engine.dispose();
    }
});

it('handles a synchronous responseActionInvoker throw on pending retry without uncaught errors', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine, invokeResponseAction } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                        { component: 'ActionButton', actionRef: 'file' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;
    const submitDoc = {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        scope: 'response',
        targetDefinition: { url: workshop.url },
        actions: [{
            id: 'file',
            intent: 'submit',
            label: { literal: 'File' },
            validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        }],
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const invoker = vi.fn((input: any) => invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId));
    const onSubmit = vi.fn();
    try {
        const el = actRender(
            <FormspecForm
                definition={workshop as any}
                engine={engine}
                componentDocument={component}
                responseActionsDocument={submitDoc}
                responseActionInvoker={invoker as any}
                onSubmit={onSubmit}
            />,
        );
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
        const submit = el.querySelector<HTMLButtonElement>('.formspec-wizard-submit')!;
        act(() => { submit.click(); });
        act(() => { el.querySelector<HTMLButtonElement>('fieldset[data-explanation-code] button')!.click(); });
        invoker.mockClear();

        const errors: string[] = [];
        const listener = (e: ErrorEvent) => { errors.push(e.message); e.preventDefault(); };
        window.addEventListener('error', listener);
        try {
            await act(async () => { submit.click(); await Promise.resolve(); });
            expect(invoker).toHaveBeenCalledOnce();
            expect(errors).toEqual([]);
            expect(el.querySelector('.formspec-wizard-pending-save')?.textContent).toMatch(/save/i);
        } finally {
            window.removeEventListener('error', listener);
        }
    } finally {
        engine.dispose();
    }
});

it('does not notify onSubmit of a completed filing after an authored submit effect fails', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine, invokeResponseAction } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'ActionButton', actionRef: 'file' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;
    const submitDoc = {
        $formspecResponseActions: '1.0',
        version: '1.0.0',
        scope: 'response',
        targetDefinition: { url: workshop.url },
        actions: [{
            id: 'file',
            intent: 'submit',
            label: { literal: 'File' },
            validation: { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        }],
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const invoker = vi.fn((input: any) => {
        engine.acceptSavedExplanations(engine.getExplanationEntries().map(entry => ({
            ...entry, author: { id: 'respondent' }, recorded: '2026-11-19T00:00:00Z',
        })) as any);
        return invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId);
    });
    const onSubmit = vi.fn();
    const onActionResult = vi.fn();
    try {
        const el = actRender(
            <FormspecForm
                definition={workshop as any}
                engine={engine}
                componentDocument={component}
                responseActionsDocument={submitDoc}
                responseActionInvoker={invoker as any}
                onSubmit={onSubmit}
                onActionResult={onActionResult}
                onHostEvent={() => { throw new Error('Filing service unavailable'); }}
            />,
        );
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
        const submit = el.querySelector<HTMLButtonElement>('.formspec-wizard-submit')!;
        act(() => { submit.click(); });
        act(() => { el.querySelector<HTMLButtonElement>('fieldset[data-explanation-code] button')!.click(); });

        const before = onSubmit.mock.calls.length;
        await act(async () => { submit.click(); await Promise.resolve(); });
        expect(onActionResult.mock.lastCall![0].status).toBe('failed');
        expect(onActionResult.mock.lastCall![0].detail.response.status).toBe('completed');
        expect(onSubmit.mock.calls.length).toBe(before);
    } finally {
        engine.dispose();
    }
});

it('emits a completed Response from standalone wizard Submit once every formerly blank field is answered', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                        { component: 'TextInput', bind: 'outcome' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const onSubmit = vi.fn();
    try {
        const el = actRender(
            <FormspecForm definition={workshop as any} engine={engine} componentDocument={component} onSubmit={onSubmit} />,
        );
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
        const submit = el.querySelector<HTMLButtonElement>('.formspec-wizard-submit')!;
        act(() => { submit.click(); });
        act(() => { el.querySelector<HTMLButtonElement>('fieldset[data-explanation-code] button')!.click(); });

        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-prev')!.click(); });
        for (const path of ['venue', 'topic', 'outcome']) {
            const input = el.querySelector<HTMLInputElement>(`[data-name="${path}"] input`)!;
            act(() => {
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Documented');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        }
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
        expect(engine.getExplanationState().groups).toEqual([]);
        expect(engine.getExplanationEntries()).toHaveLength(1);
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-submit')!.click(); });
        expect(onSubmit.mock.lastCall![0].response.status).toBe('completed');
        expect(onSubmit.mock.lastCall![0].response.explanations ?? []).toEqual([]);
    } finally {
        engine.dispose();
    }
});

it('keeps the linked second field focused after wizard mounts under StrictMode', async () => {
    const { StrictMode } = await import('react');
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    try {
        actRender(
            <StrictMode>
                <FormspecForm
                    definition={workshop as any}
                    engine={engine}
                    componentDocument={component}
                    activeSection="details"
                    focusField="topic"
                />
            </StrictMode>,
        );
        expect(document.activeElement?.closest('[data-name]')?.getAttribute('data-name')).toBe('topic');
    } finally {
        engine.dispose();
    }
});

it('notifies the route on manual wizard step transitions so stale field query params clear', async () => {
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const component = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: workshop.url },
        tree: {
            component: 'Wizard',
            children: [
                {
                    component: 'Section',
                    id: 'details',
                    title: 'Details',
                    children: [
                        { component: 'TextInput', bind: 'venue' },
                        { component: 'TextInput', bind: 'topic' },
                    ],
                },
                {
                    component: 'Section',
                    id: 'review',
                    title: 'Review',
                    children: [{ component: 'NumberInput', bind: 'attendance' }],
                },
            ],
        },
    } as any;

    const engine = createFormEngine(workshop as any, { savedResponseData: { attendance: 0, partner: 'Library' } });
    const onActiveSectionChange = vi.fn();
    try {
        const el = actRender(
            <FormspecForm
                definition={workshop as any}
                engine={engine}
                componentDocument={component}
                activeSection="details"
                focusField="topic"
                onActiveSectionChange={onActiveSectionChange}
            />,
        );
        expect(document.activeElement?.closest('[data-name]')?.getAttribute('data-name')).toBe('topic');
        act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
        expect(el.querySelector('[data-name="attendance"]')).toBeTruthy();
        expect(onActiveSectionChange).toHaveBeenCalledWith('review');
    } finally {
        engine.dispose();
    }
});

it('React button refuses acknowledging a deadline firing absent from its displayed list, refreshes to 3, and accepts on second click', async () => {
    const { initFormspecEngine, createFormEngine } = await import('@formspec-org/engine');
    await initFormspecEngine();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const definition = {
        $formspec: '1.0',
        url: 'urn:example:react-deadline',
        version: '1.0.0',
        status: 'active',
        title: 'Deadline test',
        items: ['first', 'second', 'deadline'].map(key => ({ key, type: 'field', dataType: 'string', label: key })),
        shapes: ['first', 'second', 'deadline'].map(key => ({
            id: `${key}Blank`,
            target: key,
            severity: 'warning',
            timing: 'submit',
            code: 'BLANK',
            explanation: 'acknowledge',
            constraint: key === 'deadline' ? 'day(today()) < 19 or present($)' : 'present($)',
            message: 'Blank',
        })),
    } as any;
    const engine = createFormEngine(definition);
    try {
        const ctx = { engine, latestSubmit: signal({}), touchedVersion: signal(1), isTouched: () => true } as unknown as FormspecContextValue;
        const el = actRender(
            <FormspecContext.Provider value={ctx}>
                <WarningExplanations />
            </FormspecContext.Provider>,
        );
        const button = el.querySelector<HTMLButtonElement>('fieldset[data-explanation-code="BLANK"] button')!;
        expect(button.textContent).toBe('Accept 2 unanswered questions');
        expect([...el.querySelectorAll('fieldset[data-explanation-code="BLANK"] li')].map(li => li.textContent))
            .toEqual(['first', 'second']);

        vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
        act(() => { button.click(); });
        expect(engine.getExplanationEntries()).toEqual([]);
        expect(button.textContent).toBe('Accept 3 unanswered questions');
        expect([...el.querySelectorAll('fieldset[data-explanation-code="BLANK"] li')].map(li => li.textContent))
            .toEqual(['deadline', 'first', 'second']);

        act(() => { button.click(); });
        expect(engine.getExplanationEntries()).toHaveLength(1);
        expect(button.textContent).toBe('Accepted 3 unanswered questions');
        expect(button.disabled).toBe(true);
    } finally {
        engine.dispose();
        vi.useRealTimers();
    }
});

it('handles wired wizard lifecycle: throw/reject reporting, failed autosave, retry after failed filing, dedup, unmount, edit guard, clock changes, and controlled navigation', async () => {
    const { StrictMode } = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine, invokeResponseAction } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const stamp = (e: ReturnType<typeof createFormEngine>) => e.acceptSavedExplanations(
        e.getExplanationEntries().map(entry => ({
            ...entry, author: { id: 'reviewer' }, recorded: '2026-11-19T00:00:00Z',
        })) as any,
    );
    const settle = () => act(async () => { await Promise.resolve(); });

    function setupWizard(intent: 'submit' | 'autosave' | undefined, opts: any = {}) {
        const definition = opts.definition ?? workshop;
        const engine = createFormEngine(definition, { savedResponseData: { attendance: 0, partner: 'Library' } });
        const action = {
            id: 'act',
            intent,
            label: { literal: 'Do action' },
            validation: intent === 'autosave'
                ? { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' }
                : { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
        };
        const doc = { $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition.url }, actions: [action] };
        const component = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Wizard',
                allowSkip: true,
                sidenav: true,
                children: [
                    {
                        component: 'Section',
                        id: 'details',
                        title: 'Details',
                        children: [
                            { component: 'TextInput', bind: 'venue' },
                            { component: 'TextInput', bind: 'topic' },
                            { component: 'TextInput', bind: 'outcome' },
                            ...(intent ? [{ component: 'ActionButton', actionRef: 'act' }] : []),
                        ],
                    },
                    {
                        component: 'Section',
                        id: 'review',
                        title: 'Review',
                        children: [{ component: 'NumberInput', bind: 'attendance' }],
                    },
                ],
            },
        };
        const onActionResult = vi.fn();
        const onSubmit = vi.fn();
        const route = vi.fn();
        let revealingWarnings = false;
        const invoker = vi.fn((input: any) =>
            revealingWarnings
                ? invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext)
                : opts.invoke(input, engine),
        );
        const el = document.createElement('div');
        document.body.append(el);
        const root = createRoot(el);
        const render = (nav: any = {}) => {
            const form = (
                <FormspecForm
                    definition={definition}
                    engine={engine}
                    componentDocument={component}
                    onActionResult={onActionResult}
                    onSubmit={onSubmit}
                    onActiveSectionChange={route}
                    {...nav}
                    {...(intent && { responseActionsDocument: doc as any, responseActionInvoker: invoker as any })}
                    onHostEvent={opts.onHostEvent}
                />
            );
            act(() => root.render(opts.strict ? <StrictMode>{form}</StrictMode> : form));
        };
        render(opts.nav);
        const click = (sel: string) => {
            const target = el.querySelector<HTMLButtonElement>(sel);
            expect(target, sel).toBeTruthy();
            act(() => target!.click());
        };
        const accept = () => {
            click('.formspec-wizard-next');
            revealingWarnings = true;
            try {
                click('.formspec-wizard-submit');
            } finally {
                revealingWarnings = false;
            }
            click('fieldset[data-explanation-code] button');
            invoker.mockClear();
            onSubmit.mockClear();
            onActionResult.mockClear();
        };
        const cleanup = () => {
            act(() => root.unmount());
            el.remove();
            engine.dispose();
        };
        return { engine, el, root, click, accept, invoker, onSubmit, onActionResult, render, route, cleanup };
    }

    // 1. Both submit and autosave report sync throws and async rejections via onActionResult and withhold onSubmit
    for (const intent of ['submit', 'autosave'] as const) {
        for (const mode of ['throw', 'reject'] as const) {
            const t = setupWizard(intent, {
                invoke: () => {
                    if (mode === 'throw') throw new Error('Saved draft service unavailable');
                    return Promise.reject(new Error('Saved draft service unavailable'));
                },
            });
            try {
                t.accept();
                t.click('.formspec-wizard-submit');
                await settle();
                expect(t.invoker).toHaveBeenCalledOnce();
                expect(t.el.querySelector('.formspec-wizard-pending-save')?.textContent).toMatch(/save/i);
                expect(t.onActionResult.mock.calls.map(([r]) => r.status)).toEqual(['failed']);
                expect(t.onSubmit).not.toHaveBeenCalled();
            } finally { t.cleanup(); }
        }
    }

    // 2. Failed autosave host effect after draft stamping reports failed and withholds onSubmit
    {
        const t = setupWizard('autosave', {
            onHostEvent: () => { throw new Error('Durable service failed'); },
            invoke: (input: any, e: any) => {
                stamp(e);
                return invokeResponseAction(input.document, input.actionRef, input.ports);
            },
        });
        try {
            t.accept();
            t.click('.formspec-wizard-submit');
            await settle();
            expect(t.onActionResult.mock.calls.map(([r]) => r.status)).toEqual(['failed']);
            expect(t.onSubmit).not.toHaveBeenCalled();
        } finally { t.cleanup(); }
    }

    // 3. Delayed callbacks suppressed after unmount & rapid double-clicks deduplicated for both submit and autosave
    for (const intent of ['submit', 'autosave'] as const) {
        let finish!: () => void;
        const unmountCase = setupWizard(intent, {
            invoke: (input: any, e: any) => new Promise(resolve => {
                finish = () => {
                    stamp(e);
                    resolve(invokeResponseAction(input.document, input.actionRef, input.ports));
                };
            }),
        });
        try {
            unmountCase.accept();
            unmountCase.click('.formspec-wizard-submit');
            act(() => unmountCase.root.unmount());
            await act(async () => { finish(); });
            expect(unmountCase.onSubmit).not.toHaveBeenCalled();
        } finally { unmountCase.el.remove(); unmountCase.engine.dispose(); }

        const finishList: (() => void)[] = [];
        const dedupCase = setupWizard(intent, {
            invoke: (input: any, e: any) => new Promise(resolve => {
                finishList.push(() => {
                    stamp(e);
                    resolve(invokeResponseAction(input.document, input.actionRef, input.ports));
                });
            }),
        });
        try {
            dedupCase.accept();
            dedupCase.click('.formspec-wizard-submit');
            dedupCase.click('.formspec-wizard-submit');
            await act(async () => { finishList.reverse().forEach(f => f()); });
            expect(dedupCase.invoker).toHaveBeenCalledOnce();
            expect(dedupCase.onSubmit.mock.calls.map(([x]) => x.response.status)).toEqual(['completed']);
        } finally { dedupCase.cleanup(); }
    }

    // 4. Wired submit runs even after earlier stamps exist AND retries after failed filing
    {
        const stampedCase = setupWizard('submit', {
            invoke: (input: any) => invokeResponseAction(input.document, input.actionRef, input.ports),
        });
        try {
            stampedCase.accept();
            act(() => stamp(stampedCase.engine));
            stampedCase.click('.formspec-wizard-submit');
            await settle();
            expect(stampedCase.invoker).toHaveBeenCalledOnce();
            expect(stampedCase.onSubmit.mock.calls.map(([x]) => x.response.status)).toEqual(['completed']);
        } finally { stampedCase.cleanup(); }

        const retryCase = setupWizard('submit', {
            onHostEvent: () => { throw new Error('Filing service unavailable'); },
            invoke: (input: any, e: any) => {
                stamp(e);
                return invokeResponseAction(input.document, input.actionRef, input.ports);
            },
        });
        try {
            retryCase.accept();
            retryCase.click('.formspec-wizard-submit');
            await settle();
            retryCase.click('.formspec-wizard-submit');
            await settle();
            expect(retryCase.invoker).toHaveBeenCalledTimes(2);
            expect(retryCase.onActionResult.mock.calls.map(([r]) => r.status)).toEqual(['failed', 'failed']);
            expect(retryCase.onSubmit).not.toHaveBeenCalled();
        } finally { retryCase.cleanup(); }
    }

    // 5. Delayed submit detail suppressed when respondent edits an answer before settlement
    {
        let finish!: () => void;
        const editCase = setupWizard('submit', {
            invoke: (input: any, e: any) => {
                stamp(e);
                const completed = invokeResponseAction(input.document, input.actionRef, input.ports);
                expect(completed.status).toBe('completed');
                return new Promise(resolve => { finish = () => resolve(completed); });
            },
        });
        try {
            editCase.accept();
            editCase.click('.formspec-wizard-submit');
            act(() => editCase.engine.setValue('partner', 'Updated facility'));
            await act(async () => { finish(); });
            expect(editCase.onSubmit).not.toHaveBeenCalled();
        } finally { editCase.cleanup(); }
    }

    // 6. Standalone wizard wall-clock expiry emits completed AND wall-clock revival avoids throwing uncaught
    {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
        const expiryDef = { ...workshop, shapes: [{ ...workshop.shapes[0], constraint: 'day(today()) >= 19 or present($)' }] };
        const expiryCase = setupWizard(undefined, { definition: expiryDef });
        try {
            expiryCase.accept();
            vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
            expiryCase.click('.formspec-wizard-submit');
            expect(expiryCase.onSubmit.mock.lastCall?.[0].response.status).toBe('completed');
            expect(expiryCase.onSubmit.mock.lastCall?.[0].response.explanations ?? []).toEqual([]);
        } finally { expiryCase.cleanup(); vi.useRealTimers(); }

        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
        const revivalDef = { ...workshop, shapes: [{ ...workshop.shapes[0], constraint: 'day(today()) = 19 or present($)' }] };
        const revivalCase = setupWizard(undefined, { definition: revivalDef });
        const errors: string[] = [];
        const onError = (event: ErrorEvent) => { errors.push(event.message); event.preventDefault(); };
        window.addEventListener('error', onError);
        try {
            revivalCase.accept();
            vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
            act(() => revivalCase.engine.setValue('attendance', 1));
            expect(revivalCase.engine.getExplanationState().pendingStamps).toBe(false);
            vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
            revivalCase.click('.formspec-wizard-submit');
            expect(errors).toEqual([]);
            expect(revivalCase.el.querySelector('.formspec-wizard-pending-save')?.textContent).toMatch(/save/i);
        } finally {
            window.removeEventListener('error', onError);
            revivalCase.cleanup();
            vi.useRealTimers();
        }
    }

    // 7. Host-controlled cross-step focusField suppresses onActiveSectionChange, while manual controls notify
    {
        const backCase = setupWizard(undefined, { strict: true, nav: { activeSection: 'review' } });
        try {
            backCase.route.mockClear();
            backCase.render({ activeSection: 'details', focusField: 'topic' });
            expect(document.activeElement?.closest('[data-name]')?.getAttribute('data-name')).toBe('topic');
            expect(backCase.route).not.toHaveBeenCalled();
        } finally { backCase.cleanup(); }

        const manualCase = setupWizard(undefined, { nav: { activeSection: 'details', focusField: 'topic' } });
        try {
            manualCase.route.mockClear();
            manualCase.click('.formspec-wizard-skip');
            manualCase.click('.formspec-wizard-prev');
            manualCase.click('li:nth-child(2) .formspec-wizard-sidenav-btn');
            manualCase.click('.formspec-wizard-submit');
            manualCase.click('fieldset[data-explanation-code] a');
            expect(manualCase.route.mock.calls).toEqual([['review'], ['details'], ['review'], ['details']]);
        } finally { manualCase.cleanup(); }
    }
});

it('guards delayed host effects, avoids filing bypass on clock expiry, preserves host precondition adapters, reopens stale groups on deadline, and navigates uncontrolled Workspace focusField', async () => {
    const { createRoot } = await import('react-dom/client');
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine, invokeResponseAction } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const stamp = (e: ReturnType<typeof createFormEngine>) => e.acceptSavedExplanations(
        e.getExplanationEntries().map(entry => ({
            ...entry, author: { id: 'reviewer' }, recorded: '2026-11-19T00:00:00Z',
        })) as any,
    );
    const settle = () => act(async () => { await Promise.resolve(); });

    function setupWizard(intent: 'submit' | 'autosave' | undefined, opts: any = {}) {
        const definition = opts.definition ?? workshop;
        const engine = createFormEngine(definition, { savedResponseData: { attendance: 0, partner: 'Library' } });
        const action = {
            id: 'act',
            intent,
            label: { literal: 'Do action' },
            validation: intent === 'autosave'
                ? { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' }
                : { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
            ...opts.action,
        };
        const doc = { $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition.url }, actions: [action] };
        const component = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Wizard',
                allowSkip: true,
                sidenav: true,
                children: [
                    {
                        component: 'Section',
                        id: 'details',
                        title: 'Details',
                        children: [
                            { component: 'TextInput', bind: 'venue' },
                            { component: 'TextInput', bind: 'topic' },
                            { component: 'TextInput', bind: 'outcome' },
                            ...(intent ? [{ component: 'ActionButton', actionRef: 'act' }] : []),
                        ],
                    },
                    {
                        component: 'Section',
                        id: 'review',
                        title: 'Review',
                        children: [{ component: 'NumberInput', bind: 'attendance' }],
                    },
                ],
            },
        };
        const onActionResult = vi.fn();
        const onSubmit = vi.fn();
        let revealingWarnings = false;
        const invoker = vi.fn((input: any) =>
            revealingWarnings
                ? invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext)
                : opts.invoke(input, engine),
        );
        const el = document.createElement('div');
        document.body.append(el);
        const root = createRoot(el);
        act(() => root.render(
            <FormspecForm
                definition={definition}
                engine={engine}
                componentDocument={component}
                onActionResult={onActionResult}
                onSubmit={onSubmit}
                {...opts.extraProps}
                {...(intent && { responseActionsDocument: doc as any, responseActionInvoker: invoker as any })}
                onHostEvent={opts.onHostEvent}
            />,
        ));
        const click = (sel: string) => {
            const target = el.querySelector<HTMLButtonElement>(sel);
            expect(target, sel).toBeTruthy();
            act(() => target!.click());
        };
        const accept = () => {
            click('.formspec-wizard-next');
            revealingWarnings = true;
            try {
                click('.formspec-wizard-submit');
            } finally {
                revealingWarnings = false;
            }
            click('fieldset[data-explanation-code] button');
            invoker.mockClear();
            onSubmit.mockClear();
            onActionResult.mockClear();
        };
        const cleanup = () => {
            act(() => root.unmount());
            el.remove();
            engine.dispose();
        };
        return { engine, el, root, click, accept, invoker, onSubmit, onActionResult, cleanup };
    }

    // Blocker 4: delayed submit/autosave invokers never dispatch host effects after unmount or answer edit
    for (const intent of ['submit', 'autosave'] as const) {
        for (const duringSave of ['unmount', 'change answer'] as const) {
            let finish!: () => void;
            const calls: Array<{ event: string; partner: string | undefined }> = [];
            const t = setupWizard(intent, {
                onHostEvent: (event: string, detail: any) => calls.push({ event, partner: detail?.response?.data?.partner }),
                invoke: (input: any, engine: any) => new Promise(resolve => {
                    finish = () => {
                        stamp(engine);
                        resolve(invokeResponseAction(input.document, input.actionRef, input.ports));
                    };
                }),
            });
            try {
                t.accept();
                t.click('.formspec-wizard-submit');
                if (duringSave === 'unmount') act(() => t.root.unmount());
                else act(() => t.engine.setValue('partner', 'Post-click edit'));
                await act(async () => finish());
                expect(t.onSubmit).not.toHaveBeenCalled();
                expect(t.onActionResult).not.toHaveBeenCalled();
                expect(calls).toEqual([]);
            } finally {
                if (duringSave !== 'unmount') act(() => t.root.unmount());
                t.el.remove();
                t.engine.dispose();
            }
        }
    }

    // Blocker 5: authored ActionButton and fallback Wizard Submit share host precondition evaluator
    {
        const evaluateActionPrecondition = vi.fn(() => true);
        const t = setupWizard('submit', {
            definition: { ...workshop, shapes: [] },
            action: { preconditions: [{ id: 'ready', expression: 'true', severity: 'block' }] },
            extraProps: { evaluateActionPrecondition },
            invoke: (input: any) => invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId),
        });
        try {
            const authored = [...t.el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Do action'));
            expect(authored).toBeTruthy();
            act(() => authored!.click());
            await settle();
            expect(t.onActionResult.mock.calls.map(([r]) => r.status)).toEqual(['completed']);
            t.click('.formspec-wizard-next');
            t.click('.formspec-wizard-submit');
            await settle();
            expect(t.onActionResult.mock.calls.map(([r]) => [r.status, r.failureReason ?? null])).toEqual([
                ['completed', null],
                ['completed', null],
            ]);
            expect(evaluateActionPrecondition).toHaveBeenCalledTimes(2);
        } finally { t.cleanup(); }
    }

    // Blocker 3: wired submit evaluates once per click across midnight, blocks without filing effects when invalid, and files on the next eligible click
    {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-18T23:59:59.990Z'));
        const def = { ...workshop, shapes: [{ ...workshop.shapes[0], constraint: 'day(today()) >= 19 or present($)' }] };
        const hostEvents: Array<[string, string]> = [];
        const t = setupWizard('submit', {
            definition: def,
            onHostEvent: (name: string, detail: any) => { hostEvents.push([name, detail.response.status]); },
            invoke: (input: any) => invokeResponseAction(input.document, input.actionRef, input.ports),
        });
        try {
            t.click('.formspec-wizard-next');
            const origSnap = t.engine.getResponseSnapshot.bind(t.engine);
            const trace: Array<[string | undefined, number, string]> = [];
            vi.spyOn(t.engine, 'getResponseSnapshot').mockImplementation((...args) => {
                const snap = origSnap(...args);
                trace.push([args[0]?.profile, hostEvents.length, snap.response.status]);
                vi.setSystemTime(new Date('2026-11-19T00:00:00.001Z'));
                return snap;
            });
            t.click('.formspec-wizard-submit');
            await settle();
            t.click('.formspec-wizard-submit');
            await settle();
            expect(trace).toEqual([
                ['on-submit', 0, 'in-progress'],
                ['on-submit', 0, 'completed'],
            ]);
            expect(t.onActionResult.mock.calls.map(([r]) => r.status)).toEqual(['blocked', 'completed']);
            expect(hostEvents).toEqual([['formspec-submit', 'completed']]);
            expect(t.onSubmit.mock.calls.map(([result]) => result.response.status)).toEqual(['completed']);
            expect(t.invoker).toHaveBeenCalledTimes(2);
        } finally { t.cleanup(); vi.useRealTimers(); }
    }

    // Blocker 6: standalone Submit refreshes accepted group panel when deadline expands group (both stamped & unstamped)
    for (const stamped of [false, true]) {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
        const def = {
            ...workshop,
            shapes: workshop.shapes.slice(0, 3).map((shape, i) =>
                i === 2 ? { ...shape, constraint: 'day(today()) < 19 or present($)' } : shape,
            ),
        };
        const t = setupWizard(undefined, { definition: def });
        try {
            t.accept();
            if (stamped) act(() => stamp(t.engine));
            const button = () => t.el.querySelector<HTMLButtonElement>('fieldset[data-explanation-code] button')!;
            expect(button().textContent).toMatch(/accepted 2/i);
            expect(button().disabled).toBe(true);
            vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
            t.click('.formspec-wizard-submit');
            const submitted = t.onSubmit.mock.lastCall![0];
            expect(submitted.response.status).toBe('in-progress');
            expect(submitted.validationReport?.results.map((r: any) => r.code)).toContain('EXPLANATION_STALE');
            const state = t.engine.getExplanationState().groups[0]!;
            expect({ paths: state.paths.length, label: button().textContent, disabled: button().disabled }).toEqual({
                paths: 3,
                label: 'Accept 3 unanswered questions',
                disabled: false,
            });
        } finally { t.cleanup(); vi.useRealTimers(); }
    }

    // Warning 7: uncontrolled Workspace applies host focusField to another section while keeping onActiveSectionChange quiet
    {
        const workspaceDef = {
            $formspec: '1.0',
            url: 'urn:review:workspace-local',
            version: '1.0.0',
            title: 'Workspace',
            formPresentation: { pageMode: 'workspace' },
            items: [
                { key: 'first', type: 'group', label: 'First section', children: [{ key: 'a', type: 'field', dataType: 'string', label: 'First answer' }] },
                { key: 'second', type: 'group', label: 'Second section', children: [{ key: 'b', type: 'field', dataType: 'string', label: 'Second answer' }] },
            ],
        } as any;
        const route = vi.fn();
        const el = document.createElement('div');
        document.body.append(el);
        const root = createRoot(el);
        try {
            act(() => root.render(<FormspecForm definition={workspaceDef} onActiveSectionChange={route} />));
            expect(el.querySelector('.formspec-workspace__content')?.getAttribute('data-formspec-section')).toBe('first');
            act(() => root.render(<FormspecForm definition={workspaceDef} onActiveSectionChange={route} focusField="second.b" />));
            expect({
                section: el.querySelector('.formspec-workspace__content')?.getAttribute('data-formspec-section'),
                focus: document.activeElement?.closest('[data-name]')?.getAttribute('data-name') ?? null,
                callbacks: route.mock.calls,
            }).toEqual({ section: 'second', focus: 'second.b', callbacks: [] });
        } finally {
            act(() => root.unmount());
            el.remove();
        }
    }
});

it('enforces monotonic attempt/edit/response tokens, rechecks after onActionResult, catches preflight errors, and registers semantic Wizard Submit parity', async () => {
    const { createRoot } = await import('react-dom/client');
    const { initFormspecEngine, initFormspecEngineTools, createFormEngine, invokeResponseAction } = await import('@formspec-org/engine');
    const { FormspecForm } = await import('../src/renderer');
    const { createSemanticControlRegistry } = await import('../src/semantic-controls');
    const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    const { default: evidence } = await import('../../../tests/fixtures/assemble-candidate.json');
    await initFormspecEngine();
    await initFormspecEngineTools();

    const stamp = (e: ReturnType<typeof createFormEngine>) => e.acceptSavedExplanations(
        e.getExplanationEntries().map(entry => ({
            ...entry, author: { id: 'reviewer' }, recorded: '2026-11-19T00:00:00Z',
        })) as any,
    );
    const settle = () => act(async () => { await Promise.resolve(); });
    const semanticScope = (responseId: string) => ({
        registry: createSemanticControlRegistry(),
        renderInstanceId: 'render-1',
        responseId,
        definitionArtifact: { artifactRef: workshop.url, artifactDigest: `sha256:${'a'.repeat(64)}` },
        responseActionsArtifact: { artifactRef: 'urn:review:actions', artifactDigest: `sha256:${'b'.repeat(64)}` },
    });

    function setupWizard(intent: 'submit' | 'autosave', opts: any = {}) {
        const definition = opts.definition ?? workshop;
        const engine = createFormEngine(definition, { savedResponseData: { attendance: 0, partner: 'Library' } });
        const action = {
            id: 'act',
            intent,
            label: { literal: 'Do action' },
            validation: intent === 'autosave'
                ? { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' }
                : { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' },
            effects: [{ type: 'hostEvent', eventName: 'formspec-submit' }],
            ...opts.action,
        };
        const doc = { $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response', targetDefinition: { url: definition.url }, actions: [action] };
        const component = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Wizard',
                allowSkip: true,
                sidenav: true,
                children: [
                    {
                        component: 'Section',
                        id: 'details',
                        title: 'Details',
                        children: [
                            { component: 'TextInput', bind: 'venue' },
                            { component: 'TextInput', bind: 'topic' },
                            { component: 'TextInput', bind: 'outcome' },
                            { component: 'ActionButton', actionRef: 'act' },
                        ],
                    },
                    {
                        component: 'Section',
                        id: 'review',
                        title: 'Review',
                        children: [{ component: 'NumberInput', bind: 'attendance' }],
                    },
                ],
            },
        };
        const onActionResult = opts.onActionResult ?? vi.fn();
        const onSubmit = vi.fn();
        let revealingWarnings = false;
        const invoker = vi.fn((input: any) =>
            revealingWarnings
                ? invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext)
                : opts.invoke(input, engine),
        );
        const el = document.createElement('div');
        document.body.append(el);
        const root = createRoot(el);
        const render = (extra: any = {}) => {
            act(() => root.render(
                <FormspecForm
                    definition={definition}
                    engine={engine}
                    componentDocument={component}
                    onActionResult={(result) => {
                        if (!revealingWarnings) onActionResult(result);
                    }}
                    onSubmit={onSubmit}
                    responseActionsDocument={doc as any}
                    responseActionInvoker={invoker as any}
                    onHostEvent={opts.onHostEvent}
                    {...opts.extraProps}
                    {...extra}
                />,
            ));
        };
        render();
        const click = (sel: string) => {
            const target = el.querySelector<HTMLButtonElement>(sel);
            expect(target, sel).toBeTruthy();
            act(() => target!.click());
        };
        const accept = () => {
            click('.formspec-wizard-next');
            revealingWarnings = true;
            try {
                click('.formspec-wizard-submit');
            } finally {
                revealingWarnings = false;
            }
            click('fieldset[data-explanation-code] button');
            invoker.mockClear();
            onSubmit.mockClear();
            onActionResult.mockClear();
        };
        const cleanup = () => {
            act(() => root.unmount());
            el.remove();
            engine.dispose();
        };
        return { engine, el, root, render, click, accept, invoker, onSubmit, onActionResult, cleanup };
    }

    // Blocker 3a: A -> B -> A with clicks at each value dispatches only the latest submission
    for (const intent of ['submit', 'autosave'] as const) {
        const finish: Array<() => unknown> = [];
        const host = vi.fn();
        const t = setupWizard(intent, {
            onHostEvent: host,
            invoke: (input: any, engine: any) => new Promise(resolve => {
                finish.push(() => {
                    stamp(engine);
                    resolve(invokeResponseAction(input.document, input.actionRef, input.ports));
                });
            }),
        });
        try {
            t.accept();
            t.click('.formspec-wizard-submit');
            act(() => t.engine.setValue('partner', 'Club'));
            t.click('.formspec-wizard-submit');
            act(() => t.engine.setValue('partner', 'Library'));
            t.click('.formspec-wizard-submit');
            expect(finish.length).toBe(3);
            for (const i of [2, 1, 0]) await act(async () => { finish[i]!(); });
            expect({
                hostEvents: host.mock.calls.map(([, s]) => s.response.data.partner),
                completed: t.onSubmit.mock.calls.map(([s]) => s.response.status),
                results: t.onActionResult.mock.calls.map(([r]) => r.status),
            }).toEqual({ hostEvents: ['Library'], completed: ['completed'], results: ['completed'] });
        } finally { t.cleanup(); }
    }

    // Blocker 3b: Switching semantic response identity while action is pending suppresses late host event, result, and submit
    for (const intent of ['submit', 'autosave'] as const) {
        const host = vi.fn();
        let finish!: () => void;
        const t = setupWizard(intent, {
            extraProps: { semanticControlScope: semanticScope('response-old') },
            onHostEvent: host,
            invoke: (input: any, engine: any) => new Promise(resolve => {
                finish = () => {
                    stamp(engine);
                    resolve(invokeResponseAction(input.document, input.actionRef, input.ports));
                };
            }),
        });
        try {
            t.accept();
            t.click('.formspec-wizard-submit');
            t.render({ semanticControlScope: semanticScope('response-new') });
            await act(async () => finish());
            expect({
                effects: host.mock.calls.map(([, d]) => d.response.id),
                results: t.onActionResult.mock.calls.map(([r]) => r.detail?.response?.id),
                submitted: t.onSubmit.mock.calls.map(([r]) => r.response.id),
            }).toEqual({ effects: [], results: [], submitted: [] });
        } finally { t.cleanup(); }
    }

    // Blocker 3c: Synchronous unmount or edit inside onActionResult suppresses onSubmit (and autosave post-edit completion)
    for (const intent of ['submit', 'autosave'] as const) {
        for (const changed of ['unmount', 'edit'] as const) {
            let t!: ReturnType<typeof setupWizard>;
            const onActionResult = vi.fn(() => {
                if (changed === 'unmount') t.root.unmount();
                else t.engine.setValue('partner', 'A different answer');
            });
            t = setupWizard(intent, {
                onActionResult,
                invoke: (input: any, engine: any) => {
                    stamp(engine);
                    return invokeResponseAction(input.document, input.actionRef, input.ports);
                },
            });
            try {
                t.accept();
                t.click('.formspec-wizard-submit');
                await settle();
                expect(onActionResult).toHaveBeenCalledTimes(1);
                expect(t.onSubmit).not.toHaveBeenCalled();
            } finally {
                if (changed !== 'unmount') act(() => t.root.unmount());
                t.el.remove();
                t.engine.dispose();
            }
        }
    }

    // Blocker 4: Missing response-instance delivery throwing from preflight reports failed via onActionResult without uncaught error
    {
        const uncaught: string[] = [];
        const onErr = (ev: ErrorEvent) => { uncaught.push(ev.message); ev.preventDefault(); };
        window.addEventListener('error', onErr);
        const t = setupWizard('submit', {
            definition: { ...workshop, shapes: [], instances: (evidence as any).definition.instances },
            invoke: (input: any) => invokeResponseAction(input.document, input.actionRef, input.ports),
        });
        try {
            t.click('.formspec-wizard-next');
            expect(t.engine.getValidationReport({ profile: 'on-submit' }).valid).toBe(true);
            try {
                t.click('.formspec-wizard-submit');
                await settle();
            } catch (e) {
                uncaught.push(String(e));
            }
            expect(uncaught).toEqual([]);
            expect(t.onActionResult.mock.calls.map(([r]) => r.status)).toEqual(['failed']);
            expect(t.el.querySelector('[role="status"]')?.textContent).toMatch(/Response instance.*unavailable/i);
            expect(t.onSubmit).not.toHaveBeenCalled();
        } finally {
            window.removeEventListener('error', onErr);
            t.cleanup();
        }
    }

    // Blocker 5 + review7: Wizard fallback Submit matches placed ActionButton across default/custom executors and valid/invalid states
    for (const useDefault of [false, true]) {
        for (const valid of [true, false]) {
            const scope = semanticScope('response-17');
            const host = vi.fn();
            const t = setupWizard('submit', {
                definition: valid ? { ...workshop, shapes: [] } : workshop,
                extraProps: {
                    semanticControlScope: scope,
                    ...(useDefault ? { responseActionInvoker: undefined } : {}),
                },
                onHostEvent: host,
                invoke: (input: any) => invokeResponseAction(input.document, input.actionRef, input.ports, input.nodeId, input.invocationContext),
            });
            try {
                const target = {
                    renderInstanceId: scope.renderInstanceId,
                    control: { ...scope.responseActionsArtifact, subjectRef: 'act', subjectKind: 'response-action' as const },
                };
                const activate = (id: string, field: string, value: unknown) => {
                    const set = scope.registry.setItem(
                        { renderInstanceId: scope.renderInstanceId, control: { ...scope.definitionArtifact, subjectRef: field, subjectKind: 'definition-item' } },
                        value,
                    );
                    expect(set.status).toBe('set');
                    if (set.status !== 'set') throw Error(set.reason);
                    return scope.registry.activateControl(target, { invocationId: id, responseBinding: set.responseBinding });
                };
                const simple = (r: any) => [r.status, r.reason ?? null, r.invocation?.status ?? null, r.invocation?.blockedCause ?? null];
                let placed: any;
                let wizard: any;
                await act(async () => { placed = await activate('placed', 'venue', 'north hall'); });
                t.click('.formspec-wizard-next');
                expect(t.el.querySelector('.formspec-wizard-submit')).toBeTruthy();
                await act(async () => { wizard = await activate('fallback', 'attendance', 22); });
                expect(simple(placed)).toEqual(['activated', null, valid ? 'completed' : 'blocked', valid ? null : 'validation']);
                expect(simple(wizard)).toEqual(simple(placed));
            } finally { t.cleanup(); }
        }
    }

    // Physical final Wizard Submit uses the declared filing effect when host omits responseActionInvoker (default executor)
    {
        const host = vi.fn();
        const scope = semanticScope('response-17');
        const t = setupWizard('submit', {
            definition: { ...workshop, shapes: [] },
            extraProps: { semanticControlScope: scope, responseActionInvoker: undefined },
            onHostEvent: host,
            invoke: () => { throw new Error('unused'); },
        });
        try {
            const authored = [...t.el.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === 'Do action')!;
            act(() => authored.click());
            await settle();
            const capture = () => ({
                effects: host.mock.calls.map(([n, s]) => [n, s.response.status, s.response.id]),
                results: t.onActionResult.mock.calls.map(([r]) => r.status),
            });
            const placed = capture();
            host.mockClear();
            t.onActionResult.mockClear();
            t.onSubmit.mockClear();
            t.click('.formspec-wizard-next');
            t.click('.formspec-wizard-submit');
            await settle();
            const wizard = capture();
            expect(placed.effects).toEqual([['formspec-submit', 'completed', 'response-17']]);
            expect(wizard.effects).toEqual(placed.effects);
            expect(wizard.results).toEqual(placed.results);
        } finally { t.cleanup(); }
    }
});

describe('Wizard fallback Submit matches placed ActionButton across declared action scenarios and executors', () => {
    const fullFiling = { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' } as const;
    const checkpoint = { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' } as const;
    const cases: Array<readonly [boolean, 'click' | 'semantic', 'valid' | 'invalid' | 'current step error' | 'permitted override' | 'deferred precondition']> = [];
    for (const useDefault of [false, true]) {
        for (const interaction of ['click', 'semantic'] as const) {
            for (const scenario of ['valid', 'invalid', 'current step error', 'permitted override', 'deferred precondition'] as const) {
                cases.push([useDefault, interaction, scenario]);
            }
        }
    }

    it.each(cases)('default=%s, %s parity, %s', async (useDefault, interaction, scenario) => {
        const { createRoot } = await import('react-dom/client');
        const { initFormspecEngine, initFormspecEngineTools, createFormEngine, invokeResponseAction } = await import('@formspec-org/engine');
        const { FormspecForm } = await import('../src/renderer');
        const { createSemanticControlRegistry } = await import('../src/semantic-controls');
        const { default: workshop } = await import('../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
        await initFormspecEngine();
        await initFormspecEngineTools();

        const scope = {
            registry: createSemanticControlRegistry(),
            renderInstanceId: 'render-1',
            responseId: 'response-17',
            definitionArtifact: { artifactRef: workshop.url, artifactDigest: `sha256:${'a'.repeat(64)}` },
            responseActionsArtifact: { artifactRef: 'urn:review:actions', artifactDigest: `sha256:${'b'.repeat(64)}` },
        };
        const host = vi.fn();
        const evaluate = vi.fn(() => ({ passed: false, reason: 'Review in progress' }));
        const definition: any = scenario === 'valid'
            ? { ...workshop, shapes: [] }
            : scenario === 'current step error'
                ? { ...workshop, shapes: [], binds: [{ path: 'attendance', required: 'true' }] }
                : workshop;
        const engine = createFormEngine(definition, {
            savedResponseData: scenario === 'current step error' ? { partner: 'Library' } : { attendance: 0, partner: 'Library' },
        });
        const action: any = {
            id: 'act',
            intent: 'submit',
            label: { literal: 'Do action' },
            validation: scenario === 'permitted override' ? checkpoint : fullFiling,
            effects: [{ type: 'hostEvent', eventName: 'file' }],
            ...(scenario === 'deferred precondition'
                ? { preconditions: [{ id: 'ready', expression: 'false', severity: 'defer' }] }
                : {}),
        };
        const doc: any = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            scope: 'response',
            targetDefinition: { url: definition.url },
            actions: [action],
        };
        const component: any = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Wizard',
                allowSkip: true,
                sidenav: true,
                children: [
                    {
                        component: 'Section',
                        id: 'details',
                        title: 'Details',
                        children: [
                            { component: 'TextInput', bind: 'venue' },
                            { component: 'TextInput', bind: 'topic' },
                            { component: 'TextInput', bind: 'outcome' },
                            { component: 'ActionButton', actionRef: 'act' },
                        ],
                    },
                    {
                        component: 'Section',
                        id: 'review',
                        title: 'Review',
                        children: [{ component: 'NumberInput', bind: 'attendance' }],
                    },
                ],
            },
        };
        const onActionResult = vi.fn();
        const onSubmit = vi.fn();
        const invoker = vi.fn((i: any) => invokeResponseAction(i.document, i.actionRef, i.ports, i.nodeId, i.invocationContext));
        const el = document.createElement('div');
        document.body.append(el);
        const root = createRoot(el);
        try {
            act(() => root.render(
                <FormspecForm
                    definition={definition}
                    engine={engine}
                    componentDocument={component}
                    responseActionsDocument={doc}
                    {...(!useDefault ? { responseActionInvoker: invoker as any } : {})}
                    semanticControlScope={scope}
                    evaluateActionPrecondition={evaluate}
                    onActionResult={onActionResult}
                    onSubmit={onSubmit}
                    onHostEvent={host}
                />,
            ));

            const observe = async (placed: boolean) => {
                if (scenario === 'current step error') {
                    expect(engine.getFieldVM('attendance')?.errors.value.some((e: any) => e.severity === 'error')).toBe(true);
                }
                const button = placed
                    ? [...el.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === 'Do action')
                    : el.querySelector<HTMLButtonElement>('.formspec-wizard-submit');
                expect(button).toBeTruthy();
                let activated: any;
                if (interaction === 'semantic') {
                    const set = scope.registry.setItem(
                        {
                            renderInstanceId: scope.renderInstanceId,
                            control: { ...scope.definitionArtifact, subjectRef: placed ? 'venue' : 'attendance', subjectKind: 'definition-item' },
                        },
                        placed ? 'north hall' : (scenario === 'current step error' ? null : 0),
                    );
                    expect(set.status).toBe('set');
                    if (set.status !== 'set') throw new Error(set.reason);
                    await act(async () => {
                        activated = await scope.registry.activateControl(
                            {
                                renderInstanceId: scope.renderInstanceId,
                                control: { ...scope.responseActionsArtifact, subjectRef: 'act', subjectKind: 'response-action' },
                            },
                            { invocationId: placed ? 'placed' : 'fallback', responseBinding: set.responseBinding },
                        );
                    });
                } else {
                    act(() => button!.click());
                    await act(async () => { await Promise.resolve(); });
                }
                const result = onActionResult.mock.calls.at(-1)?.[0] as any;
                const observed = {
                    executorCalls: invoker.mock.calls.length,
                    evaluations: evaluate.mock.calls.length,
                    effects: host.mock.calls.map(([name, s]) => [name, s.response.id, s.response.status]),
                    result: result ? [result.status, result.blockedCause ?? null, result.deferredPreconditionId ?? null] : [],
                    validationTuple: result?.validationTuple,
                    trace: result?.effectTrace?.map((s: any) => s.status),
                    activation: interaction === 'semantic'
                        ? [activated.status, activated.reason ?? null, activated.invocation?.status ?? null, activated.invocation?.blockedCause ?? null]
                        : undefined,
                    actionOwner: activated?.invocation?.actionOwner,
                    detailId: activated?.invocation?.detail?.response?.id,
                };
                for (const spy of [invoker, onActionResult, onSubmit, host, evaluate]) spy.mockClear();
                return observed;
            };

            const placed = await observe(true);
            act(() => { el.querySelector<HTMLButtonElement>('.formspec-wizard-next')!.click(); });
            const wizard = await observe(false);

            if (interaction === 'semantic' && ['invalid', 'current step error'].includes(scenario)) {
                expect(placed.activation).toEqual(['activated', null, 'blocked', 'validation']);
                expect(wizard.activation).toEqual(placed.activation);
                expect(wizard.actionOwner).toEqual({ ...scope.responseActionsArtifact, subjectRef: 'act', subjectKind: 'response-action' });
                expect(wizard.detailId).toBe('response-17');
                expect(placed.validationTuple).toEqual(fullFiling);
                expect(placed.trace).toEqual(['not-invoked']);
                expect(wizard.validationTuple).toEqual(placed.validationTuple);
                expect(wizard.trace).toEqual(placed.trace);
            } else {
                expect(wizard.result).toEqual(placed.result);
                expect(wizard.effects).toEqual(placed.effects);
                expect(wizard.evaluations).toBe(placed.evaluations);
                expect(wizard.validationTuple).toEqual(placed.validationTuple);
                expect(wizard.trace).toEqual(placed.trace);
                if (interaction === 'semantic') {
                    expect(wizard.activation).toEqual(placed.activation);
                }
                if (scenario === 'valid' && !useDefault) {
                    expect(wizard.executorCalls).toBe(1);
                }
            }
        } finally {
            act(() => root.unmount());
            el.remove();
            engine.dispose();
        }
    });
});

describe('Wizard cross-step invalid focus and declared formspec-submit callback parity', () => {
    const complete = { profile: 'on-submit', blocking: 'block-on-error', persistence: 'complete-response' } as const;
    const checkpoint = { profile: 'off', blocking: 'non-blocking', persistence: 'draft-checkpoint' } as const;
    const fields = ['earlier', 'lastStepValue', 'visible'] as const;

    async function setupFocusWizard(options: {
        required: string;
        custom: boolean;
        event?: string;
        draft?: boolean;
        invoke?: (i: any) => any;
    }) {
        const { createRoot } = await import('react-dom/client');
        const { createFormEngine, initFormspecEngine, initFormspecEngineTools, invokeResponseAction } = await import('@formspec-org/engine');
        const { FormspecForm } = await import('../src/renderer');
        const { createSemanticControlRegistry } = await import('../src/semantic-controls');
        await initFormspecEngine();
        await initFormspecEngineTools();

        const definition: any = {
            $formspec: '1.0',
            url: 'urn:review9:focus',
            version: '1.0.0',
            title: 'Probe',
            items: fields.map(key => ({ key, type: 'field', dataType: 'string', label: key })),
            binds: [{ path: options.required, required: 'true' }],
        };
        const engine = createFormEngine(definition);
        const doc: any = {
            $formspecResponseActions: '1.0',
            version: '1.0.0',
            scope: 'response',
            targetDefinition: { url: definition.url },
            actions: [{
                id: 'submit',
                intent: 'submit',
                label: { literal: 'Placed' },
                validation: options.draft ? checkpoint : complete,
                effects: [{ type: 'hostEvent', eventName: options.event ?? 'formspec-submit' }],
            }],
        };
        const component: any = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: definition.url },
            tree: {
                component: 'Wizard',
                allowSkip: true,
                children: [
                    {
                        component: 'Section',
                        id: 'details',
                        title: 'Details',
                        children: [
                            { component: 'TextInput', bind: 'earlier' },
                            { component: 'ActionButton', actionRef: 'submit' },
                        ],
                    },
                    {
                        component: 'Section',
                        id: 'review',
                        title: 'Review',
                        children: [
                            { component: 'TextInput', bind: 'lastStepValue' },
                            { component: 'TextInput', bind: 'visible' },
                        ],
                    },
                ],
            },
        };
        const scope = {
            renderInstanceId: 'wizard-review9',
            responseId: 'r9',
            definitionArtifact: { artifactRef: definition.url, artifactDigest: `sha256:${'a'.repeat(64)}` },
            responseActionsArtifact: { artifactRef: 'urn:review9:actions', artifactDigest: `sha256:${'b'.repeat(64)}` },
            registry: createSemanticControlRegistry(),
        };
        const onSubmit = vi.fn();
        const onActionResult = vi.fn();
        const onHostEvent = vi.fn();
        const invoker = vi.fn(options.invoke ?? ((i: any) => invokeResponseAction(i.document, i.actionRef, i.ports, i.nodeId, i.invocationContext)));
        const el = document.createElement('div');
        document.body.append(el);
        const root = createRoot(el);
        act(() => root.render(
            <FormspecForm
                definition={definition}
                engine={engine}
                componentDocument={component}
                responseActionsDocument={doc}
                semanticControlScope={scope}
                onSubmit={onSubmit}
                onActionResult={onActionResult}
                onHostEvent={onHostEvent}
                {...(options.custom ? { responseActionInvoker: invoker as any } : {})}
            />,
        ));
        const skip = () => { act(() => el.querySelector<HTMLButtonElement>('.formspec-wizard-skip')!.click()); };
        async function activate(mode: 'click' | 'semantic', placed: boolean) {
            const button = el.querySelector<HTMLButtonElement>(placed ? 'button.formspec-submit' : '.formspec-wizard-submit')!;
            expect(button).toBeTruthy();
            act(() => button.focus());
            if (mode === 'click') {
                await act(async () => button.click());
            } else {
                const subjectRef = placed ? 'earlier' : 'lastStepValue';
                let set!: ReturnType<typeof scope.registry.setItem>;
                act(() => {
                    set = scope.registry.setItem(
                        { renderInstanceId: scope.renderInstanceId, control: { ...scope.definitionArtifact, subjectKind: 'definition-item', subjectRef } },
                        'value',
                    );
                });
                expect(set.status).toBe('set');
                if (set.status !== 'set') throw new Error(set.reason);
                await act(async () => {
                    const r = await scope.registry.activateControl(
                        { renderInstanceId: scope.renderInstanceId, control: { ...scope.responseActionsArtifact, subjectKind: 'response-action', subjectRef: 'submit' } },
                        { invocationId: placed ? 'placed' : 'wizard', responseBinding: set.responseBinding },
                    );
                    expect(r.status).toBe('activated');
                });
            }
        }
        const cleanup = () => {
            act(() => root.unmount());
            el.remove();
            engine.dispose();
        };
        return { el, engine, skip, activate, onSubmit, onHostEvent, onActionResult, invoker, cleanup };
    }

    for (const custom of [false, true]) {
        for (const mode of ['click', 'semantic'] as const) {
            for (const required of ['visible', 'earlier'] as const) {
                it(`focuses ${required} after a blocked ${mode}, custom=${custom}`, async () => {
                    const t = await setupFocusWizard({ custom, required });
                    try {
                        t.skip();
                        await t.activate(mode, false);
                        const [result] = t.onActionResult.mock.lastCall!;
                        expect(result.status).toBe('blocked');
                        expect(result.blockedCause).toBe('validation');
                        expect(result.detail.validationReport.results.map((r: any) => r.path)).toContain(required);
                        expect(result.validationTuple).toEqual(complete);
                        expect(result.effectTrace.map((r: any) => r.status)).toEqual(['not-invoked']);
                        expect(t.onHostEvent).not.toHaveBeenCalled();
                        expect(document.activeElement?.closest('[data-name]')?.getAttribute('data-name')).toBe(required);
                    } finally { t.cleanup(); }
                });
            }
            for (const event of ['checkpoint-ready', 'formspec-submit'] as const) {
                it(`forwards only the declared submit callback for ${event}, ${mode}, custom=${custom}`, async () => {
                    const t = await setupFocusWizard({ custom, required: 'visible', draft: true, event });
                    try {
                        const observed = () => ({
                            callbacks: t.onSubmit.mock.calls.map(([r]) => r.response.status),
                            host: t.onHostEvent.mock.calls.map(([name, r]) => [name, r.response.status]),
                            terminal: t.onActionResult.mock.lastCall?.[0].status,
                            trace: t.onActionResult.mock.lastCall?.[0].effectTrace.map((r: any) => r.status),
                            tuple: t.onActionResult.mock.lastCall?.[0].validationTuple,
                        });
                        await t.activate(mode, true);
                        const placed = observed();
                        t.onSubmit.mockClear();
                        t.onHostEvent.mockClear();
                        t.onActionResult.mockClear();
                        t.skip();
                        await t.activate(mode, false);
                        const wizard = observed();
                        expect(placed.host).toEqual([[event, 'in-progress']]);
                        expect(placed.terminal).toBe('completed');
                        expect(placed.trace).toEqual(['succeeded']);
                        expect(placed.tuple).toEqual(checkpoint);
                        expect(placed.callbacks).toEqual(event === 'formspec-submit' ? ['in-progress'] : []);
                        expect(wizard).toEqual(placed);
                    } finally { t.cleanup(); }
                });
            }
        }
    }

    it('suppresses a delayed invocation after a user fixes the invalid answer', async () => {
        const { invokeResponseAction } = await import('@formspec-org/engine');
        let finish!: () => void;
        const t = await setupFocusWizard({
            required: 'earlier',
            custom: true,
            invoke: (i) => new Promise(resolve => {
                finish = () => resolve(invokeResponseAction(i.document, i.actionRef, i.ports, i.nodeId, i.invocationContext));
            }),
        });
        try {
            t.skip();
            await t.activate('click', false);
            expect(t.invoker).toHaveBeenCalledTimes(1);
            act(() => t.engine.setValue('earlier', 'fixed'));
            await act(async () => finish());
            expect(t.onSubmit).not.toHaveBeenCalled();
            expect(t.onHostEvent).not.toHaveBeenCalled();
            expect(t.onActionResult).not.toHaveBeenCalled();
        } finally { t.cleanup(); }
    });
});
