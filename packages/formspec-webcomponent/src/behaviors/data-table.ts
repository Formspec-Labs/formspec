/** @filedesc DataTable behavior hook — manages repeatable group table logic. */
import type { DataTableBehavior, DataTableRefs, BehaviorContext } from './types';
import { displayHostSlice } from '../adapters/display-host';
import { repeatAffordances } from '../rendering/repeat-affordances';
import { compText } from '../components/layout-plugin-factory';

export function useDataTable(ctx: BehaviorContext, comp: any): DataTableBehavior {
    const bindKey = comp.bind;
    const fullName = ctx.prefix ? `${ctx.prefix}.${bindKey}` : bindKey;
    const item = ctx.findItemByKey(bindKey);
    const groupLabel = item?.label || bindKey || '';
    const { count, relevant, canAdd, canRemove } = repeatAffordances(ctx.engine, fullName, item);

    const columns = (comp.columns || []) as any[];
    // Locale `$component.<id>.columns[N].header` (Locale §3.1.8), else the authored header.
    const headers = columns.map((column, index) => compText(ctx, comp, `columns[${index}].header`, column?.header ?? ''));
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
        headers,
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
