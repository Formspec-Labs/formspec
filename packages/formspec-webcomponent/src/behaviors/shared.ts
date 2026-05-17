/** @filedesc Shared utilities for behavior hooks: path resolution, ID generation, token stripping, shared bind helpers. */
import { effect, Signal } from '@preact/signals-core';
import { type PresentationBlock, COMPATIBILITY_MATRIX } from '@formspec-org/layout';
import type { ResolvedPresentationBlock, FieldRefs, BehaviorContext } from './types';
import type { FieldViewModel } from '@formspec-org/engine';

/** Build full field path from bind key and prefix. */
export function resolveFieldPath(bind: string, prefix: string): string {
    return prefix ? `${prefix}.${bind}` : bind;
}

/** Convert a dotted field path to a DOM-safe element ID. */
export function toFieldId(fieldPath: string): string {
    return `field-${fieldPath.replace(/[\.\[\]]/g, '-')}`;
}

/**
 * Pre-resolve all $token. references in a PresentationBlock.
 * Adapters receive concrete values only — no token resolution needed.
 */
export function resolveAndStripTokens(
    block: PresentationBlock,
    resolveToken: (v: any) => any,
    comp?: any,
): ResolvedPresentationBlock {
    const resolved: any = { ...block };
    if (resolved.style) {
        resolved.style = Object.fromEntries(
            Object.entries(resolved.style).map(([k, v]) => [k, resolveToken(v)])
        );
    }
    if (resolved.cssClass) {
        resolved.cssClass = Array.isArray(resolved.cssClass)
            ? resolved.cssClass.map((c: any) => resolveToken(c))
            : resolveToken(resolved.cssClass);
    }
    // widgetConfig is intentionally NOT token-resolved: its values are semantic configuration
    // (rows, searchable, direction), not CSS values, so $token. references are not expected.
    // comp.labelPosition overrides theme cascade (matches old field-input.ts precedence)
    if (comp?.labelPosition) {
        resolved.labelPosition = comp.labelPosition;
    }
    return resolved;
}

/** Warn if the component type is incompatible with the item's dataType. */
export function warnIfIncompatible(componentType: string, dataType: string): void {
    if (COMPATIBILITY_MATRIX[dataType] && !COMPATIBILITY_MATRIX[dataType].includes(componentType)) {
        console.warn(`Incompatible component ${componentType} for dataType ${dataType}.`);
    }
}

/**
 * Wire the shared reactive effects that all field behaviors need:
 * required indicator, validation display, readonly, relevance, touched tracking.
 *
 * Returns an array of dispose functions.
 */
export function bindSharedFieldEffects(
    ctx: BehaviorContext,
    fieldPath: string,
    vm: FieldViewModel | undefined,
    labelText: string,
    refs: FieldRefs
): Array<() => void> {
    const disposers: Array<() => void> = [];

    // Resolve the actual interactive element for ARIA attributes.
    // refs.control may be a wrapper div (Toggle, MoneyInput, TextInput with prefix/suffix).
    const actualInput = refs.control.querySelector('input')
        || refs.control.querySelector('select')
        || refs.control.querySelector('textarea')
        || refs.control;

    // Required indicator + reactive label
    disposers.push(effect(() => {
        const isRequired = vm
            ? vm.required.value
            : (ctx.engine.requiredSignals[fieldPath]?.value ?? false);
        const currentLabel = vm ? vm.label.value : labelText;
        refs.label.textContent = currentLabel;
        if (isRequired) {
            const indicator = document.createElement('abbr');
            indicator.className = 'formspec-required usa-label--required';
            indicator.setAttribute('title', 'required');
            indicator.textContent = ' *';
            refs.label.appendChild(indicator);
        }
        actualInput.setAttribute('aria-required', String(isRequired));
    }));

    // ARIA describedby — supplementary text only (USWDS form templates / file-input pattern).
    // Error text stays in the live role="alert" region; do not reference it here.
    disposers.push(effect(() => {
        const ariaTarget = refs.skipAriaDescribedBy ? refs.control : actualInput;

        const ids: string[] = [];
        const existing = ariaTarget.getAttribute('data-describedby-base');
        if (existing) ids.push(...existing.split(/\s+/).filter(Boolean));

        const descEl = refs.root.querySelector('.formspec-description[id]') as HTMLElement | null;
        if (descEl?.id) ids.push(descEl.id);

        if (refs.hint?.id) ids.push(refs.hint.id);

        refs.control.querySelectorAll('.formspec-prefix[id], .formspec-suffix[id], .formspec-input-prefix[id], .formspec-input-suffix[id]').forEach((el) => {
            if (el.id) ids.push(el.id);
        });
        const currencyBadge = refs.control.querySelector('.formspec-money-currency[id]') as HTMLElement | null;
        if (currencyBadge?.id) ids.push(currencyBadge.id);

        const toggleOn = refs.control.querySelector('.formspec-toggle-on[id]') as HTMLElement | null;
        if (toggleOn?.id) ids.push(toggleOn.id);

        const finalIds = [...new Set(ids.filter(Boolean))].join(' ');
        if (finalIds) ariaTarget.setAttribute('aria-describedby', finalIds);
        else ariaTarget.removeAttribute('aria-describedby');
    }));

    // Validation display
    disposers.push(effect(() => {
        ctx.touchedVersion.value; // subscribe to touch changes

        let effectiveError: string | null | undefined;
        if (vm) {
            effectiveError = vm.firstError.value;
        } else {
            const error = ctx.engine.errorSignals[fieldPath]?.value;
            // Shape errors from latest submit (external 1-indexed paths)
            const submitDetail = ctx.latestSubmitDetailSignal?.value;
            const externalPath = fieldPath.replace(/\[(\d+)\]/g, (_, p1) => `[${parseInt(p1) + 1}]`);
            const submitError = submitDetail?.validationReport?.results?.find((r: any) =>
                r.severity === 'error' && (r.path === fieldPath || r.path === externalPath || r.path === `${fieldPath}[*]`)
            )?.message;
            effectiveError = error || submitError;
        }

        const submitOccurred = ctx.latestSubmitDetailSignal?.value !== null;
        const shouldShowError = ctx.touchedFields.has(fieldPath) || submitOccurred;
        const showError = shouldShowError ? (effectiveError || '') : '';
        if (refs.error) refs.error.textContent = showError;
        actualInput.setAttribute('aria-invalid', String(!!showError));
        if (refs.onValidationChange) refs.onValidationChange(!!showError, showError);
    }));

    // Readonly
    disposers.push(effect(() => {
        const isReadonly = vm
            ? vm.readonly.value
            : (ctx.engine.readonlySignals[fieldPath]?.value ?? false);
        if (!refs.skipSharedReadonlyControl) {
            if (actualInput instanceof HTMLInputElement || actualInput instanceof HTMLTextAreaElement) {
                actualInput.readOnly = isReadonly;
            } else if (actualInput instanceof HTMLSelectElement) {
                actualInput.disabled = isReadonly;
            }
        }
        actualInput.setAttribute('aria-readonly', String(isReadonly));
        refs.root.classList.toggle('formspec-field--readonly', isReadonly);
    }));

    // Relevance
    disposers.push(effect(() => {
        const isRelevant = vm
            ? vm.visible.value
            : (ctx.engine.relevantSignals[fieldPath]?.value ?? true);
        refs.root.classList.toggle('formspec-hidden', !isRelevant);
        if (!isRelevant) {
            refs.root.setAttribute('aria-hidden', 'true');
            refs.root.inert = true;
        } else {
            refs.root.removeAttribute('aria-hidden');
            refs.root.inert = false;
        }
    }));

    // Touched tracking
    const markTouched = () => {
        if (!ctx.touchedFields.has(fieldPath)) {
            ctx.touchedFields.add(fieldPath);
            ctx.touchedVersion.value += 1;
        }
    };
    refs.root.addEventListener('focusout', markTouched);
    refs.root.addEventListener('change', markTouched);
    disposers.push(() => {
        refs.root.removeEventListener('focusout', markTouched);
        refs.root.removeEventListener('change', markTouched);
    });

    return disposers;
}
