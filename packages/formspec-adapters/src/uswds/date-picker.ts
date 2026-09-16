/** @filedesc USWDS v3 adapter for DatePicker — usa-date-picker markup + text input (parity with RealUSWDSStory).
 * The `date` field mounts USWDS's own usa-date-picker JS (hidden ISO input + visible MM/DD/YYYY input +
 * calendar button + month grid) when `@uswds/uswds` is installed; it falls back to the plain text shell
 * (no calendar, native-text value sync) when the module can't be loaded. */
import { widthStopClass, uiText, watchText, type DatePickerBehavior, type AdapterRenderFn } from '@formspec-org/webcomponent';
import { el } from '../helpers';
import { applyUSWDSValidationState, createUSWDSFieldDOM } from './shared';

import { createInputSkeleton } from '../shared/input-factory.js';
// Ambient type for the dynamically-imported module: see uswds-date-picker.d.ts (a real declaration would
// describe an install that may not exist — @uswds/uswds is an optional peer, package.json).
import type { USWDSDatePicker as USWDSDatePickerType } from '@uswds/uswds/js/usa-date-picker';

export const renderDatePicker: AdapterRenderFn<DatePickerBehavior> = (
    behavior, parent, actx
) => {
    const p = behavior.presentation;
    const { root, label, hint, error } = createUSWDSFieldDOM(behavior);

    if (p.labelPosition === 'start') root.classList.add('formspec-label-start');

    const useTextDate = behavior.inputType === 'date';
    // Format hint when the item has none, for the text-typed date picker whose format is not the browser's
    // to show. Static and separate from `hint`, whose text the view model owns.
    let formatHint: HTMLElement | undefined;
    if (!behavior.hint && useTextDate) {
        formatHint = el('span', { class: 'usa-hint', id: `${behavior.id}-format` });
        watchText(actx, uiText(actx.engine, 'date.format'), (text) => { formatHint!.textContent = text; });
        root.appendChild(formatHint);
    }

    // No groupClass: DatePickerBehavior carries no prefix/suffix, so createInputSkeleton's
    // group-wrap branch (triggered only by prefix || suffix) never fires — a `usa-date-picker`
    // groupClass here would be dead configuration. The useTextDate shell below carries that
    // class explicitly instead.
    const { control, actualInput } = createInputSkeleton(behavior, {
        type: useTextDate ? 'text' : behavior.inputType,
        inputClass: 'usa-input',
        onInputCreated: (input) => {
            // USWDS's enhanceDatePicker reads `min`/`max` off this same input before wrapping it
            // (packages/usa-date-picker/src/index.js enhanceDatePicker, ~911-923); the native
            // datetime-local input honors them directly.
            if ((behavior.inputType === 'datetime-local' || behavior.inputType === 'date') && input instanceof HTMLInputElement) {
                if (behavior.minDate) input.min = behavior.minDate;
                if (behavior.maxDate) input.max = behavior.maxDate;
            }
        },
    });
    // Invariant-safe form even though DatePicker carries no prefix/suffix today: target whatever
    // createInputSkeleton returns as the control, not the inner element the class was seeded on.
    control.className += widthStopClass('usa-input', behavior.width);

    if (formatHint) actualInput.setAttribute('data-describedby-base', formatHint.id);

    // useTextDate: wrap the bare input in the usa-date-picker shell manually (no prefix/suffix
    // means createInputSkeleton never wraps it).
    let shell: HTMLElement | undefined;
    if (useTextDate && control === actualInput) {
        shell = el('div', { class: 'usa-date-picker' });
        shell.appendChild(actualInput);
        root.appendChild(shell);
    } else {
        root.appendChild(control);
    }

    parent.appendChild(root);

    const bindNative = (): (() => void) => behavior.bind({
        root, label, control: actualInput, hint, error,
        onValidationChange: (hasError) => applyUSWDSValidationState(root, label, hasError, actualInput),
    });

    let disposed = false;
    let bindDispose: (() => void) | undefined;
    let mountedDatePicker: USWDSDatePickerType | undefined;

    if (shell) {
        const dateShell = shell;
        // Mount USWDS's own date-picker JS: it turns the shell into hidden ISO input + visible
        // MM/DD/YYYY input + calendar button + month grid. Optional peer — dynamic + failure-tolerant
        // so a host without @uswds/uswds still gets a usable (native-text) date field.
        (async () => {
            try {
                const mod = await import('@uswds/uswds/js/usa-date-picker');
                const datePicker = ((mod as any).default ?? mod) as USWDSDatePickerType;
                if (disposed) return;
                mountedDatePicker = datePicker;
                // A host that already loads USWDS globally (the CDN bundle — uswds-core/src/js/start.js,
                // compiled into dist/js/uswds.min.js) sets `window.uswdsPresent` and, at DOMContentLoaded,
                // calls every component's `on(document.body)` — enhancing only the date pickers that exist
                // at that moment, but attaching its listeners to `document.body`, which (via bubbling)
                // covers descendants added later, including this shell. That host module exposes no global
                // API, so we still import our own copy to build the enhanced DOM here — but must call only
                // `init()` (enhance, no listeners), never `on()`/`add()`: a second delegated listener set on
                // top of the host's would double-handle every click (the calendar toggles open and shut in
                // the same gesture). Version skew caveat: our module builds the DOM the page's already-
                // running USWDS then drives — a mismatched USWDS version on the page can enhance markup its
                // own delegated handlers don't expect.
                if ((window as any).uswdsPresent) {
                    datePicker.init(dateShell);
                } else {
                    datePicker.on(dateShell);
                }
                const externalInput = dateShell.querySelector<HTMLInputElement>('.usa-date-picker__external-input')!;
                bindDispose = behavior.bind({
                    root, label, control: externalInput, hint, error,
                    // DatePicker never sets maxLines/tag, so createInputSkeleton always returns an <input> here.
                    valueIO: { element: actualInput as HTMLInputElement, write: (iso: string) => datePicker.setCalendarValue(dateShell, iso) },
                    onValidationChange: (hasError) => applyUSWDSValidationState(root, label, hasError, externalInput),
                });
            } catch {
                if (disposed) return;
                bindDispose = bindNative();
            }
        })();
    } else {
        bindDispose = bindNative();
    }

    actx.onDispose(() => {
        disposed = true;
        // Safe even when only init() ran (no add()): remove() no-ops for listeners never attached, and
        // usa-date-picker defines no teardown, so off()'s teardown step is skipped too (behavior.js above).
        mountedDatePicker?.off(shell!);
        bindDispose?.();
    });
};
