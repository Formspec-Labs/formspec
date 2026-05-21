/** @filedesc Verify default wizard adapter is signal-free per ADR 0046. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { minimalComponentDoc } from '../helpers/engine-fixtures';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

function renderWizard(tree: any) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    // Convert Wizard tree to Stack + Pages + pageMode: 'wizard'
    const children = tree.children || [];
    el.componentDocument = minimalComponentDoc({
        component: 'Stack',
        children: children.map((c: any) => c.component === 'Section' ? c : { component: 'Section', children: [c] }),
    });
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test',
        items: [],
        formPresentation: {
            pageMode: 'wizard',
            ...(tree.sidenav !== undefined ? { sidenav: tree.sidenav } : {}),
            ...(tree.showProgress !== undefined ? { showProgress: tree.showProgress } : {}),
            ...(tree.allowSkip !== undefined ? { allowSkip: tree.allowSkip } : {}),
        },
    };
    el.render();
    return el;
}

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
});

describe('Default wizard adapter — ADR 0046 compliance', () => {
    it('does not import @preact/signals-core', () => {
        const adapterPath = resolve(__dirname, '../../src/adapters/default/wizard.ts');
        const source = readFileSync(adapterPath, 'utf-8');
        expect(source).not.toContain('@preact/signals-core');
        expect(source).not.toMatch(/\bsignal\s*\(/);
        expect(source).not.toMatch(/\beffect\s*\(/);
    });
});

describe('Wizard bind() manages panel visibility', () => {
    it('bind() toggles panels on step change', () => {
        const el = renderWizard({
            component: 'Wizard',
            children: [
                { component: 'Text', text: 'Step 1' },
                { component: 'Text', text: 'Step 2' },
                { component: 'Text', text: 'Step 3' },
            ],
        });
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click();

        const panels = el.querySelectorAll('.formspec-wizard-panel');
        expect(panels[0].classList.contains('formspec-hidden')).toBe(true);
        expect(panels[1].classList.contains('formspec-hidden')).toBe(false);
        expect(panels[2].classList.contains('formspec-hidden')).toBe(true);
    });
});

describe('Wizard bind() manages sidenav updates', () => {
    it('sidenav items update active/completed classes on step change', () => {
        const el = renderWizard({
            component: 'Wizard',
            sidenav: true,
            children: [
                { component: 'Section', title: 'Step 1', children: [{ component: 'Text', text: 'A' }] },
                { component: 'Section', title: 'Step 2', children: [{ component: 'Text', text: 'B' }] },
                { component: 'Section', title: 'Step 3', children: [{ component: 'Text', text: 'C' }] },
            ],
        });
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click(); // go to step 2

        const items = el.querySelectorAll('.formspec-wizard-sidenav-item');
        expect(items[0].classList.contains('formspec-wizard-sidenav-item--completed')).toBe(true);
        expect(items[1].classList.contains('formspec-wizard-sidenav-item--active')).toBe(true);
        expect(items[2].classList.contains('formspec-wizard-sidenav-item--active')).toBe(false);
    });

    it('sidenav step circles show checkmark for completed steps', () => {
        const el = renderWizard({
            component: 'Wizard',
            sidenav: true,
            children: [
                { component: 'Section', title: 'Step 1', children: [{ component: 'Text', text: 'A' }] },
                { component: 'Section', title: 'Step 2', children: [{ component: 'Text', text: 'B' }] },
            ],
        });
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click();

        const circles = el.querySelectorAll('.formspec-wizard-sidenav-step');
        expect(circles[0].textContent).toBe('\u2713');
        expect(circles[1].textContent).toBe('2');
    });

    it('sidenav aria-current updates on step change', () => {
        const el = renderWizard({
            component: 'Wizard',
            sidenav: true,
            children: [
                { component: 'Section', title: 'Step 1', children: [{ component: 'Text', text: 'A' }] },
                { component: 'Section', title: 'Step 2', children: [{ component: 'Text', text: 'B' }] },
            ],
        });
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        const sidenavBtns = el.querySelectorAll('.formspec-wizard-sidenav-btn');
        expect(sidenavBtns[0].getAttribute('aria-current')).toBe('step');
        expect(sidenavBtns[1].getAttribute('aria-current')).toBe('false');

        nextBtn.click();

        expect(sidenavBtns[0].getAttribute('aria-current')).toBe('false');
        expect(sidenavBtns[1].getAttribute('aria-current')).toBe('step');
    });
});

describe('Wizard bind() manages progress bar updates', () => {
    it('progress indicators update active/completed classes on step change', () => {
        const el = renderWizard({
            component: 'Wizard',
            sidenav: false,
            showProgress: true,
            children: [
                { component: 'Text', text: 'Step 1' },
                { component: 'Text', text: 'Step 2' },
                { component: 'Text', text: 'Step 3' },
            ],
        });
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        nextBtn.click(); // go to step 2

        const indicators = el.querySelectorAll('.formspec-wizard-step');
        expect(indicators[0].classList.contains('formspec-wizard-step--completed')).toBe(true);
        expect(indicators[1].classList.contains('formspec-wizard-step--active')).toBe(true);
        expect(indicators[2].classList.contains('formspec-wizard-step--active')).toBe(false);
        expect(indicators[2].classList.contains('formspec-wizard-step--completed')).toBe(false);
    });
});

describe('Wizard bind() manages skip button visibility', () => {
    it('skip button hidden on last step', () => {
        const el = renderWizard({
            component: 'Wizard',
            allowSkip: true,
            children: [
                { component: 'Text', text: 'Step 1' },
                { component: 'Text', text: 'Step 2' },
            ],
        });
        const nextBtn = el.querySelector('.formspec-wizard-next') as HTMLButtonElement;
        const skipBtn = el.querySelector('.formspec-wizard-skip') as HTMLButtonElement;

        expect(skipBtn.classList.contains('formspec-hidden')).toBe(false);
        nextBtn.click(); // go to last step
        expect(skipBtn.classList.contains('formspec-hidden')).toBe(true);
    });
});

describe('Wizard sidenav collapse toggle is signal-free', () => {
    it('collapse toggle works without signals', () => {
        const el = renderWizard({
            component: 'Wizard',
            sidenav: true,
            children: [
                { component: 'Section', title: 'Step 1', children: [{ component: 'Text', text: 'A' }] },
                { component: 'Section', title: 'Step 2', children: [{ component: 'Text', text: 'B' }] },
            ],
        });
        const sidenav = el.querySelector('.formspec-wizard-sidenav') as HTMLElement;
        const toggleBtn = el.querySelector('.formspec-wizard-sidenav-toggle') as HTMLButtonElement;

        expect(sidenav.classList.contains('formspec-wizard-sidenav--collapsed')).toBe(false);
        toggleBtn.click();
        expect(sidenav.classList.contains('formspec-wizard-sidenav--collapsed')).toBe(true);
        toggleBtn.click();
        expect(sidenav.classList.contains('formspec-wizard-sidenav--collapsed')).toBe(false);
    });
});
