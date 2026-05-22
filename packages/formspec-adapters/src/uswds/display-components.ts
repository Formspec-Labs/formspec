/** @filedesc USWDS display & special components — usa-alert, usa-card, usa-table, usa-prose, etc. */
import { effect } from '@preact/signals-core';
import type { AdapterContext, DisplayComponentBehavior, DataTableBehavior } from '@formspec-org/webcomponent';
import {
    formatMoney,
    renderMarkdown,
    renderDefaultProgressBar,
    renderDefaultDataTable,
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
    wrap.className = 'usa-prose formspec-uswds-heading-wrap margin-bottom-2';
    const el = document.createElement(`h${comp.level || 2}`);
    if (comp.id) el.id = comp.id;
    el.className = 'formspec-heading margin-top-0';
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
        el.textContent = host.resolveCompText(comp, 'text', comp.text || '');
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
    el.className = 'formspec-text margin-top-0';
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
    } else if (isMarkdown && comp.text) {
        el.innerHTML = renderMarkdown(host.resolveCompText(comp, 'text', comp.text));
    } else {
        el.textContent = host.resolveCompText(comp, 'text', comp.text || '');
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
        h.textContent = host.resolveCompText(comp, 'title', comp.title);
        header.appendChild(h);
        container.appendChild(header);
    }
    const body = document.createElement('div');
    body.className = 'usa-card__body';
    if (comp.subtitle) {
        const sub = document.createElement('p');
        sub.textContent = host.resolveCompText(comp, 'subtitle', comp.subtitle);
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
    const wrap = document.createElement('div');
    wrap.className = 'formspec-uswds-alert-wrap margin-y-2';
    const root = document.createElement('div');
    if (comp.id) root.id = comp.id;
    root.className = `usa-alert usa-alert--${usaSeverity}`;
    root.setAttribute('role', severity === 'error' || severity === 'warning' ? 'alert' : 'status');

    const body = document.createElement('div');
    body.className = 'usa-alert__body';

    const titleText = host.resolveCompText(comp, 'title', comp.title || '');
    if (titleText) {
        const h = document.createElement('h3');
        h.className = 'usa-alert__heading';
        h.textContent = titleText;
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
        p.textContent = host.resolveCompText(comp, 'text', comp.text || comp.description || '');
    }
    body.appendChild(p);
    root.appendChild(body);
    if (comp.dismissible) {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'usa-button usa-button--unstyled formspec-focus-ring';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        closeBtn.textContent = 'Dismiss';
        closeBtn.addEventListener('click', () => root.remove());
        root.appendChild(closeBtn);
    }
    wrap.appendChild(root);
    actx.applyCssClass(root, comp);
    actx.applyAccessibility(root, comp);
    actx.applyStyle(root, comp.style);
    parent.appendChild(wrap);
}

export function renderUSWDSBadge(behavior: DisplayComponentBehavior, parent: HTMLElement, actx: AdapterContext): void {
    const { comp, host } = behavior;
    const el = document.createElement('span');
    if (comp.id) el.id = comp.id;
    const variantCls = badgeVariantClass(comp.variant);
    el.className = ['usa-tag', 'formspec-badge', variantCls].filter(Boolean).join(' ');
    el.textContent = host.resolveCompText(comp, 'text', comp.text || '');
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
        for (const item of comp.items) {
            const dt = document.createElement('dt');
            dt.textContent = item.label || '';
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
        }
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

    const source = comp.source || 'live';
    const mode = comp.mode || 'continuous';
    const showFieldErrors = comp.showFieldErrors === true;
    const jumpLinks = comp.jumpLinks === true;
    const dedupe = comp.dedupe !== false;

    host.cleanupFns.push(
        effect(() => {
            let rawResults: any[] = [];
            if (source === 'submit') {
                const detail = host.latestSubmitDetailSignal.value;
                const fromReport = detail?.validationReport?.results;
                const fromResponse = detail?.response?.validationResults;
                rawResults = Array.isArray(fromReport)
                    ? fromReport
                    : Array.isArray(fromResponse)
                      ? fromResponse
                      : [];
            } else {
                const detail = host.latestSubmitDetailSignal.value;
                const submitOccurred = detail !== null;
                const wizardNavigated = host.touchedVersion.value > 0;
                const gateOpen = mode === 'submit' ? submitOccurred : submitOccurred || wizardNavigated;
                if (!gateOpen) {
                    el.replaceChildren();
                    el.classList.remove('formspec-validation-summary--visible');
                    return;
                }
                if (mode === 'submit') {
                    const fromReport = detail?.validationReport?.results;
                    const fromResponse = detail?.response?.validationResults;
                    rawResults = Array.isArray(fromReport)
                        ? fromReport
                        : Array.isArray(fromResponse)
                          ? fromResponse
                          : [];
                } else {
                    host.engine.structureVersion.value;
                    rawResults = host.engine.getValidationReport({ profile: 'live' }).results;
                }
            }

            const filteredResults = rawResults.filter((r: any) => {
                if (showFieldErrors) return true;
                return r.source === 'shape' || r.constraintKind === 'shape';
            });

            const resolved = filteredResults.map((result: any) => ({
                result,
                target: host.resolveValidationTarget(result),
            }));

            const rows = dedupe
                ? (() => {
                      const seen = new Set<string>();
                      return resolved.filter(({ result, target }) => {
                          const key = `${result?.severity || 'error'}|${target.path || result?.path || ''}|${result?.message || ''}`;
                          if (seen.has(key)) return false;
                          seen.add(key);
                          return true;
                      });
                  })()
                : resolved;

            el.replaceChildren();
            if (rows.length === 0) {
                el.classList.remove('formspec-validation-summary--visible');
                return;
            }
            el.classList.add('formspec-validation-summary--visible');

            const errorCount = rows.filter(({ result }) => (result.severity || 'error') === 'error').length;
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
            heading.textContent = 'Please correct the following';
            body.appendChild(heading);

            const intro = document.createElement('p');
            intro.className = 'usa-alert__text';
            const total = rows.length;
            if (errorCount > 0) {
                intro.textContent =
                    errorCount === 1
                        ? 'There is 1 error on this form.'
                        : `There are ${errorCount} errors on this form.`;
            } else {
                intro.textContent =
                    total === 1
                        ? 'There is 1 issue to review on this form.'
                        : `There are ${total} issues to review on this form.`;
            }
            body.appendChild(intro);

            const list = document.createElement('ul');
            list.className = 'usa-list';

            for (const { result, target } of rows) {
                const li = document.createElement('li');
                const message = result?.message || 'Validation error';
                const withLabel = target.formLevel ? message : `${target.label}: ${message}`;
                if (jumpLinks && target.jumpable) {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'usa-button usa-button--unstyled formspec-validation-summary-link formspec-focus-ring';
                    button.textContent = withLabel;
                    button.addEventListener('click', () => {
                        host.focusField(target.path);
                    });
                    li.appendChild(button);
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
