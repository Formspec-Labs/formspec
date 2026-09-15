/** @filedesc Default DOM for display components — Heading through ValidationSummary. */
import { effect } from '@preact/signals-core';
import type { AdapterContext } from '../types';
import type { DisplayComponentBehavior } from '../display-behaviors';
import { renderMarkdown } from '../display-markdown';
import { writeRichText } from '../rich-text-dom.js';
import { formatMoney } from '../../format';
import { uiText } from '../ui-text.js';
import { watchText } from '../watch-text.js';
import { readValidationSummaryRows } from '../validation-summary.js';

function applySurfaceProps(el: HTMLElement, comp: any, resolveToken: (value: unknown) => unknown): void {
    if (comp.padding != null) el.style.padding = String(resolveToken(comp.padding));
    if (comp.background != null) el.style.background = String(resolveToken(comp.background));
    if (comp.border != null) el.style.border = String(resolveToken(comp.border));
    if (comp.radius != null) el.style.borderRadius = String(resolveToken(comp.radius));
    if (comp.elevation != null) el.dataset.elevation = String(resolveToken(comp.elevation));
}

export function renderDefaultHeading(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement(`h${comp.level || 2}`);
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-heading';
    if (comp.bind) {
        const itemFullName = host.prefix ? `${host.prefix}.${comp.bind}` : comp.bind;
        host.cleanupFns.push(
            effect(() => {
                const sig = host.engine.signals[itemFullName] ?? host.engine.variableSignals?.[`#:${comp.bind}`];
                const v = sig?.value;
                el.textContent = v != null ? String(v) : '';
            })
        );
    } else {
        host.watchCompText(comp, 'text', comp.text || '', (text) => {
            writeRichText(el, text, { inline: true });
        });
    }
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
}

export function renderDefaultText(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement('p');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-text';
    if (comp.format === 'markdown') el.classList.add('formspec-text--markdown');
    const isMarkdown = comp.format === 'markdown';
    if (comp.bind) {
        const itemFullName = host.prefix ? `${host.prefix}.${comp.bind}` : comp.bind;
        const varKey = `#:${comp.bind}`;
        host.cleanupFns.push(
            effect(() => {
                const sig = host.engine.signals[itemFullName] ?? host.engine.variableSignals?.[varKey];
                const v = sig?.value;
                if (v != null && typeof v === 'object' && 'amount' in v) {
                    el.textContent = formatMoney(v as any);
                } else if (isMarkdown && v != null) {
                    el.innerHTML = renderMarkdown(String(v));
                } else {
                    el.textContent = v != null ? String(v) : '';
                }
            })
        );
    } else {
        host.watchCompText(comp, 'text', comp.text || '', (text) => {
            // `format: 'markdown'` is the Component-tier opt-in (wider grammar, HTML string); everything else
            // goes through the core §4.2.1 subset, built as DOM.
            if (isMarkdown && text) el.innerHTML = renderMarkdown(text);
            else writeRichText(el, text, { inline: true });
        });
    }
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
}

export function renderDefaultCard(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-card';
    if (comp.title) {
        const h3 = document.createElement('h3');
        h3.className = 'formspec-card-title';
        host.watchCompText(comp, 'title', comp.title, (text) => { h3.textContent = text; });
        el.appendChild(h3);
    }
    if (comp.subtitle) {
        const sub = document.createElement('p');
        sub.className = 'formspec-card-subtitle';
        host.watchCompText(comp, 'subtitle', comp.subtitle, (text) => { sub.textContent = text; });
        el.appendChild(sub);
    }
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    applySurfaceProps(el, comp, host.resolveToken);
    parent.appendChild(el);
    if (comp.children) {
        for (const child of comp.children) {
            host.renderComponent(child, el, host.prefix);
        }
    }
}

export function renderDefaultAlert(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const severity = comp.severity || 'info';
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = `formspec-alert formspec-alert--${severity}`;
    el.setAttribute('role', severity === 'error' || severity === 'warning' ? 'alert' : 'status');
    if (comp.dismissible) {
        el.classList.add('formspec-alert--dismissible');
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'formspec-alert-close formspec-focus-ring';
        closeBtn.textContent = '\u00d7';
        watchText(actx, uiText(actx.engine, 'alert.dismiss'), (text) => { closeBtn.setAttribute('aria-label', text); });
        closeBtn.addEventListener('click', () => {
            el.remove();
        });
        el.appendChild(closeBtn);
    }
    const textSpan = document.createElement('span');
    if (comp.bind) {
        const itemFullName = host.prefix ? `${host.prefix}.${comp.bind}` : comp.bind;
        host.cleanupFns.push(
            effect(() => {
                const sig = host.engine.signals[itemFullName] ?? host.engine.variableSignals?.[`#:${comp.bind}`];
                const v = sig?.value;
                textSpan.textContent = v != null ? String(v) : '';
            })
        );
    } else {
        host.watchCompText(comp, 'text', comp.text || '', (text) => {
            writeRichText(textSpan, text, { inline: true });
        });
    }
    el.appendChild(textSpan);
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
}

export function renderDefaultBadge(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement('span');
    if (comp.id) el.id = comp.id;
    el.className = `formspec-badge formspec-badge--${comp.variant || 'default'}`;
    host.watchCompText(comp, 'text', comp.text || '', (text) => {
        el.textContent = text;
    });
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
}

export function renderDefaultProgressBar(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const wrapper = document.createElement('div');
    if (comp.id) wrapper.id = comp.id;
    wrapper.className = 'formspec-progress-bar';

    const progressEl = document.createElement('progress');
    const maxVal = comp.max || 100;
    progressEl.max = maxVal;
    if (comp.label) host.watchCompText(comp, 'label', comp.label, (text) => { progressEl.setAttribute('aria-label', text); });

    if (comp.bind) {
        const fullName = host.prefix ? `${host.prefix}.${comp.bind}` : comp.bind;
        const percentLabel = document.createElement('span');
        percentLabel.className = 'formspec-progress-percent';

        host.cleanupFns.push(
            effect(() => {
                const sig = host.engine.signals[fullName];
                const val = Number(sig?.value ?? comp.value ?? 0);
                progressEl.value = val;
                if (comp.showPercent) {
                    percentLabel.textContent = `${Math.round((val / maxVal) * 100)}%`;
                }
            })
        );

        wrapper.appendChild(progressEl);
        if (comp.showPercent) wrapper.appendChild(percentLabel);
    } else {
        progressEl.value = comp.value || 0;
        wrapper.appendChild(progressEl);
        if (comp.showPercent) {
            const percentLabel = document.createElement('span');
            percentLabel.className = 'formspec-progress-percent';
            percentLabel.textContent = `${Math.round(((comp.value || 0) / maxVal) * 100)}%`;
            wrapper.appendChild(percentLabel);
        }
    }

    actx.applyCssClass(wrapper, comp);
    actx.applyAccessibility(wrapper, comp);
    actx.applyStyle(wrapper, comp.style);
    parent.appendChild(wrapper);
}

export function renderDefaultSummary(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement('dl');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-summary';

    if (comp.items) {
        comp.items.forEach((item: any, index: number) => {
            const dt = document.createElement('dt');
            host.watchCompText(comp, `items[${index}].label`, item.label || '', (text) => { dt.textContent = text; });
            el.appendChild(dt);

            const dd = document.createElement('dd');
            el.appendChild(dd);

            if (item.bind) {
                const fullName = host.prefix ? `${host.prefix}.${item.bind}` : item.bind;
                const varKey = `#:${item.bind}`;
                host.cleanupFns.push(
                    effect(() => {
                        const sig = host.engine.signals[fullName] ?? host.engine.variableSignals?.[varKey];
                        const v = sig?.value;
                        if (v != null && typeof v === 'object' && 'amount' in v) {
                            dd.textContent = formatMoney(v as any);
                        } else if (v != null && item.optionSet) {
                            const def = (host.engine as any).getDefinition?.();
                            const entry = def?.optionSets?.[item.optionSet];
                            const opts: Array<{ value: string; label: string }> = Array.isArray(entry)
                                ? entry
                                : (entry?.options ?? []);
                            const match = opts.find((o: any) => o.value === String(v));
                            dd.textContent = match ? match.label : String(v);
                        } else {
                            dd.textContent = v != null ? String(v) : '\u2014';
                        }
                    })
                );
            }
        });
    }

    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
}

export function renderDefaultValidationSummary(
    behavior: DisplayComponentBehavior,
    parent: HTMLElement,
    actx: AdapterContext
): void {
    const { comp, host } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-validation-summary';
    el.setAttribute('aria-live', 'polite');
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);

    host.cleanupFns.push(
        effect(() => {
            const rows = readValidationSummaryRows(host, comp, true);
            el.replaceChildren();
            el.classList.toggle('formspec-validation-summary--visible', rows.length > 0);
            if (rows.length === 0) return;

            const errorCount = rows.filter((row) => row.severity === 'error').length;
            const headerText =
                errorCount > 0
                    ? `Please fix ${errorCount === 1 ? 'this error' : `these ${errorCount} errors`} before continuing:`
                    : 'Please review the following before continuing:';
            const header = document.createElement('h2');
            header.className = 'formspec-validation-summary-title';
            header.textContent = headerText;
            el.appendChild(header);

            const severityIcon: Record<string, string> = { error: '✕', warning: '!', info: 'i' };

            for (const { severity, labeled, jumpPath } of rows) {
                const row = document.createElement('div');
                row.className = `formspec-shape-${severity}`;
                const icon = document.createElement('span');
                icon.className = 'formspec-shape-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = severityIcon[severity] ?? '!';
                row.appendChild(icon);
                if (jumpPath !== null) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'formspec-validation-summary-link formspec-focus-ring';
                    button.textContent = labeled;
                    button.addEventListener('click', () => {
                        host.focusField(jumpPath);
                    });
                    row.appendChild(button);
                } else {
                    const text = document.createElement('span');
                    text.textContent = labeled;
                    row.appendChild(text);
                }
                el.appendChild(row);
            }
        })
    );
}
