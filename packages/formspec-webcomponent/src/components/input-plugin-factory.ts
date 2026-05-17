/** @filedesc Factory for input component plugins (behavior hook → adapter render). */
import { ComponentPlugin, RenderContext } from '../types';
import { globalRegistry } from '../registry';
import type { BehaviorContext } from '../behaviors/types';
import type { FieldBehavior } from '../behaviors/types';

export type InputBehaviorHook = (ctx: BehaviorContext, comp: any) => FieldBehavior;

/** Builds a {@link ComponentPlugin} that runs `useBehavior` then the active adapter for `type`. */
export function makeInputPlugin(type: string, useBehavior: InputBehaviorHook): ComponentPlugin {
    return {
        type,
        render: (comp: any, parent: HTMLElement, ctx: RenderContext) => {
            if (!comp.bind) return;
            const behavior = useBehavior(ctx.behaviorContext, comp);
            const adapterFn = globalRegistry.resolveAdapterFn(type);
            if (adapterFn) adapterFn(behavior, parent, ctx.adapterContext);
        },
    };
}
