/** @filedesc Submit flow: payload building, touch-all, pending state, and validation targeting. */
import type { Signal } from '@preact/signals-core';
import type { IFormEngine } from '@formspec-org/engine/render';
import {
    FormDefinition,
    FormItem,
    FormResponse,
    ValidationOverride,
    ValidationProfile,
    ValidationResult,
} from '@formspec-org/types';
import { normalizeFieldPath, findFieldElement } from '../navigation/index.js';
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

export interface SubmitOptions {
    profile?: ValidationProfile;
    validationTuple?: ValidationOverride;
    emitEvent?: boolean;
}

function responseProfileForTuple(validationTuple: ValidationOverride | undefined): ValidationProfile {
    return validationTuple?.persistence === 'complete-response' ? 'on-submit' : 'off';
}

/**
 * Touch all fields within a specific DOM container element (e.g. a wizard panel).
 * Fields are identified by their `[data-name]` root elements.
 * Used for soft per-page wizard validation: errors become visible without blocking navigation.
 */
export function touchFieldsInContainer(
    container: Element,
    touchedFields: Set<string>,
    touchedVersion: { value: number },
): void {
    const fieldEls = container.querySelectorAll('[data-name]');
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

/** Enclosing group/repeat path of a resolved instance path (`a[0].b` → `a[0]` → `a` → `''`). */
function parentInstancePath(path: string): string {
    const parent = path.replace(/(\[\d+\]|\.[^.[\]]+)$/, '');
    return parent === path ? '' : parent;
}

/**
 * Path of the first rendered field, in page order, that carries an error result — its own or an
 * enclosing group's. Report order follows binds and shapes, not layout. O(fields × path depth).
 */
function firstInvalidFieldPath(host: SubmitHost, results: ValidationResult[]): string | null {
    const errorPaths = new Set(
        results.filter((r) => r.severity === 'error').map((r) => normalizeFieldPath(r.path)).filter(Boolean),
    );
    if (errorPaths.size === 0) return null;
    for (const fieldEl of host.querySelectorAll('[data-name]')) {
        const name = (fieldEl as HTMLElement).dataset.name;
        for (let path = name; path; path = parentInstancePath(path)) {
            if (errorPaths.has(path)) return name!;
        }
    }
    return null;
}

/**
 * Build a submit payload and validation report from the current form state.
 * Optionally dispatches `formspec-submit` with `{ response, validationReport }`.
 */
export function submit(
    host: SubmitHost,
    options?: SubmitOptions,
): SubmitDetail | null {
    if (!host.engine) return null;
    const profile = options?.profile ?? options?.validationTuple?.profile ?? 'on-submit';
    const emitEvent = options?.emitEvent !== false;

    touchAllFields(host);

    const response = host.engine.getResponse({ profile: responseProfileForTuple(options?.validationTuple) });
    const validationReport = host.engine.getValidationReport({ profile });
    const detail = { response, validationReport };
    host._latestSubmitDetailSignal.value = detail;

    if (emitEvent) {
        host.dispatchEvent(new CustomEvent('formspec-submit', {
            detail,
            bubbles: true,
            composed: true,
        }));
    }

    if (validationReport && !validationReport.valid && host.focusField) {
        const firstError = validationReport.results.find((r: ValidationResult) => r.severity === 'error');
        const target = firstInvalidFieldPath(host, validationReport.results) ?? firstError?.path;
        if (target) host.focusField(target);
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

    const path = formLevel ? '' : normalizedPath;
    const fieldElement = formLevel ? null : findFieldElement(host, normalizedPath);

    const keyPath = path.replace(/\[\d+\]/g, '');
    const item = keyPath ? host.findItemByKey(keyPath) : null;
    const label = formLevel
        ? (typeof host._definition?.title === 'string' ? host._definition.title : 'Form')
        : (item?.label || keyPath || normalizedPath || 'Field');

    return {
        path,
        label,
        formLevel,
        jumpable: !!fieldElement,
        fieldElement,
    };
}
