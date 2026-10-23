/** @filedesc Assist transport abstraction types and envelope interfaces. */

import type { AssistProvider, InvokeToolOptions, ToolDeclaration, ToolResult } from '../types.js';

/** Pluggable transport abstraction interface for Assist tool consumers and providers. */
export interface AssistTransport {
  readonly name: string;
  register(provider: AssistProvider): Promise<void> | void;
  unregister?(): Promise<void> | void;
  invoke(toolName: string, input?: Record<string, unknown>, options?: InvokeToolOptions): Promise<ToolResult>;
  listTools?(): Promise<ToolDeclaration[]>;
}

/** Wire request payload for browser postMessage bindings (§7.4). */
export interface PostMessageRequest {
  type: 'formspec-assist-request';
  callId: string;
  toolName: string;
  input?: Record<string, unknown>;
}

/** Wire response payload for browser postMessage bindings (§7.4). */
export interface PostMessageResponse {
  type: 'formspec-assist-response';
  callId: string;
  result?: ToolResult;
  error?: { code: string; message: string };
}

/** Message endpoint contract supporting postMessage and event listener registration. */
export interface MessageEndpoint {
  postMessage(message: unknown, targetOrigin?: string): void;
  addEventListener?(type: string, listener: (event: { data: unknown }) => void): void;
  removeEventListener?(type: string, listener: (event: { data: unknown }) => void): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
}

/** Generate a unique call identifier per §7.4 (UUID format). */
export function generateCallId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
