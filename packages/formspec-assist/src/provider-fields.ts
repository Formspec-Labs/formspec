/** @filedesc Field lookup, descriptions, validation, and live status for Assist tools. */
import type { IFormEngine } from '@formspec-org/engine';
import type { FormItem, ValidationResult } from '@formspec-org/types';
import { collectFieldMetadata, minimizeFieldHelp, normalizeFieldPath } from './context-resolver.js';
import type { ContextResolver } from './context-resolver.js';
import { jsonError } from './errors.js';

type ExtendedFormItem = FormItem & {
  calculate?: string;
  presentation?: { widgetHint?: string };
  repeatable?: boolean;
  minRepeat?: number;
  maxRepeat?: number;
};

interface FieldStatus {
  path: string;
  label: string;
  required: boolean;
  relevant: boolean;
  readonly: boolean;
  filled: boolean;
  valid: boolean;
  dataType: string;
}

export function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

export class ProviderFields {
  private definitionKey?: string;
  private engineAtIndex?: IFormEngine;
  private readonly items = new Map<string, ExtendedFormItem>();
  public fieldOrder: string[] = [];
  public calculatedPaths = new Set<string>();

  public constructor(public readonly getEngine: () => IFormEngine, private readonly resolver: ContextResolver) {}

  public get engine(): IFormEngine { return this.getEngine(); }

  public refresh(): void {
    const definition = this.engine.getDefinition();
    const key = JSON.stringify(definition);
    if (this.definitionKey === key && this.engineAtIndex === this.engine) return;
    this.engineAtIndex = this.engine;
    this.definitionKey = key;
    this.items.clear();
    const visit = (items: FormItem[], prefix = '') => {
      for (const item of items) {
        const path = prefix ? `${prefix}.${item.key}` : item.key;
        this.items.set(path, item as ExtendedFormItem);
        if (item.children) visit(item.children, path);
      }
    };
    visit(definition.items);
    const fields = collectFieldMetadata(definition);
    this.fieldOrder = [...fields.keys()];
    this.calculatedPaths = new Set([
      ...[...fields.values()].filter(({ item }) => typeof (item as ExtendedFormItem).calculate === 'string').map(({ path }) => path),
      ...(definition.binds ?? []).filter((bind) => bind.calculate).map((bind) => normalizeFieldPath(bind.path.replace(/\[\*\]/g, ''))),
    ]);
  }

  private findItem(path: string): ExtendedFormItem | undefined {
    this.refresh();
    return this.items.get(normalizeFieldPath(path));
  }

  /** The `calculate` expression owning `basePath`, from its item or a Bind; the engine refuses writes to these (§4.3 rule 2). */
  private calculateExpression(basePath: string): string | undefined {
    const item = this.findItem(basePath);
    if (typeof item?.calculate === 'string') {
      return item.calculate;
    }
    return this.engine.getDefinition().binds?.find((bind) => bind.calculate && bind.path.replace(/\[\*\]/g, '') === basePath)?.calculate;
  }

  public listFields(filter: string): FieldStatus[] {
    return this.engine.getFieldPaths()
      .map((path) => this.fieldStatus(path))
      .filter((status) => {
        switch (filter) {
          case 'all':
            return true;
          case 'required':
            return status.required;
          case 'empty':
            return !status.filled;
          case 'invalid':
            return !status.valid;
          case 'relevant':
          default:
            return status.relevant;
        }
      });
  }

  public describeField(path: string): Record<string, unknown> {
    const vm = this.requireField(path);
    const basePath = normalizeFieldPath(path);
    const item = this.findItem(basePath);
    const expression = this.calculateExpression(basePath);
    const widgetHint = item?.presentation?.widgetHint;
    const indexMatch = path.match(/^(.*)\[(\d+)\]/);
    const repeatIndex = indexMatch ? Number.parseInt(indexMatch[2], 10) : undefined;
    const parentGroupPath = indexMatch ? indexMatch[1] : undefined;
    const repeatCount = parentGroupPath ? this.engine.repeats[parentGroupPath]?.value : undefined;
    const parentItem = parentGroupPath
      ? this.findItem(parentGroupPath)
      : undefined;
    const minRepeat = parentItem?.minRepeat;
    const maxRepeat = parentItem?.maxRepeat;
    return {
      path,
      label: vm.label.value,
      hint: vm.hint.value ?? undefined,
      dataType: vm.dataType,
      value: vm.value.value,
      required: vm.required.value,
      relevant: vm.visible.value,
      readonly: vm.readonly.value,
      valid: this.isFieldValid(path),
      validation: this.fieldValidation(path),
      options: vm.options.value,
      calculated: expression !== undefined,
      expression,
      widget: widgetHint,
      ...(repeatIndex !== undefined ? { repeatIndex } : {}),
      ...(repeatCount !== undefined ? { repeatCount } : {}),
      ...(minRepeat !== undefined ? { minRepeat } : {}),
      ...(maxRepeat !== undefined ? { maxRepeat } : {}),
      help: minimizeFieldHelp(this.resolver.resolve(path)),
    };
  }

  public fieldStatus(path: string): FieldStatus {
    const vm = this.requireField(path);
    return {
      path,
      label: vm.label.value,
      dataType: vm.dataType,
      required: vm.required.value,
      relevant: vm.visible.value,
      readonly: vm.readonly.value,
      filled: !isEmptyValue(vm.value.value),
      valid: this.isFieldValid(path),
    };
  }

  public fieldValidation(path: string): ValidationResult[] {
    this.requireField(path);
    return this.engine.validationResults[path]?.value ?? [];
  }

  public isFieldValid(path: string): boolean {
    return !this.fieldValidation(path).some((result) => result.severity === 'error');
  }

  private requireField(path: string) {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      throw jsonError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    return vm;
  }

}
