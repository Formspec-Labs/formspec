/** @filedesc Assist composition, validated tool dispatch, and WebMCP registration lifecycle. */
import type { IFormEngine, RegistryEntry } from '@formspec-org/engine';
import type { RegistryDocument } from '@formspec-org/types';
import { ContextResolver } from './context-resolver.js';
import { AssistError, isAssistError, jsonError, jsonResult } from './errors.js';
import { buildToolDeclarations } from './tool-declarations.js';
import { validateToolInput, type ToolSchema } from './tool-input.js';
import { ProviderFields } from './provider-fields.js';
import { ProviderWrites } from './provider-writes.js';
import { ProviderProfiles } from './provider-profiles.js';
import { ProviderProgress } from './provider-progress.js';
import { buildToolHandler, type ToolHandler } from './provider-handlers.js';
import { PROFILE_WEBMCP_TOOLS, registerAssistTools, resolveModelContext, type RegisterAssistToolsOptions } from './webmcp-binding.js';
import type { WebMCP } from 'webmcp-types';
import type {
  AssistProvider, AssistProviderOptions, FieldHelp, FormProgress, InvokeToolOptions,
  OntologyDocument, ProfileMatch, ReferencesDocument, ToolDeclaration, ToolResult, UserProfile,
} from './types.js';

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
  private readonly resolver: ContextResolver;
  private readonly fields: ProviderFields;
  private readonly profiles: ProviderProfiles;
  private readonly progress: ProviderProgress;
  private readonly tools = new Map<string, ToolHandler>();
  private readonly declarations: ToolDeclaration[];
  private webmcpRegistration?: AbortController;
  private profileRegistration?: AbortController;
  private pendingProfileTools?: WebMCP.ModelContext;
  public readonly ready: Promise<void>;

  public constructor(options: AssistProviderOptions) {
    assertEngineCompatibility(options.engine);
    this.engine = options.engine;
    this.resolver = new ContextResolver(this.engine, arrayify(options.references), arrayify(options.ontology), flattenRegistryEntries(options.registries));
    this.fields = new ProviderFields(() => this.engine, this.resolver);
    this.fields.refresh();
    const writes = new ProviderWrites(this.fields);
    this.profiles = new ProviderProfiles(() => this.engine, this.resolver, writes, options, () => this.enableProfileCapability());
    this.progress = new ProviderProgress(this.fields, options);
    this.declarations = buildToolDeclarations();
    for (const declaration of this.declarations) {
      this.tools.set(declaration.name, buildToolHandler(declaration.name, this, this.fields, writes, this.profiles, this.progress));
    }
    this.ready = this.registerWithModelContext(options);
  }

  public attach(engine: IFormEngine): void {
    assertEngineCompatibility(engine);
    this.engine = engine;
    this.resolver.setEngine(engine);
    this.fields.refresh();
    this.progress.refresh();
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
    this.resolver.setReferences(arrayify(refs));
  }

  public loadOntology(ontology: OntologyDocument | OntologyDocument[]): void {
    this.resolver.setOntologies(arrayify(ontology));
  }

  public loadProfile(profile: UserProfile): Promise<void> { return this.profiles.load(profile); }

  /**
   * A profile exists now (loaded or learned): flip the capability and, when the WebMCP registration went
   * out profile-less, add the three profile tools (§7.2 — registration is additive). Resolves when the
   * host acknowledges them; immediately when there is nothing to add.
   */
  private enableProfileCapability(): Promise<void> {
    this.profiles.capable = true;
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
      pages: this.progress.getPageProgress(),
    };
  }

  public matchProfile(profileRef?: string): ProfileMatch[] { return this.profiles.matchProfile(profileRef); }

  public hasProfile(): boolean { return this.profiles.capable; }

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

}

export function createAssistProvider(options: AssistProviderOptions): AssistProvider {
  return new AssistProviderImpl(options);
}
