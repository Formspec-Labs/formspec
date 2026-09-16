/** @filedesc WebMCP binding: registers Assist tools on a `document.modelContext` (Assist spec §7.2). */

import type { WebMCP } from 'webmcp-types';
import type { AssistProvider, ToolDeclaration, ToolResult } from './types.js';

/**
 * The §7.2 default registration: one tool per job, so a browser's consent UI and an agent's tool
 * picker see no overlap. `field.set` ⊂ `field.bulkSet`, `field.validate` ⊂ `form.validate`,
 * `form.pages` ⊂ `form.progress`; those three stay in the catalog and register with `'all'`.
 */
export const DEFAULT_WEBMCP_TOOLS: readonly string[] = [
  'formspec.form.describe',
  'formspec.form.progress',
  'formspec.field.list',
  'formspec.field.describe',
  'formspec.field.help',
  'formspec.field.bulkSet',
  'formspec.form.validate',
  'formspec.form.nextIncomplete',
];

/** Joins the default set when the provider has a profile configured (`provider.hasProfile()`). */
export const PROFILE_WEBMCP_TOOLS: readonly string[] = [
  'formspec.profile.match',
  'formspec.profile.apply',
  'formspec.profile.learn',
];

export interface RegisterAssistToolsOptions extends WebMCP.ModelContextRegisterToolOptions {
  /** `'default'` (the default): {@link DEFAULT_WEBMCP_TOOLS} plus the profile tools when the provider has a profile; `'all'`: the whole catalog; a list: exactly those names. */
  tools?: 'default' | 'all' | readonly string[];
}

/**
 * Unwrap the MCP `CallToolResult` envelope into the value a WebMCP `execute`
 * callback returns. The browser JSON-serializes that value for the agent, so
 * returning the envelope would hand the agent JSON nested inside JSON. Errors
 * come back as values rather than rejections: WebMCP surfaces a rejected
 * `execute` as a bare `UnknownError` and discards the reason.
 */
export function unwrapToolResult(result: ToolResult): unknown {
  const payload: unknown = JSON.parse(result.content[0]?.text ?? 'null');
  return result.isError ? { error: payload } : payload;
}

/**
 * §7.2: a registered `inputSchema` carries no `additionalProperties`, at any depth. The registered
 * schema is what a model reads; the gate is in-process validation (tool-input.ts), which keeps the
 * strict declaration and still refuses unknown keys.
 */
function withoutAdditionalProperties(schema: Record<string, unknown>): Record<string, unknown> {
  const { additionalProperties: _dropped, properties, items, anyOf, oneOf, allOf, ...rest } = schema;
  const strip = (value: unknown): unknown =>
    value && typeof value === 'object' && !Array.isArray(value) ? withoutAdditionalProperties(value as Record<string, unknown>) : value;
  const stripAll = (branches: unknown): unknown => (Array.isArray(branches) ? branches.map(strip) : branches);
  return {
    ...rest,
    ...(properties && typeof properties === 'object'
      ? {
        properties: Object.fromEntries(
          Object.entries(properties as Record<string, unknown>).map(([key, property]) => [key, strip(property)]),
        ),
      }
      : {}),
    ...(items !== undefined ? { items: strip(items) } : {}),
    ...(anyOf !== undefined ? { anyOf: stripAll(anyOf) } : {}),
    ...(oneOf !== undefined ? { oneOf: stripAll(oneOf) } : {}),
    ...(allOf !== undefined ? { allOf: stripAll(allOf) } : {}),
  };
}

function selectDeclarations(provider: AssistProvider, tools: RegisterAssistToolsOptions['tools']): ToolDeclaration[] {
  const declarations = provider.getTools();
  if (tools === 'all') {
    return declarations;
  }
  const selected = new Set(
    tools === undefined || tools === 'default'
      ? [...DEFAULT_WEBMCP_TOOLS, ...(provider.hasProfile() ? PROFILE_WEBMCP_TOOLS : [])]
      : tools,
  );
  return declarations.filter((declaration) => selected.has(declaration.name));
}

function toModelContextTool(provider: AssistProvider, declaration: ToolDeclaration): WebMCP.ModelContextTool {
  return {
    name: declaration.name,
    title: declaration.title,
    description: declaration.description,
    inputSchema: withoutAdditionalProperties(declaration.inputSchema),
    ...(declaration.annotations ? { annotations: declaration.annotations } : {}),
    // Options are required by the draft, but polyfill extension bridges call `execute(args)` bare.
    execute: async (input, options) => unwrapToolResult(await provider.invokeTool(declaration.name, input, { signal: options?.signal })),
  };
}

/**
 * Register the selected tools (see {@link RegisterAssistToolsOptions.tools}) on `modelContext`.
 * Aborting `options.signal` unregisters them all — the platform's own lifecycle idiom.
 * Resolves once every registration has been acknowledged.
 */
export async function registerAssistTools(
  provider: AssistProvider,
  modelContext: WebMCP.ModelContext,
  options: RegisterAssistToolsOptions = {},
): Promise<void> {
  const { tools, ...registerOptions } = options;
  await Promise.all(
    selectDeclarations(provider, tools).map((declaration) => modelContext.registerTool(toModelContextTool(provider, declaration), registerOptions)),
  );
}

/** The page's native or polyfilled `document.modelContext`, if any. */
export function resolveModelContext(): WebMCP.ModelContext | undefined {
  return typeof document === 'undefined' ? undefined : document.modelContext;
}
