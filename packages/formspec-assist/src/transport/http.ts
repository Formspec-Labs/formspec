/** @filedesc Assist HTTP transport implementation and server request handler (§7.5). */

import type { AssistProvider, InvokeToolOptions, ToolDeclaration, ToolResult } from '../types.js';
import type { AssistTransport } from './types.js';

export interface HttpRequestLike {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface HttpResponseLike {
  status(code: number): HttpResponseLike;
  setHeader(name: string, value: string): HttpResponseLike;
  json(data: unknown): void;
  send(data: string): void;
}

/**
 * Creates an HTTP request listener / router that handles Assist discovery and invocation (§7.5).
 * - GET  /formspec/tools            -> returns tool declarations
 * - POST /formspec/tools/{name}     -> executes tool with request body as input
 *
 * NOTE: Per §7.5, servers MUST NOT interpret dots in `{name}` as path separators or file extensions.
 */
export function createHttpServerHandler(provider: AssistProvider) {
  return async (
    req: HttpRequestLike,
    res: HttpResponseLike
  ): Promise<void> => {
    const rawUrl = req.url || '';
    const parsedPath = rawUrl.split('?')[0] || '';
    const method = (req.method || 'GET').toUpperCase();

    // 1. Tool discovery: GET /formspec/tools
    if (method === 'GET' && (parsedPath === '/formspec/tools' || parsedPath.endsWith('/formspec/tools'))) {
      const tools = provider.getTools();
      res.setHeader('Content-Type', 'application/json');
      res.status(200).json({ tools });
      return;
    }

    // 2. Tool invocation: POST /formspec/tools/{name}
    const toolsPrefix = '/formspec/tools/';
    const prefixIndex = parsedPath.indexOf(toolsPrefix);
    if (method === 'POST' && prefixIndex !== -1) {
      const rawToolName = parsedPath.slice(prefixIndex + toolsPrefix.length);
      const toolName = decodeURIComponent(rawToolName);

      if (!toolName) {
        res.status(400).json({
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ code: 'BAD_REQUEST', message: 'Missing tool name' }) }],
        });
        return;
      }

      let input: Record<string, unknown> = {};
      if (req.body && typeof req.body === 'object') {
        input = req.body as Record<string, unknown>;
      } else if (typeof req.body === 'string') {
        try {
          input = JSON.parse(req.body);
        } catch {
          res.status(400).json({
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ code: 'INVALID_JSON', message: 'Malformed JSON body' }) }],
          });
          return;
        }
      }

      try {
        const result = await provider.invokeTool(toolName, input);
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(result);
      } catch (err) {
        res.setHeader('Content-Type', 'application/json');
        res.status(500).json({
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: 'EXECUTION_ERROR',
                message: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
        });
      }
      return;
    }

    // Not handled
    res.status(404).json({
      isError: true,
      content: [{ type: 'text', text: JSON.stringify({ code: 'NOT_FOUND', message: `Route not found: ${parsedPath}` }) }],
    });
  };
}

export interface HttpTransportOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
}

export class HttpTransport implements AssistTransport {
  readonly name = 'http';
  private baseUrl: string;
  private fetchFn: typeof fetch;
  private defaultHeaders: Record<string, string>;
  private provider?: AssistProvider;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    };
  }

  register(provider: AssistProvider): void {
    this.provider = provider;
  }

  unregister(): void {
    this.provider = undefined;
  }

  async listTools(): Promise<ToolDeclaration[]> {
    if (this.provider) {
      return this.provider.getTools();
    }
    const url = `${this.baseUrl}/formspec/tools`;
    const response = await this.fetchFn(url, {
      method: 'GET',
      headers: this.defaultHeaders,
    });
    if (!response.ok) {
      throw new Error(`HTTP discovery failed with status ${response.status}`);
    }
    const json = (await response.json()) as { tools: ToolDeclaration[] };
    return json.tools;
  }

  async invoke(
    toolName: string,
    input: Record<string, unknown> = {},
    options?: InvokeToolOptions
  ): Promise<ToolResult> {
    if (this.provider) {
      return this.provider.invokeTool(toolName, input, options);
    }
    const encodedName = encodeURIComponent(toolName);
    const url = `${this.baseUrl}/formspec/tools/${encodedName}`;
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: this.defaultHeaders,
      body: JSON.stringify(input),
      signal: options?.signal,
    });

    const json = (await response.json()) as ToolResult;
    return json;
  }
}
