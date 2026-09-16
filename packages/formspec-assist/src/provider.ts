/** @filedesc Assist provider implementation: tool catalog, context resolution, profile workflows, and WebMCP registration. */

import { deepEqual } from '@formspec-org/engine';
import type { IFormEngine, RegistryEntry } from '@formspec-org/engine';
import { resolvePageSequence } from '@formspec-org/layout';
import {
  targetDefinitionMatches,
  type FormDefinition,
  type FormItem,
  type RegistryDocument,
  type ValidationResult,
} from '@formspec-org/types';
import { ContextResolver, collectFieldMetadata, minimizeFieldHelp, normalizeFieldPath } from './context-resolver.js';
import { AssistError, isAssistError, jsonError, jsonResult, toolError } from './errors.js';
import { buildToolDeclarations } from './tool-declarations.js';
import {
  readAudience,
  readNextIncompleteScope,
  readPath,
  readValidationProfile,
  validateToolInput,
  type ToolSchema,
} from './tool-input.js';
import { ProfileMatcher, toWireMatch, type ResolvedProfileMatch } from './profile-matcher.js';
import { ProfileStore } from './profile-store.js';
import { PROFILE_WEBMCP_TOOLS, registerAssistTools, resolveModelContext, type RegisterAssistToolsOptions } from './webmcp-binding.js';
import type { WebMCP } from 'webmcp-types';
import type {
  AssistProvider,
  AssistProviderOptions,
  FieldHelp,
  FieldHelpOptions,
  FormProgress,
  InvokeToolOptions,
  OntologyDocument,
  ProfileApplyResult,
  ProfileMatch,
  ReferencesDocument,
  SetValueResult,
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
type FieldVM = NonNullable<ReturnType<IFormEngine['getFieldVM']>>;
/** One write request: `expected` is the compare-and-set witness for a respondent-written value (§4.3 rule 6). */
interface WriteRequest {
  path: string;
  value?: unknown;
  expected?: unknown;
}

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

// Input readers for the write tools; validateToolInput has already enforced each shape.

function readWriteEntries(input: Record<string, unknown>): WriteRequest[] {
  return (input.entries as WriteRequest[]).map(({ path, value, expected }) => ({ path, value, expected }));
}

function readApplyPaths(input: Record<string, unknown>): Array<{ path: string; expected?: unknown }> | undefined {
  if (!Array.isArray(input.paths)) {
    return undefined;
  }
  return (input.paths as Array<string | { path: string; expected?: unknown }>)
    .map((entry) => (typeof entry === 'string' ? { path: entry } : { path: entry.path, expected: entry.expected }));
}

function readFieldHelpOptions(input: Record<string, unknown>): FieldHelpOptions {
  return {
    includeContent: input.includeContent === true,
    ...(typeof input.maxBytes === 'number' ? { maxBytes: input.maxBytes } : {}),
  };
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
  private calculatedPaths = new Set<string>();
  private webmcpRegistration?: AbortController;
  private profileRegistration?: AbortController;
  /** Set when a `'default'` registration went out without the profile tools; `loadProfile` adds them. */
  private pendingProfileTools?: WebMCP.ModelContext;
  public readonly ready: Promise<void>;
  private readonly now: () => Date;
  private readonly confirmProfileApply?: AssistProviderOptions['confirmProfileApply'];
  private profileCapable: boolean;

  public constructor(options: AssistProviderOptions) {
    assertEngineCompatibility(options.engine);
    this.engine = options.engine;
    this.references = arrayify(options.references);
    this.ontologies = arrayify(options.ontology);
    this.component = options.component;
    this.theme = options.theme;
    this.profileStore = new ProfileStore(options.storage);
    this.profileCapable = options.profile !== undefined || options.storage !== undefined;
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
    this.profileRegistration?.abort();
    this.profileRegistration = undefined;
    this.pendingProfileTools = undefined;
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

  public loadProfile(profile: UserProfile): Promise<void> {
    this.currentProfile = profile;
    this.profileStore.save(profile);
    return this.enableProfileCapability();
  }

  /**
   * A profile exists now (loaded or learned): flip the capability and, when the WebMCP registration went
   * out profile-less, add the three profile tools (§7.2 — registration is additive). Resolves when the
   * host acknowledges them; immediately when there is nothing to add.
   */
  private enableProfileCapability(): Promise<void> {
    this.profileCapable = true;
    const modelContext = this.pendingProfileTools;
    if (!modelContext) {
      return Promise.resolve();
    }
    this.pendingProfileTools = undefined;
    const registration = this.register(modelContext, PROFILE_WEBMCP_TOOLS);
    this.profileRegistration = registration.controller;
    return registration.ready;
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

  public matchProfile(profileRef?: string): ProfileMatch[] {
    return this.resolveProfileMatches(profileRef).map(toWireMatch);
  }

  public hasProfile(): boolean {
    return this.profileCapable;
  }

  /** The current match set with values — what `profile.apply` writes from. Never leaves the page. */
  private resolveProfileMatches(profileRef?: string): ResolvedProfileMatch[] {
    return this.matcher.match(
      this.resolveProfile(profileRef),
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
        return (input) => minimizeFieldHelp(this.getFieldHelp(readPath(input), readAudience(input)), readFieldHelpOptions(input));
      case 'formspec.form.progress':
        return () => this.getProgress();
      case 'formspec.field.set':
        return (input) => this.setField({ path: readPath(input), value: input.value, expected: input.expected });
      case 'formspec.field.bulkSet':
        return (input) => this.bulkSet(readWriteEntries(input));
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
        return (input, options) => this.applyProfile(readApplyPaths(input), input.confirm === true, options.signal);
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
    if (!modelContext) {
      return Promise.resolve();
    }
    // Tool selection (§7.2 registration profile) is applied by the binding; see WebMCPRegistrationOptions.
    const tools = typeof options.registerWebMCP === 'object' ? options.registerWebMCP.tools : undefined;
    if (tools !== 'all' && !this.hasProfile()) {
      this.pendingProfileTools = modelContext;
    }
    const registration = this.register(modelContext, tools);
    this.webmcpRegistration = registration.controller;
    // A refused first registration must not leave three orphan profile tools to register later.
    registration.ready.catch(() => { this.pendingProfileTools = undefined; });
    return registration.ready;
  }

  /** One registration under its own AbortController; aborting it (detach) unregisters. `ready` never rejects unhandled. */
  private register(
    modelContext: WebMCP.ModelContext,
    tools: RegisterAssistToolsOptions['tools'],
  ): { controller: AbortController; ready: Promise<void> } {
    const controller = new AbortController();
    const ready = registerAssistTools(this, modelContext, { signal: controller.signal, tools }).catch((reason: unknown) => {
      // Detaching before the host acknowledged registration aborts the pending promises; that is our
      // own lifecycle, not a refusal.
      if (controller.signal.aborted) {
        return;
      }
      throw reason;
    });
    // A refusal still rejects `ready` for hosts that await it; nobody else should see an unhandled rejection.
    ready.catch(() => undefined);
    return { controller, ready };
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
    const fields = collectFieldMetadata(definition);
    this.fieldOrder = [...fields.keys()];
    this.calculatedPaths = new Set([
      ...[...fields.values()].filter(({ item }) => typeof (item as ExtendedFormItem).calculate === 'string').map(({ path }) => path),
      ...(definition.binds ?? []).filter((bind) => bind.calculate).map((bind) => bind.path.replace(/\[\*\]/g, '')),
    ]);
  }

  /** The `calculate` expression owning `basePath`, from its item or a Bind; the engine refuses writes to these (§4.3 rule 2). */
  private calculateExpression(basePath: string): string | undefined {
    const item = findItem(this.engine.getDefinition(), basePath) as ExtendedFormItem | undefined;
    if (typeof item?.calculate === 'string') {
      return item.calculate;
    }
    return this.engine.getDefinition().binds?.find((bind) => bind.calculate && bind.path.replace(/\[\*\]/g, '') === basePath)?.calculate;
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
    const expression = this.calculateExpression(basePath);
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
      help: minimizeFieldHelp(this.getFieldHelp(path)),
    };
  }

  private setField(request: WriteRequest): SetValueResult {
    const result = this.trySetField(request);
    if ('code' in result) {
      throw jsonResult(result, true);
    }
    return result;
  }

  /** `summary`: `accepted` + `rejected` + `skipped` = entries; `skipped` is the §4.3 rule 6 refusals; `errors` counts every entry carrying an error. */
  private bulkSet(entries: WriteRequest[]): Record<string, unknown> {
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

  /**
   * Assist spec §3.5: values come from the current match set, never from tool input. Every path that
   * cannot be written is decided before confirmation, so the respondent only ever approves values that
   * will land; the write itself re-runs the same checks, since the form may move while the dialog is up.
   */
  private async applyProfile(
    paths: Array<{ path: string; expected?: unknown }> | undefined,
    confirm: boolean,
    signal?: AbortSignal,
  ): Promise<ProfileApplyResult> {
    if (confirm && !this.confirmProfileApply) {
      throw new AssistError('x-confirmation-required', 'Profile application requires an explicit confirmation handler');
    }
    const matches = new Map(this.resolveProfileMatches().map((match) => [match.path, match]));
    const skipped: Array<{ path: string; reason: string }> = [];
    const pending: WriteRequest[] = [];
    const requested: Array<{ path: string; expected?: unknown }> = paths ?? [...matches.keys()].map((path) => ({ path }));
    for (const { path, expected } of requested) {
      const located = this.locateWritable(path);
      const match = matches.get(path);
      const plan = 'code' in located
        ? located
        // Writable, so the matcher saw the field and had nothing for it (§6.2).
        : !match ? toolError('x-not-matched', `No profile match for ${path}`, path)
          : this.guardWrite(located, { path, value: match.value, expected });
      if ('code' in plan) {
        skipped.push({ path, reason: plan.code });
      } else {
        pending.push({ path, value: plan.value, expected });
      }
    }

    if (confirm && pending.length > 0) {
      const approved = await this.confirmProfileApply!({ matches: pending.map(({ path, value }) => ({ path, value })), signal });
      if (signal?.aborted) {
        throw new AssistError('x-cancelled', 'Tool execution was cancelled before the values were applied');
      }
      if (!approved) {
        return {
          filled: [],
          skipped: [...skipped, ...pending.map(({ path }) => ({ path, reason: 'DECLINED' }))],
          validation: this.engine.getValidationReport(),
        };
      }
    }

    const filled: Array<{ path: string }> = [];
    for (const request of pending) {
      const result = this.trySetField(request);
      if ('code' in result) {
        skipped.push({ path: request.path, reason: result.code });
      } else {
        filled.push({ path: request.path });
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
    void this.enableProfileCapability();
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

  /** The field at `path` if a write may target it (§4.3 rules 1–3): unknown, readonly, calculated, or hidden fields are refused. */
  private locateWritable(path: string): FieldVM | ToolError {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      return toolError('NOT_FOUND', `Unknown field path: ${path}`, path);
    }
    // The engine refuses calculated writes silently and records no source; name it before the guard can misread it.
    if (vm.readonly.value || this.calculatedPaths.has(normalizeFieldPath(path))) {
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
  private guardWrite(vm: FieldVM, { path, value, expected }: WriteRequest): { value: unknown } | ToolError {
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

  private trySetField(request: WriteRequest): SetValueResult | ToolError {
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
        validation: this.fieldValidation(request.path),
      };
    } catch (error) {
      return toolError('INVALID_VALUE', error instanceof Error ? error.message : String(error), request.path);
    }
  }
}

export function createAssistProvider(options: AssistProviderOptions): AssistProvider {
  return new AssistProviderImpl(options);
}
