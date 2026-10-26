/** @filedesc Live page progress snapshots and next-incomplete navigation. */
import type { IFormEngine } from '@formspec-org/engine';
import { resolvePageSequence } from '@formspec-org/layout';
import { targetDefinitionMatches } from '@formspec-org/types';
import { normalizeFieldPath } from './context-resolver.js';
import { isEmptyValue, type ProviderFields } from './provider-fields.js';
import type { AssistProviderOptions } from './types.js';

type Page = ReturnType<typeof resolvePageSequence>[number];
type Reason = 'required' | 'invalid' | 'empty';
interface PageProgress {
  id: string;
  title?: string;
  fieldCount: number;
  filledCount: number;
  complete: boolean;
}
interface FieldSnapshot {
  visible: boolean;
  required: boolean;
  filled: boolean;
  valid: boolean;
}
interface PageSnapshot {
  progress: PageProgress;
  reason?: Reason;
}

export class ProviderProgress {
  private layoutKey?: string;
  private engineAtLayout?: IFormEngine;
  private pageSequence: Page[] = [];
  private snapshotKey?: string;
  private snapshots: PageSnapshot[] = [];
  private readonly component: AssistProviderOptions['component'];
  private readonly theme: AssistProviderOptions['theme'];

  public constructor(private readonly fields: ProviderFields, options: AssistProviderOptions) {
    this.component = options.component;
    this.theme = options.theme;
    this.refresh();
  }

  private get engine(): IFormEngine { return this.fields.engine; }

  public get pageCount(): number {
    this.refresh();
    return this.pageSequence.length;
  }

  public refresh(): void {
    const definition = this.engine.getDefinition();
    // IFormEngine has no universal evaluation revision. Check JSON layout inputs even when their
    // identity stays the same, so caller edits and definition replacement cannot leave old pages.
    const key = JSON.stringify([definition, this.component, this.theme]);
    if (key === this.layoutKey && this.engineAtLayout === this.engine) return;
    this.layoutKey = key;
    this.engineAtLayout = this.engine;
    this.snapshotKey = undefined;
    this.pageSequence = resolvePageSequence(definition, {
      component: targetDefinitionMatches(this.component?.targetDefinition, definition) ? this.component : undefined,
      theme: targetDefinitionMatches(this.theme?.targetDefinition, definition) ? this.theme : undefined,
    });
  }

  public nextIncomplete(scope: 'field' | 'page'): Record<string, unknown> {
    if (scope === 'page') {
      const page = this.readPages().find((entry) => !entry.progress.complete);
      return page
        ? { pageId: page.progress.id, label: page.progress.title ?? 'Next page', reason: page.reason ?? 'empty' }
        : { label: 'Complete', reason: 'complete' };
    }

    this.fields.refresh();
    const paths = this.engine.getFieldPaths();
    for (const basePath of this.fields.fieldOrder) {
      for (const path of paths.filter((candidate) => normalizeFieldPath(candidate) === basePath)) {
        const vm = this.engine.getFieldVM(path);
        if (!vm || !vm.visible.value) continue;
        const status = this.fields.fieldStatus(path);
        if (status.required && !status.filled) return { path, label: status.label, reason: 'required' };
        if (!status.valid) return { path, label: status.label, reason: 'invalid' };
        if (!status.filled) return { path, label: status.label, reason: 'empty' };
      }
    }
    return { label: 'Complete', reason: 'complete' };
  }

  public getPageProgress(): PageProgress[] {
    // Never expose cached objects: a consumer may freely edit its returned snapshot.
    return this.readPages().map(({ progress }) => ({ ...progress }));
  }

  private readPages(): PageSnapshot[] {
    this.refresh();
    const pathsByBase = new Map<string, string[]>();
    for (const path of this.engine.getFieldPaths()) {
      const base = normalizeFieldPath(path);
      const paths = pathsByBase.get(base) ?? [];
      paths.push(path);
      pathsByBase.set(base, paths);
    }
    const pagePaths = this.pageSequence.map((page) => [...new Set(
      page.fields.flatMap((path) => pathsByBase.get(normalizeFieldPath(path)) ?? []),
    )]);
    const fields = new Map<string, FieldSnapshot>();
    // One VM lookup per live page field, including fields occurring on more than one page. Keep
    // scanning live signals: UI writes, another client, and validation changes bypass Assist writes.
    for (const path of new Set(pagePaths.flat())) {
      const vm = this.engine.getFieldVM(path);
      if (!vm) continue;
      fields.set(path, {
        visible: vm.visible.value,
        required: vm.required.value,
        filled: !isEmptyValue(vm.value.value),
        valid: !(this.engine.validationResults[path]?.value ?? []).some((result) => result.severity === 'error'),
      });
    }
    const key = JSON.stringify([this.engine.structureVersion.value, pagePaths, [...fields]]);
    if (key !== this.snapshotKey) {
      this.snapshotKey = key;
      this.snapshots = this.pageSequence.map((page, index) => {
        const relevant = pagePaths[index].flatMap((path) => {
          const field = fields.get(path);
          return field?.visible ? [field] : [];
        });
        const reason = this.pageIssue(relevant);
        return {
          progress: {
            id: page.id,
            title: page.title,
            fieldCount: relevant.length,
            filledCount: relevant.filter((field) => field.filled).length,
            complete: reason === undefined,
          },
          reason,
        };
      });
    }
    return this.snapshots;
  }

  private pageIssue(fields: FieldSnapshot[]): Reason | undefined {
    for (const field of fields) {
      if (field.required && !field.filled) return 'required';
      if (!field.valid) return 'invalid';
    }
    return fields.some((field) => !field.filled) ? 'empty' : undefined;
  }
}
