/** @filedesc Maps shared form progress to Assist's tools and page navigation. */
import type { IFormEngine } from '@formspec-org/engine';
import {
  pageProgressIssue, resolvePageSequence, summarizeFormProgress, type PageSequenceEntry,
} from '@formspec-org/layout';
import { targetDefinitionMatches } from '@formspec-org/types';
import { normalizeFieldPath } from './context-resolver.js';
import { AssistError } from './errors.js';
import type { ProviderFields } from './provider-fields.js';
import type { AssistProviderOptions, FormProgress } from './types.js';

export class ProviderProgress {
  private layoutKey?: string;
  private engineAtLayout?: IFormEngine;
  private pageSequence: PageSequenceEntry[] = [];
  private pagesById = new Map<string, PageSequenceEntry>();
  private readonly component: AssistProviderOptions['component'];
  private readonly theme: AssistProviderOptions['theme'];

  public constructor(private readonly fields: ProviderFields, options: AssistProviderOptions) {
    this.component = options.component;
    this.theme = options.theme;
    this.refresh();
  }

  private get engine(): IFormEngine { return this.fields.engine; }

  public refresh(): void {
    const definition = this.engine.getDefinition();
    // Layout documents may be edited in place by their owner.
    const key = JSON.stringify([definition, this.component, this.theme]);
    if (key === this.layoutKey && this.engineAtLayout === this.engine) return;
    this.layoutKey = key;
    this.engineAtLayout = this.engine;
    this.pageSequence = resolvePageSequence(definition, {
      component: targetDefinitionMatches(this.component?.targetDefinition, definition) ? this.component : undefined,
      theme: targetDefinitionMatches(this.theme?.targetDefinition, definition) ? this.theme : undefined,
    });
    this.pagesById = new Map(this.pageSequence.flatMap(page => page.id === undefined ? [] : [[page.id, page]]));
  }

  private summarize() {
    this.refresh();
    return summarizeFormProgress(this.pageSequence, this.engine.getEvaluatedFormState());
  }

  private pageTitle(id: string): string | undefined {
    const page = this.pagesById.get(id);
    if (page?.titleBind) return this.engine.getItemLabelSignal(page.titleBind)?.value || page.title;
    if (page?.titleLocaleKey) return this.engine.resolveLocaleString(page.titleLocaleKey, page.title ?? '');
    return page?.title;
  }

  public getProgress(): FormProgress {
    const { form, sections } = this.summarize();
    return {
      total: form.total,
      filled: form.filled,
      valid: form.valid,
      required: form.required,
      requiredFilled: form.requiredFilled,
      missingReadonly: form.missingReadonly,
      ready: form.ready,
      pages: sections.flatMap(({ id, counts, filled }) => id === undefined ? [] : [{
        id,
        title: this.pageTitle(id),
        fieldCount: counts.total,
        filledCount: counts.filled,
        missingReadonly: counts.missingReadonly,
        filled,
      }]),
    };
  }

  public nextIncomplete(scope: 'field' | 'page'): Record<string, unknown> {
    if (scope === 'page') {
      for (const { id, counts } of this.summarize().sections) {
        const reason = pageProgressIssue(counts);
        if (reason === 'unavailable') throw new AssistError('ENGINE_ERROR', 'Live validation is unavailable');
        if (reason) {
          return { pageId: id, label: (id && this.pageTitle(id)) || 'Next page', reason };
        }
      }
      return { label: 'Complete', reason: 'complete' };
    }

    this.fields.refresh();
    const paths = this.engine.getFieldPaths();
    let blockedReadonly: { path: string; label: string } | undefined;
    for (const basePath of this.fields.fieldOrder) {
      for (const path of paths.filter(candidate => normalizeFieldPath(candidate) === basePath)) {
        const vm = this.engine.getFieldVM(path);
        if (!vm || !vm.visible.value) continue;
        const status = this.fields.fieldStatus(path);
        if (status.readonly && !status.filled) {
          if (status.required) blockedReadonly ??= { path, label: status.label };
          continue;
        }
        if (status.required && !status.filled) return { path, label: status.label, reason: 'required' };
        if (!status.valid) return { path, label: status.label, reason: 'invalid' };
        if (!status.filled) return { path, label: status.label, reason: 'empty' };
      }
    }
    if (blockedReadonly) return { ...blockedReadonly, reason: 'blocked-readonly' };
    return { label: 'Complete', reason: 'complete' };
  }
}
