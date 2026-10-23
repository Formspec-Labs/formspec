/** @filedesc Deterministic mock LLM adapter for conversational testing and reproducible execution. */

import type { ToolDeclaration } from '../types.js';
import type { ChatMessage, LLMAdapter, LLMResponse } from './types.js';

export class DeterministicMockAdapter implements LLMAdapter {
  readonly name = 'deterministic-mock';

  async chat(messages: ChatMessage[], tools?: ToolDeclaration[]): Promise<LLMResponse> {
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const content = lastUserMessage?.content.trim() || '';
    const fieldPath = lastUserMessage?.context?.fieldPath;

    // 1. Explicit set pattern: "Set <path> to <val>" or "My <path> is <val>"
    const setMatch = content.match(/(?:set|my)\s+([a-zA-Z0-9_.-]+)\s+(?:to|is)\s+(.+)/i);
    if (setMatch) {
      const targetPath = setMatch[1].trim();
      const rawValue = setMatch[2].trim().replace(/^['"]|['"]$/g, '');
      const numVal = Number(rawValue);
      const parsedValue = !isNaN(numVal) && rawValue !== '' ? numVal : rawValue === 'true' ? true : rawValue === 'false' ? false : rawValue;

      return {
        message: `I will update ${targetPath} to ${parsedValue}.`,
        toolCalls: [
          {
            name: 'formspec.field.set',
            input: {
              path: targetPath,
              value: parsedValue,
            },
          },
        ],
      };
    }

    // 2. Help request: "Help with <path>", "What is <path>", or questions mentioning a field
    const helpMatch = content.match(/(?:help\s+(?:with|for|on)|what\s+is|explain)\s+([a-zA-Z0-9_.-]+)/i) ||
      content.match(/^help\s+([a-zA-Z0-9_.-]+)/i);
    const matchedTarget = helpMatch?.[1];
    if (
      (helpMatch && matchedTarget && !['me', 'us', 'please', 'here'].includes(matchedTarget.toLowerCase())) ||
      (fieldPath && content.toLowerCase().includes('help'))
    ) {
      const target = fieldPath || matchedTarget || 'organization.name';
      return {
        message: `Here is information to assist you with ${target}:`,
        toolCalls: [
          {
            name: 'formspec.field.help',
            input: {
              path: target,
              includeContent: true,
            },
          },
        ],
      };
    }

    // 3. Fallback standard assistant response
    return {
      message: `I received your message: "${content}". How can I help you complete this form?`,
    };
  }
}
