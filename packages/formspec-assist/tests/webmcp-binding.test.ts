import { beforeAll, describe, expect, it } from 'vitest';
import type { WebMCP } from 'webmcp-types';
import type { AssistProvider } from '../src/index.js';
import { createAssistProvider, DEFAULT_WEBMCP_TOOLS, PROFILE_WEBMCP_TOOLS, registerAssistTools } from '../src/index.js';
import { createEngine, ensureEngine, FakeModelContext, makeOntology, makeProfile, nextTask } from './helpers.js';

/** Every `additionalProperties` occurrence in a JSON-Schema-shaped object, at any depth. */
function additionalPropertiesAt(schema: unknown, location = ''): string[] {
  if (!schema || typeof schema !== 'object') {
    return [];
  }
  if (Array.isArray(schema)) {
    return schema.flatMap((child, index) => additionalPropertiesAt(child, `${location}[${index}]`));
  }
  const found = 'additionalProperties' in schema ? [location || '<root>'] : [];
  for (const [key, child] of Object.entries(schema)) {
    found.push(...additionalPropertiesAt(child, location ? `${location}.${key}` : key));
  }
  return found;
}

/** The binding only reads `getTools`, `invokeTool`, and `hasProfile` — stand in for a provider whose profile is configured. */
function withProfile(provider: AssistProvider): AssistProvider {
  return {
    getTools: () => provider.getTools(),
    invokeTool: (name, input, options) => provider.invokeTool(name, input, options),
    hasProfile: () => true,
  } as unknown as AssistProvider;
}

describe('WebMCP binding', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('registers every declared tool on the model context with title, schema, and annotations', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    await registerAssistTools(provider, modelContext, { tools: 'all' });

    const tools = await modelContext.getTools();
    expect(tools.map((tool) => tool.name)).toEqual([...provider.getTools().map((tool) => tool.name)].sort());
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema, tool.name).toBeDefined();
    }
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    expect(byName.get('formspec.form.describe')?.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.get('formspec.field.set')?.annotations).toMatchObject({ consequentialHint: true });
    expect(byName.get('formspec.profile.apply')?.annotations).toMatchObject({ consequentialHint: true });
    expect(byName.get('formspec.field.help')?.annotations).toMatchObject({ untrustedContentHint: true });
  });

  it('describes every input property so agents can supply values', () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    for (const tool of provider.getTools()) {
      const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [key, schema] of Object.entries(properties)) {
        expect(schema.description, `${tool.name}.${key}`).toBeTruthy();
      }
    }
  });

  it('registers the default profile: eight non-overlapping tools when no profile is configured', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;
    expect((await modelContext.getTools()).map((tool) => tool.name)).toEqual([...DEFAULT_WEBMCP_TOOLS].sort());
    expect(DEFAULT_WEBMCP_TOOLS).toHaveLength(8);
  });

  it('adds the profile tools to the default set when the provider has a profile', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false, ontology: makeOntology(), profile: makeProfile() });
    await registerAssistTools(withProfile(provider), modelContext);
    expect((await modelContext.getTools()).map((tool) => tool.name)).toEqual([...DEFAULT_WEBMCP_TOOLS, ...PROFILE_WEBMCP_TOOLS].sort());
  });

  it("registers the whole catalog with tools: 'all', and exactly the named tools with a list", async () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });

    const all = new FakeModelContext();
    await registerAssistTools(provider, all, { tools: 'all' });
    expect(await all.getTools()).toHaveLength(14);

    const named = new FakeModelContext();
    await registerAssistTools(provider, named, { tools: ['formspec.field.set', 'formspec.form.pages', 'formspec.nope'] });
    expect((await named.getTools()).map((tool) => tool.name)).toEqual(['formspec.field.set', 'formspec.form.pages']);
  });

  it('strips additionalProperties from registered schemas at every depth; in-process validation stays strict', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    await registerAssistTools(provider, modelContext, { tools: 'all' });

    for (const tool of await modelContext.getTools()) {
      expect(additionalPropertiesAt(tool.inputSchema), tool.name).toEqual([]);
    }
    const [bulkSet] = provider.getTools().filter((tool) => tool.name === 'formspec.field.bulkSet');
    expect(additionalPropertiesAt(bulkSet.inputSchema)).toEqual(['<root>', 'properties.entries.items']);

    const [registered] = (await modelContext.getTools()).filter((tool) => tool.name === 'formspec.form.validate');
    const result = JSON.parse(await modelContext.executeTool(registered, { mode: 'eventual' }));
    expect(result.error).toMatchObject({ code: 'INVALID_VALUE', message: 'unexpected input property "mode"; accepted: profile' });
  });

  it('executeTool returns the payload object directly, not the MCP envelope', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;

    const [describe] = (await modelContext.getTools()).filter((tool) => tool.name === 'formspec.form.describe');
    const result = JSON.parse(await modelContext.executeTool(describe, {}));
    expect(result).toMatchObject({ title: 'Grant Application' });
    expect(result).not.toHaveProperty('content');
  });

  it('returns tool errors as values because WebMCP drops rejection reasons', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;

    const [describe] = (await modelContext.getTools()).filter((tool) => tool.name === 'formspec.field.describe');
    const result = JSON.parse(await modelContext.executeTool(describe, { path: 'nope' }));
    expect(result).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String), path: 'nope', retryable: true } });
  });

  it('detach() unregisters through the AbortSignal and fires toolchange', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;
    const registered = (await modelContext.getTools()).length;
    expect(registered).not.toBe(0);

    let changes = 0;
    modelContext.addEventListener('toolchange', () => { changes += 1; });
    provider.detach();
    expect(await modelContext.getTools()).toHaveLength(0);
    await nextTask();
    expect(changes).toBe(registered);
  });

  it('does not register when registerWebMCP is false or no model context exists', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext, registerWebMCP: false });
    await provider.ready;
    expect(await modelContext.getTools()).toHaveLength(0);

    const detached = createAssistProvider({ engine: createEngine() });
    await expect(detached.ready).resolves.toBeUndefined();
  });

  it('forwards the execute AbortSignal to the confirmation handler and applies nothing after abort', async () => {
    const engine = createEngine();
    let seen: AbortSignal | undefined;
    let release: (approved: boolean) => void = () => {};
    const provider = createAssistProvider({
      engine,
      registerWebMCP: false,
      ontology: makeOntology(),
      profile: makeProfile(),
      confirmProfileApply: ({ signal }) => new Promise<boolean>((resolve) => { seen = signal; release = resolve; }),
    });

    const controller = new AbortController();
    const pending = provider.invokeTool(
      'formspec.profile.apply',
      { paths: ['organization.ein'], confirm: true },
      { signal: controller.signal },
    );
    expect(seen).toBe(controller.signal);
    controller.abort();
    release(true);
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ code: 'x-cancelled', message: expect.any(String), retryable: false });
    expect(engine.getFieldVM('organization.ein')?.value.value).toBe('');
  });

  it('rejects an already-aborted invocation before touching the form', async () => {
    const engine = createEngine();
    const provider = createAssistProvider({ engine, registerWebMCP: false });
    const controller = new AbortController();
    controller.abort();
    const result = await provider.invokeTool('formspec.field.set', { path: 'contactEmail', value: 'a@b.c' }, { signal: controller.signal });
    expect(JSON.parse(result.content[0].text).code).toBe('x-cancelled');
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('');
  });

  it('a WebMCP caller that aborts sees its own reason, and the form stays untouched', async () => {
    const modelContext = new FakeModelContext();
    const engine = createEngine();
    let release: (approved: boolean) => void = () => {};
    const provider = createAssistProvider({
      engine,
      registerWebMCP: false,
      ontology: makeOntology(),
      profile: makeProfile(),
      confirmProfileApply: () => new Promise<boolean>((resolve) => { release = resolve; }),
    });
    await registerAssistTools(provider, modelContext, { tools: 'all' });

    const [apply] = (await modelContext.getTools()).filter((tool) => tool.name === 'formspec.profile.apply');
    const controller = new AbortController();
    const pending = modelContext.executeTool(apply, { paths: ['organization.ein'], confirm: true }, { signal: controller.signal });
    controller.abort(new Error('AbortError'));
    release(true);
    await expect(pending).rejects.toThrow('AbortError');
    expect(engine.getFieldVM('organization.ein')?.value.value).toBe('');
  });

  it('ready resolves when the provider is detached before the host acknowledges registration', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    provider.dispose();
    await expect(provider.ready).resolves.toBeUndefined();
    expect(await modelContext.getTools()).toHaveLength(0);
  });

  it('ready rejects when the host refuses a tool, e.g. a second provider on the same document', async () => {
    const modelContext = new FakeModelContext();
    const first = createAssistProvider({ engine: createEngine(), modelContext });
    await first.ready;
    const registered = (await modelContext.getTools()).length;
    const second = createAssistProvider({ engine: createEngine(), modelContext });
    await expect(second.ready).rejects.toThrow('duplicate tool');
    expect(await modelContext.getTools()).toHaveLength(registered);
    second.dispose();
  });

  it('never leaves an unhandled rejection when nobody awaits ready', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      const modelContext = new FakeModelContext();
      const first = createAssistProvider({ engine: createEngine(), modelContext });
      await nextTask();
      const second = createAssistProvider({ engine: createEngine(), modelContext });
      second.dispose();
      first.dispose();
      await nextTask();
      await nextTask();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });

  it('getTools() hands out independent copies of the declarations', () => {
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const [a] = provider.getTools().filter((tool) => tool.name === 'formspec.field.set');
    (a.inputSchema.properties as Record<string, Record<string, unknown>>).path.description = 'mutated';
    const [b] = provider.getTools().filter((tool) => tool.name === 'formspec.field.set');
    expect((b.inputSchema.properties as Record<string, Record<string, unknown>>).path.description).not.toBe('mutated');
    const other = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const [c] = other.getTools().filter((tool) => tool.name === 'formspec.field.describe');
    expect((c.inputSchema.properties as Record<string, Record<string, unknown>>).path.description).not.toBe('mutated');
  });

  it('tolerates execute() being called without options, as polyfill extension bridges do', async () => {
    const captured: WebMCP.ModelContextTool[] = [];
    const modelContext = { registerTool: async (tool: WebMCP.ModelContextTool) => { captured.push(tool); } } as unknown as WebMCP.ModelContext;
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    await registerAssistTools(provider, modelContext);

    const describe = captured.find((tool) => tool.name === 'formspec.form.describe')!;
    const result = await (describe.execute as (input: object) => Promise<unknown>)({});
    expect(result).toMatchObject({ title: 'Grant Application' });
  });

  it('registerAssistTools is usable standalone with a caller-owned signal', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), registerWebMCP: false });
    const controller = new AbortController();
    await registerAssistTools(provider, modelContext, { signal: controller.signal });
    expect(await modelContext.getTools()).toHaveLength(DEFAULT_WEBMCP_TOOLS.length);
    controller.abort();
    expect(await modelContext.getTools()).toHaveLength(0);
  });
});
