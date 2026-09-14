/** @filedesc Interactive component plugins: Tabs and ActionButton. */
import { computed, effect, type ReadonlySignal } from '@preact/signals-core';
import { ComponentPlugin, RenderContext } from '../types';
import { useTabs } from '../behaviors/tabs';
import { globalRegistry } from '../registry';
import { compText } from './layout-plugin-factory';

/**
 * ActionButton label wrappers (`{ literal }` or a Locale `{ ref }`; plain strings tolerated in tests) as a signal
 * that follows the active locale.
 */
function actionButtonText(ctx: RenderContext, comp: any, prop: string, fallback: string): ReadonlySignal<string> {
    const value = comp[prop];
    if (value && typeof value === 'object' && typeof value.ref === 'string') {
        return computed(() => {
            ctx.engine.localeSignal.value;
            return ctx.engine.resolveLocaleString(value.ref, fallback);
        });
    }
    const inline = value && typeof value === 'object' && typeof value.literal === 'string'
        ? value.literal
        : typeof value === 'string' ? value : fallback;
    return compText(ctx, comp, prop, inline);
}

function actionRefFor(comp: any): string {
    return typeof comp.actionRef === 'string' ? comp.actionRef : '';
}

/** Renders a tabbed interface via the behavior-adapter pipeline. */
export const TabsPlugin: ComponentPlugin = {
    type: 'Tabs',
    render: (comp: any, parent: HTMLElement, ctx: RenderContext) => {
        const behavior = useTabs(ctx.behaviorContext, comp);
        const adapterFn = globalRegistry.resolveAdapterFn('Tabs');
        if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);
    }
};

/** Renders an action button by resolving actionRef through the host Action registry. */
export const ActionButtonPlugin: ComponentPlugin = {
    type: 'ActionButton',
    render: (comp: any, parent: HTMLElement, ctx: RenderContext) => {
        const actionRef = actionRefFor(comp);
        const actionResolved = ctx.resolveActionRef(actionRef, comp.id).resolved;
        const adapterFn = globalRegistry.resolveAdapterFn('ActionButton');
        if (adapterFn) {
            const defaultLabel = actionButtonText(ctx, comp, 'label', 'Submit');
            const pendingLabel = actionButtonText(ctx, comp, 'pendingLabel', 'Submitting\u2026');
            const disableWhenPending = comp.disableWhenPending !== false;
            adapterFn({
                id: comp.id,
                compOverrides: comp,
                defaultLabel: defaultLabel.peek(),
                pendingLabel: pendingLabel.peek(),
                disableWhenPending,
                bind: (refs: { root: HTMLButtonElement }) => {
                    const button = refs.root;
                    const disposeEffect = effect(() => {
                        const pending = ctx.submitPendingSignal.value;
                        button.textContent = pending ? pendingLabel.value : defaultLabel.value;
                        button.disabled = !actionResolved || (disableWhenPending ? pending : false);
                    });
                    const handleClick = () => {
                        void ctx.invokeAction(actionRef, comp.id);
                    };
                    button.addEventListener('click', handleClick);
                    return () => {
                        disposeEffect();
                        button.removeEventListener('click', handleClick);
                    };
                },
            }, parent, ctx.adapterContext);
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'formspec-action formspec-submit formspec-focus-ring';
        if (comp.id) button.id = comp.id;
        const defaultLabel = actionButtonText(ctx, comp, 'label', 'Submit');
        const pendingLabel = actionButtonText(ctx, comp, 'pendingLabel', 'Submitting\u2026');
        const disableWhenPending = comp.disableWhenPending !== false;
        button.disabled = !actionResolved;
        ctx.applyCssClass(button, comp);
        ctx.applyAccessibility(button, comp);
        ctx.applyStyle(button, comp.style);
        ctx.cleanupFns.push(effect(() => {
            const pending = ctx.submitPendingSignal.value;
            button.textContent = pending ? pendingLabel.value : defaultLabel.value;
            button.disabled = !actionResolved || (disableWhenPending ? pending : false);
        }));
        button.addEventListener('click', () => {
            void ctx.invokeAction(actionRef, comp.id);
        });
        parent.appendChild(button);
    },
};
