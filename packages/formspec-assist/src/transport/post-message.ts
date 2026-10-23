/** @filedesc Browser postMessage transport implementation (§7.4) correlating requests with callId. */

import type { AssistProvider, InvokeToolOptions, ToolDeclaration, ToolResult } from '../types.js';
import {
  generateCallId,
  type AssistTransport,
  type MessageEndpoint,
  type PostMessageRequest,
  type PostMessageResponse,
} from './types.js';

export interface PostMessageTransportOptions {
  endpoint: MessageEndpoint;
  targetOrigin?: string;
  timeoutMs?: number;
}

export class PostMessageTransport implements AssistTransport {
  readonly name = 'post-message';
  private endpoint: MessageEndpoint;
  private targetOrigin: string;
  private timeoutMs: number;
  private pending = new Map<
    string,
    {
      resolve: (result: ToolResult) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private messageListener?: (event: { data: unknown }) => void;
  private provider?: AssistProvider;

  constructor(options: PostMessageTransportOptions) {
    this.endpoint = options.endpoint;
    this.targetOrigin = options.targetOrigin ?? '*';
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.setupListener();
  }

  private setupListener() {
    this.messageListener = async (event: { data: unknown }) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      const raw = data as Record<string, unknown>;

      // Handling response to pending invocation (client side)
      if (raw.type === 'formspec-assist-response' && typeof raw.callId === 'string') {
        const payload = raw as unknown as PostMessageResponse;
        const handler = this.pending.get(payload.callId);
        if (handler) {
          clearTimeout(handler.timer);
          this.pending.delete(payload.callId);
          if (payload.error) {
            handler.reject(new Error(`[${payload.error.code}] ${payload.error.message}`));
          } else if (payload.result) {
            handler.resolve(payload.result);
          } else {
            handler.reject(new Error('Invalid empty postMessage response'));
          }
        }
        return;
      }

      // Handling incoming invocation request (provider server side)
      if (
        raw.type === 'formspec-assist-request' &&
        typeof raw.callId === 'string' &&
        typeof raw.toolName === 'string' &&
        this.provider
      ) {
        const payload = raw as unknown as PostMessageRequest;
        const { callId, toolName, input } = payload;
        try {
          const result = await this.provider.invokeTool(toolName, input ?? {});
          const response: PostMessageResponse = {
            type: 'formspec-assist-response',
            callId,
            result,
          };
          this.endpoint.postMessage(response, this.targetOrigin);
        } catch (err) {
          const response: PostMessageResponse = {
            type: 'formspec-assist-response',
            callId,
            error: {
              code: 'TOOL_EXECUTION_ERROR',
              message: err instanceof Error ? err.message : String(err),
            },
          };
          this.endpoint.postMessage(response, this.targetOrigin);
        }
      }
    };

    if (typeof this.endpoint.addEventListener === 'function') {
      this.endpoint.addEventListener('message', this.messageListener);
    } else {
      this.endpoint.onmessage = this.messageListener;
    }
  }

  register(provider: AssistProvider): void {
    this.provider = provider;
  }

  unregister(): void {
    this.provider = undefined;
    if (this.messageListener) {
      if (typeof this.endpoint.removeEventListener === 'function') {
        this.endpoint.removeEventListener('message', this.messageListener);
      } else if (this.endpoint.onmessage === this.messageListener) {
        this.endpoint.onmessage = null;
      }
    }
    for (const [, handler] of this.pending) {
      clearTimeout(handler.timer);
      handler.reject(new Error('PostMessageTransport unregistered'));
    }
    this.pending.clear();
  }

  async invoke(
    toolName: string,
    input: Record<string, unknown> = {},
    options?: InvokeToolOptions
  ): Promise<ToolResult> {
    const callId = generateCallId();
    const request: PostMessageRequest = {
      type: 'formspec-assist-request',
      callId,
      toolName,
      input,
    };

    return new Promise<ToolResult>((resolve, reject) => {
      if (options?.signal?.aborted) {
        reject(new Error('Invocation aborted by signal'));
        return;
      }

      const abortHandler = () => {
        clearTimeout(timer);
        this.pending.delete(callId);
        reject(new Error('Invocation aborted by signal'));
      };

      if (options?.signal) {
        options.signal.addEventListener('abort', abortHandler, { once: true });
      }

      const timer = setTimeout(() => {
        this.pending.delete(callId);
        if (options?.signal) {
          options.signal.removeEventListener('abort', abortHandler);
        }
        reject(new Error(`PostMessage invocation timed out after ${this.timeoutMs}ms (callId: ${callId})`));
      }, this.timeoutMs);

      this.pending.set(callId, {
        resolve: (res) => {
          if (options?.signal) options.signal.removeEventListener('abort', abortHandler);
          resolve(res);
        },
        reject: (err) => {
          if (options?.signal) options.signal.removeEventListener('abort', abortHandler);
          reject(err);
        },
        timer,
      });

      this.endpoint.postMessage(request, this.targetOrigin);
    });
  }

  async listTools(): Promise<ToolDeclaration[]> {
    if (this.provider) {
      return this.provider.getTools();
    }
    const res = await this.invoke('formspec.form.describe');
    const first = res.content[0];
    if (first && first.type === 'text') {
      const parsed = JSON.parse(first.text) as { tools?: ToolDeclaration[] };
      return parsed.tools ?? [];
    }
    return [];
  }
}
