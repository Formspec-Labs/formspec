/** @filedesc Numeric control arithmetic using the evaluator's decimal implementation. */
import { jsonNumberText, parseJsonNumber, type ExactJsonNumber } from './json-values.js';
import { wasmEvalFel } from './wasm-bridge-runtime.js';

function numeric(value: unknown): unknown {
    if (typeof value === 'string') return parseJsonNumber(value);
    if (jsonNumberText(value) === undefined) throw new TypeError('Expected a JSON number');
    return value;
}

/** Clamp an entered number without rounding it through binary floating point. */
export function clampJsonNumber(value: unknown, min?: unknown, max?: unknown): number | ExactJsonNumber {
    const fields = { value: numeric(value), min: min == null ? null : numeric(min), max: max == null ? null : numeric(max) };
    const result = wasmEvalFel('if($min != null and $value < $min, $min, if($max != null and $value > $max, $max, $value))', fields);
    if (jsonNumberText(result) === undefined) throw new RangeError('Number exceeds evaluator precision or range');
    return result as number | ExactJsonNumber;
}

/** Step by one authored increment; return undefined when it would cross a bound. */
export function stepJsonNumber(value: unknown, step: unknown, direction: -1 | 1, min?: unknown, max?: unknown): number | ExactJsonNumber | undefined {
    if (value != null && jsonNumberText(value) === undefined) return undefined;
    const fields = { value: numeric(value ?? 0), step: numeric(step ?? 1), direction, min: min == null ? null : numeric(min), max: max == null ? null : numeric(max) };
    const next = wasmEvalFel('$value + $step * $direction', fields);
    if (jsonNumberText(next) === undefined) return undefined;
    const allowed = wasmEvalFel('($min = null or $value >= $min) and ($max = null or $value <= $max)', { ...fields, value: next });
    return allowed === true ? next as number | ExactJsonNumber : undefined;
}
