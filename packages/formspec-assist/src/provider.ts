/** @filedesc Assist provider implementation: tool catalog, context resolution, profile workflows, and WebMCP registration. */

import type { IFormEngine, RegistryEntry } from '@formspec-org/engine';
import { resolvePageSequence } from '@formspec-org/layout';
import {
  targetDefinitionMatches,
  type FormDefinition,
  type FormItem,
  type RegistryDocument,
  type ValidationResult,
} from '@formspec-org/types';
import { ContextResolver, collectFieldMetadata, normalizeFieldPath } from './context-resolver.js';
import { AssistError, isAssistError, jsonError, jsonResult, toolError } from './errors.js';
import { buildToolDeclarations } from './tool-declarations.js';
import {
  readAudience,
  readEntries,
  readNextIncompleteScope,
  readPath,
  readValidationProfile,
  validateToolInput,
  type ToolSchema,
} from './tool-input.js';
import { ProfileMatcher } from './profile-matcher.js';
import { ProfileStore } from './profile-store.js';
import { registerAssistTools, resolveModelContext } from './webmcp-binding.js';
import type {
  AssistProvider,
  AssistProviderOptions,
  FieldHelp,
  FormProgress,
  InvokeToolOptions,
  OntologyDocument,
  ProfileApplyResult,
  ProfileMatch,
  ReferencesDocument,
  ToolDeclaration,
  ToolError,
  ToolResult,
  UserProfile,
} from './types.js';

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

type ToolHandler = (input: Record<string, unknown>, options: InvokeToolOptions) => Promise<unknown> | unknown;
function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function arrayify<T>(value?: T | T[]): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function flattenRegistryEntries(registries?: RegistryDocument[] | RegistryEntry[]): RegistryEntry[] {
  if (!registries || registries.length === 0) {
    return [];
  }
  const first = registries[0] as RegistryDocument | RegistryEntry;
  if ('entries' in first) {
    return (registries as RegistryDocument[]).flatMap((doc) => doc.entries ?? []);
  }
  return registries as RegistryEntry[];
}

function findItem(definition: FormDefinition, path: string): FormItem | undefined {
  return collectFieldMetadata(definition).get(path)?.item;
}

function findItemByPath(items: FormItem[], path: string, prefix = ''): FormItem | undefined {
  for (const item of items) {
    const itemPath = prefix ? `${prefix}.${item.key}` : item.key;
    if (itemPath === path) {
      return item;
    }
    if ('children' in item && Array.isArray(item.children) && (path.startsWith(`${itemPath}.`) || path.startsWith(`${itemPath}[`))) {
      const result = findItemByPath(item.children as FormItem[], path, itemPath);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}

function isToolResult(value: unknown): value is ToolResult {
  return !!value && typeof value === 'object' && Array.isArray((value as ToolResult).content);
}

function assertEngineCompatibility(engine: IFormEngine): void {
  const candidate = engine as IFormEngine & { getFieldPaths?: unknown; getProgress?: unknown };
  if (typeof candidate.getFieldPaths !== 'function' || typeof candidate.getProgress !== 'function') {
    throw new AssistError('UNSUPPORTED', 'Active engine does not expose the assist compatibility surface');
  }
}

class AssistProviderImpl implements AssistProvider {
  private engine: IFormEngine;
  private references: ReferencesDocument[] = [];
  private ontologies: OntologyDocument[] = [];
  private component = undefined as AssistProviderOptions['component'];
  private theme = undefined as AssistProviderOptions['theme'];
  private profileStore: ProfileStore;
  private currentProfile?: UserProfile;
  private resolver: ContextResolver;
  private matcher: ProfileMatcher;
  private readonly tools = new Map<string, ToolHandler>();
  private readonly declarations: ToolDeclaration[];
  private pageSequence: Array<{ id: string; title?: string; fields: string[] }> = [];
  private fieldOrder: string[] = [];
  private webmcpRegistration?: AbortController;
  public readonly ready: Promise<void>;
  private readonly now: () => Date;
  private readonly confirmProfileApply?: AssistProviderOptions['confirmProfileApply'];

  public constructor(options: AssistProviderOptions) {
    assertEngineCompatibility(options.engine);
    this.engine = options.engine;
    this.references = arrayify(options.references);
    this.ontologies = arrayify(options.ontology);
    this.component = options.component;
    this.theme = options.theme;
    this.profileStore = new ProfileStore(options.storage);
    this.currentProfile = options.profile ?? this.profileStore.load('default') ?? this.profileStore.load();
    this.now = options.now ?? (() => new Date());
    this.confirmProfileApply = options.confirmProfileApply;
    const registryEntries = flattenRegistryEntries(options.registries);
    this.resolver = new ContextResolver(this.engine, this.references, this.ontologies, registryEntries);
    this.matcher = new ProfileMatcher(
      (path) => this.resolver.resolveConcept(path),
      options.profileMatchThreshold,
    );
    this.refreshEngineDerivedState();
    this.declarations = buildToolDeclarations();
    for (const declaration of this.declarations) {
      this.tools.set(declaration.name, this.buildToolHandler(declaration.name));
    }
    this.ready = this.registerWithModelContext(options);
  }

  public attach(engine: IFormEngine): void {
    assertEngineCompatibility(engine);
    this.engine = engine;
    this.resolver.setEngine(engine);
    this.refreshEngineDerivedState();
  }

  public detach(): void {
    this.webmcpRegistration?.abort();
    this.webmcpRegistration = undefined;
  }

  public dispose(): void {
    this.detach();
  }

  public loadReferences(refs: ReferencesDocument | ReferencesDocument[]): void {
    this.references = arrayify(refs);
    this.resolver.setReferences(this.references);
  }

  public loadOntology(ontology: OntologyDocument | OntologyDocument[]): void {
    this.ontologies = arrayify(ontology);
    this.resolver.setOntologies(this.ontologies);
  }

  public loadProfile(profile: UserProfile): void {
    this.currentProfile = profile;
    this.profileStore.save(profile);
  }

  public getFieldHelp(path: string, audience: 'human' | 'agent' | 'both' = 'agent'): FieldHelp {
    return this.resolver.resolve(path, audience);
  }

  public getProgress(): FormProgress {
    return {
      ...this.engine.getProgress(),
      pages: this.getPageProgress(),
    };
  }

  public matchProfile(_profileRef?: string): ProfileMatch[] {
    return this.matcher.match(
      this.resolveProfile(_profileRef),
      this.engine.getFieldPaths().filter((path) => {
        const vm = this.engine.getFieldVM(path);
        return this.engine.isPathRelevant(path) && !!vm && !vm.readonly.value;
      }),
    );
  }

  public getTools(): ToolDeclaration[] {
    return structuredClone(this.declarations);
  }

  public async invokeTool(name: string, input: Record<string, unknown>, options: InvokeToolOptions = {}): Promise<ToolResult> {
    const handler = this.tools.get(name);
    if (!handler) {
      return jsonError('UNSUPPORTED', `Unknown tool: ${name}`);
    }
    if (options.signal?.aborted) {
      return jsonError('x-cancelled', 'Invocation was cancelled before it started');
    }
    try {
      const declaration = this.declarations.find((tool) => tool.name === name);
      if (declaration) {
        validateToolInput(declaration.inputSchema as ToolSchema, input);
      }
      const payload = await handler(input, options);
      return jsonResult(payload);
    } catch (error) {
      if (isToolResult(error)) {
        return error;
      }
      if (isAssistError(error)) {
        return jsonError(error.code, error.message, error.path);
      }
      return jsonError('ENGINE_ERROR', error instanceof Error ? error.message : String(error));
    }
  }

  private buildToolHandler(name: string): ToolHandler {
    switch (name) {
      case 'formspec.form.describe':
        return () => ({
          title: this.engine.getDefinition().title,
          description: this.engine.getDefinition().description,
          url: this.engine.getDefinition().url,
          version: this.engine.getDefinition().version,
          fieldCount: this.engine.getFieldPaths().length,
          pageCount: this.pageSequence.length,
          status: this.engine.getProgress().complete ? 'complete' : 'in-progress',
        });
      case 'formspec.field.list':
        return (input) => this.listFields(typeof input.filter === 'string' ? input.filter : 'relevant');
      case 'formspec.field.describe':
        return (input) => this.describeField(readPath(input));
      case 'formspec.field.help':
        return (input) => this.getFieldHelp(readPath(input), readAudience(input));
      case 'formspec.form.progress':
        return () => this.getProgress();
      case 'formspec.field.set':
        return (input) => this.setField(readPath(input), input.value);
      case 'formspec.field.bulkSet':
        return (input) => this.bulkSet(readEntries(input));
      case 'formspec.form.validate':
        return (input) => this.engine.getValidationReport({ profile: readValidationProfile(input) });
      case 'formspec.field.validate':
        return (input) => ({
          results: this.fieldValidation(readPath(input)),
        });
      case 'formspec.profile.match':
        return (input) => ({
          matches: this.matchProfile(typeof input.profileRef === 'string' ? input.profileRef : undefined),
        });
      case 'formspec.profile.apply':
        return (input, options) => this.applyProfileMatches(
          readEntries(input),
          input.confirm === true,
          options.signal,
        );
      case 'formspec.profile.learn':
        return (input) => this.learnProfile(typeof input.profileRef === 'string' ? input.profileRef : undefined);
      case 'formspec.form.pages':
        return () => ({
          pages: this.getPageProgress(),
        });
      case 'formspec.form.nextIncomplete':
        return (input) => this.nextIncomplete(readNextIncompleteScope(input));
      default:
        return () => {
          throw jsonError('UNSUPPORTED', `Unknown tool: ${name}`);
        };
    }
  }

  private registerWithModelContext(options: AssistProviderOptions): Promise<void> {
    const modelContext = options.registerWebMCP === false ? undefined : options.modelContext ?? resolveModelContext();
    // Tool selection (§7.2 registration profile) is applied by the binding; see WebMCPRegistrationOptions.
    if (!modelContext) {
      return Promise.resolve();
    }
    const controller = new AbortController();
    this.webmcpRegistration = controller;
    const ready = registerAssistTools(this, modelContext, { signal: controller.signal }).catch((reason: unknown) => {
      // Detaching before the host acknowledged registration aborts the pending promises; that is our
      // own lifecycle, not a refusal.
      if (controller.signal.aborted) {
        return;
      }
      throw reason;
    });
    // A refusal still rejects `ready` for hosts that await it; nobody else should see an unhandled rejection.
    ready.catch(() => undefined);
    return ready;
  }

  private refreshEngineDerivedState(): void {
    const definition = this.engine.getDefinition();
    this.pageSequence = resolvePageSequence(definition, {
      component: targetDefinitionMatches((this.component as { targetDefinition?: { url?: string; compatibleVersions?: string } } | undefined)?.targetDefinition, definition)
        ? this.component
        : undefined,
      theme: targetDefinitionMatches((this.theme as { targetDefinition?: { url?: string; compatibleVersions?: string } } | undefined)?.targetDefinition, definition)
        ? this.theme
        : undefined,
    });
    this.fieldOrder = [...collectFieldMetadata(this.engine.getDefinition()).keys()];
  }

  private listFields(filter: string): FieldStatus[] {
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

  private describeField(path: string): Record<string, unknown> {
    const vm = this.requireField(path);
    const basePath = normalizeFieldPath(path);
    const item = findItem(this.engine.getDefinition(), basePath) as ExtendedFormItem | undefined;
    const expression = typeof item?.calculate === 'string' ? item.calculate : undefined;
    const widgetHint = item?.presentation?.widgetHint;
    const indexMatch = path.match(/^(.*)\[(\d+)\]/);
    const repeatIndex = indexMatch ? Number.parseInt(indexMatch[2], 10) : undefined;
    const parentGroupPath = indexMatch ? indexMatch[1] : undefined;
    const repeatCount = parentGroupPath ? this.engine.repeats[parentGroupPath]?.value : undefined;
    const parentItem = parentGroupPath
      ? findItemByPath(this.engine.getDefinition().items, parentGroupPath) as ExtendedFormItem | undefined
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
      help: this.getFieldHelp(path),
    };
  }

  private setField(path: string, value: unknown): Record<string, unknown> {
    const result = this.trySetField(path, value);
    if ('code' in result) {
      throw jsonError(result.code, result.message, result.path);
    }
    return result;
  }

  private bulkSet(entries: Array<{ path: string; value: unknown }>): Record<string, unknown> {
    const results = entries.map((entry) => {
      const result = this.trySetField(entry.path, entry.value);
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
    return {
      results,
      summary: {
        accepted: results.filter((entry) => entry.accepted).length,
        rejected: results.filter((entry) => !entry.accepted).length,
        errors: results.filter((entry) => entry.error).length,
      },
    };
  }

  private async applyProfileMatches(
    entries: Array<{ path: string; value: unknown }>,
    confirm: boolean,
    signal?: AbortSignal,
  ): Promise<ProfileApplyResult> {
    if (confirm) {
      if (!this.confirmProfileApply) {
        throw new AssistError('x-confirmation-required', 'Profile application requires an explicit confirmation handler');
      }
      const approved = await this.confirmProfileApply({ matches: entries, signal });
      if (signal?.aborted) {
        throw new AssistError('x-cancelled', 'Tool execution was cancelled before the values were applied');
      }
      if (!approved) {
        return {
          filled: [],
          skipped: entries.map((entry) => ({ path: entry.path, reason: 'DECLINED' })),
          validation: this.engine.getValidationReport(),
        };
      }
    }

    const filled: Array<{ path: string; value: unknown }> = [];
    const skipped: Array<{ path: string; reason: string }> = [];
    for (const entry of entries) {
      const result = this.trySetField(entry.path, entry.value);
      if ('code' in result) {
        skipped.push({ path: entry.path, reason: result.code });
      } else {
        filled.push({ path: entry.path, value: entry.value });
      }
    }
    return {
      filled,
      skipped,
      validation: this.engine.getValidationReport(),
    };
  }

  private learnProfile(profileRef?: string): { savedConcepts: number; savedFields: number } {
    const definition = this.engine.getDefinition();
    const timestamp = this.now().toISOString();
    const targetProfileRef = profileRef ?? this.currentProfile?.id ?? 'default';
    const profile = this.profileStore.load(targetProfileRef) ?? (
      this.currentProfile && this.currentProfile.id === targetProfileRef
        ? this.currentProfile
        : {
          id: targetProfileRef,
          label: targetProfileRef === 'default' ? 'Default' : targetProfileRef,
          created: timestamp,
          updated: timestamp,
          concepts: {},
          fields: {},
        }
    );
    const mutableProfile = profile ?? {
      id: targetProfileRef,
      label: targetProfileRef === 'default' ? 'Default' : targetProfileRef,
      created: timestamp,
      updated: timestamp,
      concepts: {},
      fields: {},
    };

    let savedConcepts = 0;
    let savedFields = 0;
    for (const path of this.engine.getFieldPaths()) {
      if (!this.engine.isPathRelevant(path)) {
        continue;
      }
      const value = this.engine.getFieldVM(path)?.value.value;
      if (isEmptyValue(value)) {
        continue;
      }
      const concept = this.resolver.resolveConcept(path);
      const entry = {
        value,
        confidence: 1,
        source: {
          type: 'form-fill' as const,
          formUrl: definition.url,
          fieldPath: path,
          timestamp,
        },
        lastUsed: timestamp,
        verified: true,
      };
      if (concept?.concept) {
        mutableProfile.concepts[concept.concept] = entry;
        savedConcepts += 1;
      } else {
        mutableProfile.fields[path] = entry;
        savedFields += 1;
      }
    }
    mutableProfile.updated = timestamp;
    if (!profileRef || this.currentProfile?.id === targetProfileRef || !this.currentProfile) {
      this.currentProfile = mutableProfile;
    }
    this.profileStore.save(mutableProfile);
    return { savedConcepts, savedFields };
  }

  private nextIncomplete(scope: 'field' | 'page'): Record<string, unknown> {
    if (scope === 'page') {
      const page = this.getPageProgress().find((entry) => !entry.complete);
      if (page) {
        const issue = this.getPageIssue(page.id);
        return {
          pageId: page.id,
          label: page.title ?? 'Next page',
          reason: issue?.reason ?? 'empty',
        };
      }
      return { label: 'Complete', reason: 'complete' as const };
    }

    for (const path of this.fieldOrder) {
      const vm = this.engine.getFieldVM(path);
      if (!vm || !vm.visible.value) {
        continue;
      }
      const status = this.fieldStatus(path);
      if (status.required && !status.filled) {
        return { path, label: status.label, reason: 'required' };
      }
      if (!status.valid) {
        return { path, label: status.label, reason: 'invalid' };
      }
      if (!status.filled) {
        return { path, label: status.label, reason: 'empty' };
      }
    }
    return { label: 'Complete', reason: 'complete' as const };
  }

  private getPageProgress(): Array<{ id: string; title?: string; fieldCount: number; filledCount: number; complete: boolean }> {
    return this.pageSequence.map((page) => {
      const relevantFields = page.fields.filter((path) => this.engine.getFieldVM(path)?.visible.value ?? false);
      const filledCount = relevantFields.filter((path) => !isEmptyValue(this.engine.getFieldVM(path)?.value.value)).length;
      const issue = this.describePageIssue(relevantFields);
      return {
        id: page.id,
        title: page.title,
        fieldCount: relevantFields.length,
        filledCount,
        complete: issue === null,
      };
    });
  }

  private getPageIssue(pageId: string): { reason: 'empty' | 'invalid' | 'required' } | null {
    const page = this.pageSequence.find((entry) => entry.id === pageId);
    if (!page) {
      return null;
    }
    const relevantFields = page.fields.filter((path) => this.engine.getFieldVM(path)?.visible.value ?? false);
    return this.describePageIssue(relevantFields);
  }

  private describePageIssue(paths: string[]): { reason: 'empty' | 'invalid' | 'required' } | null {
    if (paths.length === 0) {
      return null;
    }

    let hasEmpty = false;
    for (const path of paths) {
      const vm = this.engine.getFieldVM(path);
      if (!vm) {
        continue;
      }
      if (vm.required.value && isEmptyValue(vm.value.value)) {
        return { reason: 'required' };
      }
      if (!this.isFieldValid(path)) {
        return { reason: 'invalid' };
      }
      if (isEmptyValue(vm.value.value)) {
        hasEmpty = true;
      }
    }

    return hasEmpty ? { reason: 'empty' } : null;
  }

  private resolveProfile(profileRef?: string): UserProfile | undefined {
    if (profileRef) {
      return this.profileStore.load(profileRef);
    }
    return this.currentProfile ?? this.profileStore.load('default') ?? this.profileStore.load();
  }

  private fieldStatus(path: string): FieldStatus {
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

  private fieldValidation(path: string): ValidationResult[] {
    const vm = this.requireField(path);
    void vm;
    return this.engine.validationResults[path]?.value ?? [];
  }

  private isFieldValid(path: string): boolean {
    return !this.fieldValidation(path).some((result) => result.severity === 'error');
  }

  private requireField(path: string) {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      throw jsonError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    return vm;
  }

  private trySetField(path: string, value: unknown):
    | { accepted: true; value: unknown; validation: ValidationResult[] }
    | ToolError {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      return toolError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    if (vm.readonly.value) {
      return toolError('READONLY', `Field is readonly: ${path}`, path);
    }
    if (!vm.visible.value) {
      return toolError('NOT_RELEVANT', `Field is not relevant: ${path}`, path);
    }
    try {
      vm.setValue(value ?? null);
      return {
        accepted: true,
        value: vm.value.value,
        validation: this.fieldValidation(path),
      };
    } catch (error) {
      return toolError('INVALID_VALUE', error instanceof Error ? error.message : String(error), path);
    }
  }
}

export function createAssistProvider(options: AssistProviderOptions): AssistProvider {
  return new AssistProviderImpl(options);
}
