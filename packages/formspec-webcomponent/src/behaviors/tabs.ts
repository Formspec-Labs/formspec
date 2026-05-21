/** @filedesc Tabs behavior hook — manages tabbed interface state. */
import { signal } from '@preact/signals-core';
import { effect } from '@preact/signals-core';
import type { ComponentDescriptor } from '../hub-types.js';
import type { TabsBehavior, TabsRefs, BehaviorContext } from './types';

type TabsPlacement = 'top' | 'bottom' | 'left' | 'right';

type TabsComponentDescriptor = ComponentDescriptor & {
    children?: ComponentDescriptor[];
    tabLabels?: string[];
    placement?: TabsPlacement;
    defaultTab?: number;
};

function normalizeTabsPlacement(value: unknown): TabsPlacement {
    return value === 'bottom' || value === 'left' || value === 'right' ? value : 'top';
}

export function useTabs(ctx: BehaviorContext, comp: TabsComponentDescriptor): TabsBehavior {
    const children: ComponentDescriptor[] = comp.children || [];
    const tabLabels: string[] = comp.tabLabels || [];
    const placement = normalizeTabsPlacement(comp.placement);
    const defaultTab = comp.defaultTab || 0;
    const activeTabSignal = signal(defaultTab);

    const setActiveTab = (nextTab: number) => {
        const bounded = Math.max(0, Math.min(children.length - 1, Math.trunc(nextTab)));
        activeTabSignal.value = bounded;
    };

    return {
        id: comp.id,
        compOverrides: {
            cssClass: comp.cssClass,
            style: comp.style,
            accessibility: comp.accessibility,
        },
        tabLabels,
        tabCount: children.length,
        placement,
        defaultTab,

        activeTab(): number {
            return activeTabSignal.value;
        },

        setActiveTab,

        renderTab(index: number, parent: HTMLElement): void {
            ctx.renderComponent(children[index], parent, ctx.prefix);
        },

        bind(refs: TabsRefs): () => void {
            const disposers: Array<() => void> = [];
            const tabCount = refs.buttons.length;

            const activateTab = (index: number) => {
                setActiveTab(index);
                refs.buttons[activeTabSignal.value]?.focus();
            };

            // Reactive panel/button toggling + ARIA state
            disposers.push(effect(() => {
                const active = activeTabSignal.value;
                refs.panels.forEach((p, idx) => p.classList.toggle('formspec-hidden', idx !== active));
                refs.buttons.forEach((b, idx) => {
                    const isActive = idx === active;
                    b.classList.toggle('formspec-tab--active', isActive);
                    b.setAttribute('aria-selected', String(isActive));
                    b.setAttribute('tabindex', isActive ? '0' : '-1');
                });

                if (refs.onTabChange) {
                    refs.onTabChange(active);
                }
            }));

            // Wire button clicks
            refs.buttons.forEach((btn, i) => {
                btn.addEventListener('click', () => setActiveTab(i));
            });

            // Arrow key navigation (WAI-ARIA Tabs pattern)
            const onKeyDown = (event: KeyboardEvent) => {
                const active = activeTabSignal.value;
                let nextIndex: number | undefined;

                switch (event.key) {
                    case 'ArrowRight':
                    case 'ArrowDown':
                        nextIndex = (active + 1) % tabCount;
                        break;
                    case 'ArrowLeft':
                    case 'ArrowUp':
                        nextIndex = (active - 1 + tabCount) % tabCount;
                        break;
                    case 'Home':
                        nextIndex = 0;
                        break;
                    case 'End':
                        nextIndex = tabCount - 1;
                        break;
                }

                if (nextIndex !== undefined) {
                    event.preventDefault();
                    activateTab(nextIndex);
                }
            };
            refs.tabBar.addEventListener('keydown', onKeyDown);
            disposers.push(() => refs.tabBar.removeEventListener('keydown', onKeyDown));

            // formspec-tabs-set-active custom event
            const onSetActive = (event: Event) => {
                const customEvent = event as CustomEvent<{ index?: unknown }>;
                const requestedIndex = Number(customEvent.detail?.index);
                if (!Number.isFinite(requestedIndex)) return;
                setActiveTab(requestedIndex);
                event.stopPropagation();
            };
            refs.root.addEventListener('formspec-tabs-set-active', onSetActive as EventListener);
            disposers.push(() => {
                refs.root.removeEventListener('formspec-tabs-set-active', onSetActive as EventListener);
            });

            return () => disposers.forEach(d => d());
        },
    };
}
