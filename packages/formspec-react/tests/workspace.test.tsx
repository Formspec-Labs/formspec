/** @filedesc The same authored page mode works through the plain and provider-driven renderers. */
import React, { act, useState } from 'react';
import { beforeAll, expect, it, vi } from 'vitest';
import { createAssistProvider } from '@formspec-org/assist';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import type { ComponentDocument, FormDefinition } from '@formspec-org/types';
import type { FieldComponentProps } from '../src/component-map';
import { FormspecProvider, useFormspecContext } from '../src/context';
import { FormspecNode } from '../src/node-renderer';
import { FormspecForm, type WalkBridgeElement } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => { await initFormspecEngine(); });

const contact = { key: 'name', type: 'field', dataType: 'string', label: 'Contact name' } as const;
const definition: FormDefinition = {
    $formspec: '1.0', url: 'urn:test:workspace', version: '1.0.0', title: 'Filing',
    formPresentation: { pageMode: 'workspace' },
    items: [
        { key: 'intro', type: 'group', label: 'Introduction', children: [contact] },
        { key: 'details', type: 'group', label: 'Details', children: [
            { key: 'offices', type: 'group', label: 'Offices', repeatable: true, minRepeat: 2, children: [
                { key: 'staff', type: 'group', label: 'Staff', repeatable: true, minRepeat: 2, children: [
                    { key: 'email', type: 'field', dataType: 'string', label: 'Work email' },
                ] },
            ] },
            { key: 'approval', type: 'field', dataType: 'string', label: 'Approval' },
        ] },
    ],
    shapes: [
        { id: 'formCheck', target: '#', severity: 'warning', constraint: 'false', message: 'Check the whole filing' },
        { id: 'approvalCheck', target: 'details.approval', severity: 'error', constraint: '$intro.name = "Confirmed"', message: 'Confirm approval' },
    ],
};
const repeatPath = 'details.offices[1].staff[1].email';

function control(host: ParentNode, path: string) {
    return host.querySelector<HTMLInputElement>(`[data-name="${path}"] input`);
}

function clickText(host: ParentNode, text: string) {
    const button = Array.from(host.querySelectorAll<HTMLElement>('a,button')).find(node => node.textContent?.includes(text));
    expect(button, text).toBeDefined();
    act(() => button!.click());
}

function searchFor(host: ParentNode, term: string) {
    const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, term);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}

it('jumps to a localized concrete nested repeat and retains the Walk bridge and engine', () => {
    const engine = createFormEngine(definition);
    engine.loadLocale({
        $formspecLocale: '2.1', version: '1.0.0', locale: 'es', target: { kind: 'definition', url: definition.url },
        strings: {
            'email.label': 'Correo de trabajo',
            'details.label': 'Detalles',
            '$ui.workspace.matchCount': 'Coincidencias ({{$count}})',
        },
    });
    engine.setLocale('es');
    const host = actRender(<FormspecForm engine={engine} />);
    const root = host.querySelector<WalkBridgeElement>('[data-formspec-render-root]')!;
    expect(control(root, repeatPath)).toBeNull();
    searchFor(root, 'correo');
    const matches = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
        .filter(button => button.textContent?.includes('Correo de trabajo'));
    expect(matches).toHaveLength(4);
    expect(root.querySelector('.formspec-workspace__navigation [role="status"]')?.textContent).toBe('Coincidencias (4)');
    expect(new Set(matches.map(button => button.textContent)).size).toBe(4);
    act(() => matches[3].click());
    expect(document.activeElement).toBe(control(root, repeatPath));
    expect(root.querySelector('h3')?.textContent).toBe('Detalles');
    expect(root.engine).toBe(engine);
    expect(root.submit?.({ emitEvent: false })?.validationReport?.valid).toBe(false);
});

it('keeps matching questions stable on ordinary edits and updates them when relevance changes', () => {
    const engine = createFormEngine({
        ...definition, shapes: [],
        binds: [{ path: 'details.offices.staff.email', relevant: '$intro.name != "Hide email"' }],
    });
    const host = actRender(<FormspecForm engine={engine} />);
    searchFor(host, 'Work email');
    const results = () => Array.from(host.querySelectorAll('button')).filter(button => button.textContent?.includes('Work email'));
    expect(results()).toHaveLength(4);
    const fields = vi.spyOn(engine, 'getFieldVM');
    act(() => engine.setValue('intro.name', 'Example'));
    expect(results()).toHaveLength(4);
    expect(fields).not.toHaveBeenCalledWith(repeatPath);
    act(() => engine.setValue('intro.name', 'Hide email'));
    expect(results()).toHaveLength(0);
});

it.each([false, true])('sets the document title only with host opt-in = %s', (updateDocumentTitle) => {
    const previousTitle = document.title;
    document.title = 'Host title';
    try {
        const host = actRender(<FormspecForm definition={definition} {...(updateDocumentTitle && { updateDocumentTitle })} />);
        expect(document.title).toBe(updateDocumentTitle ? 'Introduction – Host title' : 'Host title');
        clickText(host, 'Details');
        expect(document.title).toBe(updateDocumentTitle ? 'Details – Host title' : 'Host title');
    } finally {
        document.title = previousTitle;
    }
});

it('uses the tracker’s filled and total parameters in the authored locale', () => {
    const engine = createFormEngine(definition);
    engine.loadLocale({
        $formspecLocale: '2.1', version: '1.0.0', locale: 'es', target: { kind: 'definition', url: definition.url },
        strings: { '$ui.workspace.filled': 'Respondidas: {{$filled}} de {{$total}}' },
    });
    engine.setLocale('es');
    engine.setValue('intro.name', 'Confirmed');
    const host = actRender(<FormspecForm engine={engine} />);
    expect(host.querySelector('aside')?.textContent).toContain('Respondidas: 1 de 6');
});

it.each(['search', 'finding'])('focuses a visible read-only question from %s', source => {
    const engine = createFormEngine({
        ...definition, binds: [{ path: 'details.approval', readonly: 'true' }],
    });
    const host = actRender(<FormspecForm engine={engine} />);
    if (source === 'search') {
        searchFor(host, 'Approval');
        clickText(host, 'ApprovalDetails');
    } else {
        clickText(host, 'Confirm approval');
    }
    const target = control(host, 'details.approval');
    expect(target?.readOnly).toBe(true);
    expect(document.activeElement).toBe(target);
    expect(host.querySelector('.formspec-workspace__content [role="status"]')?.textContent).toBe('');
});

it('explains a visible disabled target and clears the notice on Previous', () => {
    const components = { fields: { TextInput: ({ field }: FieldComponentProps) => (
        <div data-name={field.path}><input disabled /></div>
    ) } };
    const host = actRender(<FormspecForm definition={definition} components={components} />);
    searchFor(host, 'Approval');
    clickText(host, 'ApprovalDetails');
    expect(control(host, 'details.approval')?.disabled).toBe(true);
    expect(document.activeElement?.textContent).toBe('Details');
    const notice = host.querySelector('.formspec-workspace__content [role="status"]');
    expect(notice?.textContent).toBe('This question cannot be edited.');
    clickText(host, 'Previous');
    expect(notice?.textContent).toBe('');
});

it('cancels an uncommitted field jump when Next selects its section', () => {
    let requested = false;
    function Controlled() {
        const [activeSection, setSection] = useState('intro');
        return <FormspecForm definition={definition} activeSection={activeSection} onActiveSectionChange={section => {
            if (requested) setSection(section);
            requested = true;
        }} />;
    }
    const host = actRender(<Controlled />);
    searchFor(host, 'Approval');
    clickText(host, 'ApprovalDetails');
    expect(control(host, 'details.approval')).toBeNull();
    clickText(host, 'Next');
    expect(document.activeElement?.textContent).toBe('Details');
});

it('shows form-level and cross-section findings and jumps only where a control exists', () => {
    const engine = createFormEngine(definition);
    const host = actRender(<FormspecForm engine={engine} />);
    const formFinding = Array.from(host.querySelectorAll('li')).find(row => row.textContent?.includes('Check the whole filing'));
    expect(formFinding).toBeDefined();
    expect(formFinding?.querySelector('a,button')).toBeNull();
    clickText(host, 'Confirm approval');
    expect(document.activeElement).toBe(control(host, 'details.approval'));
});

it.each(['section', 'form'])('focuses the %s heading when a requested control disappears before mounting', (fallback) => {
    const engine = createFormEngine({
        ...definition,
        binds: [{ path: 'details.approval', relevant: 'empty($intro.name)' }],
    });
    function Controlled() {
        const [activeSection, setSection] = useState('intro');
        return <FormspecForm engine={engine} activeSection={activeSection} onActiveSectionChange={section => {
            engine.setValue('intro.name', 'Confirmed');
            setSection(section);
        }} componentDocument={fallback === 'form' ? authoredSections(false, 'false') : undefined} />;
    }
    const host = actRender(<Controlled />);
    clickText(host, 'Confirm approval');
    expect(control(host, 'details.approval')).toBeNull();
    expect(document.activeElement?.textContent).toBe(fallback === 'section' ? 'Details' : 'Filing');
    expect(host.querySelector('.formspec-workspace__content [role="status"]')?.textContent).toMatch(/no longer available/i);
});

function authoredSections(keyed: boolean, approvalWhen?: string): ComponentDocument {
    return {
        $formspecComponent: '1.0', version: '1.0.0', targetDefinition: { url: definition.url },
        tree: { component: 'Stack', children: [
            { component: 'Text', text: 'Before' },
            { component: 'Section', ...(keyed && { id: 'contact' }), title: 'Contact', children: [
                { component: 'TextInput', bind: 'intro.name' },
            ] },
            { component: 'Text', text: 'Between' },
            { component: 'Section', ...(keyed && { id: 'details' }), ...(keyed && { title: 'Details' }), children: [
                { component: 'TextInput', bind: 'details.approval', ...(approvalWhen && { when: approvalWhen }) },
            ] },
            { component: 'Text', text: 'After' },
        ] },
    };
}

it.each([true, false])('preserves ordered content with authored IDs present = %s', (keyed) => {
    const host = actRender(<FormspecForm definition={definition} componentDocument={authoredSections(keyed)} />);
    const markers = () => Array.from(host.querySelectorAll('p, [data-name]')).flatMap(node => {
        const text = node.getAttribute('data-name') ?? node.textContent;
        return ['Before', 'intro.name', 'Between', 'details.approval', 'After'].includes(text ?? '') ? [text] : [];
    });
    if (keyed) {
        expect(markers()).toEqual(['Before', 'intro.name', 'Between']);
        clickText(host, 'Details');
        expect(markers()).toEqual(['details.approval', 'After']);
    } else {
        expect(markers()).toEqual(['Before', 'intro.name', 'Between', 'details.approval', 'After']);
    }
});

it('renders workspace from the provider layout used by the standalone respondent web renderer', () => {
    function RespondentLayout() {
        const { layoutPlan } = useFormspecContext();
        return layoutPlan && <FormspecNode node={layoutPlan} />;
    }
    const host = actRender(<FormspecProvider definition={definition}><RespondentLayout /></FormspecProvider>);
    clickText(host, 'Details');
    expect(control(host, 'details.approval')).not.toBeNull();
    expect(control(host, 'intro.name')).toBeNull();
});

it.each(['wizard', 'tabs'] as const)('uses Assist page order in %s while retaining progression and mounts', (pageMode) => {
    const engine = createFormEngine({
        ...definition, formPresentation: { pageMode }, shapes: [],
        binds: [{ path: 'intro.name', required: 'true' }],
        items: [definition.items[0], { key: 'middle', type: 'field', dataType: 'string', label: 'Middle question' }, definition.items[1]],
    });
    const assist = createAssistProvider({ engine, registerWebMCP: false });
    const host = actRender(<FormspecForm engine={engine} />);
    const selectors = pageMode === 'tabs' ? '[role="tab"]' : '.formspec-wizard-step-label';
    const labels = Array.from(host.querySelectorAll(selectors)).map(tab => tab.textContent?.trim());
    const pages = assist.getProgress().pages!;
    expect(pages.map(page => page.id)).toEqual(['intro', 'middle', 'details']);
    expect(labels).toHaveLength(pages.length);
    pages.forEach((page, index) => expect(labels[index]).toContain(page.title));
    if (pageMode === 'tabs') {
        const retained = control(host, 'intro.name');
        clickText(host, 'Additional items');
        expect(control(host, 'intro.name')).toBe(retained);
        expect(control(host, 'middle')?.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(false);
    } else {
        clickText(host, 'Next');
        expect(control(host, 'middle')).toBeNull();
        act(() => engine.setValue('intro.name', 'Contact'));
        clickText(host, 'Next');
        expect(control(host, 'intro.name')).toBeNull();
        expect(control(host, 'middle')).not.toBeNull();
    }
});

it('uses the authored row label for a repeat that owns its section', () => {
    const rows = definition.items[1].children![0];
    const host = actRender(<FormspecForm definition={{ ...definition, items: [rows], shapes: [] }} />);
    expect(host.querySelector('[data-bind="offices"] > .formspec-repeat-add')?.textContent).toBe('Add Offices');
    expect(host.querySelector('.formspec-repeat-instance')?.getAttribute('aria-label')).toBe('Offices 1 of 2');
});

it('keeps the authored configuration of a Component Tabs root', () => {
    const componentDocument: ComponentDocument = {
        ...authoredSections(true),
        tree: { component: 'Tabs', defaultTab: 1, placement: 'bottom', tabLabels: ['One', 'Two'],
            children: authoredSections(true).tree.children!.filter(child => child.component === 'Section') },
    };
    const host = actRender(<FormspecForm definition={{ ...definition, formPresentation: { pageMode: 'tabs' } }} componentDocument={componentDocument} />);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Two');
    expect(host.querySelector('[data-placement="bottom"]')).not.toBeNull();
});

it('jumps to a concrete editable table cell', () => {
    const componentDocument: ComponentDocument = {
        ...authoredSections(true),
        tree: { component: 'Section', id: 'details', title: 'Details', children: [
            { component: 'DataTable', bind: 'details.offices', columns: [{ header: 'Office code', bind: 'code' }] },
        ] },
    };
    const engine = createFormEngine({ ...definition, items: [
        { ...definition.items[1], children: [{ ...definition.items[1].children![0], children: [
            { key: 'code', type: 'field', dataType: 'string', label: 'Office code' },
        ] }] },
    ], shapes: [{ id: 'codeCheck', target: 'details.offices[1].code', severity: 'error', constraint: 'false', message: 'Check the second code' }] });
    const host = actRender(<FormspecForm engine={engine} componentDocument={componentDocument} />);
    clickText(host, 'Check the second code');
    expect(document.activeElement?.getAttribute('name')).toBe('details.offices[1].code');
});

it('waits for an authored nested tab before focusing the requested question', async () => {
    const componentDocument: ComponentDocument = {
        ...authoredSections(true),
        tree: { component: 'Section', id: 'details', title: 'Details', children: [
            { component: 'Tabs', tabLabels: ['Contact', 'Approval'], children: [
                { component: 'Section', children: [{ component: 'TextInput', bind: 'intro.name' }] },
                { component: 'Section', children: [{ component: 'TextInput', bind: 'details.approval' }] },
            ] },
        ] },
    };
    const host = actRender(<FormspecForm definition={definition} componentDocument={componentDocument} />);
    const approval = control(host, 'details.approval');
    expect(approval?.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(true);
    clickText(host, 'Confirm approval');
    await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
    expect(approval?.closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(approval);
});

it('keeps a shared Save control available when a Wizard step blocks Next', () => {
    const engine = createFormEngine({
        ...definition, formPresentation: { pageMode: 'wizard' }, shapes: [],
        binds: [{ path: 'intro.name', required: 'true' }],
    });
    const componentDocument: ComponentDocument = {
        ...authoredSections(true),
        'x-studio-generated': true,
        tree: { component: 'Stack', children: [
            { component: 'Stack', bind: 'intro', children: [{ component: 'TextInput', bind: 'name' }] },
            { component: 'Stack', bind: 'details', children: [{ component: 'TextInput', bind: 'approval' }] },
            { component: 'Text', text: 'You may save at any time.' },
            { component: 'ActionButton', actionRef: 'save' },
        ] },
    };
    const host = actRender(<FormspecForm engine={engine} componentDocument={componentDocument}
        responseActionsDocument={{
            $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response',
            targetDefinition: { url: definition.url },
            actions: [{ id: 'save', intent: 'save-draft', label: { literal: 'Save draft' } }],
        }} />);
    clickText(host, 'Next');
    expect(control(host, 'intro.name')).not.toBeNull();
    const save = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Save draft');
    expect(save).toBeDefined();
    expect(save?.closest('.formspec-wizard-panel')).toBeNull();
});

it('renders root Save and validation summary once across authored workspace sections', () => {
    const componentDocument: ComponentDocument = {
        ...authoredSections(true),
        tree: { component: 'Stack', children: [
            { component: 'ActionButton', actionRef: 'save' },
            { component: 'ValidationSummary' },
            ...authoredSections(true).tree.children!.filter(child => child.component === 'Section'),
        ] },
    };
    const host = actRender(<FormspecForm definition={definition} componentDocument={componentDocument}
        responseActionsDocument={{
            $formspecResponseActions: '1.0', version: '1.0.0', scope: 'response',
            targetDefinition: { url: definition.url },
            actions: [{ id: 'save', intent: 'save-draft', label: { literal: 'Save draft' } }],
        }} />);
    const saves = () => Array.from(host.querySelectorAll('button')).filter(button => button.textContent === 'Save draft');
    const summaries = () => Array.from(host.querySelectorAll('.formspec-validation-summary'));
    const root = host.querySelector<WalkBridgeElement>('[data-formspec-render-root]')!;
    act(() => { root.submit?.({ emitEvent: false }); });
    const save = saves()[0];
    const summary = summaries()[0];
    expect(saves()).toHaveLength(1);
    expect(summaries()).toHaveLength(1);
    clickText(host, 'Details');
    expect(saves()).toEqual([save]);
    expect(summaries()).toEqual([summary]);
    clickText(host, 'Previous');
    expect(saves()).toEqual([save]);
    expect(summaries()).toEqual([summary]);
});
