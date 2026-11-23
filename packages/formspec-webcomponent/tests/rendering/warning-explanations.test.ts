/** @filedesc Individual warning controls use the current finding and its localized prompt. */
import { signal } from '@preact/signals-core';
import { it, expect, vi } from 'vitest';
import type { IFormEngine } from '@formspec-org/engine/render';
import { bindWarningExplanations } from '../../src/rendering/warning-explanations';

it('confirms a firing instance, preserves unsaved text during a locale refresh, and removes a cleared warning', () => {
    const finding = { shapeId: 'check', path: 'rows[1].total', mode: 'confirm',
        basis: 'a', current: false, message: 'Check total' };
    const state = signal([finding]);
    const localeSignal = signal(0);
    const engine = { localeSignal, shapeResults: {}, getExplanationState: () => ({ instances: state.value }),
        resolveLocaleString: (key: string, fallback: string) => key === '$shape.check.explanationPrompt' ? 'Confirm this total' : fallback,
        setExplanation: vi.fn() };
    const root = document.createElement('div');
    const field = document.createElement('div');
    field.dataset.name = finding.path;
    root.append(field);
    const dispose = bindWarningExplanations(root, engine as unknown as IFormEngine, () => true, () => true);
    expect(field.querySelector('legend')?.textContent).toBe('Check total');
    expect(field.querySelector('label')?.textContent).toContain('Confirm this total');
    const input = field.querySelector('textarea')!;
    input.value = 'I checked the source.';
    input.dispatchEvent(new Event('input'));
    localeSignal.value++;
    expect(field.querySelector('textarea')).toBe(input);
    field.querySelector('button')!.click();
    expect(engine.setExplanation).toHaveBeenCalledWith('check', 'rows[1].total', { text: input.value });
    state.value = [];
    expect(field.querySelector('fieldset')).toBeNull();
    dispose();
});

it('renders grouped blank-answer acknowledgement, jumps to fields, and displays set differences after changes', () => {
    const groups = signal([{
        code: 'WORKSHOP_NOT_ANSWERED',
        paths: ['outcome', 'topic', 'venue'],
        current: false,
        added: ['outcome', 'topic', 'venue'],
        removed: [] as string[],
    }]);
    const entries = signal<unknown[]>([]);
    const labels: Record<string, string> = {
        outcome: 'Outcome',
        partner: 'Partner',
        topic: 'Topic',
        venue: 'Venue',
    };
    const acknowledge = vi.fn((code: string) => {
        entries.value = [{ group: true, code, paths: groups.value[0]!.paths, basis: 'g1' }];
        groups.value = [{ ...groups.value[0]!, current: true, added: [], removed: [] }];
    });
    const focusField = vi.fn();
    const engine = {
        localeSignal: signal(0),
        shapeResults: {},
        getFieldVM: (path: string) => labels[path] ? ({ id: `field-${path}`, label: signal(labels[path]!) }) : undefined,
        getItemLabelSignal: (path: string) => labels[path] ? signal(labels[path]!) : undefined,
        getDefinition: () => ({ title: 'Workshop report' }),
        getExplanationState: () => ({ instances: [], groups: groups.value, entries: entries.value }),
        resolveLocaleString: (_key: string, fallback: string) => fallback,
        acknowledge,
        setExplanation: vi.fn(),
    };
    const root = document.createElement('div');
    const dispose = bindWarningExplanations(
        root,
        engine as unknown as IFormEngine,
        () => true,
        () => true,
        focusField,
    );
    const panel = root.querySelector<HTMLFieldSetElement>('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"]')!;
    expect(panel).not.toBeNull();
    expect(panel.querySelector('legend')?.textContent).toBe('3 unanswered questions');
    const links = [...panel.querySelectorAll('a')];
    expect(links.map(a => a.textContent)).toEqual(['Outcome', 'Topic', 'Venue']);
    links[2]!.click();
    expect(focusField).toHaveBeenCalledWith('venue');

    const button = panel.querySelector('button')!;
    expect(button.textContent).toBe('Accept 3 unanswered questions');
    button.click();
    expect(acknowledge).toHaveBeenCalledWith('WORKSHOP_NOT_ANSWERED');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe('Accepted 3 unanswered questions');

    groups.value = [{
        code: 'WORKSHOP_NOT_ANSWERED',
        paths: ['outcome', 'partner', 'topic'],
        current: false,
        added: ['partner'],
        removed: ['venue'],
    }];
    expect(panel.textContent).toContain('Newly unanswered');
    expect(panel.textContent).toContain('Partner');
    expect(panel.textContent).toContain('Now answered');
    expect(panel.textContent).toContain('Venue');
    expect(button.disabled).toBe(false);

    groups.value = [];
    expect(root.querySelector('fieldset[data-explanation-code="WORKSHOP_NOT_ANSWERED"]')).toBeNull();
    dispose();
});

it('fills translated $ui.validationSummary.row slots literally without FEL stripping placeholders', async () => {
    const { FormspecRender } = await import('../../src/index');
    const { default: workshop } = await import('../../../../tests/conformance/fixtures/explanations/first-slice.definition.json');
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);
    const el = document.createElement('formspec-render') as InstanceType<typeof FormspecRender>;
    document.body.append(el);
    try {
        el.definition = workshop as any;
        el.localeDocuments = [{
            $formspecLocale: '2.1',
            locale: 'fr',
            version: '1.0.0',
            target: { kind: 'definition', url: workshop.url },
            strings: {
                '$ui.validationSummary.row': 'Écart [{{$message}}] — {{$label}}',
                'venue.label': 'Lieu',
            },
        } as any];
        el.locale = 'fr';
        el.render();
        const engine = el.getEngine()!;
        engine.setValue('partner', 'Library');
        el.submit({ profile: 'on-submit', emitEvent: false });
        const panel = el.querySelector<HTMLElement>('[data-explanation-code]')!;
        panel.querySelector('button')!.click();
        engine.setValue('venue', 'Hall');
        expect(engine.lookupLocaleString('$ui.validationSummary.row')).toBe('Écart [{{$message}}] — {{$label}}');
        expect(panel.querySelector('.formspec-warning-acknowledgement-removed')?.textContent).toBe('Écart [Lieu] — Now answered');
    } finally {
        el.remove();
    }
});

it('refuses acknowledging a deadline firing absent from its displayed list, refreshes to 3, and accepts on second click', async () => {
    const { initFormspecEngine, createFormEngine } = await import('@formspec-org/engine');
    await initFormspecEngine();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'));
    const definition = {
        $formspec: '1.0',
        url: 'urn:example:wc-deadline',
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
    const root = document.createElement('div');
    document.body.append(root);
    const dispose = bindWarningExplanations(root, engine, () => true, () => true);
    try {
        const button = root.querySelector<HTMLButtonElement>('fieldset[data-explanation-code="BLANK"] button')!;
        expect(button.textContent).toBe('Accept 2 unanswered questions');
        expect([...root.querySelectorAll('fieldset[data-explanation-code="BLANK"] li')].map(li => li.textContent))
            .toEqual(['first', 'second']);

        vi.setSystemTime(new Date('2026-11-19T12:00:00Z'));
        button.click();
        expect(engine.getExplanationEntries()).toEqual([]);
        expect(button.textContent).toBe('Accept 3 unanswered questions');
        expect([...root.querySelectorAll('fieldset[data-explanation-code="BLANK"] li')].map(li => li.textContent))
            .toEqual(['deadline', 'first', 'second']);

        button.click();
        expect(engine.getExplanationEntries()).toHaveLength(1);
        expect(button.textContent).toBe('Accepted 3 unanswered questions');
        expect(button.disabled).toBe(true);
    } finally {
        dispose();
        root.remove();
        engine.dispose();
        vi.useRealTimers();
    }
});
