/** @filedesc USWDS display & special components — usa-alert, usa-card, usa-table, usa-prose, etc. */
import { effect } from '@preact/signals-core';
import type { AdapterContext, DisplayComponentBehavior, DataTableBehavior } from '@formspec-org/webcomponent';
import {
    formatMoney,
    renderMarkdown,
    writeRichText,
    renderDefaultProgressBar,
    renderDefaultDataTable,
    readValidationSummaryRows,
    uiText,
    watchText,
} from '@formspec-org/webcomponent';

const ALERT_SEVERITY: Record<string, string> = {
    info: 'info',
    success: 'success',
    warning: 'warning',
    error: 'error',
};

function badgeVariantClass(variant: string | undefined): string {
    switch (variant) {
        case 'success':
            return 'formspec-uswds-tag--success';
        case 'warning':
            return 'formspec-uswds-tag--warning';
        case 'error':
            return 'formspec-uswds-tag--error';
        case 'primary':
            return 'formspec-uswds-tag--primary';
        default:
            return '';
    }
}

export function renderUSWDSHeading(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const wrap = document.createElement('div');
    wrap.className = 'usa-prose formspec-uswds-heading-wrap';
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
    wrap.appendChild(el);
    actx.applyCssClass(wrap, comp);
    actx.applyAccessibility(wrap, comp);
    actx.applyStyle(wrap, comp.style);
    parent.appendChild(wrap);
}

export function renderUSWDSText(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const wrap = document.createElement('div');
    wrap.className = 'usa-prose formspec-uswds-text-wrap';
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
    wrap.appendChild(el);
    actx.applyCssClass(wrap, comp);
    actx.applyAccessibility(wrap, comp);
    actx.applyStyle(wrap, comp.style);
    parent.appendChild(wrap);
}

export function renderUSWDSCard(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const card = document.createElement('div');
    if (comp.id) card.id = comp.id;
    card.className = 'usa-card';
    if (comp.elevation != null && comp.elevation > 0) {
        card.dataset.elevation = String(comp.elevation);
    }
    const container = document.createElement('div');
    container.className = 'usa-card__container';
    if (comp.title) {
        const header = document.createElement('div');
        header.className = 'usa-card__header';
        const h = document.createElement('h3');
        h.className = 'usa-card__heading';
        host.watchCompText(comp, 'title', comp.title, (text) => { h.textContent = text; });
        header.appendChild(h);
        container.appendChild(header);
    }
    const body = document.createElement('div');
    body.className = 'usa-card__body';
    if (comp.subtitle) {
        const sub = document.createElement('p');
        host.watchCompText(comp, 'subtitle', comp.subtitle, (text) => { sub.textContent = text; });
        body.appendChild(sub);
    }
    container.appendChild(body);
    card.appendChild(container);
    actx.applyCssClass(card, comp);
    actx.applyAccessibility(card, comp);
    actx.applyStyle(card, comp.style);
    parent.appendChild(card);
    if (comp.children) {
        for (const child of comp.children) {
            host.renderComponent(child, body, host.prefix);
        }
    }
}

export function renderUSWDSAlert(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const severity = comp.severity || 'info';
    const usaSeverity = ALERT_SEVERITY[severity] || 'info';
    // No wrapper: USWDS spaces an alert with `* + .usa-alert { margin-top: 1rem }`, which only fires when
    // the alert itself is the adjacent sibling. A wrapping div swallows it.
    const root = document.createElement('div');
    if (comp.id) root.id = comp.id;
    root.className = `usa-alert usa-alert--${usaSeverity}`;
    root.setAttribute('role', severity === 'error' || severity === 'warning' ? 'alert' : 'status');

    const body = document.createElement('div');
    body.className = 'usa-alert__body';

    if (comp.title) {
        const h = document.createElement('h3');
        h.className = 'usa-alert__heading';
        host.watchCompText(comp, 'title', comp.title, (text) => { h.textContent = text; });
        body.appendChild(h);
    }

    const p = document.createElement('p');
    p.className = 'usa-alert__text';
    if (comp.bind) {
        const itemFullName = host.prefix ? `${host.prefix}.${comp.bind}` : comp.bind;
        host.cleanupFns.push(
            effect(() => {
                const sig = host.engine.signals[itemFullName] ?? host.engine.variableSignals?.[`#:${comp.bind}`];
                const v = sig?.value;
                p.textContent = v != null ? String(v) : '';
            })
        );
    } else {
        host.watchCompText(comp, 'text', comp.text || comp.description || '', (text) => {
            writeRichText(p, text, { inline: true });
        });
    }
    body.appendChild(p);
    root.appendChild(body);
    if (comp.dismissible) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'usa-button usa-button--unstyled formspec-focus-ring';
        watchText(actx, uiText(actx.engine, 'alert.dismiss'), (text) => {
            closeBtn.setAttribute('aria-label', text);
            closeBtn.textContent = text;
        });
        closeBtn.addEventListener('click', () => root.remove());
        root.appendChild(closeBtn);
    }
    actx.applyCssClass(root, comp);
    actx.applyAccessibility(root, comp);
    actx.applyStyle(root, comp.style);
    parent.appendChild(root);
}

export function renderUSWDSBadge(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement('span');
    if (comp.id) el.id = comp.id;
    const variantCls = badgeVariantClass(comp.variant);
    el.className = ['usa-tag', 'formspec-badge', variantCls].filter(Boolean).join(' ');
    host.watchCompText(comp, 'text', comp.text || '', (text) => {
        el.textContent = text;
    });
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
}

export function renderUSWDSProgressBar(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    renderDefaultProgressBar(behavior, parent, actx);
    const wrap = parent.querySelector(':scope > .formspec-progress-bar:last-of-type');
    wrap?.classList.add('formspec-uswds-progress');
}

export function renderUSWDSSummary(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const prose = document.createElement('div');
    prose.className = 'usa-prose formspec-uswds-summary-wrap';
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
    prose.appendChild(el);
    actx.applyCssClass(prose, comp);
    actx.applyAccessibility(prose, comp);
    actx.applyStyle(prose, comp.style);
    parent.appendChild(prose);
}

export function renderUSWDSValidationSummary(
    behavior: DisplayComponentBehavior,
    parent: HTMLElement,
    actx: AdapterContext
): void {
    const { comp, host } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-validation-summary formspec-uswds-validation-summary';
    el.setAttribute('aria-live', 'polite');
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);

    host.cleanupFns.push(
        effect(() => {
            const rows = readValidationSummaryRows(host, comp, false);
            el.replaceChildren();
            el.classList.toggle('formspec-validation-summary--visible', rows.length > 0);
            if (rows.length === 0) return;

            const errorCount = rows.filter((row) => row.severity === 'error').length;
            const alertRoot = document.createElement('div');
            alertRoot.className =
                errorCount > 0
                    ? 'usa-alert usa-alert--error margin-bottom-2'
                    : 'usa-alert usa-alert--warning margin-bottom-2';
            alertRoot.setAttribute('role', 'alert');

            const body = document.createElement('div');
            body.className = 'usa-alert__body';
            const heading = document.createElement('h3');
            heading.className = 'usa-alert__heading';
            heading.textContent = uiText(host.engine, 'validationSummary.heading').value;
            body.appendChild(heading);

            const intro = document.createElement('p');
            intro.className = 'usa-alert__text';
            const total = rows.length;
            const introKey = errorCount > 0
                ? (errorCount === 1 ? 'validationSummary.errorCountOne' : 'validationSummary.errorCount')
                : (total === 1 ? 'validationSummary.issueCountOne' : 'validationSummary.issueCount');
            intro.textContent = uiText(host.engine, introKey, { count: errorCount > 0 ? errorCount : total }).value;
            body.appendChild(intro);

            const list = document.createElement('ul');
            list.className = 'usa-list';

            for (const { message, text, jumpPath, jumpHref } of rows) {
                const li = document.createElement('li');
                if (jumpPath !== null && jumpHref !== null) {
                    // A link to the control — a place on the page, which is what a screen reader calls it and
                    // what USWDS's own error pattern draws. The click lands the focus the way `focusField`
                    // does (disclosures opened, wizard step revealed); the fragment names the same control.
                    const link = document.createElement('a');
                    link.href = jumpHref;
                    link.className = 'usa-link formspec-validation-summary-link formspec-focus-ring';
                    link.textContent = text;
                    link.addEventListener('click', (event) => {
                        event.preventDefault();
                        host.focusField(jumpPath);
                    });
                    li.appendChild(link);
                } else {
                    // Match USWDS comparison pane: plain message bullets (no label prefix, no icons).
                    li.appendChild(document.createTextNode(message));
                }
                list.appendChild(li);
            }
            body.appendChild(list);
            alertRoot.appendChild(body);
            el.appendChild(alertRoot);
        })
    );
}

export function renderUSWDSConditionalGroup(
    behavior: DisplayComponentBehavior,
    parent: HTMLElement,
    actx: AdapterContext
): void {
    const { comp, host } = behavior;
    const el = document.createElement('div');
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-conditional-group';
    actx.applyCssClass(el, comp);
    actx.applyAccessibility(el, comp);
    actx.applyStyle(el, comp.style);
    parent.appendChild(el);
    if (comp.children) {
        for (const child of comp.children) {
            host.renderComponent(child, el, host.prefix);
        }
    }
}

export function renderUSWDSDataTable(behavior: DataTableBehavior, parent: HTMLElement, actx: AdapterContext): void {
    renderDefaultDataTable(behavior, parent, actx);
    const wrap = parent.querySelector(':scope > .formspec-data-table-wrapper');
    const table = wrap?.querySelector('table');
    table?.classList.add('usa-table');
    wrap?.querySelectorAll('input.formspec-datatable-input').forEach((node) => node.classList.add('usa-input'));
    wrap?.querySelectorAll('select.formspec-datatable-input').forEach((node) => node.classList.add('usa-select'));
    wrap?.querySelectorAll('.formspec-datatable-remove').forEach((node) => {
        node.classList.add('usa-button', 'usa-button--secondary', 'formspec-focus-ring');
    });
    wrap?.querySelectorAll('.formspec-datatable-add').forEach((node) => {
        node.classList.add('usa-button', 'usa-button--outline', 'formspec-focus-ring');
    });
}
