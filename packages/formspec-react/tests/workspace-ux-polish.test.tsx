/** @filedesc Regression tests for workspace UX polish: warning callouts, badge updates, repeater cards/locks/undo, scalar auto-grid, inline Shape errors, keyboard/wheel polish, single-section rail collapse, responsive hooks, and non-relevant section filtering. */
import React, { act } from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import type { FormDefinition } from '@formspec-org/types';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

function setControlValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Warning callouts, prefix deduplication, persistent inline rendering, and badge updates', () => {
    const warningDef: FormDefinition = {
        $formspec: '1.0',
        url: 'urn:test:warning-polish',
        version: '1.0.0',
        title: 'Annual Grant Report',
        formPresentation: { pageMode: 'workspace' },
        items: [
            {
                key: 'sectionA',
                type: 'group',
                label: 'Section A',
                children: [
                    { key: 'allocated', type: 'field', dataType: 'integer', label: 'Allocated' },
                    { key: 'spent', type: 'field', dataType: 'integer', label: 'Spent' },
                ],
            },
            {
                key: 'sectionB',
                type: 'group',
                label: 'Section B',
                children: [
                    { key: 'summaryNote', type: 'field', dataType: 'string', label: 'Summary note' },
                ],
            },
        ],
        shapes: [
            {
                id: 'overspendWarn',
                target: 'sectionA.spent',
                severity: 'warning',
                code: 'OVERSPEND',
                constraint: '$sectionA.spent <= $sectionA.allocated',
                message: 'WARNING: Spent exceeds allocated amount.',
                explanation: 'explain',
                explanationPrompt: 'Explain the variance',
            },
            {
                id: 'formSummaryWarn',
                target: '#',
                severity: 'warning',
                code: 'FORM_NOTE_CHECK',
                constraint: 'present($sectionB.summaryNote)',
                message: 'Warning: WARNING: Summary note is blank.',
                explanation: 'explain',
                explanationPrompt: 'Confirm why the summary note is blank',
            },
        ],
    } as FormDefinition;

    it('renders active live explainable warnings persistently as region callouts (no fieldset/legend), deduplicates doubled prefixes, places form-level warnings above Submit, and decrements badges on Use explanation', () => {
        const engine = createFormEngine(warningDef);
        act(() => {
            engine.setValue('sectionA.allocated', 100);
            engine.setValue('sectionA.spent', 150);
        });

        const host = actRender(<FormspecForm engine={engine} />);

        // P0-6: No native <fieldset><legend> wrapping warning explanations.
        expect(host.querySelector('fieldset.formspec-warning-explanation')).toBeNull();

        // P1-8: Active field warning explanation renders persistently inline right beside its target field without blur or Findings click.
        const spentField = host.querySelector<HTMLElement>('[data-name="sectionA.spent"]')!;
        const fieldBox = host.querySelector<HTMLElement>('.formspec-warning-explanation[role="region"][data-shape-id="overspendWarn"]');
        expect(fieldBox).not.toBeNull();
        expect(spentField.nextElementSibling).toBe(fieldBox);
        // P3-3: No doubled "Warning: WARNING:" prefix in warning header.
        const fieldHeader = fieldBox!.querySelector('.formspec-warning-explanation-header')?.textContent ?? '';
        expect(fieldHeader).not.toMatch(/warning:\s*warning:/i);
        expect(fieldHeader).toContain('Spent exceeds allocated amount.');

        // P2-2: Button uses design-system class instead of raw unstyled button.
        const saveBtn = fieldBox!.querySelector<HTMLButtonElement>('button.formspec-warning-explanation-action.formspec-button-secondary');
        expect(saveBtn).not.toBeNull();

        // P1-8: Form-level warning explanation lives inside .formspec-workspace__content ABOVE Previous/Next and footer Submit.
        const contentCol = host.querySelector<HTMLElement>('.formspec-workspace__content')!;
        const formWarningBox = contentCol.querySelector<HTMLElement>('.formspec-warning-explanation[role="region"][data-shape-id="formSummaryWarn"]');
        expect(formWarningBox).not.toBeNull();
        const formHeader = formWarningBox!.querySelector('.formspec-warning-explanation-header')?.textContent ?? '';
        expect(formHeader).not.toMatch(/warning:\s*warning:/i);
        expect(formHeader).toContain('Summary note is blank.');

        const navFooter = contentCol.querySelector<HTMLElement>('.formspec-workspace__previous-next')!;
        expect(formWarningBox!.compareDocumentPosition(navFooter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // Findings rail starts with 2 unresolved warnings and zero doubled prefixes.
        const findingsRail = host.querySelector<HTMLElement>('.formspec-workspace__findings')!;
        expect(findingsRail.textContent).not.toMatch(/warning:\s*warning:/i);
        const sectionABadgeBefore = host.querySelector('.formspec-workspace__navigation nav [data-current="true"] .formspec-workspace__section-badge--check')?.textContent;
        expect(sectionABadgeBefore).toBe('1');
        expect(findingsRail.textContent).toContain('2 to check');

        // Enter explanation and click "Use explanation".
        const textarea = fieldBox!.querySelector<HTMLTextAreaElement>('textarea')!;
        act(() => {
            setControlValue(textarea, 'Approved carry-forward covered the additional spending.');
        });
        act(() => {
            saveBtn!.click();
        });

        // Section A badge decrements (removed once count hits 0) and Findings marks the card explained.
        expect(host.querySelector('.formspec-workspace__navigation nav [data-current="true"] .formspec-workspace__section-badge--check')).toBeNull();
        expect(findingsRail.textContent).toContain('1 to check');
        const explainedFinding = findingsRail.querySelector('[data-explained="true"]');
        expect(explainedFinding).not.toBeNull();
        expect(explainedFinding?.textContent).toContain('Explained');
    });
});

describe('Repeater ergonomics: concise headers, compact outline Remove, seedFrom lock, confirmation/undo, and editable focus', () => {
    const longPrompt = 'List every regional partner organization that participated in delivering core program services during the reporting cycle, including site names and activity notes.';

    it('renders long prompts once in sentence case, uses concise row headers and compact outline Remove, confirms non-empty deletion with Undo, and focuses the first editable field on Add/Remove', async () => {
        const def: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:repeater-polish',
            version: '1.0.0',
            title: 'Partner Directory',
            items: [
                {
                    key: 'partners',
                    type: 'group',
                    label: longPrompt,
                    repeatable: true,
                    minRepeat: 1,
                    children: [
                        { key: 'rowCode', type: 'field', dataType: 'string', label: 'Code' },
                        { key: 'partnerName', type: 'field', dataType: 'string', label: 'Partner name' },
                        { key: 'notes', type: 'field', dataType: 'string', label: 'Notes' },
                    ],
                },
            ],
            binds: [
                { path: 'partners.rowCode', readonly: 'true', calculate: '"AUTO"' },
            ],
        };

        const engine = createFormEngine(def);
        const host = actRender(<FormspecForm engine={engine} />);

        // Prompt appears once as a normal heading (not repeated inside every Remove button).
        const heading = host.querySelector<HTMLElement>('.formspec-repeat-heading');
        expect(heading?.textContent).toBe(longPrompt);

        // Add a second row: focus must skip readOnly `rowCode` and land on editable `partnerName`.
        const addBtn = host.querySelector<HTMLButtonElement>('.formspec-repeat-add')!;
        act(() => addBtn.click());
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        expect(engine.repeats.partners.value).toBe(2);
        const row2Name = host.querySelector<HTMLInputElement>('[data-name="partners[1].partnerName"] input')!;
        expect(document.activeElement).toBe(row2Name);

        // Read-only input is excluded from sequential Tab order.
        const row1Code = host.querySelector<HTMLInputElement>('[data-name="partners[0].rowCode"] input')!;
        expect(row1Code.readOnly).toBe(true);
        expect(row1Code.tabIndex).toBe(-1);

        // Enter a value in row 2 and check concise header + compact outline Remove button.
        act(() => setControlValue(row2Name, 'North Valley Center'));
        const labels = Array.from(host.querySelectorAll('.formspec-repeat-instance-label')).map(n => n.textContent);
        expect(labels[1]).toContain('Item 2');
        expect(labels[1]).toContain('North Valley Center');

        const removeButtons = host.querySelectorAll<HTMLButtonElement>('.formspec-repeat-remove');
        expect(removeButtons).toHaveLength(2);
        expect(removeButtons[1].textContent).toBe('Remove');
        expect(removeButtons[1].className).not.toContain('formspec-button-danger');

        // Removing a non-empty row asks for inline confirmation first; Escape cancels.
        act(() => removeButtons[1].click());
        expect(engine.repeats.partners.value).toBe(2);
        const confirmBar = host.querySelector<HTMLElement>('.formspec-repeat-confirm');
        expect(confirmBar).not.toBeNull();
        act(() => {
            confirmBar!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(host.querySelector('.formspec-repeat-confirm')).toBeNull();
        expect(engine.repeats.partners.value).toBe(2);

        // Confirm removal -> row removed, focus skips readOnly field to editable field, Undo restores values.
        act(() => host.querySelectorAll<HTMLButtonElement>('.formspec-repeat-remove')[1].click());
        const confirmRemoveBtn = host.querySelector<HTMLButtonElement>('.formspec-repeat-confirm-yes')!;
        act(() => confirmRemoveBtn.click());
        await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
        expect(engine.repeats.partners.value).toBe(1);
        const row1Name = host.querySelector<HTMLInputElement>('[data-name="partners[0].partnerName"] input')!;
        expect(document.activeElement).toBe(row1Name);

        const undoBtn = host.querySelector<HTMLButtonElement>('.formspec-repeat-undo-button')!;
        expect(undoBtn).not.toBeNull();
        act(() => undoBtn.click());
        expect(engine.repeats.partners.value).toBe(2);
        expect(engine.signals['partners[1].partnerName'].value).toBe('North Valley Center');
    });

    it('protects upstream seedFrom carried rows from removal while allowing newly added rows to be removed', () => {
        const seededDef: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:seeded-repeat',
            version: '1.0.0',
            title: 'Carry-over Register',
            instances: {
                roster: {
                    data: {
                        entries: [
                            { entityName: 'Alpha Org' },
                            { entityName: 'Beta Org' },
                        ],
                    },
                },
            },
            items: [
                {
                    key: 'entries',
                    type: 'group',
                    label: 'Organizations',
                    repeatable: true,
                    minRepeat: 1,
                    seedFrom: { instance: 'roster', path: 'entries' },
                    children: [
                        {
                            key: 'entityName',
                            type: 'field',
                            dataType: 'string',
                            label: 'Organization',
                            prePopulate: { instance: 'roster', path: 'entityName', editable: false },
                        },
                        {
                            key: 'statusNote',
                            type: 'field',
                            dataType: 'string',
                            label: 'Status note',
                        },
                    ],
                },
            ],
        } as FormDefinition;

        const engine = createFormEngine(seededDef);
        const host = actRender(<FormspecForm engine={engine} />);

        // Carried rows (indices 0 & 1) have no Remove button by default.
        expect(engine.repeats.entries.value).toBe(2);
        expect(host.querySelectorAll('.formspec-repeat-remove')).toHaveLength(0);

        // Adding a 3rd row exposes Remove ONLY for the newly added row (index 2).
        act(() => host.querySelector<HTMLButtonElement>('.formspec-repeat-add')!.click());
        expect(engine.repeats.entries.value).toBe(3);
        const removeBtns = host.querySelectorAll<HTMLButtonElement>('.formspec-repeat-remove');
        expect(removeBtns).toHaveLength(1);
        expect(removeBtns[0].closest('.formspec-repeat-instance')?.getAttribute('data-repeat-path')).toBe('entries[2]');
    });
});

describe('Scalar auto-grid, inline Shape errors, wheel guard, and workspace navigation polish', () => {
    it('renders compact scalar row groups with .formspec-auto-grid and highlights field and group Shape errors inline', () => {
        const def: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:grid-and-shape-errors',
            version: '1.0.0',
            title: 'Outcome Metrics',
            items: [
                {
                    key: 'indicator',
                    type: 'group',
                    label: 'Indicator Row',
                    children: [
                        { key: 'baseline', type: 'field', dataType: 'integer', label: 'I. Baseline' },
                        { key: 'target', type: 'field', dataType: 'integer', label: 'II. Target' },
                        { key: 'actual', type: 'field', dataType: 'integer', label: 'III. Actual' },
                        { key: 'percent', type: 'field', dataType: 'decimal', label: 'IV. % Achieved' },
                        { key: 'comment', type: 'field', dataType: 'text', label: 'Commentary' },
                    ],
                },
            ],
            shapes: [
                {
                    id: 'actualCheck',
                    target: 'indicator.actual',
                    severity: 'error',
                    code: 'ACTUAL_LIMIT',
                    constraint: '$indicator.actual <= $indicator.baseline',
                    message: 'Actual cannot exceed baseline.',
                },
                {
                    id: 'groupCheck',
                    target: 'indicator',
                    severity: 'error',
                    code: 'GROUP_BALANCE',
                    constraint: '$indicator.target <= $indicator.baseline',
                    message: 'Target must not exceed baseline.',
                },
            ],
        };

        const engine = createFormEngine(def);
        act(() => {
            engine.setValue('indicator.baseline', 10);
            engine.setValue('indicator.target', 20);
            engine.setValue('indicator.actual', 25);
        });

        const host = actRender(<FormspecForm engine={engine} />);

        // P1-6: Scalar auto-grid applied to group with 4 columns and full-width narrative sibling.
        const gridGroup = host.querySelector<HTMLElement>('.formspec-auto-grid[data-auto-grid="4"]');
        expect(gridGroup).not.toBeNull();
        expect(host.querySelector('[data-name="indicator.comment"]')?.className).toContain('formspec-auto-grid-full');

        // P1-9: Field-targeting Shape error sets invalid class, aria-invalid, and inline error message.
        const actualField = host.querySelector<HTMLElement>('[data-name="indicator.actual"]')!;
        expect(actualField.className).toContain('formspec-field--invalid');
        expect(actualField.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
        expect(actualField.querySelector('.formspec-error')?.textContent).toContain('Actual cannot exceed baseline.');

        // P1-9: Group-targeting Shape error marks group invalid and shows .formspec-group-errors inline.
        const groupContainer = host.querySelector<HTMLElement>('[data-group-path="indicator"]')!;
        expect(groupContainer.getAttribute('data-invalid')).toBe('true');
        expect(groupContainer.querySelector('.formspec-group-errors')?.textContent).toContain('Target must not exceed baseline.');

        // P2-7: Wheel event on focused numeric input blurs to prevent accidental value mutation.
        const baselineInput = host.querySelector<HTMLInputElement>('[data-name="indicator.baseline"] input')!;
        baselineInput.focus();
        expect(document.activeElement).toBe(baselineInput);
        act(() => {
            baselineInput.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
        });
        expect(document.activeElement).not.toBe(baselineInput);
    });

    it('puts SEARCH QUESTIONS at the top of the left rail, omits the left rail on single-section workspaces, hides non-relevant top-level sections, and renders mobile section/findings toggles', () => {
        const multiDef: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:workspace-nav',
            version: '1.0.0',
            title: 'Multi-Section Workspace',
            formPresentation: { pageMode: 'workspace' },
            items: [
                { key: 'secOne', type: 'group', label: 'Section One', children: [{ key: 'a', type: 'field', dataType: 'string', label: 'Field A' }] },
                { key: 'hiddenMeta', type: 'group', label: 'Hidden Metadata', children: [{ key: 'm', type: 'field', dataType: 'string', label: 'Meta' }] },
                { key: 'secTwo', type: 'group', label: 'Section Two', children: [{ key: 'b', type: 'field', dataType: 'string', label: 'Field B' }] },
            ],
            binds: [
                { path: 'hiddenMeta', relevant: 'false' },
            ],
        };

        const engine = createFormEngine(multiDef);
        const host = actRender(<FormspecForm engine={engine} />);

        // Peer #169: Non-relevant top-level section is hidden from section rail and Previous/Next.
        const navButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('.formspec-workspace__navigation nav button'));
        expect(navButtons.map(b => b.textContent)).toEqual(['Section One', 'Section Two']);

        // P1-12: SEARCH QUESTIONS appears BEFORE the <nav> list inside the left rail.
        const navAside = host.querySelector<HTMLElement>('.formspec-workspace__navigation')!;
        const searchBox = navAside.querySelector<HTMLElement>('.formspec-workspace__search')!;
        const navEl = navAside.querySelector<HTMLElement>('nav')!;
        expect(searchBox.compareDocumentPosition(navEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        // P1-5: Mobile section toggle & top Findings bar exist.
        expect(host.querySelector('.formspec-workspace__nav-toggle')).not.toBeNull();
        expect(host.querySelector('.formspec-workspace__mobile-findings-bar')).not.toBeNull();

        // P3-3: Single-section workspace omits the 260px left section rail.
        const singleDef: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:single-section',
            version: '1.0.0',
            title: 'Single Section Filing',
            formPresentation: { pageMode: 'workspace' },
            items: [
                { key: 'only', type: 'group', label: 'Only Section', children: [{ key: 'x', type: 'field', dataType: 'string', label: 'X' }] },
            ],
        };
        const singleHost = actRender(<FormspecForm engine={createFormEngine(singleDef)} />);
        expect(singleHost.querySelector('.formspec-workspace')?.getAttribute('data-single-section')).toBe('true');
        expect(singleHost.querySelector('.formspec-workspace__navigation')).toBeNull();
    });

    it('enforces key visual & accessibility CSS invariants in bundled layout stylesheets', () => {
        const layoutDist = path.resolve(__dirname, '../../formspec-layout/dist');
        const defaultCss = fs.readFileSync(path.join(layoutDist, 'formspec-default.css'), 'utf8');
        const layoutCss = fs.readFileSync(path.join(layoutDist, 'formspec-layout.css'), 'utf8');

        // P2-7: No dotted underline under required asterisk.
        expect(defaultCss).toMatch(/\.formspec-required\s*\{[^}]*text-decoration:\s*none/);
        // P0-4: Repeat instance label is not forced ALL-CAPS.
        const instanceLabelMatch = defaultCss.match(/\.formspec-repeat-instance-label\s*\{([^}]*)\}/);
        expect(instanceLabelMatch).not.toBeNull();
        expect(instanceLabelMatch![1]).not.toMatch(/text-transform:\s*uppercase/);
        // P1-12 & P2-3: Scroll margin and no horizontal scrollbar on Findings rail.
        expect(defaultCss).toContain('scroll-margin-top:');
        expect(defaultCss).toMatch(/\.formspec-workspace__findings\s*\{[^}]*overflow-x:\s*hidden/);
        // P1-5: 3-column workspace threshold raised past 900px (62rem).
        expect(layoutCss).toContain('@container formspec-workspace (width > 62rem)');
        // P2-1: Dark-mode checkbox border contrast rules scoped to compound appearance class.
        expect(defaultCss).toContain('.formspec-container.formspec-appearance-dark :is(');
        expect(defaultCss).toContain('--formspec-default-checkbox-border');
        // P1-6 alignment: negative error hang excludes .formspec-auto-grid so last column aligns cleanly.
        expect(defaultCss).toContain(':not([style*="gap"]):not(.formspec-auto-grid)');
    });

    it('transitions ValidationSummary warning header smoothly 2 -> 1 -> resolved without jumping back up', () => {
        const def: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:summary-progression',
            version: '1.0.0',
            title: 'Summary Progression',
            items: [
                { key: 'a', type: 'field', dataType: 'integer', label: 'A' },
                { key: 'b', type: 'field', dataType: 'integer', label: 'B' },
            ],
            shapes: [
                { id: 'w1', target: 'a', severity: 'warning', code: 'W1', constraint: '$a <= 10', message: 'A is high.', explanation: 'explain' },
                { id: 'w2', target: 'b', severity: 'warning', code: 'W2', constraint: '$b <= 10', message: 'B is high.', explanation: 'explain' },
            ],
        };
        const engine = createFormEngine(def);
        act(() => {
            engine.setValue('a', 20);
            engine.setValue('b', 30);
        });
        const fullHost = actRender(
            <FormspecForm
                engine={engine}
                componentDocument={{
                    $formspecComponent: '1.0',
                    version: '1.0.0',
                    targetDefinition: { url: def.url },
                    tree: {
                        component: 'Stack',
                        children: [
                            { component: 'ValidationSummary', source: 'live', mode: 'continuous' },
                            { component: 'NumberInput', bind: 'a' },
                            { component: 'NumberInput', bind: 'b' },
                        ],
                    },
                }}
            />,
        );
        const inputA = fullHost.querySelector<HTMLInputElement>('[data-name="a"] input')!;
        act(() => {
            inputA.focus();
            inputA.blur();
            inputA.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
        });

        const title = () => fullHost.querySelector('.formspec-validation-summary-title')?.textContent ?? '';
        const summaryEl = () => fullHost.querySelector('.formspec-validation-summary');
        expect(title()).toContain('2');
        expect(summaryEl()?.getAttribute('data-all-explained')).toBeNull();

        act(() => { engine.setExplanation('w1', 'a', { text: 'Expected peak for A.' }); });
        expect(title()).toBe('Please review this warning before continuing:');
        expect(summaryEl()?.getAttribute('data-all-explained')).toBeNull();

        act(() => { engine.setExplanation('w2', 'b', { text: 'Expected peak for B.' }); });
        expect(title()).toBe('All 2 warnings explained');
        expect(summaryEl()?.getAttribute('data-all-explained')).toBe('true');
    });

    it('renders nested group and nested repeat warnings inline on repeat instance [1]+ instead of routing to form root', () => {
        const def: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:nested-repeat-warnings',
            version: '1.0.0',
            title: 'Regional Affiliates',
            items: [
                {
                    key: 'entities',
                    type: 'group',
                    label: 'Affiliates',
                    repeatable: true,
                    minRepeat: 2,
                    children: [
                        {
                            key: 'contact',
                            type: 'group',
                            label: 'Contact details',
                            children: [
                                { key: 'phone', type: 'field', dataType: 'string', label: 'Phone' },
                            ],
                        },
                        {
                            key: 'offices',
                            type: 'group',
                            label: 'Offices',
                            repeatable: true,
                            minRepeat: 1,
                            children: [
                                { key: 'city', type: 'field', dataType: 'string', label: 'City' },
                            ],
                        },
                    ],
                },
            ],
            shapes: [
                {
                    id: 'contactWarn',
                    target: 'entities[*].contact',
                    severity: 'warning',
                    code: 'CONTACT_CHECK',
                    constraint: 'present($phone)',
                    message: 'Confirm missing contact phone.',
                    explanation: 'explain',
                },
                {
                    id: 'officeWarn',
                    target: 'entities[*].offices[*]',
                    severity: 'warning',
                    code: 'OFFICE_CHECK',
                    constraint: 'present($city)',
                    message: 'Confirm missing office city.',
                    explanation: 'explain',
                },
            ],
        };

        const engine = createFormEngine(def);
        act(() => {
            engine.setValue('entities[0].contact.phone', '555-0100');
            engine.setValue('entities[0].offices[0].city', 'Portland');
        });
        const host = actRender(<FormspecForm engine={engine} />);

        const contact1 = host.querySelector<HTMLElement>('[data-group-path="entities[1].contact"]')!;
        expect(contact1).not.toBeNull();
        expect(contact1.querySelector('[data-shape-id="contactWarn"]')).not.toBeNull();

        const office1 = host.querySelector<HTMLElement>('[data-repeat-path="entities[1].offices[0]"]')!;
        expect(office1).not.toBeNull();
        expect(office1.querySelector('[data-shape-id="officeWarn"]')).not.toBeNull();

        // Neither warning should have leaked to a duplicate root copy outside the target containers.
        expect(host.querySelectorAll('[data-shape-id="contactWarn"]')).toHaveLength(1);
        expect(host.querySelectorAll('[data-shape-id="officeWarn"]')).toHaveLength(1);
    });

    it('updates repeat card header live when string identifier follows numeric fields and keeps reloaded user-added rows removable on seedFrom repeaters', () => {
        const longLabel = 'Record every participating satellite site operating during the current fiscal cycle including capacity and site title.';
        const numericFirstDef: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:live-row-id',
            version: '1.0.0',
            title: 'Satellite Sites',
            items: [
                {
                    key: 'sites',
                    type: 'group',
                    label: longLabel,
                    repeatable: true,
                    minRepeat: 1,
                    children: [
                        { key: 'capacity', type: 'field', dataType: 'integer', label: 'Capacity' },
                        { key: 'openedOn', type: 'field', dataType: 'date', label: 'Opened' },
                        { key: 'siteName', type: 'field', dataType: 'string', label: 'Site name' },
                    ],
                },
            ],
        };
        const host1 = actRender(<FormspecForm engine={createFormEngine(numericFirstDef)} />);
        expect(host1.querySelector('.formspec-repeat-instance-label')?.textContent).toBe('Item 1');
        const siteNameInput = host1.querySelector<HTMLInputElement>('[data-name="sites[0].siteName"] input')!;
        act(() => setControlValue(siteNameInput, 'Harbor Annex'));
        expect(host1.querySelector('.formspec-repeat-instance-label')?.textContent).toBe('Item 1 — Harbor Annex');

        // Reloaded saved draft with 2 upstream seedFrom rows + 1 user-added row: only rows 0..1 stay locked!
        const reloadedSeededDef: FormDefinition = {
            $formspec: '1.0',
            url: 'urn:test:reloaded-seeded',
            version: '1.0.0',
            title: 'Reloaded Carry-over',
            instances: {
                roster: {
                    data: {
                        entries: [{ entityName: 'Alpha Org' }, { entityName: 'Beta Org' }],
                    },
                },
            },
            items: [
                {
                    key: 'entries',
                    type: 'group',
                    label: 'Organizations',
                    repeatable: true,
                    minRepeat: 0,
                    seedFrom: { instance: 'roster', path: 'entries' },
                    children: [
                        { key: 'entityName', type: 'field', dataType: 'string', label: 'Organization' },
                        { key: 'note', type: 'field', dataType: 'string', label: 'Note' },
                    ],
                },
            ],
        } as FormDefinition;

        const reloadedEngine = createFormEngine(reloadedSeededDef, {
            responseData: {
                entries: [
                    { entityName: 'Alpha Org', note: 'Carried 1' },
                    { entityName: 'Beta Org', note: 'Carried 2' },
                    { entityName: 'Gamma Org', note: 'User-added before reload' },
                ],
            },
        });
        const host2 = actRender(<FormspecForm engine={reloadedEngine} />);
        expect(reloadedEngine.repeats.entries.value).toBe(3);
        const removeBtns = host2.querySelectorAll<HTMLButtonElement>('.formspec-repeat-remove');
        expect(removeBtns).toHaveLength(1);
        expect(removeBtns[0].closest('.formspec-repeat-instance')?.getAttribute('data-repeat-path')).toBe('entries[2]');
    });
});
