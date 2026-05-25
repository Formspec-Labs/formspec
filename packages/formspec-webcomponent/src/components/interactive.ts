/** @filedesc Interactive component plugins: Tabs and ActionButton. */
import { effect } from '@preact/signals-core';
import { ComponentPlugin, RenderContext } from '../types';
import { useTabs } from '../behaviors/tabs';
import { globalRegistry } from '../registry';

/** Resolve a component string via $component.<id>.<prop> locale key, falling back to inline. */
function resolveCompText(ctx: RenderContext, comp: any, prop: string, fallback: string): string {
    if (!comp.id) return fallback;
    return ctx.engine.resolveLocaleString(`$component.${comp.id}.${prop}`, fallback);
}

/** Resolve ActionButton label wrappers while tolerating legacy string values in tests. */
function resolveActionButtonText(ctx: RenderContext, comp: any, prop: string, fallback: string): string {
    const value = comp[prop];
    if (value && typeof value === 'object') {
        if (typeof value.literal === 'string') return resolveCompText(ctx, comp, prop, value.literal);
        if (typeof value.ref === 'string') return ctx.engine.resolveLocaleString(value.ref, fallback);
    }
    if (typeof value === 'string') return resolveCompText(ctx, comp, prop, value);
    return resolveCompText(ctx, comp, prop, fallback);
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
            const defaultLabel = resolveActionButtonText(ctx, comp, 'label', 'Submit');
            const pendingLabel = resolveActionButtonText(ctx, comp, 'pendingLabel', 'Submitting\u2026');
            const disableWhenPending = comp.disableWhenPending !== false;
            adapterFn({
                id: comp.id,
                compOverrides: comp,
                defaultLabel,
                pendingLabel,
                disableWhenPending,
                bind: (refs: { root: HTMLButtonElement }) => {
                    const button = refs.root;
                    const disposeEffect = effect(() => {
                        const pending = ctx.submitPendingSignal.value;
                        button.textContent = pending ? pendingLabel : defaultLabel;
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
        const defaultLabel = resolveActionButtonText(ctx, comp, 'label', 'Submit');
        const pendingLabel = resolveActionButtonText(ctx, comp, 'pendingLabel', 'Submitting\u2026');
        const disableWhenPending = comp.disableWhenPending !== false;
        button.textContent = defaultLabel;
        button.disabled = !actionResolved;
        ctx.applyCssClass(button, comp);
        ctx.applyAccessibility(button, comp);
        ctx.applyStyle(button, comp.style);
        ctx.cleanupFns.push(effect(() => {
            const pending = ctx.submitPendingSignal.value;
            button.textContent = pending ? pendingLabel : defaultLabel;
            button.disabled = !actionResolved || (disableWhenPending ? pending : false);
        }));
        button.addEventListener('click', () => {
            void ctx.invokeAction(actionRef, comp.id);
        });
        parent.appendChild(button);
    },
};
