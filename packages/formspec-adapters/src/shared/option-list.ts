/** @filedesc Shared option-list loop for checkbox/radio group adapters (design-system render hooks). */

export type OptionEntry = Readonly<{ value: string; label: string }>;

export type OptionInputKind = 'radio' | 'checkbox';

export interface OptionListRenderOneArgs {
    opt: OptionEntry;
    optId: string;
    index: number;
    kind: OptionInputKind;
    inputName: string;
}

export interface BuildOptionListParams {
    behaviorId: string;
    options: ReadonlyArray<OptionEntry>;
    kind: OptionInputKind;
    inputName: string;
    container: HTMLElement;
    clearContainer?: (container: HTMLElement) => void;
    renderOption: (args: OptionListRenderOneArgs) => {
        wrapper: HTMLElement;
        input: HTMLInputElement;
    };
}

/** Remove direct children marked with `data-option-wrapper` (default group option chrome). */
export function clearOptionNodes(container: HTMLElement): void {
    for (const child of Array.from(container.children)) {
        if (child.hasAttribute('data-option-wrapper')) child.remove();
    }
}

/**
 * Build a value→control map for radio/checkbox option groups.
 * Design systems supply markup via `renderOption`; this module owns the index loop only.
 */
export function buildOptionList(params: BuildOptionListParams): Map<string, HTMLInputElement> {
    const { behaviorId, options, kind, inputName, container, clearContainer, renderOption } = params;
    (clearContainer ?? clearOptionNodes)(container);
    const controls = new Map<string, HTMLInputElement>();

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const optId = `${behaviorId}-${i}`;
        const { wrapper, input } = renderOption({ opt, optId, index: i, kind, inputName });
        wrapper.setAttribute('data-option-wrapper', '');
        controls.set(opt.value, input);
        container.appendChild(wrapper);
    }

    return controls;
}
