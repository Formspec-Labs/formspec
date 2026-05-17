/** @filedesc Rating behavior hook — extracts reactive state for icon-rating fields. */
import { effect } from '@preact/signals-core';
import type { RatingBehavior, FieldRefs, BehaviorContext } from './types';
import { resolveFieldPath, toFieldId, resolveAndStripTokens, bindSharedFieldEffects, warnIfIncompatible } from './shared';

const RATING_ICON_MAP: Record<string, [string, string]> = {
    star: ['\u2605', '\u2606'],    // ★ filled, ☆ outline
    heart: ['\u2665', '\u2661'],   // ♥ filled, ♡ outline
    circle: ['\u25cf', '\u25cb'],  // ● filled, ○ outline
};

function resolveRatingIcons(icon?: string): [string, string] {
    if (!icon) return RATING_ICON_MAP.star;
    return RATING_ICON_MAP[icon] || [icon, icon];
}

export function useRating(ctx: BehaviorContext, comp: any): RatingBehavior {
    const fieldPath = resolveFieldPath(comp.bind, ctx.prefix);
    const id = comp.id || toFieldId(fieldPath);
    const item = ctx.findItemByKey(comp.bind);
    warnIfIncompatible('Rating', item?.dataType || 'string');
    const itemDesc = { key: item?.key || comp.bind, type: 'field' as const, dataType: item?.dataType || 'decimal' };
    const rawPresentation = ctx.resolveItemPresentation(itemDesc);
    const presentation = resolveAndStripTokens(rawPresentation, ctx.resolveToken, comp);
    const widgetClassSlots = ctx.resolveWidgetClassSlots(rawPresentation);

    const labelText = comp.labelOverride || item?.label || item?.key || comp.bind;
    const vm = ctx.getFieldVM(fieldPath);
    const maxRating = comp.max ?? comp.maxRating ?? 5;
    const isInteger = item?.dataType === 'integer';
    const allowHalf = comp.allowHalf === true;
    const [selectedIcon, unselectedIcon] = resolveRatingIcons(comp.icon);

    return {
        fieldPath,
        id,
        label: labelText,
        hint: comp.hintOverride || item?.hint || null,
        description: item?.description || null,
        vm,
        presentation,
        widgetClassSlots,
        compOverrides: {
            cssClass: comp.cssClass,
            style: comp.style,
            accessibility: comp.accessibility,
        },
        remoteOptionsState: { loading: false, error: null },
        options: () => [],
        maxRating,
        icon: selectedIcon,
        unselectedIcon,
        allowHalf,
        isInteger,

        setValue(val: any): void {
            const finalValue = isInteger && typeof val === 'number' ? Math.round(val) : val;
            ctx.engine.setValue(fieldPath, finalValue);
        },

        touch(): void {
            if (!ctx.touchedFields.has(fieldPath)) {
                ctx.touchedFields.add(fieldPath);
                ctx.touchedVersion.value += 1;
            }
        },

        bind(refs: FieldRefs): () => void {
            const disposers = bindSharedFieldEffects(ctx, fieldPath, vm, labelText, refs);

            // Sync star selection classes and glyphs from engine value
            const stars = refs.control.querySelectorAll('.formspec-rating-star');
            disposers.push(effect(() => {
                const sig = ctx.engine.signals[fieldPath];
                const rawValue = sig?.value;
                const value = typeof rawValue === 'number' ? rawValue : Number(rawValue ?? 0);
                const ratingValue = Number.isFinite(value) ? value : 0;
                stars.forEach((star, idx) => {
                    const fullValue = idx + 1;
                    const halfValue = idx + 0.5;
                    const isSelected = fullValue <= ratingValue;
                    const isHalfSelected = allowHalf && !isSelected && halfValue <= ratingValue;
                    star.classList.toggle('formspec-rating-star--selected', isSelected);
                    star.classList.toggle('formspec-rating-star--half', isHalfSelected);
                    star.textContent = (isSelected || isHalfSelected) ? selectedIcon : unselectedIcon;
                });
            }));

            return () => disposers.forEach(d => d());
        }
    };
}
