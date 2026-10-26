/** @filedesc Guarded Assist writes, respondent value protection, and choice label resolution. */
import { deepEqual } from '@formspec-org/engine';
import type { IFormEngine } from '@formspec-org/engine';
import { normalizeFieldPath } from './context-resolver.js';
import { jsonResult, toolError } from './errors.js';
import { isEmptyValue, type ProviderFields } from './provider-fields.js';
import type { SetValueResult, ToolError } from './types.js';

type FieldVM = NonNullable<ReturnType<IFormEngine['getFieldVM']>>;
/** One write request: `expected` is the compare-and-set witness for a respondent-written value (§4.3 rule 6). */
export interface WriteRequest {
  path: string;
  value?: unknown;
  expected?: unknown;
}

const describeOptions = (options: Array<{ value: string; label: string }>): string =>
  options.map((option) => `${option.value} — ${option.label}`).join(', ');

/**
 * Assist spec §3.3: a choice write may name the option by its label. An option value passes through
 * untouched (the engine coerces it as it does for the UI); otherwise a case-insensitive exact label
 * match yields the value. `multiChoice` arrays map element-wise. The error names every option.
 */
function resolveOptionValue(
  path: string,
  options: Array<{ value: string; label: string }>,
  value: unknown,
): { value: unknown } | ToolError {
  if (options.length === 0 || isEmptyValue(value)) {
    return { value };
  }
  if (Array.isArray(value)) {
    const resolved: unknown[] = [];
    for (const element of value) {
      const result = resolveOptionValue(path, options, element);
      if ('code' in result) {
        return result;
      }
      resolved.push(result.value);
    }
    return { value: resolved };
  }
  if (options.some((option) => option.value === value || option.value === String(value))) {
    return { value };
  }
  const wanted = String(value).toLowerCase();
  const byLabel = options.filter((option) => option.label.toLowerCase() === wanted);
  if (byLabel.length === 1) {
    return { value: byLabel[0].value };
  }
  const shown = JSON.stringify(value);
  return byLabel.length === 0
    ? toolError('INVALID_VALUE', `${path} accepts one of: ${describeOptions(options)} (got ${shown})`, path)
    : toolError('INVALID_VALUE', `${shown} is ambiguous for ${path}; pass the option value: ${describeOptions(byLabel)}`, path);
}


export class ProviderWrites {
  public constructor(private readonly fields: ProviderFields) {}

  public setField(request: WriteRequest): SetValueResult {
    const result = this.trySetField(request);
    if ('code' in result) {
      throw jsonResult(result, true);
    }
    return result;
  }

  /** `summary`: `accepted` + `rejected` + `skipped` = entries; `skipped` is the §4.3 rule 6 refusals; `errors` counts every entry carrying an error. */
  public bulkSet(entries: WriteRequest[]): Record<string, unknown> {
    const results = entries.map((entry) => {
      const result = this.trySetField(entry);
      if ('code' in result) {
        return {
          path: entry.path,
          accepted: false,
          validation: [],
          error: result,
        };
      }
      return {
        path: entry.path,
        accepted: true,
        validation: result.validation,
      };
    });
    const skipped = results.filter((entry) => entry.error?.code === 'x-user-edited').length;
    return {
      results,
      summary: {
        accepted: results.filter((entry) => entry.accepted).length,
        rejected: results.filter((entry) => !entry.accepted).length - skipped,
        skipped,
        errors: results.filter((entry) => entry.error).length,
      },
    };
  }

  /** The field at `path` if a write may target it (§4.3 rules 1–3): unknown, readonly, calculated, or hidden fields are refused. */
  public locateWritable(path: string): FieldVM | ToolError {
    this.fields.refresh();
    const vm = this.fields.engine.getFieldVM(path);
    if (!vm) {
      return toolError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    // The engine refuses calculated writes silently and records no source; name it before the guard can misread it.
    if (vm.readonly.value || this.fields.calculatedPaths.has(normalizeFieldPath(path))) {
      return toolError('READONLY', `Field is readonly: ${path}`, path);
    }
    if (!vm.visible.value) {
      return toolError('NOT_RELEVANT', `Field is not relevant: ${path}`, path);
    }
    return vm;
  }

  /**
   * The value a write to `vm` will store, or why it is refused: the compare-and-set guard (§4.3 rule 6 —
   * a respondent-written value is replaced only when `expected` equals it) and option-label resolution
   * (§3.3). No side effects.
   */
  public guardWrite(vm: FieldVM, { path, value, expected }: WriteRequest): { value: unknown } | ToolError {
    const currentValue = vm.value.value;
    if (!isEmptyValue(currentValue) && vm.writeSource.value !== 'assist') {
      if (expected === undefined) {
        return toolError('x-user-edited', `${path} holds a value the assistant did not write; read it with field.describe and pass it as expected to replace it`, path);
      }
      if (!deepEqual(expected, currentValue)) {
        return toolError('x-user-edited', `${path} changed since it was read; call field.describe again and pass the current value as expected`, path);
      }
    }
    return resolveOptionValue(path, vm.options.value, value);
  }

  public trySetField(request: WriteRequest): SetValueResult | ToolError {
    const vm = this.locateWritable(request.path);
    if ('code' in vm) {
      return vm;
    }
    const plan = this.guardWrite(vm, request);
    if ('code' in plan) {
      return plan;
    }
    try {
      vm.setValue(plan.value ?? null, { source: 'assist' });
      return {
        accepted: true,
        value: vm.value.value,
        validation: this.fields.fieldValidation(request.path),
      };
    } catch (error) {
      return toolError('INVALID_VALUE', error instanceof Error ? error.message : String(error), request.path);
    }
  }
}
