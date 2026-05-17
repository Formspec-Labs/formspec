/** @filedesc Layout component plugins — delegate DOM to the active render adapter (falls back to default). */
import type { ComponentPlugin } from '../types';
import { makeLayoutPlugin, type LayoutBehaviorBuilder } from './layout-plugin-factory';
import {
    buildPageBehavior,
    buildStackBehavior,
    buildGridBehavior,
    buildDividerBehavior,
    buildCollapsibleBehavior,
    buildColumnsBehavior,
    buildPanelBehavior,
    buildAccordionBehavior,
    buildModalBehavior,
    buildPopoverBehavior,
} from './layout-plugin-builders';

const LAYOUT_PLUGIN_ENTRIES: [string, LayoutBehaviorBuilder][] = [
    ['Page', buildPageBehavior],
    ['Stack', buildStackBehavior],
    ['Grid', buildGridBehavior],
    ['Divider', buildDividerBehavior],
    ['Collapsible', buildCollapsibleBehavior],
    ['Columns', buildColumnsBehavior],
    ['Panel', buildPanelBehavior],
    ['Accordion', buildAccordionBehavior],
    ['Modal', buildModalBehavior],
    ['Popover', buildPopoverBehavior],
];

/** All 10 built-in layout component plugins, exported as a single array for bulk registration. */
export const LayoutPlugins: ComponentPlugin[] = LAYOUT_PLUGIN_ENTRIES.map(([type, build]) =>
    makeLayoutPlugin(type, build),
);
