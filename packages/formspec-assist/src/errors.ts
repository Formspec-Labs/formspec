/** @filedesc Assist tool error codes, the `ToolError` shape, and the MCP-family result envelope helpers. */

import type { ToolError, ToolResult } from './types.js';

export class AssistError extends Error {
  public readonly code: string;
  public readonly path?: string;

  public constructor(code: string, message: string, path?: string) {
    super(message);
    this.name = 'AssistError';
    this.code = code;
    this.path = path;
  }
}

export function isAssistError(value: unknown): value is AssistError {
  return value instanceof AssistError;
}

/**
 * Whether the same call can succeed with corrected arguments (Assist spec §4.2).
 * Unknown and `x-` codes default to false: the safe reading is "ask the human".
 */
const RETRYABLE_CODES = new Set(['NOT_FOUND', 'INVALID_PATH', 'INVALID_VALUE', 'NOT_RELEVANT', 'UNSUPPORTED']);

export function isRetryable(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}

export function toolError(code: string, message: string, path?: string): ToolError {
  return { code, message, retryable: isRetryable(code), ...(path ? { path } : {}) };
}

/** MCP `CallToolResult` envelope: the JSON payload rides in `content[0].text` (§4.1). */
export function jsonResult(payload: unknown, isError = false): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function jsonError(code: string, message: string, path?: string): ToolResult {
  return jsonResult(toolError(code, message, path), true);
}
