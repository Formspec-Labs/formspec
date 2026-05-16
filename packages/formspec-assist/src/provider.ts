/** @filedesc Assist provider implementation: tool catalog, context resolution, profile workflows, and WebMCP registration. */

import type { IFormEngine, RegistryEntry } from '@formspec-org/engine';
import { resolvePageSequence } from '@formspec-org/layout';
import type {
  FormDefinition,
  FormItem,
  RegistryDocument,
  ValidationResult,
} from '@formspec-org/types';
import { ContextResolver, collectFieldMetadata, normalizeFieldPath, targetDefinitionMatches } from './context-resolver.js';
import { AssistError, isAssistError } from './errors.js';
import { ProfileMatcher } from './profile-matcher.js';
import { ProfileStore } from './profile-store.js';
import { ensureModelContext, type ModelContextLike, type ModelContextTool } from './webmcp-shim.js';
import type {
  AssistProvider,
  AssistProviderOptions,
  FieldHelp,
  FormProgress,
  OntologyDocument,
  ProfileApplyResult,
  ProfileMatch,
  ReferencesDocument,
  ToolDeclaration,
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

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown> | unknown;
type ToolSchema = {
  type?: string;
  enum?: readonly unknown[];
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  required?: string[];
  additionalProperties?: boolean;
};

const ASSIST_DISCOVERY_VERSION = '1.0';

function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function jsonResult(payload: unknown, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

function jsonError(code: string, message: string, path?: string): ToolResult {
  return jsonResult({ code, message, ...(path ? { path } : {}) }, true);
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

function readPath(input: Record<string, unknown>): string {
  if (typeof input.path !== 'string' || input.path.length === 0) {
    throw new AssistError('INVALID_PATH', 'Expected a non-empty string path');
  }
  return input.path;
}

function readAudience(input: Record<string, unknown>): 'human' | 'agent' | 'both' {
  return input.audience === undefined ? 'agent' : input.audience as 'human' | 'agent' | 'both';
}

function readValidationMode(input: Record<string, unknown>): 'continuous' | 'submit' {
  if (input.mode === undefined) {
    return 'continuous';
  }
  if (input.mode === 'continuous' || input.mode === 'submit') {
    return input.mode;
  }
  throw new AssistError('INVALID_VALUE', 'Expected mode to be one of: continuous, submit');
}

function readNextIncompleteScope(input: Record<string, unknown>): 'field' | 'page' {
  if (input.scope === undefined) {
    return 'field';
  }
  if (input.scope === 'field' || input.scope === 'page') {
    return input.scope;
  }
  throw new AssistError('INVALID_VALUE', 'Expected scope to be one of: field, page');
}

function readEntries(input: Record<string, unknown>): Array<{ path: string; value: unknown }> {
  if (!Array.isArray(input.entries) && !Array.isArray(input.matches)) {
    throw new AssistError('INVALID_VALUE', 'Expected entries or matches array');
  }
  const entries = Array.isArray(input.entries) ? input.entries : input.matches;
  return (entries as unknown[]).map((entry, index) => {
    if (!isPlainObject(entry) || typeof entry.path !== 'string' || entry.path.length === 0) {
      throw new AssistError('INVALID_VALUE', `Expected entries[${index}].path to be a non-empty string`);
    }
    return {
      path: entry.path,
      value: entry.value,
    };
  });
}

function isToolResult(value: unknown): value is ToolResult {
  return !!value && typeof value === 'object' && Array.isArray((value as ToolResult).content);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function valueMatchesType(type: string | undefined, value: unknown): boolean {
  if (!type) {
    return true;
  }
  switch (type) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number';
    case 'object':
      return isPlainObject(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

function validateAgainstSchema(schema: ToolSchema, value: unknown, location: string): void {
  if (
    schema.type === undefined
    && schema.enum === undefined
    && schema.properties === undefined
    && schema.items === undefined
    && schema.required === undefined
    && schema.additionalProperties === undefined
  ) {
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    throw new AssistError('INVALID_VALUE', `Invalid value for ${location}`);
  }

  const schemaType = schema.type ?? 'object';
  if (schemaType === 'array') {
    if (!Array.isArray(value)) {
      throw new AssistError('INVALID_VALUE', `Expected ${location} to be an array`);
    }
    if (schema.items) {
      value.forEach((entry, index) => validateAgainstSchema(schema.items as ToolSchema, entry, `${location}[${index}]`));
    }
    return;
  }

  if (schemaType !== 'object') {
    if (!valueMatchesType(schemaType, value)) {
      throw new AssistError('INVALID_VALUE', `Invalid type for ${location}`);
    }
    return;
  }

  if (!isPlainObject(value)) {
    throw new AssistError('INVALID_VALUE', `Expected ${location} to be an object`);
  }
  for (const key of schema.required ?? []) {
    if (!(key in value)) {
      throw new AssistError('INVALID_VALUE', `Missing required input property: ${location}.${key}`);
    }
  }
  const propertyNames = new Set(Object.keys(schema.properties ?? {}));
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!propertyNames.has(key)) {
        throw new AssistError('INVALID_VALUE', `Unexpected input property: ${key}`);
      }
    }
  }
  for (const [key, propertySchema] of Object.entries(schema.properties ?? {})) {
    if (!(key in value) || value[key] === undefined) {
      continue;
    }
    validateAgainstSchema(propertySchema as ToolSchema, value[key], `${location}.${key}`);
  }
}

function validateToolInput(schema: ToolSchema, input: Record<string, unknown>): void {
  validateAgainstSchema(schema, input, 'input');
}

function assertEngineCompatibility(engine: IFormEngine): void {
  const candidate = engine as IFormEngine & { getFieldPaths?: unknown; getProgress?: unknown };
  if (typeof candidate.getFieldPaths !== 'function' || typeof candidate.getProgress !== 'function') {
    throw new AssistError('UNSUPPORTED', 'Active engine does not expose the assist compatibility surface');
  }
}

function buildToolDeclarations(): ToolDeclaration[] {
  return [
    {
      name: 'formspec.form.describe',
      description: 'Describe the active form.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.field.list',
      description: 'List fields with summary state.',
      inputSchema: { type: 'object', properties: { filter: { type: 'string', enum: ['all', 'required', 'empty', 'invalid', 'relevant'] } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.field.describe',
      description: 'Describe a field with live state and help.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.field.help',
      description: 'Resolve field help from references and ontology sidecars.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          audience: { type: 'string', enum: ['human', 'agent', 'both'] },
        },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.form.progress',
      description: 'Get form completion progress.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.field.set',
      description: 'Set a single field value.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' }, value: {} },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'formspec.field.bulkSet',
      description: 'Set multiple field values.',
      inputSchema: {
        type: 'object',
        properties: {
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, value: {} },
              required: ['path'],
              additionalProperties: false,
            },
          },
        },
        required: ['entries'],
        additionalProperties: false,
      },
    },
    {
      name: 'formspec.form.validate',
      description: 'Get the full validation report.',
      inputSchema: {
        type: 'object',
        properties: { mode: { type: 'string', enum: ['continuous', 'submit'] } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.field.validate',
      description: 'Get validation results for a single field.',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.profile.match',
      description: 'Match profile values to form fields.',
      inputSchema: { type: 'object', properties: { profileId: { type: 'string' } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.profile.apply',
      description: 'Apply matched profile values to the form.',
      inputSchema: {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, value: {} },
              required: ['path'],
              additionalProperties: false,
            },
          },
          confirm: { type: 'boolean' },
        },
        required: ['matches'],
        additionalProperties: false,
      },
    },
    {
      name: 'formspec.profile.learn',
      description: 'Learn reusable values from the current form state.',
      inputSchema: { type: 'object', properties: { profileId: { type: 'string' } }, additionalProperties: false },
    },
    {
      name: 'formspec.form.pages',
      description: 'Get page progress for the active form.',
      inputSchema: { type: 'object', additionalProperties: false },
      annotations: { readOnlyHint: true },
    },
    {
      name: 'formspec.form.nextIncomplete',
      description: 'Get the next incomplete page or field.',
      inputSchema: {
        type: 'object',
        properties: { scope: { type: 'string', enum: ['field', 'page'] } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
  ];
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
  private modelContext?: ModelContextLike;
  private readonly registeredToolNames = new Set<string>();
  private readonly now: () => Date;
  private readonly confirmProfileApply?: AssistProviderOptions['confirmProfileApply'];
  private readonly discoveryEnabled: boolean;

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
    this.discoveryEnabled = options.registerWebMCP !== false;
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
    if (this.discoveryEnabled) {
      this.registerWithModelContext();
    }
  }

  public attach(engine: IFormEngine): void {
    assertEngineCompatibility(engine);
    this.engine = engine;
    this.resolver.setEngine(engine);
    this.refreshEngineDerivedState();
    if (this.discoveryEnabled) {
      this.emitDiscoveryEvent();
    }
  }

  public detach(): void {
    if (!this.modelContext) {
      return;
    }
    for (const name of this.registeredToolNames) {
      this.modelContext.unregisterTool(name);
    }
    this.registeredToolNames.clear();
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

  public matchProfile(_profileId?: string): ProfileMatch[] {
    return this.matcher.match(
      this.resolveProfile(_profileId),
      this.engine.getFieldPaths().filter((path) => {
        const vm = this.engine.getFieldVM(path);
        return this.engine.isPathRelevant(path) && !!vm && !vm.readonly.value;
      }),
    );
  }

  public getTools(): ToolDeclaration[] {
    return this.declarations.map((tool) => ({ ...tool }));
  }

  public async invokeTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.tools.get(name);
    if (!handler) {
      return jsonError('UNSUPPORTED', `Unknown tool: ${name}`);
    }
    try {
      const declaration = this.declarations.find((tool) => tool.name === name);
      if (declaration) {
        validateToolInput(declaration.inputSchema as ToolSchema, input);
      }
      const payload = await handler(input);
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
        return (input) => this.engine.getValidationReport({ mode: readValidationMode(input) });
      case 'formspec.field.validate':
        return (input) => ({
          results: this.fieldValidation(readPath(input)),
        });
      case 'formspec.profile.match':
        return (input) => ({
          matches: this.matchProfile(typeof input.profileId === 'string' ? input.profileId : undefined),
        });
      case 'formspec.profile.apply':
        return (input) => this.applyProfileMatches(
          readEntries(input),
          input.confirm === true,
        );
      case 'formspec.profile.learn':
        return (input) => this.learnProfile(typeof input.profileId === 'string' ? input.profileId : undefined);
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

  private registerWithModelContext(): void {
    this.modelContext = ensureModelContext();
    for (const declaration of this.declarations) {
      const tool: ModelContextTool = {
        ...declaration,
        handler: (input) => this.invokeTool(declaration.name, input),
      };
      this.modelContext.registerTool(tool);
      this.registeredToolNames.add(tool.name);
    }
    this.emitDiscoveryEvent();
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
  ): Promise<ProfileApplyResult> {
    if (confirm) {
      if (!this.confirmProfileApply) {
        throw new AssistError('x-confirmation-required', 'Profile application requires an explicit confirmation handler');
      }
      const approved = await this.confirmProfileApply({ matches: entries });
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

  private learnProfile(profileId?: string): { savedConcepts: number; savedFields: number } {
    const definition = this.engine.getDefinition();
    const timestamp = this.now().toISOString();
    const targetProfileId = profileId ?? this.currentProfile?.id ?? 'default';
    const profile = this.profileStore.load(targetProfileId) ?? (
      this.currentProfile && this.currentProfile.id === targetProfileId
        ? this.currentProfile
        : {
          id: targetProfileId,
          label: targetProfileId === 'default' ? 'Default' : targetProfileId,
          created: timestamp,
          updated: timestamp,
          concepts: {},
          fields: {},
        }
    );
    const mutableProfile = profile ?? {
      id: targetProfileId,
      label: targetProfileId === 'default' ? 'Default' : targetProfileId,
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
    if (!profileId || this.currentProfile?.id === targetProfileId || !this.currentProfile) {
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

  private resolveProfile(profileId?: string): UserProfile | undefined {
    if (profileId) {
      return this.profileStore.load(profileId);
    }
    return this.currentProfile ?? this.profileStore.load('default') ?? this.profileStore.load();
  }

  private emitDiscoveryEvent(): void {
    const candidate = globalThis as typeof globalThis & {
      document?: { dispatchEvent?: (event: unknown) => boolean };
      CustomEvent?: new (type: string, init?: { detail?: Record<string, unknown> }) => { type: string; detail?: Record<string, unknown> };
    };
    if (!candidate.document || typeof candidate.document.dispatchEvent !== 'function') {
      return;
    }
    const detail = {
      protocolVersion: ASSIST_DISCOVERY_VERSION,
      definitionUrl: this.engine.getDefinition().url,
      definitionVersion: this.engine.getDefinition().version,
      tools: this.declarations.map((tool) => tool.name),
    };
    const event = candidate.CustomEvent
      ? new candidate.CustomEvent('formspec-tools-available', { detail })
      : { type: 'formspec-tools-available', detail };
    candidate.document.dispatchEvent(event);
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
    | { code: string; message: string; path: string } {
    const vm = this.engine.getFieldVM(path);
    if (!vm) {
      return { code: 'NOT_FOUND', message: `Unknown field path: ${path}`, path };
    }
    if (vm.readonly.value) {
      return { code: 'READONLY', message: `Field is readonly: ${path}`, path };
    }
    if (!vm.visible.value) {
      return { code: 'NOT_RELEVANT', message: `Field is not relevant: ${path}`, path };
    }
    try {
      vm.setValue(value ?? null);
      return {
        accepted: true,
        value: vm.value.value,
        validation: this.fieldValidation(path),
      };
    } catch (error) {
      return {
        code: 'INVALID_VALUE',
        message: error instanceof Error ? error.message : String(error),
        path,
      };
    }
  }
}

export function createAssistProvider(options: AssistProviderOptions): AssistProvider {
  return new AssistProviderImpl(options);
}
