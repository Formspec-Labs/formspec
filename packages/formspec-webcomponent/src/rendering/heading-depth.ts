/** @filedesc Which components head their children — the rule the live render and the skeleton nest headings by. */

/**
 * Whether every adapter draws a heading over this component's children: a titled Section (the component
 * spec makes its title a heading) or a titled Card (both built-in adapters draw one). Children of such a
 * component sit one heading level deeper, as a titled group's do (`buildGroupBehavior`). A Stack or Grid
 * title heads a row of content, not a division of the form; a Panel, Collapsible or Accordion title is a
 * heading in one adapter and a `<summary>` or plain header in another, so their children stay at the same
 * depth — a flat outline, never a skipped level. A wizard's step heading is its Section's title, drawn at
 * the Section's depth, so the Section rule covers it.
 */
export function hasLayoutTitle(comp: { title?: unknown; titleBind?: unknown; titleLocaleKey?: unknown; titleIndex?: unknown }): boolean {
    return [comp.title, comp.titleBind, comp.titleLocaleKey].some(value => typeof value === 'string' && value !== '')
        || typeof comp.titleIndex === 'number';
}

export function headsChildren(comp: Parameters<typeof hasLayoutTitle>[0] & { component: string }): boolean {
    return (comp.component === 'Section' || comp.component === 'Card') && hasLayoutTitle(comp);
}
