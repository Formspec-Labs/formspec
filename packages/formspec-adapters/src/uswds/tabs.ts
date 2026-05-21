/** @filedesc USWDS v3 adapter for Tabs — usa-button-group segmented tab bar. */
import type { TabsBehavior, AdapterRenderFn } from '@formspec-org/webcomponent';

export const renderTabs: AdapterRenderFn<TabsBehavior> = (
    behavior, parent, actx
) => {
    const root = document.createElement('div');
    if (behavior.id) root.id = behavior.id;
    root.className = 'formspec-tabs';
    if (behavior.placement !== 'top') root.dataset.placement = behavior.placement;
    if (behavior.compOverrides.cssClass) actx.applyCssClass(root, behavior.compOverrides);
    if (behavior.compOverrides.accessibility) actx.applyAccessibility(root, behavior.compOverrides);
    if (behavior.compOverrides.style) actx.applyStyle(root, behavior.compOverrides.style);
    parent.appendChild(root);

    const count = behavior.tabCount;
    const idBase = behavior.id || 'tabs';

    // Tab bar — USWDS segmented button group
    const tabBar = document.createElement('ul');
    tabBar.className = 'usa-button-group usa-button-group--segmented';
    tabBar.setAttribute('role', 'tablist');
    if (behavior.placement === 'left' || behavior.placement === 'right') {
        tabBar.setAttribute('aria-orientation', 'vertical');
    }

    // Tab panels
    const panelContainer = document.createElement('div');
    panelContainer.className = 'formspec-tab-panels';

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

    // Tab buttons inside button-group items
    const buttons: HTMLButtonElement[] = [];
    for (let i = 0; i < count; i++) {
        const li = document.createElement('li');
        li.className = 'usa-button-group__item';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.id = `${idBase}-tab-${i}`;
        btn.setAttribute('aria-controls', `${idBase}-panel-${i}`);
        btn.setAttribute('aria-selected', i === behavior.defaultTab ? 'true' : 'false');
        btn.setAttribute('tabindex', i === behavior.defaultTab ? '0' : '-1');
        btn.textContent = behavior.tabLabels[i] || `Tab ${i + 1}`;
        // Active tab: filled button; inactive: outline
        btn.className = i === behavior.defaultTab
            ? 'usa-button'
            : 'usa-button usa-button--outline';

        li.appendChild(btn);
        tabBar.appendChild(li);
        buttons.push(btn);
    }

    // Sync USWDS button styling with active tab
    const updateButtonStyles = (activeIdx: number) => {
        for (let i = 0; i < buttons.length; i++) {
            buttons[i].className = i === activeIdx
                ? 'usa-button'
                : 'usa-button usa-button--outline';
        }
    };

    // Position: bottom puts panels before bar
    if (behavior.placement === 'bottom') {
        root.appendChild(panelContainer);
        root.appendChild(tabBar);
    } else {
        root.appendChild(tabBar);
        root.appendChild(panelContainer);
    }

    // Bind behavior — bind() manages panel visibility and active tab state
    const dispose = behavior.bind({
        root, tabBar, panels, buttons,
        onTabChange: (tabIndex) => updateButtonStyles(tabIndex),
    });
    actx.onDispose(dispose);
};
