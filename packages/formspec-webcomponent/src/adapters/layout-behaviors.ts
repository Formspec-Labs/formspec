/** @filedesc Behavior payloads for layout component adapter render functions. */
import type { LayoutHostSlice } from './layout-host';

export interface SectionLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: string | null;
    headingLevel: string;
    descriptionText: string | null;
}

export interface StackLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: string | null;
    descriptionText: string | null;
}

export interface GridLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: string | null;
    descriptionText: string | null;
}

export interface DividerLayoutBehavior {
    comp: any;
    /** Label at render time (component §5.15 `label`); null renders a plain rule. */
    labelText: string | null;
    /** Write the label now and whenever it changes: a Divider planned from a display Item follows its live label. */
    watchLabel(write: (text: string) => void): void;
}

export interface CollapsibleLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: string;
    descriptionText: string | null;
}

export interface PanelLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleText: string | null;
    descriptionText: string | null;
}

export interface AccordionLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    /** Current number of repeat instances (only when bound). */
    repeatCount: import('@preact/signals-core').ReadonlySignal<number>;
    /** The repeated group's live label (Locale `<key>.label`, `{{}}`); read it in effects or `rows.watch`. */
    groupLabel: import('@preact/signals-core').ReadonlySignal<string>;
    /** False while the bound group is non-relevant: hide the whole repeat container (headings, Add, Remove). */
    relevant: import('@preact/signals-core').ReadonlySignal<boolean>;
    /** False at `maxRepeat` or when `allowAdd` is false: hide Add. */
    canAdd: import('@preact/signals-core').ReadonlySignal<boolean>;
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
    titleText: string | null;
    triggerLabelText: string;
}

export interface PopoverLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    titleResolved: string;
    triggerLabelFallback: string;
}
