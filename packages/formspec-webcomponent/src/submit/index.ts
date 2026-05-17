/** @filedesc Submit flow: payload building, touch-all, pending state, and validation targeting. */
import type { Signal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import {
    FormDefinition,
    FormItem,
    FormResponse,
    ValidationResult,
    ValidationReport,
} from '@formspec-org/types';
import { normalizeFieldPath, externalPathToInternal, findFieldElement } from '../navigation/index.js';
import type { NavigationHost } from '../navigation/index.js';
import type { SubmitDetail, ValidationTargetMetadata } from '../hub-types.js';

export interface SubmitHost extends NavigationHost {
    engine: IFormEngine | null;
    _definition: FormDefinition | null;
    touchedFields: Set<string>;
    touchedVersion: Signal<number>;
    _submitPendingSignal: Signal<boolean>;
    _latestSubmitDetailSignal: Signal<SubmitDetail | null>;
    dispatchEvent(event: Event): boolean;
    findItemByKey(key: string, items?: FormItem[]): FormItem | null;
    focusField?(path: string): void;
}

/**
 * Touch all fields within a specific DOM container element (e.g. a wizard panel).
 * Fields are identified by `.formspec-field[data-name]` elements.
 * Used for soft per-page wizard validation: errors become visible without blocking navigation.
 */
export function touchFieldsInContainer(
    container: Element,
    touchedFields: Set<string>,
    touchedVersion: { value: number },
): void {
    const fieldEls = container.querySelectorAll('.formspec-field[data-name]');
    let touchedAny = false;
    for (const fieldEl of fieldEls) {
        const name = (fieldEl as HTMLElement).dataset.name;
        if (name && !touchedFields.has(name)) {
            touchedFields.add(name);
            touchedAny = true;
        }
    }
    if (touchedAny) {
        touchedVersion.value += 1;
    }
}

/**
 * Mark all registered fields as touched so validation errors become visible.
 */
export function touchAllFields(host: SubmitHost): void {
    if (!host.engine) return;
    let touchedAny = false;
    // Touch all fields with error signals
    for (const key of Object.keys(host.engine.errorSignals)) {
        if (host.touchedFields.has(key)) continue;
        host.touchedFields.add(key);
        touchedAny = true;
    }
    // Also touch any other items that have validation results (e.g. groups with cardinality errors)
    for (const key of Object.keys(host.engine.validationResults)) {
        if (host.touchedFields.has(key)) continue;
        host.touchedFields.add(key);
        touchedAny = true;
    }
    if (touchedAny) {
        host.touchedVersion.value += 1;
    }
}

/**
 * Build a submit payload and validation report from the current form state.
 * Optionally dispatches `formspec-submit` with `{ response, validationReport }`.
 */
export function submit(
    host: SubmitHost,
    options?: { mode?: 'continuous' | 'submit'; emitEvent?: boolean },
): SubmitDetail | null {
    if (!host.engine) return null;
    const mode = options?.mode || 'submit';
    const emitEvent = options?.emitEvent !== false;

    touchAllFields(host);

    const response = host.engine.getResponse({ mode });
    const results = Array.isArray(response?.validationResults) ? response.validationResults : [];
    const counts = { error: 0, warning: 0, info: 0 };
    for (const result of results) {
        const severity = result?.severity as 'error' | 'warning' | 'info' | undefined;
        if (severity === 'error' || severity === 'warning' || severity === 'info') {
            counts[severity] += 1;
        }
    }
    const validationReport: ValidationReport = {
        $formspecValidationReport: '1.0',
        valid: counts.error === 0,
        results,
        counts,
        timestamp: response?.authored || new Date().toISOString(),
    };
    const detail = { response, validationReport };
    host._latestSubmitDetailSignal.value = detail;

    if (emitEvent) {
        host.dispatchEvent(new CustomEvent('formspec-submit', {
            detail,
            bubbles: true,
            composed: true,
        }));
    }

    // Scroll to first error if invalid
    if (!validationReport.valid && host.focusField) {
        const firstError = validationReport.results.find((r: ValidationResult) => r.severity === 'error');
        if (firstError) {
            host.focusField(firstError.path);
        }
    }

    return detail;
}

/**
 * Toggle shared submit pending state and emit `formspec-submit-pending-change`
 * whenever the value changes.
 */
export function setSubmitPending(host: SubmitHost, pending: boolean): void {
    const next = !!pending;
    if (next === host._submitPendingSignal.value) return;
    host._submitPendingSignal.value = next;
    host.dispatchEvent(new CustomEvent('formspec-submit-pending-change', {
        detail: { pending: next },
        bubbles: true,
        composed: true,
    }));
}

/** Returns the current shared submit pending state. */
export function isSubmitPending(host: SubmitHost): boolean {
    return host._submitPendingSignal.value;
}

/**
 * Resolve a validation result/path to a navigation target with metadata.
 */
export function resolveValidationTarget(host: SubmitHost, resultOrPath: string | ValidationResult): ValidationTargetMetadata {
    let rawPath = '';
    if (typeof resultOrPath === 'string') {
        rawPath = resultOrPath;
    } else if (resultOrPath && typeof resultOrPath === 'object') {
        rawPath = resultOrPath.sourceId || resultOrPath.path || '';
    }
    const normalizedPath = normalizeFieldPath(rawPath);
    const formLevel = normalizedPath === '' || normalizedPath === '#';

    let path = formLevel ? '' : normalizedPath;
    let fieldElement: HTMLElement | null = null;

    if (!formLevel) {
        const candidatePaths = [normalizedPath, externalPathToInternal(normalizedPath)]
            .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index);
        for (const candidate of candidatePaths) {
            const match = findFieldElement(host, candidate);
            if (!match) continue;
            path = candidate;
            fieldElement = match;
            break;
        }
    }

    const keyPath = (path || normalizedPath).replace(/\[\d+\]/g, '');
    const item = keyPath ? host.findItemByKey(keyPath) : null;
    const label = formLevel
        ? (host._definition?.title || 'Form')
        : (item?.label || keyPath || normalizedPath || 'Field');

    return {
        path,
        label,
        formLevel,
        jumpable: !!fieldElement,
        fieldElement,
    };
}
