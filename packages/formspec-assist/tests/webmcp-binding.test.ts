import { beforeAll, describe, expect, it } from 'vitest';
import { createAssistProvider, registerAssistTools } from '../src/index.js';
import { createEngine, ensureEngine, FakeModelContext } from './helpers.js';

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

  it('honors the execute AbortSignal across a confirmation wait', async () => {
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
    controller.abort();
    release(true);
    const result = JSON.parse(await pending);
    expect(result).toEqual({ error: { code: 'x-cancelled', message: expect.any(String) } });
    expect(engine.getFieldVM('contactEmail')?.value.value).toBe('');
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
