import type { IFormEngine } from '@formspec-org/engine/render';
import { wasmEvaluateScreenerDocument } from '@formspec-org/engine';
import { FormDefinition, ScreenerDocument, FormItem, ScreenerBind, DeterminationRecord, PhaseResult } from '@formspec-org/types';
import type { ScreenerRoute } from '../types.js';

/** Use as {@link ScreenerRoute.extensions} only for plain objects (excludes null, arrays, Date, etc.). */
function asRouteExtensionsRecord(value: unknown): Record<string, any> | undefined {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, any>;
}

function firstMatchedRouteFromDetermination(determination: DeterminationRecord): ScreenerRoute | null {
    const matched =
        determination.overrides?.matched?.[0] ?? determination.phases?.flatMap((p: PhaseResult) => p.matched)?.[0];
    if (!matched) return null;
    const extensions = asRouteExtensionsRecord(matched.metadata);
    return { target: matched.target, label: matched.label, extensions } as ScreenerRoute;
}

/**
 * Evaluate a standalone Screener Document (WASM) and return the first matched route, if any.
 * See specs/screener/screener-spec.md — embedded `definition.screener` is not supported.
 */
export function evaluateScreenerDocumentForRoute(
    screenerDocument: ScreenerDocument,
    answers: Record<string, unknown>,
): ScreenerRoute | null {
    const determination = wasmEvaluateScreenerDocument(screenerDocument, answers);
    return firstMatchedRouteFromDetermination(determination);
}

export interface ScreenerHost {
    _definition: FormDefinition;
    /** Standalone Screener Document (`$formspecScreener`). Required for the gate UI. */
    _screenerDocument: ScreenerDocument | null;
    engine: IFormEngine;
    _screenerCompleted: boolean;
    _screenerRoute: ScreenerRoute | null;
    /** Initial answers when the screener mounts — from {@link extractScreenerSeedFromData} / host integration. */
    screenerSeedAnswers: Record<string, unknown> | null;
    classifyScreenerRoute(route: ScreenerRoute | null | undefined): 'none' | 'internal' | 'external';
    emitScreenerStateChange(reason: string, answers?: Record<string, unknown>): void;
    dispatchEvent(event: Event): boolean;
    render(): void;
}

/**
 * True when `answers` satisfies the same required / “at least one answer” rules as the Continue button.
 */
export function screenerAnswersSatisfyRequired(screener: ScreenerDocument, answers: Record<string, unknown>): boolean {
    const binds = screener.binds || [];
    const requiredPaths = new Set(
        binds.filter((b: ScreenerBind) => String(b.required) === 'true' || b.required === true).map((b: ScreenerBind) => b.path),
    );
    if (requiredPaths.size > 0) {
        for (const item of screener.items) {
            if (!requiredPaths.has(item.key)) continue;
            const val = answers[item.key];
            if (val == null || val === '') return false;
        }
        return true;
    }
    return screener.items.some((it: FormItem) => {
        const val = answers[it.key];
        return val != null && val !== '';
    });
}

function normalizeMoneySeed(raw: unknown, defaultCurrency: string): { amount: number; currency: string } | null {
    if (raw == null) return null;
    if (typeof raw === 'number' && !Number.isNaN(raw)) {
        return { amount: raw, currency: defaultCurrency };
    }
    if (typeof raw === 'object' && raw !== null && 'amount' in raw) {
        const r = raw as { amount: unknown; currency?: unknown };
        const n = typeof r.amount === 'string' ? parseFloat(r.amount) : Number(r.amount);
        if (Number.isNaN(n)) return null;
        return {
            amount: n,
            currency: typeof r.currency === 'string' ? r.currency : defaultCurrency,
        };
    }
    return null;
}

/**
 * Coerce values from external systems (saved responses, REST/GraphQL, auth claims, etc.) into
 * shapes the screener DOM and WASM screener evaluation expect.
 */
export function normalizeScreenerSeedForItem(item: FormItem, raw: unknown, defaultCurrency: string): unknown {
    if (raw === undefined) return undefined;
    if (item.dataType === 'boolean') return !!raw;
    if (item.dataType === 'money') return normalizeMoneySeed(raw, defaultCurrency);
    if (item.dataType === 'integer') {
        if (raw === null || raw === '') return null;
        const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
        return Number.isNaN(n) ? null : n;
    }
    if (item.dataType === 'decimal') {
        if (raw === null || raw === '') return null;
        const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
        return Number.isNaN(n) ? null : n;
    }
    return raw === null ? null : raw;
}

/**
 * Build the in-memory answer map for the screener from optional seed data (same keys as screener items).
 */
export function buildInitialScreenerAnswers(screener: ScreenerDocument, seed: Record<string, any> | null, defaultCurrency: string): Record<string, any> {
    const answers: Record<string, any> = {};
    for (const item of screener.items) {
        if (item.dataType === 'boolean') {
            answers[item.key] =
                seed && Object.prototype.hasOwnProperty.call(seed, item.key)
                    ? !!seed[item.key]
                    : false;
            continue;
        }
        if (seed && Object.prototype.hasOwnProperty.call(seed, item.key)) {
            const norm = normalizeScreenerSeedForItem(item, seed[item.key], defaultCurrency);
            if (norm !== undefined) answers[item.key] = norm;
        }
    }
    return answers;
}

/**
 * From any plain object, select only entries whose keys match the standalone screener's `items`.
 * Set {@link FormspecRender.screenerDocument} before {@link FormspecRender.definition} when using
 * {@link FormspecRender.initialData} so seeds line up with the same document.
 */
export function extractScreenerSeedFromData(
    screenerDocument: ScreenerDocument | null | undefined,
    data: Record<string, any> | null | undefined,
): Record<string, any> | null {
    const items = screenerDocument?.items;
    if (!Array.isArray(items) || !items.length || !data || typeof data !== 'object') {
        return null;
    }
    const seed: Record<string, any> = {};
    for (const item of items) {
        const k = item?.key;
        if (k && Object.prototype.hasOwnProperty.call(data, k)) {
            seed[k] = data[k];
        }
    }
    return Object.keys(seed).length ? seed : null;
}

/** Shallow copy of `data` without top-level keys that match screener item keys. */
export function omitScreenerKeysFromData(
    screenerDocument: ScreenerDocument | null | undefined,
    data: Record<string, any>,
): Record<string, any> {
    const items = screenerDocument?.items;
    if (!Array.isArray(items) || !items.length) {
        return { ...data };
    }
    const drop = new Set(items.map((i: FormItem) => i?.key).filter(Boolean));
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        if (!drop.has(k)) {
            out[k] = v;
        }
    }
    return out;
}

/** True when a standalone Screener Document is attached and has at least one item. */
export function hasActiveScreener(screenerDocument: ScreenerDocument | null | undefined): boolean {
    return Boolean(screenerDocument) && Array.isArray(screenerDocument?.items) && (screenerDocument?.items?.length ?? 0) > 0;
}

export function renderScreener(host: ScreenerHost, container: HTMLElement): void {
    if (!hasActiveScreener(host._screenerDocument)) return;
    const screener = host._screenerDocument!;
    const panel = document.createElement('div');
    panel.className = 'formspec-screener';

    const heading = document.createElement('h2');
    heading.className = 'formspec-screener-heading';
    heading.textContent = typeof host._definition.title === 'string' ? host._definition.title : 'Screening Questions';
    panel.appendChild(heading);

    if (typeof host._definition.description === 'string' && host._definition.description) {
        const intro = document.createElement('p');
        intro.className = 'formspec-screener-intro';
        intro.textContent = host._definition.description;
        panel.appendChild(intro);
    }

    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'formspec-screener-fields';
    panel.appendChild(fieldsContainer);

    const defaultCurrency = host._definition.formPresentation?.defaultCurrency || 'USD';
    const answers = buildInitialScreenerAnswers(screener, host.screenerSeedAnswers, defaultCurrency);

    for (const item of (screener.items as FormItem[])) {
        const fieldWrapper = document.createElement('div');
        fieldWrapper.className = 'formspec-field formspec-screener-field';
        fieldWrapper.dataset.name = item.key;

        const fieldId = `screener-${item.key}`;
        const label = document.createElement('label');
        label.textContent = host.engine.getLabel(item);
        label.htmlFor = fieldId;
        fieldWrapper.appendChild(label);

        const hintId = `${fieldId}-hint`;
        if (item.hint) {
            const hint = document.createElement('span');
            hint.className = 'formspec-hint';
            hint.id = hintId;
            hint.textContent = item.hint;
            fieldWrapper.appendChild(hint);
        }

        const clearFieldError = () => {
            fieldWrapper.querySelector('.formspec-error')?.remove();
        };

        if (item.dataType === 'choice' && item.options) {
            const select = document.createElement('select');
            select.className = 'formspec-input';
            select.id = fieldId;
            if (item.hint) select.setAttribute('aria-describedby', hintId);
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '-- Select --';
            select.appendChild(emptyOpt);
            for (const opt of (item.options || [])) {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label || opt.value;
                select.appendChild(option);
            }
            const seededChoice = answers[item.key];
            if (seededChoice != null && seededChoice !== '') {
                select.value = String(seededChoice);
            }
            select.addEventListener('change', () => {
                answers[item.key] = select.value || null;
                clearFieldError();
            });
            fieldWrapper.appendChild(select);
        } else if (item.dataType === 'boolean') {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'formspec-input';
            checkbox.id = fieldId;
            if (item.hint) checkbox.setAttribute('aria-describedby', hintId);
            checkbox.checked = !!answers[item.key];
            checkbox.addEventListener('change', () => {
                answers[item.key] = checkbox.checked;
                clearFieldError();
            });
            fieldWrapper.appendChild(checkbox);
        } else if (item.dataType === 'money') {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'formspec-input';
            input.id = fieldId;
            input.placeholder = 'Amount';
            if (item.hint) input.setAttribute('aria-describedby', hintId);
            const moneySeed = answers[item.key];
            if (moneySeed && typeof moneySeed.amount === 'number' && !Number.isNaN(moneySeed.amount)) {
                input.value = String(moneySeed.amount);
            }
            input.addEventListener('input', () => {
                const val = parseFloat(input.value);
                answers[item.key] = isNaN(val) ? null : { amount: val, currency: host._definition.formPresentation?.defaultCurrency || 'USD' };
                clearFieldError();
            });
            fieldWrapper.appendChild(input);
        } else {
            const input = document.createElement('input');
            input.type = item.dataType === 'integer' || item.dataType === 'decimal' ? 'number' : 'text';
            input.className = 'formspec-input';
            input.id = fieldId;
            if (item.hint) input.setAttribute('aria-describedby', hintId);
            const v = answers[item.key];
            if (v != null && v !== '') {
                input.value = String(v);
            }
            input.addEventListener('input', () => {
                const val = input.value;
                if (item.dataType === 'integer') {
                    answers[item.key] = val ? parseInt(val, 10) : null;
                } else if (item.dataType === 'decimal') {
                    answers[item.key] = val ? parseFloat(val) : null;
                } else {
                    answers[item.key] = val || null;
                }
                clearFieldError();
            });
            fieldWrapper.appendChild(input);
        }

        fieldsContainer.appendChild(fieldWrapper);
    }

    const continueBtn = document.createElement('button');
    continueBtn.type = 'button';
    continueBtn.className = 'formspec-screener-continue formspec-focus-ring';
    continueBtn.textContent = 'Continue';
    continueBtn.addEventListener('click', () => {
        // Clear prior errors
        for (const err of fieldsContainer.querySelectorAll('.formspec-error')) {
            err.remove();
        }

        // Validate: check screener.binds for required fields; if no binds exist,
        // require at least one answer to prevent empty routing.
        const binds = screener.binds || [];
        const requiredPaths = new Set(
            binds
                .filter((b: ScreenerBind) => String(b.required) === 'true' || b.required === true)
                .map((b: ScreenerBind) => b.path)
        );
        let valid = true;

        if (requiredPaths.size > 0) {
            for (const item of screener.items) {
                if (!requiredPaths.has(item.key)) continue;
                const val = answers[item.key];
                if (val == null || val === '') {
                    valid = false;
                    const wrapper = fieldsContainer.querySelector(`[data-name="${item.key}"]`);
                    if (wrapper) {
                        const err = document.createElement('div');
                        err.className = 'formspec-error';
                        err.setAttribute('role', 'alert');
                        err.setAttribute('aria-live', 'assertive');
                        err.textContent = 'Required';
                        wrapper.appendChild(err);
                    }
                }
            }
        } else {
            // No explicit required binds — require at least one non-null answer
            const hasAny = (screener.items as FormItem[]).some((it: FormItem) => {
                const val = answers[it.key];
                return val != null && val !== '';
            });
            if (!hasAny) {
                valid = false;
                // Show error on every unfilled field
                for (const item of screener.items) {
                    const val = answers[item.key];
                    if (val == null || val === '') {
                        const wrapper = fieldsContainer.querySelector(`[data-name="${item.key}"]`);
                        if (wrapper) {
                            const err = document.createElement('div');
                            err.className = 'formspec-error';
                            err.setAttribute('role', 'alert');
                            err.setAttribute('aria-live', 'assertive');
                            err.textContent = 'Required';
                            wrapper.appendChild(err);
                        }
                    }
                }
            }
        }
        if (!valid) return;

        let route: ScreenerRoute | null = null;
        try {
            route = evaluateScreenerDocumentForRoute(screener, answers);
        } catch {
            route = null;
        }
        host._screenerRoute = route;
        const routeType = host.classifyScreenerRoute(route);
        const isInternal = routeType === 'internal';

        host.dispatchEvent(new CustomEvent('formspec-screener-route', {
            detail: { route, answers, routeType, isInternal },
            bubbles: true,
            composed: true,
        }));

        if (isInternal) {
            host._screenerCompleted = true;
            host.emitScreenerStateChange('route-internal', answers);
            host.render();
            return;
        }

        host.emitScreenerStateChange(route ? 'route-external' : 'route-none', answers);

        // For external routes, replace the screener with a route result panel
        // so the user sees feedback instead of a dead-end.
        if (route) {
            showExternalRouteResult(host, container, route);
        }
    });
    panel.appendChild(continueBtn);

    container.appendChild(panel);
}

function showExternalRouteResult(
    host: ScreenerHost,
    container: HTMLElement,
    route: { target: string; label?: string },
): void {
    container.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'formspec-screener-routed';

    const heading = document.createElement('h2');
    heading.className = 'formspec-screener-heading';
    heading.textContent = route.label || 'Routed to another form';
    panel.appendChild(heading);

    const target = document.createElement('p');
    target.className = 'formspec-screener-routed-target';
    target.textContent = route.target;
    panel.appendChild(target);

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'formspec-screener-continue formspec-focus-ring';
    backBtn.textContent = 'Back to screening';
    backBtn.addEventListener('click', () => {
        host._screenerRoute = null;
        host.emitScreenerStateChange('restart', undefined);
        host.render();
    });
    panel.appendChild(backBtn);

    container.appendChild(panel);
}
