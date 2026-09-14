/** @filedesc Behavior payloads for layout component adapter render functions. */
import type { ReadonlySignal } from '@preact/signals-core';
import type { LayoutHostSlice } from './layout-host';

/**
 * A component string (`$component.<id>.<prop>` Locale string, else the inline prop) that follows the active locale
 * and `{{}}` values. Write it with `watchText`; `peek()` it only to decide what DOM to build.
 */
export type LocalizedText = ReadonlySignal<string>;

export interface SectionLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: LocalizedText | null;
    headingLevel: string;
    descriptionText: LocalizedText | null;
}

export interface StackLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: LocalizedText | null;
    descriptionText: LocalizedText | null;
}

export interface GridLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: LocalizedText | null;
    descriptionText: LocalizedText | null;
}

export interface DividerLayoutBehavior {
    comp: any;
    /**
     * Label at render time (component §5.15 `label`), possibly empty while a `{{}}` value is unanswered; null when
     * the Divider has no label source and is only ever a plain rule.
     */
    labelText: string | null;
    /** Write the label now and whenever it changes (display Item label, Locale, `{{}}`); '' means show a plain rule. */
    watchLabel(write: (text: string) => void): void;
}

export interface CollapsibleLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: LocalizedText;
    descriptionText: LocalizedText | null;
}

export interface PanelLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: LocalizedText | null;
    descriptionText: LocalizedText | null;
}

export interface AccordionLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    /** Summary text for section `index`: `labels[index]` (Locale `$component.<id>.labels[N]`), else "Section N". */
    sectionLabel(index: number): LocalizedText;
    /** Current number of repeat instances (only when bound). */
    repeatCount: ReadonlySignal<number>;
    /** The repeated group's live label (Locale `<key>.label`, `{{}}`); read it in effects or `rows.watch`. */
    groupLabel: ReadonlySignal<string>;
    /** False while the bound group is non-relevant: hide the whole repeat container (headings, Add, Remove). */
    relevant: ReadonlySignal<boolean>;
    /** False at `maxRepeat` or when `allowAdd` is false: hide Add. */
    canAdd: ReadonlySignal<boolean>;
    /**
     * Build the instance rows now and whenever the count or Remove availability changes. Each pass
     * renders untracked into its own scope, disposed before the next pass: render row children with
     * `rows.renderComponent`, never `host.renderComponent`, or every add/remove strands their effects.
     */
    renderRows(build: (rows: AccordionRowsPass) => void): void;
    /** Add a new repeat instance. */
    addInstance(): void;
    /** Remove a repeat instance by index. */
    removeInstance(index: number): void;
}

/** One render pass of a repeat-bound Accordion's rows. */
export interface AccordionRowsPass {
    count: number;
    /** False at or below `minRepeat` or when `allowRemove` is false: omit Remove. */
    canRemove: boolean;
    /** Render a row child into this pass's scope. */
    renderComponent(comp: any, parent: HTMLElement, prefix: string): void;
    /** Run `fn` as an effect disposed with this pass (e.g. row text that follows `groupLabel`). */
    watch(fn: () => void): void;
}

export interface ModalLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: LocalizedText | null;
    triggerLabelText: LocalizedText;
}

export interface PopoverLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    /** The popover's accessible name: `title`, else `triggerLabel`, else "Popover". */
    titleResolved: LocalizedText;
    /** Trigger text when no `triggerBind` value is shown: `triggerLabel`, else "Open". */
    triggerLabelFallback: LocalizedText;
}
