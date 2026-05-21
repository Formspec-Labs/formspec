/** @filedesc Tests for WAI-ARIA Tabs pattern on the Tabs component. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

const items = [
    { key: 'name', type: 'field', dataType: 'string', label: 'Name' },
    { key: 'age', type: 'field', dataType: 'integer', label: 'Age' },
];

const tree = {
    component: 'Tabs',
    id: 'test-tabs',
    tabLabels: ['Personal', 'Details'],
    children: [
        { component: 'Section', children: [{ component: 'TextInput', bind: 'name' }] },
        { component: 'Section', children: [{ component: 'NumberInput', bind: 'age' }] },
    ],
};

function renderTabs() {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        tree,
    };
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test',
        items,
    };
    el.render();
    return el;
}

function renderTabsWithPlacement(placement: string) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.componentDocument = {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        tree: { ...tree, placement },
    };
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test',
        items,
    };
    el.render();
    return el;
}

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
});

describe('Tabs ARIA roles', () => {
    it('tab bar has role="tablist"', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('.formspec-tab-bar') as HTMLElement;
        expect(tabBar.getAttribute('role')).toBe('tablist');
    });

    it('left and right placements set vertical aria orientation', () => {
        for (const placement of ['left', 'right']) {
            const el = renderTabsWithPlacement(placement);
            const tabs = el.querySelector('.formspec-tabs') as HTMLElement;
            const tabBar = el.querySelector('.formspec-tab-bar') as HTMLElement;
            expect(tabs.dataset.placement).toBe(placement);
            expect(tabBar.getAttribute('aria-orientation')).toBe('vertical');
            el.remove();
        }
    });

    it('tab buttons have role="tab" and aria-controls linking to panel', () => {
        const el = renderTabs();
        const buttons = el.querySelectorAll('button.formspec-tab');
        expect(buttons.length).toBe(2);

        buttons.forEach((btn: Element, i: number) => {
            expect(btn.getAttribute('role')).toBe('tab');
            const controlsId = btn.getAttribute('aria-controls');
            expect(controlsId).toBe(`test-tabs-panel-${i}`);
            // The panel it points to must exist
            expect(el.querySelector(`#${controlsId}`)).not.toBeNull();
        });
    });

    it('tab buttons have unique ids', () => {
        const el = renderTabs();
        const buttons = el.querySelectorAll('button.formspec-tab');
        buttons.forEach((btn: Element, i: number) => {
            expect(btn.id).toBe(`test-tabs-tab-${i}`);
        });
    });

    it('panels have role="tabpanel", aria-labelledby, and tabindex="0"', () => {
        const el = renderTabs();
        const panels = el.querySelectorAll('.formspec-tab-panel');
        expect(panels.length).toBe(2);

        panels.forEach((panel: Element, i: number) => {
            expect(panel.getAttribute('role')).toBe('tabpanel');
            expect(panel.id).toBe(`test-tabs-panel-${i}`);
            expect(panel.getAttribute('aria-labelledby')).toBe(`test-tabs-tab-${i}`);
            expect(panel.getAttribute('tabindex')).toBe('0');
        });
    });
});

describe('Tabs aria-selected state', () => {
    it('only the default active tab has aria-selected="true"', () => {
        const el = renderTabs();
        const buttons = el.querySelectorAll('button.formspec-tab');
        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
        expect(buttons[1].getAttribute('aria-selected')).toBe('false');
    });

    it('clicking a tab updates aria-selected', () => {
        const el = renderTabs();
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        buttons[1].click();

        expect(buttons[0].getAttribute('aria-selected')).toBe('false');
        expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    });

    it('active tab has tabindex="0", inactive tabs have tabindex="-1"', () => {
        const el = renderTabs();
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        expect(buttons[0].getAttribute('tabindex')).toBe('0');
        expect(buttons[1].getAttribute('tabindex')).toBe('-1');

        buttons[1].click();

        expect(buttons[0].getAttribute('tabindex')).toBe('-1');
        expect(buttons[1].getAttribute('tabindex')).toBe('0');
    });
});

describe('Tabs keyboard navigation', () => {
    function pressKey(target: HTMLElement, key: string) {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }

    it('ArrowRight moves to next tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        pressKey(tabBar, 'ArrowRight');

        expect(buttons[0].getAttribute('aria-selected')).toBe('false');
        expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    });

    it('ArrowLeft wraps from first to last tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        pressKey(tabBar, 'ArrowLeft');

        expect(buttons[0].getAttribute('aria-selected')).toBe('false');
        expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    });

    it('ArrowRight wraps from last to first tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        // Move to last tab first
        buttons[1].click();
        expect(buttons[1].getAttribute('aria-selected')).toBe('true');

        pressKey(tabBar, 'ArrowRight');

        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
        expect(buttons[1].getAttribute('aria-selected')).toBe('false');
    });

    it('ArrowDown moves to next tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        pressKey(tabBar, 'ArrowDown');

        expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    });

    it('ArrowUp moves to previous tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        // Start on second tab
        buttons[1].click();

        pressKey(tabBar, 'ArrowUp');

        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    });

    it('Home activates first tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        // Start on second tab
        buttons[1].click();

        pressKey(tabBar, 'Home');

        expect(buttons[0].getAttribute('aria-selected')).toBe('true');
        expect(buttons[1].getAttribute('aria-selected')).toBe('false');
    });

    it('End activates last tab', () => {
        const el = renderTabs();
        const tabBar = el.querySelector('[role="tablist"]') as HTMLElement;
        const buttons = el.querySelectorAll('button.formspec-tab') as NodeListOf<HTMLButtonElement>;

        pressKey(tabBar, 'End');

        expect(buttons[0].getAttribute('aria-selected')).toBe('false');
        expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    });
});
