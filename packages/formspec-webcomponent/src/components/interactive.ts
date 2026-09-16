/** @filedesc Interactive component plugins: Tabs and ActionButton. */
import { computed, effect, type ReadonlySignal } from '@preact/signals-core';
import { ComponentPlugin, RenderContext } from '../types';
import { useTabs } from '../behaviors/tabs';
import { globalRegistry } from '../registry';
import { compText } from './layout-plugin-factory';

/**
 * An ActionButton's text as a signal that follows the active locale. `value` is the label wrapper
 * (`{ literal }` or a Locale `{ ref }`; plain strings tolerated in tests) the caller resolved: the
 * component's own if it has one, else the Action's — the Response Actions spec makes `label`
 * presentational, and an injected button has no label of its own to carry.
 */
function actionButtonText(ctx: RenderContext, comp: any, prop: string, value: unknown, fallback: string): ReadonlySignal<string> {
    if (value && typeof value === 'object' && typeof (value as any).ref === 'string') {
        const ref = (value as any).ref as string;
        return computed(() => {
            ctx.engine.localeSignal.value;
            return ctx.engine.resolveLocaleString(ref, fallback);
        });
    }
    const inline = value && typeof value === 'object' && typeof (value as any).literal === 'string'
        ? (value as any).literal as string
        : typeof value === 'string' ? value : fallback;
    return compText(ctx, comp, prop, inline);
}

function actionRefFor(comp: any): string {
    return typeof comp.actionRef === 'string' ? comp.actionRef : '';
}

/**
 * A submit-intent ActionButton (assist-spec §8.2) is the opt-in tool-form's native submit button only where
 * clicking it is actually the respondent's next action: always outside a Wizard (single-page, tabs), only on
 * the Wizard's last step otherwise. That can't be read once at mount — a Wizard keeps every step's panel
 * mounted (CSS-hidden, not removed) once built, so this button — always the last step's — sits in the DOM the
 * whole time, and Chromium's implicit submission (Enter) clicks the first submit button in tree order even
 * while its panel is hidden (fs-8kpq). `formspec-page-change` (behaviors/wizard.ts) is the live signal: an
 * ancestor Wizard fires it on every step change, including once synchronously as this button mounts — before
 * the browser can act on the type this sets first.
 */
function bindNativeSubmitEligibility(button: HTMLButtonElement, cleanupFns: Array<() => void>): void {
    button.type = 'submit';
    const onPageChange = (event: Event) => {
        const { target } = event;
        if (!(target instanceof Node) || !target.contains(button)) return;
        const { index, total } = (event as CustomEvent<{ index: number; total: number }>).detail;
        button.type = index === total - 1 ? 'submit' : 'button';
    };
    document.addEventListener('formspec-page-change', onPageChange);
    cleanupFns.push(() => document.removeEventListener('formspec-page-change', onPageChange));
}

/** Renders a tabbed interface via the behavior-adapter pipeline. */
export const TabsPlugin: ComponentPlugin = {
    type: 'Tabs',
    render: (comp: any, parent: HTMLElement, ctx: RenderContext) => {
        const behavior = useTabs(ctx.behaviorContext, comp);
        const adapterFn = globalRegistry.resolveAdapterFn('Tabs', ctx.adapterName);
        if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);
    }
};

/** Renders an action button by resolving actionRef through the host Action registry. */
export const ActionButtonPlugin: ComponentPlugin = {
    type: 'ActionButton',
    render: (comp: any, parent: HTMLElement, ctx: RenderContext) => {
        const actionRef = actionRefFor(comp);
        const resolution = ctx.resolveActionRef(actionRef, comp.id);
        const actionResolved = resolution.resolved;
        const action = resolution.action as Record<string, unknown> | null;
        const labelSource = (prop: string) => comp[prop] ?? action?.[prop];
        const adapterFn = globalRegistry.resolveAdapterFn('ActionButton', ctx.adapterName);
        if (adapterFn) {
            const defaultLabel = actionButtonText(ctx, comp, 'label', labelSource('label'), 'Submit');
            const pendingLabel = actionButtonText(ctx, comp, 'pendingLabel', labelSource('pendingLabel'), 'Submitting\u2026');
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
        const defaultLabel = actionButtonText(ctx, comp, 'label', labelSource('label'), 'Submit');
        const pendingLabel = actionButtonText(ctx, comp, 'pendingLabel', labelSource('pendingLabel'), 'Submitting\u2026');
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
        // Assist spec §8.2: the tool form's only native submit button, where actionable — see
        // bindNativeSubmitEligibility. Default (no tool-name) rendering never reaches here: type stays "button".
        if (ctx.isDeclarativeToolForm && action?.intent === 'submit') {
            bindNativeSubmitEligibility(button, ctx.cleanupFns);
        }
        button.addEventListener('click', () => {
            // A native submit button's click also fires the form's `submit` event (the tool form's listener
            // runs the intent from there — createToolForm in element.ts); running it here too would run it twice.
            if (button.type === 'submit') return;
            void ctx.invokeAction(actionRef, comp.id);
        });
        parent.appendChild(button);
    },
};
