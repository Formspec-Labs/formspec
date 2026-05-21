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
    labelText: string | null;
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
    repeatCount: import('@preact/signals-core').Signal<number>;
    /** Resolved label for the group/item being repeated. */
    groupLabel: string;
    /** Add a new repeat instance. */
    addInstance(): void;
    /** Remove a repeat instance by index. */
    removeInstance(index: number): void;
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
