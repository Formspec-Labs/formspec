import { beforeAll, describe, expect, it } from 'vitest';
import type { WebMCP } from 'webmcp-types';
import { createAssistProvider, registerAssistTools } from '../src/index.js';
import { createEngine, ensureEngine, FakeModelContext, nextTask } from './helpers.js';

describe('WebMCP binding', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('registers every declared tool on the model context with title, schema, and annotations', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;

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

    const [set] = (await modelContext.getTools()).filter((tool) => tool.name === 'formspec.field.set');
    const result = JSON.parse(await modelContext.executeTool(set, { path: 'nope', value: 1 }));
    expect(result).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String), path: 'nope' } });
  });

  it('detach() unregisters through the AbortSignal and fires toolchange', async () => {
    const modelContext = new FakeModelContext();
    const provider = createAssistProvider({ engine: createEngine(), modelContext });
    await provider.ready;
    expect(await modelContext.getTools()).not.toHaveLength(0);

    let changes = 0;
    modelContext.addEventListener('toolchange', () => { changes += 1; });
    provider.detach();
    expect(await modelContext.getTools()).toHaveLength(0);
    await nextTask();
    expect(changes).toBe(provider.getTools().length);
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
      confirmProfileApply: ({ signal }) => new Promise<boolean>((resolve) => { seen = signal; release = resolve; }),
    });

    const controller = new AbortController();
    const pending = provider.invokeTool(
      'formspec.profile.apply',
      { matches: [{ path: 'contactEmail', value: 'a@b.c' }], confirm: true },
      { signal: controller.signal },
    );
    expect(seen).toBe(controller.signal);
    controller.abort();
    release(true);
    const result = await pending;
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ code: 'x-cancelled', message: expect.any(String) });
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('');
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
      modelContext,
      confirmProfileApply: () => new Promise<boolean>((resolve) => { release = resolve; }),
    });
    await provider.ready;

    const [apply] = (await modelContext.getTools()).filter((tool) => tool.name === 'formspec.profile.apply');
    const controller = new AbortController();
    const pending = modelContext.executeTool(apply, { matches: [{ path: 'contactEmail', value: 'a@b.c' }], confirm: true }, { signal: controller.signal });
    controller.abort(new Error('AbortError'));
    release(true);
    await expect(pending).rejects.toThrow('AbortError');
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('');
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
    const second = createAssistProvider({ engine: createEngine(), modelContext });
    await expect(second.ready).rejects.toThrow('duplicate tool');
    expect(await modelContext.getTools()).toHaveLength(first.getTools().length);
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
    expect(await modelContext.getTools()).toHaveLength(provider.getTools().length);
    controller.abort();
    expect(await modelContext.getTools()).toHaveLength(0);
  });
});
