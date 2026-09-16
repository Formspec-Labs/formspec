/** @filedesc Shared utilities for behavior hooks: path resolution, ID generation, token stripping, shared bind helpers. */
import { effect, untracked, Signal } from '@preact/signals-core';
import { type PresentationBlock, COMPATIBILITY_MATRIX } from '@formspec-org/layout';
import type { RegistryEntry } from '@formspec-org/types';
import type { ResolvedPresentationBlock, FieldRefs, BehaviorContext } from './types';
import type { FieldViewModel } from '@formspec-org/engine';
import { writeRichText } from '../adapters/rich-text-dom.js';
import { createFieldHelpLink, DEFAULT_FIELD_HELP_LABEL } from '../adapters/field-help-link.js';
import { uiText } from '../adapters/ui-text.js';
import { plainText, toolText, TOOL_PARAM_DESCRIPTION_MAX } from '../adapters/tool-text.js';

/** Registry entry metadata is an open object in schema; narrow for behavior reads. */
export function readRegistryMetadata(entry: RegistryEntry | undefined): Record<string, unknown> {
    return (entry?.metadata ?? {}) as Record<string, unknown>;
}

export function readRegistryConstraints(entry: RegistryEntry | undefined): Record<string, unknown> {
    return (entry?.constraints ?? {}) as Record<string, unknown>;
}

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

/**
 * Initial hint/description text for a field: the view model's Locale-resolved, `{{}}`-interpolated
 * strings, or the raw item strings when no view model exists. Read untracked: behaviors are created
 * inside render effects (repeat lists), where a tracked read would re-render the whole list whenever
 * an interpolated value changed. {@link bindSharedFieldEffects} keeps the DOM text current.
 */
export function resolveFieldText(
    item: { hint?: string | null; description?: string | null } | null | undefined,
    vm: FieldViewModel | undefined,
): { hint: string | null; description: string | null } {
    return untracked(() => ({
        hint: vm ? vm.hint.value : (item?.hint ?? null),
        description: vm ? vm.description.value : (item?.description ?? null),
    }));
}

/**
 * A choice field's options, and the re-render that follows them. The engine's view model resolves each
 * option label through the Locale cascade (field key, `$optionSet`, inline label — Locale §3.1) and follows
 * a locale switch and a remote load alike; adapters draw options once, so any change re-renders the field.
 * Without a view model (a bind the engine does not know), the raw options stand.
 */
export function fieldOptions(
    ctx: BehaviorContext,
    fieldPath: string,
    vm: FieldViewModel | undefined,
    item: { options?: unknown[] } | null | undefined,
): { options: () => any[]; remoteOptionsState: { loading: boolean; error: string | null } } {
    const optionSignal = ctx.engine.getOptionsSignal?.(fieldPath);
    const optionStateSignal = ctx.engine.getOptionsStateSignal?.(fieldPath);
    if (vm || optionSignal || optionStateSignal) {
        let initialized = false;
        ctx.cleanupFns.push(effect(() => {
            if (vm) vm.options.value; else optionSignal?.value;
            optionStateSignal?.value;
            if (!initialized) {
                initialized = true;
                return;
            }
            ctx.rerender();
        }));
    }
    return {
        options: () => (vm ? vm.options.value : (ctx.engine.getOptions?.(fieldPath) || item?.options || [])),
        remoteOptionsState: ctx.engine.getOptionsState?.(fieldPath) || { loading: false, error: null },
    };
}

/**
 * Set a hint/description element through the rich-text subset (core §4.2.1), hiding it while empty.
 *
 * `template` is the authored string and `interpolate` fills its leaves, so the markup boundary is the author's
 * and a respondent's value is always literal text. `resolved` decides visibility only — a template that
 * interpolates to an empty string still hides the element.
 */
function showFieldText(
    el: HTMLElement | null | undefined,
    resolved: string | null | undefined,
    template: string | null | undefined,
    interpolate: (t: string) => string,
): void {
    if (!el) return;
    writeRichText(el, template, { interpolate });
    el.hidden = !resolved;
}

/** Set (or with `null`, remove) an attribute only when it changes: field effects re-run on every touch. */
function syncAttribute(el: Element, name: string, value: string | null): void {
    if (el.getAttribute(name) === value) return;
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
}

/** Named native controls a field draws — where a WebMCP declarative synthesizer reads `required` and `toolparamdescription` (assist-spec §8.2). */
function namedControls(root: HTMLElement): NodeListOf<Element> {
    return root.querySelectorAll('input[name], select[name], textarea[name]');
}

/** Warn if the component type is incompatible with the item's dataType. */
export function warnIfIncompatible(
    componentType: string,
    dataType: string,
    options: { multiple?: boolean } = {},
): void {
    if (componentType === 'Select' && dataType === 'multiChoice' && options.multiple === true) {
        return;
    }
    if (componentType === 'Select' && dataType === 'multiChoice') {
        console.warn(`Incompatible component ${componentType} for dataType ${dataType}.`);
        return;
    }
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
    refs: FieldRefs,
    presentation?: ResolvedPresentationBlock,
): Array<() => void> {
    const disposers: Array<() => void> = [];

    // Resolve the actual interactive element for ARIA attributes.
    // refs.control may be a wrapper div (Toggle, MoneyInput, TextInput with prefix/suffix).
    const actualInput = refs.control.querySelector('input')
        || refs.control.querySelector('select')
        || refs.control.querySelector('textarea')
        || refs.control;
    // Field state (required / invalid / readonly) belongs to an option group, not its first option.
    // A radiogroup carries all three (WAI-ARIA radiogroup supports them). A checkbox group's `group` role supports
    // neither aria-required nor aria-readonly: the group carries aria-invalid, each checkbox aria-readonly, and
    // required stays with the legend as visually hidden text (aria-required on one checkbox reads as "check this box").
    const checkboxGroup = [...(refs.optionControls?.values() ?? [])][0]?.type === 'checkbox';
    const stateTarget = checkboxGroup || refs.control.getAttribute('role') === 'radiogroup' ? refs.control : actualInput;

    // Theme `requiredIndicator: 'none'` drops the visible asterisk only — a form where every field is required
    // marks nothing useful by marking everything (theme §5.2). aria-required below is untouched: assistive
    // technology reads the state, not the marker.
    const showRequiredMarker = presentation?.requiredIndicator !== 'none';

    // Required indicator + reactive label
    disposers.push(effect(() => {
        const isRequired = vm
            ? vm.required.value
            : (ctx.engine.requiredSignals[fieldPath]?.value ?? false);
        // A label's content model is phrasing only, so the subset renders inline here (core §4.2.1). With a
        // view model the parse runs on the authored template and the values fill its leaves.
        if (vm) writeRichText(refs.label, vm.labelTemplate.value, { inline: true, interpolate: vm.interpolate });
        else writeRichText(refs.label, labelText, { inline: true });
        if (isRequired && showRequiredMarker) {
            const indicator = document.createElement('abbr');
            indicator.className = 'formspec-required usa-label--required';
            indicator.setAttribute('title', 'required');
            indicator.textContent = ' *';
            refs.label.appendChild(indicator);
            if (checkboxGroup) {
                // No aria-required to carry it: the legend says "required" to screen readers instead of the asterisk.
                indicator.setAttribute('aria-hidden', 'true');
                const srText = document.createElement('span');
                srText.className = 'formspec-sr-only usa-sr-only';
                srText.textContent = ' required';
                refs.label.appendChild(srText);
            }
        }
        if (!checkboxGroup) stateTarget.setAttribute('aria-required', String(isRequired));
        // Assist spec §8.2: under the opt-in tool form (novalidate — no browser validation bubble to suppress),
        // native `required` on each named control is the synthesized schema's only signal for `required[]`.
        // Skipped for a checkbox group: `required` on an individual checkbox means "this one must be checked",
        // not "at least one of the group must be" — setting it on every option would read as "check every
        // box" to a declarative-tool synthesizer, degrading the schema (§8.2 MUST NOT). A radio group is a
        // single value across same-named radios, so `required` on each carries the conventional HTML meaning
        // and stays.
        if (ctx.isDeclarativeToolForm && !checkboxGroup) {
            for (const el of namedControls(refs.root)) {
                syncAttribute(el, 'required', isRequired ? '' : null);
            }
        }
    }));

    // ARIA describedby: supplementary text ids (description and hint only while shown), plus the error
    // message id while an error is shown (USWDS validation pattern: the input's aria-describedby names its
    // usa-error-message).
    const ariaTarget = refs.skipAriaDescribedBy ? refs.control : actualInput;
    const descEl = refs.root.querySelector('.formspec-description') as HTMLElement | null;
    const shownTextId = (el: HTMLElement | null | undefined) => (el && !el.hidden ? el.id : undefined);
    const supplementaryIds = () => [
        ...(ariaTarget.getAttribute('data-describedby-base')?.split(/\s+/) ?? []),
        shownTextId(descEl),
        shownTextId(refs.hint),
        ...Array.from(
            refs.control.querySelectorAll('.formspec-prefix[id], .formspec-suffix[id], .formspec-input-prefix[id], .formspec-input-suffix[id]'),
            (el) => el.id,
        ),
        refs.control.querySelector('.formspec-money-currency[id]')?.id,
        refs.control.querySelector('.formspec-toggle-on[id]')?.id,
    ];
    let lastErrorShown = false;
    const syncDescribedBy = (errorShown = lastErrorShown) => {
        lastErrorShown = errorShown;
        const ids = [...new Set([...supplementaryIds(), errorShown ? refs.error?.id : undefined].filter(Boolean))].join(' ');
        syncAttribute(ariaTarget, 'aria-describedby', ids || null);
    };

    // Hint + description text (Locale changes, `{{}}` interpolation of live values). Adapters render both,
    // hidden while empty; text that appears or clears later toggles visibility and aria-describedby.
    if (vm) {
        disposers.push(effect(() => {
            showFieldText(refs.hint, vm.hint.value, vm.hintTemplate.value, vm.interpolate);
            showFieldText(descEl, vm.description.value, vm.descriptionTemplate.value, vm.interpolate);
            syncDescribedBy();
        }));
    }

    // Assist spec §8.2: every named control describes itself to the browser-synthesized WebMCP tool — the hint,
    // else the label, as plain text within the §8.2 cap — and follows the Locale like the visible text does. A
    // rebuilt option set re-renders the field, so every control the adapter named is here when this runs. An
    // option group's fieldset carries it too: a synthesizer folds same-named radios into one property and reads
    // the group.
    disposers.push(effect(() => {
        const interpolate = vm ? vm.interpolate : (template: string) => template;
        const description = toolText(vm ? vm.hintTemplate.value : refs.hint?.textContent, TOOL_PARAM_DESCRIPTION_MAX, interpolate)
            || toolText(vm ? vm.labelTemplate.value : labelText, TOOL_PARAM_DESCRIPTION_MAX, interpolate);
        const described = namedControls(refs.root);
        for (const el of refs.root instanceof HTMLFieldSetElement ? [refs.root, ...described] : described) {
            syncAttribute(el, 'toolparamdescription', description || null);
        }
    }));

    // Field help: the item's human References as one link, after the hint and at the end of the field block
    // (References spec §7). Built once — References are static per Definition (§2.3) — with the label alone
    // following the locale. The link sits in a row of its own so it clears the control above it; the
    // adapters space the row, not the inline anchor.
    const helpLink = createFieldHelpLink(ctx.fieldHelp?.(fieldPath) ?? []);
    if (helpLink) {
        const helpRow = document.createElement('div');
        helpRow.className = 'formspec-field-help-row';
        helpRow.appendChild(helpLink);
        refs.root.appendChild(helpRow);
        const helpLabelKey = `${fieldPath.replace(/\[\d+\]/g, '').split('.').pop()}.helpLabel`;
        disposers.push(effect(() => {
            ctx.engine.localeSignal?.value;
            // Authored <key>.helpLabel (Locale §3.1.1) wins; else the closed $ui.fieldHelp.label chrome
            // string (§3.1.10); else the hardcoded English default.
            const chromeDefault = uiText(ctx.engine, 'fieldHelp.label', undefined, DEFAULT_FIELD_HELP_LABEL).value;
            helpLink.textContent = ctx.engine.resolveLocaleString(helpLabelKey, chromeDefault, fieldPath);
        }));
    }

    // Validation display. Re-runs for every field whenever any field is touched, so write only changes.
    disposers.push(effect(() => {
        ctx.touchedVersion.value; // subscribe to touch changes

        let effectiveError: string | null | undefined;
        if (vm) {
            effectiveError = vm.firstError.value;
        } else {
            const error = ctx.engine.errorSignals[fieldPath]?.value;
            // Shape errors from latest submit (result paths share the field's 0-based indexes)
            const submitDetail = ctx.latestSubmitDetailSignal?.value;
            const submitError = submitDetail?.validationReport?.results?.find((r: any) =>
                r.severity === 'error' && (r.path === fieldPath || r.path === `${fieldPath}[*]`)
            )?.message;
            effectiveError = error || submitError;
        }

        const submitOccurred = ctx.latestSubmitDetailSignal?.value !== null;
        const shouldShowError = ctx.touchedFields.has(fieldPath) || submitOccurred;
        const showError = shouldShowError ? (effectiveError || '') : '';
        if (refs.error && refs.error.textContent !== showError) refs.error.textContent = showError;
        syncAttribute(stateTarget, 'aria-invalid', String(!!showError));
        syncDescribedBy(!!showError);
        if (refs.onValidationChange) refs.onValidationChange(!!showError, showError);
    }));

    // Readonly
    const readonlySignal = vm ? vm.readonly : ctx.engine.readonlySignals[fieldPath];
    if (refs.optionControls) {
        // `readonly` has no effect on radios or checkboxes. While read-only, cancel the click that would change an
        // option (label clicks and keyboard selection dispatch one too): options stay enabled, focusable, and
        // announced read-only, but the value cannot change (core §4.3 Bind `readonly`).
        const blockReadonlyChange = (event: Event) => {
            const target = event.target;
            if (readonlySignal?.value && target instanceof HTMLInputElement && (target.type === 'radio' || target.type === 'checkbox')) {
                event.preventDefault();
            }
        };
        refs.control.addEventListener('click', blockReadonlyChange, true);
        disposers.push(() => refs.control.removeEventListener('click', blockReadonlyChange, true));
    }
    disposers.push(effect(() => {
        const isReadonly = readonlySignal?.value ?? false;
        if (!refs.skipSharedReadonlyControl) {
            if (actualInput instanceof HTMLInputElement || actualInput instanceof HTMLTextAreaElement) {
                actualInput.readOnly = isReadonly;
            } else if (actualInput instanceof HTMLSelectElement) {
                actualInput.disabled = isReadonly;
            }
        }
        const readonlyTargets = checkboxGroup ? refs.control.querySelectorAll('input[type="checkbox"]') : [stateTarget];
        for (const target of readonlyTargets) target.setAttribute('aria-readonly', String(isReadonly));
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

    // Assist spec §8 (draft.3 C6): a field the assistant wrote wears `data-formspec-agent-filled` (the adapters'
    // style hook) until the respondent edits it, and is touched at once — its validation shows without a blur,
    // since nobody will blur it. The write is announced once, on the transition: a field that mounts already
    // assistant-written (a re-render) keeps its mark and validation but says nothing again.
    if (vm) {
        let mounted = false;
        disposers.push(effect(() => {
            const byAssist = vm.writeSource.value === 'assist';
            // Subscribing to the value too: the assistant rewriting its own field keeps the source at 'assist', and
            // that write must be announced as well (§8.4 "each write batch").
            vm.value.value;
            // Untracked: the touch bump reads `touchedVersion`, and the label follows the Locale — neither re-announces.
            untracked(() => {
                syncAttribute(refs.root, 'data-formspec-agent-filled', byAssist ? '' : null);
                if (byAssist) {
                    markTouched();
                    if (mounted) ctx.announceAssistFill?.(plainText(vm.labelTemplate.value, vm.interpolate));
                }
                mounted = true;
            });
        }));
    }

    return disposers;
}
