/** @filedesc Type definitions for the conversational form runtime (formspec-assist chat layer). */

import type { AssistProvider, ToolDeclaration } from '../types.js';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  context?: {
    fieldPath?: string;
  };
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
    result?: unknown;
  }>;
}

export interface GuidedStep {
  fieldPath: string;
  label: string;
  description?: string;
  dataType: string;
  required: boolean;
  value: unknown;
  index: number;
  total: number;
  complete: boolean;
}

export interface Suggestion {
  id: string;
  fieldPath: string;
  suggestedValue: unknown;
  reason: string;
  confidence: number;
}

export interface ExtractionResult {
  extractedFields: Record<string, unknown>;
  unmatched: string[];
  confidence: number;
}

export interface LLMResponse {
  message: string;
  toolCalls?: Array<{
    name: string;
    input: Record<string, unknown>;
  }>;
}

export interface LLMAdapter {
  readonly name: string;
  chat(messages: ChatMessage[], tools?: ToolDeclaration[]): Promise<LLMResponse>;
}

export interface ChatSessionOptions {
  provider?: AssistProvider;
  adapter?: LLMAdapter;
  systemPrompt?: string;
}

export interface ChatSession {
  readonly id: string;
  attach(provider: AssistProvider): void;
  getProvider(): AssistProvider | undefined;
  getAdapter(): LLMAdapter;
  sendMessage(content: string, context?: { fieldPath?: string }): Promise<ChatMessage>;
  getHistory(): ChatMessage[];
  clearHistory(): void;
  startGuidedFlow(options?: { skipFilled?: boolean }): GuidedStep | null;
  currentStep(): GuidedStep | null;
  nextStep(): GuidedStep | null;
  previousStep(): GuidedStep | null;
  skipStep(): GuidedStep | null;
  getSuggestions(): Promise<Suggestion[]>;
  onSuggestion(callback: (suggestion: Suggestion) => void): () => void;
  extractFromDocument(document: { name: string; text: string }): Promise<ExtractionResult>;
}
