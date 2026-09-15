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

export interface GroupRefs {
    /** The element the adapter made for the group. */
    root: HTMLElement;
}

/** A bound (scope-changing) group: `address`, `employer[0]`. Titled or not, it wraps its children in one scope. */
export interface GroupLayoutBehavior {
    /** The planner's node: `cssClasses`, `style`, `accessibility`, and surface `props`. */
    comp: any;
    host: LayoutHostSlice;
    /** The group's live title (Locale, `{{}}`, definition label), or null when it has none. */
    titleText: LocalizedText | null;
    /**
     * `labelPosition: 'hidden'` (theme §5.2): draw the title for assistive technology only — it stays in
     * the accessible markup (a legend keeps naming the fieldset) and leaves the page.
     */
    titleHidden: boolean;
    /** The group's live hint (Locale `<key>.hint`, `{{}}`), or null when it has none. */
    hintText: LocalizedText | null;
    /** Heading tag for the title at this depth: `'h3'`…`'h6'`. */
    headingLevel: string;
    /** Render the group's children into `parent`, scoped to the group's own path. */
    renderChildren(parent: HTMLElement): void;
    /** Hides the group while it is not relevant. */
    bind(refs: GroupRefs): () => void;
}

export interface RepeatGroupRefs {
    root: HTMLElement;
    /** Row container: its element children are the rows, in order. Used to restore focus after add/remove. */
    list: HTMLElement;
    /** Add control; hidden while Add is locked or the group is at `maxRepeat`. */
    addButton?: HTMLElement;
    /** Polite live region for add/remove announcements. */
    announcer?: HTMLElement;
}

/**
 * One repeat row's text, all following the active locale and `{{}}` values. Each comes from the group's
 * Locale strings (`<key>.rowLabel` / `<key>.removeLabel`, Locale §3.1.1) and is derived from the group
 * label only when the Locale is silent.
 */
export interface RepeatRowText {
    /** "Employer 1". Empty when the Locale suppresses the row heading: draw no heading, keep {@link ariaLabel}. */
    label: LocalizedText;
    /** "Employer 1 of 3" — the row's accessible name, never empty. */
    ariaLabel: LocalizedText;
    /** "Remove Employer" */
    removeLabel: LocalizedText;
    /** "Remove Employer 1" */
    removeAriaLabel: LocalizedText;
}

/** One render pass of a repeatable group's rows. */
export interface RepeatGroupRowsPass {
    count: number;
    /** False at or below `minRepeat` or when `allowRemove` is false: omit Remove. */
    canRemove: boolean;
    /** Localized text for row `index`; write it inside {@link watch}, never once at build time. */
    rowText(index: number): RepeatRowText;
    /** Render row `index`'s children into `parent`, scoped to that row. */
    renderRow(index: number, parent: HTMLElement): void;
    /** Run `fn` as an effect disposed with this pass. */
    watch(fn: () => void): void;
}

/** A repeatable group's chrome: rows plus the Add and Remove affordances. */
export interface RepeatGroupLayoutBehavior {
    comp: any;
    host: LayoutHostSlice;
    /** The repeated group's key, as authored. */
    bindKey: string;
    /** Heading tag for a row heading at this depth: `'h3'`…`'h6'`. */
    headingLevel: string;
    /** "Add Employer" — Locale `<key>.addLabel`, else derived from the group label. */
    addLabel: LocalizedText;
    /**
     * Build the rows now and again whenever the count or Remove availability changes. Each pass
     * renders untracked into its own scope, disposed before the next pass.
     */
    renderRows(build: (rows: RepeatGroupRowsPass) => void): void;
    /** Append a row, announce it, and focus into it. No-op while Add is locked. */
    addInstance(): void;
    /** Remove row `index`, announce it, and move focus to the nearest surviving row. */
    removeInstance(index: number): void;
    /** Hides the group while it is not relevant, and the Add control while Add is unavailable. */
    bind(refs: RepeatGroupRefs): () => void;
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
