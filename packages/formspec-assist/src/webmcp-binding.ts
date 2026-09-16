/** @filedesc WebMCP binding: registers Assist tools on a `document.modelContext` (Assist spec §7.2). */

import type { WebMCP } from 'webmcp-types';
import type { AssistProvider, ToolDeclaration, ToolResult } from './types.js';

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

function toModelContextTool(provider: AssistProvider, declaration: ToolDeclaration): WebMCP.ModelContextTool {
  return {
    name: declaration.name,
    title: declaration.title,
    description: declaration.description,
    inputSchema: declaration.inputSchema,
    ...(declaration.annotations ? { annotations: declaration.annotations } : {}),
    // Options are required by the draft, but polyfill extension bridges call `execute(args)` bare.
    execute: async (input, options) => unwrapToolResult(await provider.invokeTool(declaration.name, input, { signal: options?.signal })),
  };
}

/**
 * Register every tool the provider declares on `modelContext`. Aborting
 * `options.signal` unregisters them all — the platform's own lifecycle idiom.
 * Resolves once every registration has been acknowledged.
 */
export async function registerAssistTools(
  provider: AssistProvider,
  modelContext: WebMCP.ModelContext,
  options: WebMCP.ModelContextRegisterToolOptions = {},
): Promise<void> {
  await Promise.all(
    provider.getTools().map((declaration) => modelContext.registerTool(toModelContextTool(provider, declaration), options)),
  );
}

/** The page's native or polyfilled `document.modelContext`, if any. */
export function resolveModelContext(): WebMCP.ModelContext | undefined {
  return typeof document === 'undefined' ? undefined : document.modelContext;
}
