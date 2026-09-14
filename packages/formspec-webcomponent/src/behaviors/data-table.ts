/** @filedesc DataTable behavior hook — manages repeatable group table logic. */
import type { DataTableBehavior, DataTableRefs, BehaviorContext } from './types';
import { displayHostSlice } from '../adapters/display-host';
import { repeatAffordances } from '../rendering/repeat-affordances';

export function useDataTable(ctx: BehaviorContext, comp: any): DataTableBehavior {
    const bindKey = comp.bind;
    const fullName = ctx.prefix ? `${ctx.prefix}.${bindKey}` : bindKey;
    const item = ctx.findItemByKey(bindKey);
    const groupLabel = item?.label || bindKey || '';
    const { count, relevant, canAdd, canRemove } = repeatAffordances(ctx.engine, fullName, item);

    const columns = (comp.columns || []) as any[];
    const showRowNumbers = comp.showRowNumbers === true;
    const allowAdd = comp.allowAdd === true;
    const allowRemove = comp.allowRemove === true;

    return {
        comp,
        host: displayHostSlice(ctx as any),
        id: comp.id,
        compOverrides: {
            cssClass: comp.cssClass,
            style: comp.style,
            accessibility: comp.accessibility,
        },
        bindKey,
        fullName,
        columns,
        showRowNumbers,
        allowAdd,
        allowRemove,
        groupLabel,
        repeatCount: count,
        relevant,
        canAdd,
        canRemove,

        addInstance() {
            if (canAdd.value) ctx.engine.addRepeatInstance(fullName);
        },

        removeInstance(index: number) {
            if (canRemove.value) ctx.engine.removeRepeatInstance(fullName, index);
        },

        bind(refs: DataTableRefs): () => void {
            const disposers: Array<() => void> = [];
            return () => disposers.forEach(d => d());
        }
    };
}
