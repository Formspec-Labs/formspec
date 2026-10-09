/** @filedesc Apply WASM/diff outputs to `EngineSignal` stores — reactive seam only. */

import type { EvalDelta } from '../diff.js';
import type { EngineReactiveRuntime, EngineSignal } from '../reactivity/types.js';
import type { ValidationResult } from '@formspec-org/types';
import type { FormItem } from '@formspec-org/types';
import type { EngineBindConfig } from './helpers.js';
import {
    cloneValue,
    deepEqual,
    isEmptyValue,
    normalizeWasmValue,
    toBasePath,
    toValidationResults,
} from './helpers.js';

export function patchValueSignalsFromWasm(options: {
    values: Record<string, unknown>;
    signals: Record<string, EngineSignal<any>>;
    data: Record<string, any>;
    fieldItems: Map<string, FormItem>;
    bindConfigs: Record<string, EngineBindConfig>;
    calculatedFields: Set<string>;
}): void {
    for (const [path, sig] of Object.entries(options.signals)) {
        const basePath = toBasePath(path);
        // Native output can omit non-relevant fields. Their editing values still belong to the primary instance.
        if (!Object.prototype.hasOwnProperty.call(options.values, path)) {
            if (!options.calculatedFields.has(basePath)) {
                sig.value = normalizeWasmValue(options.data[path]);
            }
            continue;
        }
        const value = options.values[path];
        const item = options.fieldItems.get(basePath);
        const normalizedValue = normalizeWasmValue(value);
        const hasExpressionInitial = typeof item?.initialValue === 'string' && item.initialValue.startsWith('=');
        if (!options.calculatedFields.has(basePath)
            && hasExpressionInitial
            && !(path in options.data)) {
            options.data[path] = cloneValue(normalizedValue);
        } else if (!options.calculatedFields.has(basePath)
            && options.bindConfigs[basePath]?.default !== undefined
            && path in options.data
            && isEmptyValue(options.data[path])
            && !deepEqual(options.data[path], normalizedValue)) {
            options.data[path] = cloneValue(normalizedValue);
        }
        let rawValue: any;
        if (!options.calculatedFields.has(basePath)
            && (path in options.data || options.bindConfigs[basePath]?.default === undefined)) {
            rawValue = options.data[path];
        } else {
            rawValue = normalizedValue;
        }
        sig.value = normalizeWasmValue(rawValue);
    }
}

export function patchDeltaSignalsFromWasm(
    rx: EngineReactiveRuntime,
    delta: EvalDelta,
    options: {
        relevantSignals: Record<string, EngineSignal<boolean>>;
        requiredSignals: Record<string, EngineSignal<boolean>>;
        readonlySignals: Record<string, EngineSignal<boolean>>;
        validationResults: Record<string, EngineSignal<ValidationResult[]>>;
        shapeResults: Record<string, EngineSignal<ValidationResult[]>>;
        variableSignals: Record<string, EngineSignal<any>>;
        variableSignalKeys: Map<string, string[]>;
        prePopulateReadonly: Set<string>;
    },
): void {
    for (const [path, relevant] of Object.entries(delta.relevant)) {
        options.relevantSignals[path] ??= rx.signal(true);
        options.relevantSignals[path].value = relevant;
    }
    for (const [path, required] of Object.entries(delta.required)) {
        options.requiredSignals[path] ??= rx.signal(false);
        options.requiredSignals[path].value = required;
    }
    for (const [path, readonly] of Object.entries(delta.readonly)) {
        options.readonlySignals[path] ??= rx.signal(false);
        options.readonlySignals[path].value = readonly || options.prePopulateReadonly.has(path);
    }
    for (const [path, results] of Object.entries(delta.validations)) {
        options.validationResults[path] ??= rx.signal([]);
        options.validationResults[path].value = toValidationResults(results);
    }
    for (const path of delta.removedValidationPaths) {
        if (options.validationResults[path]) {
            options.validationResults[path].value = [];
        }
    }
    for (const [shapeId, results] of Object.entries(delta.shapeResults)) {
        options.shapeResults[shapeId] ??= rx.signal([]);
        options.shapeResults[shapeId].value = toValidationResults(results);
    }
    for (const shapeId of delta.removedShapeIds) {
        if (options.shapeResults[shapeId]) {
            options.shapeResults[shapeId].value = [];
        }
    }
    for (const [name, value] of Object.entries(delta.variables)) {
        const signalKeys = options.variableSignalKeys.get(name) ?? [name];
        for (const key of signalKeys) {
            options.variableSignals[key] ??= rx.signal(undefined);
            options.variableSignals[key].value = normalizeWasmValue(value);
        }
    }
    for (const name of delta.removedVariables) {
        const signalKeys = options.variableSignalKeys.get(name) ?? [name];
        for (const key of signalKeys) {
            if (options.variableSignals[key]) {
                options.variableSignals[key].value = undefined;
            }
        }
    }
}

export function patchErrorSignalsFromWasm(
    rx: EngineReactiveRuntime,
    options: {
        validationResults: Record<string, EngineSignal<ValidationResult[]>>;
        errorSignals: Record<string, EngineSignal<string | null>>;
    },
): void {
    for (const [path, signalRef] of Object.entries(options.validationResults)) {
        const firstError = signalRef.value.find((result) => result.severity === 'error')?.message ?? null;
        options.errorSignals[path] ??= rx.signal(null);
        options.errorSignals[path].value = firstError;
    }
}
