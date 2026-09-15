/** @filedesc Shared Divider DOM — a plain rule, or a rule/label/rule row that follows a live label — for default and external adapters. */
import type { AdapterContext } from './types';
import type { DividerLayoutBehavior } from './layout-behaviors';

/** Design-system classes for a Divider's elements. */
export interface DividerClasses {
    /** A rule with no label: the whole Divider, or the rule shown while a live label is empty. */
    rule: string;
    /** The row holding two rules around the label. */
    labeled: string;
    /** Each rule inside the labeled row. */
    line: string;
    /** The label text. */
    label: string;
}

/**
 * Render a Divider (component §5.15). Without a label source it is a plain `<hr>`. With one (an authored `label`,
 * or a display Item's label), one stable root follows the live label: a plain rule while it is empty (a `{{}}`
 * value not yet answered), a rule/label/rule row once it has text. The root stays put so Bind relevance, which
 * tracks the elements a render appended, keeps applying.
 */
export function renderDividerDOM(
    behavior: DividerLayoutBehavior,
    parent: HTMLElement,
    actx: AdapterContext,
    classes: DividerClasses,
): void {
    const { comp } = behavior;
    const decorate = (el: HTMLElement) => {
        if (comp.id) el.id = comp.id;
        actx.applyCssClass(el, comp);
        actx.applyAccessibility(el, comp);
        actx.applyStyle(el, comp.style);
        parent.appendChild(el);
    };

    if (behavior.labelText === null) {
        const hr = document.createElement('hr');
        hr.className = classes.rule;
        decorate(hr);
        return;
    }

    // Root stays put (never swapped) so Bind relevance, which captures the elements this render appended,
    // keeps applying. Its label/second-line children exist only while the live label has text — added on
    // first arrival, torn down when it empties again — so an always-empty label never leaves a dead `<hr>`.
    const root = document.createElement('div');
    const lineBefore = document.createElement('hr');
    lineBefore.className = classes.rule;
    root.append(lineBefore);
    decorate(root);

    const labeledTokens = classes.labeled.split(/\s+/).filter(Boolean);
    let labelEl: HTMLElement | null = null;
    let lineAfter: HTMLElement | null = null;
    behavior.watchLabel((text) => {
        const labeled = text !== '';
        for (const token of labeledTokens) root.classList.toggle(token, labeled);
        lineBefore.className = labeled ? classes.line : classes.rule;
        if (labeled && !labelEl) {
            labelEl = document.createElement('span');
            labelEl.className = classes.label;
            lineAfter = document.createElement('hr');
            lineAfter.className = classes.line;
            root.append(labelEl, lineAfter);
        } else if (!labeled && labelEl) {
            labelEl.remove();
            lineAfter?.remove();
            labelEl = null;
            lineAfter = null;
        }
        if (labelEl) labelEl.textContent = text;
    });
}
