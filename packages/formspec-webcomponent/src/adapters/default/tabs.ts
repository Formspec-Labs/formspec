/** @filedesc Default adapter for Tabs — reproduces current DOM structure. */
import type { TabsBehavior } from '../../behaviors/types';
import type { AdapterRenderFn } from '../types';

export const renderTabs: AdapterRenderFn<TabsBehavior> = (
    behavior, parent, actx
) => {
    const el = document.createElement('div');
    if (behavior.id) el.id = behavior.id;
    el.className = 'formspec-tabs';
    if (behavior.placement !== 'top') el.dataset.placement = behavior.placement;
    if (behavior.compOverrides.cssClass) actx.applyCssClass(el, behavior.compOverrides);
    if (behavior.compOverrides.accessibility) actx.applyAccessibility(el, behavior.compOverrides);
    if (behavior.compOverrides.style) actx.applyStyle(el, behavior.compOverrides.style);
    parent.appendChild(el);

    const count = behavior.tabCount;

    const idBase = behavior.id || 'tabs';

    // Tab bar
    const tabBar = document.createElement('div');
    tabBar.className = 'formspec-tab-bar';
    tabBar.setAttribute('role', 'tablist');
    if (behavior.placement === 'left' || behavior.placement === 'right') {
        tabBar.setAttribute('aria-orientation', 'vertical');
    }

    // Panel container
    const panelContainer = document.createElement('div');
    panelContainer.className = 'formspec-tab-panels';

    // Tab panels
    const panels: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
        const panel = document.createElement('div');
        panel.className = 'formspec-tab-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.id = `${idBase}-panel-${i}`;
        panel.setAttribute('aria-labelledby', `${idBase}-tab-${i}`);
        panel.setAttribute('tabindex', '0');
        if (i !== behavior.defaultTab) panel.classList.add('formspec-hidden');
        behavior.renderTab(i, panel);
        panelContainer.appendChild(panel);
        panels.push(panel);
    }

    // Tab buttons
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < count; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'formspec-tab formspec-focus-ring';
        btn.textContent = behavior.tabLabels[i] || `Tab ${i + 1}`;
        btn.setAttribute('role', 'tab');
        btn.id = `${idBase}-tab-${i}`;
        btn.setAttribute('aria-controls', `${idBase}-panel-${i}`);
        btn.setAttribute('aria-selected', i === behavior.defaultTab ? 'true' : 'false');
        btn.setAttribute('tabindex', i === behavior.defaultTab ? '0' : '-1');
        tabBar.appendChild(btn);
        buttons.push(btn);
    }

    // Position: bottom puts panels before bar
    if (behavior.placement === 'bottom') {
        el.appendChild(panelContainer);
        el.appendChild(tabBar);
    } else {
        el.appendChild(tabBar);
        el.appendChild(panelContainer);
    }

    // Bind behavior
    const dispose = behavior.bind({
        root: el,
        tabBar,
        panels,
        buttons,
    });
    actx.onDispose(dispose);
};
