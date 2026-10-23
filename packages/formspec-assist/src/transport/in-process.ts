/** @filedesc In-process transport implementation for direct invocation within the same runtime. */

import type { AssistProvider, InvokeToolOptions, ToolDeclaration, ToolResult } from '../types.js';
import type { AssistTransport } from './types.js';

export class InProcessTransport implements AssistTransport {
  readonly name = 'in-process';
  private provider?: AssistProvider;

  constructor(provider?: AssistProvider) {
    if (provider) {
      this.register(provider);
    }
  }

  register(provider: AssistProvider): void {
    this.provider = provider;
  }

  unregister(): void {
    this.provider = undefined;
  }

  async invoke(
    toolName: string,
    input: Record<string, unknown> = {},
    options?: InvokeToolOptions
  ): Promise<ToolResult> {
    if (!this.provider) {
      throw new Error('InProcessTransport: no AssistProvider registered');
    }
    return this.provider.invokeTool(toolName, input, options);
  }

  async listTools(): Promise<ToolDeclaration[]> {
    if (!this.provider) {
      throw new Error('InProcessTransport: no AssistProvider registered');
    }
    return this.provider.getTools();
  }
}
