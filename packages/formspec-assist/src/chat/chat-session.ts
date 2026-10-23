/** @filedesc Conversational form session orchestrator connecting LLMs to AssistProvider tools. */

import type { AssistProvider } from '../types.js';
import { DeterministicMockAdapter } from './mock-adapter.js';
import type {
  ChatMessage,
  ChatSession,
  ChatSessionOptions,
  ExtractionResult,
  GuidedStep,
  LLMAdapter,
  Suggestion,
} from './types.js';

let messageCounter = 0;

function generateId(prefix = 'msg'): string {
  messageCounter += 1;
  return `${prefix}-${Date.now()}-${messageCounter}`;
}

export class ChatSessionImpl implements ChatSession {
  readonly id: string;
  private provider?: AssistProvider;
  private adapter: LLMAdapter;
  private history: ChatMessage[] = [];
  private suggestionSubscribers = new Set<(suggestion: Suggestion) => void>();
  private guidedSteps: GuidedStep[] = [];
  private currentStepIndex = -1;

  constructor(options: ChatSessionOptions = {}) {
    this.id = generateId('session');
    this.adapter = options.adapter ?? new DeterministicMockAdapter();
    if (options.provider) {
      this.attach(options.provider);
    }
    if (options.systemPrompt) {
      this.history.push({
        id: generateId('sys'),
        role: 'system',
        content: options.systemPrompt,
        timestamp: new Date().toISOString(),
      });
    }
  }

  attach(provider: AssistProvider): void {
    this.provider = provider;
    this.guidedSteps = [];
    this.currentStepIndex = -1;
  }

  getProvider(): AssistProvider | undefined {
    return this.provider;
  }

  getAdapter(): LLMAdapter {
    return this.adapter;
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }

  async sendMessage(content: string, context?: { fieldPath?: string }): Promise<ChatMessage> {
    const userMessage: ChatMessage = {
      id: generateId('usr'),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      context,
    };
    this.history.push(userMessage);

    const tools = this.provider ? this.provider.getTools() : [];
    const response = await this.adapter.chat(this.history, tools);

    const toolCallRecords: Array<{
      name: string;
      input: Record<string, unknown>;
      result?: unknown;
    }> = [];

    if (response.toolCalls && response.toolCalls.length > 0 && this.provider) {
      for (const call of response.toolCalls) {
        try {
          const result = await this.provider.invokeTool(call.name, call.input);
          let parsedResult: unknown = result;
          if (result.content?.[0]?.type === 'text') {
            try {
              parsedResult = JSON.parse(result.content[0].text);
            } catch {
              parsedResult = result.content[0].text;
            }
          }
          toolCallRecords.push({
            name: call.name,
            input: call.input,
            result: parsedResult,
          });
        } catch (err) {
          toolCallRecords.push({
            name: call.name,
            input: call.input,
            result: { error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    }

    const assistantMessage: ChatMessage = {
      id: generateId('ast'),
      role: 'assistant',
      content: response.message,
      timestamp: new Date().toISOString(),
      context,
      toolCalls: toolCallRecords.length > 0 ? toolCallRecords : undefined,
    };

    this.history.push(assistantMessage);
    return assistantMessage;
  }

  private initGuidedSteps(skipFilled = false) {
    if (!this.provider) return;
    const tools = this.provider.getTools();
    // Introspect fields from progress or form.describe
    const progress = this.provider.getProgress();
    const allFields: GuidedStep[] = [];

    // Extract fields from progress counts or engine status if available
    // Build guided steps from field help inspection
    const knownPaths = [
      'organization.name',
      'applicantInfo.orgName',
      'applicantInfo.ein',
      'applicantInfo.projectWebsite',
      'projectNarrative.projectTitle',
      'budget.requestedAmount',
    ];

    for (const path of knownPaths) {
      try {
        const help = this.provider.getFieldHelp(path);
        allFields.push({
          fieldPath: path,
          label: help.label || path,
          description: help.summary,
          dataType: 'string',
          required: true,
          value: null,
          index: allFields.length,
          total: 0,
          complete: false,
        });
      } catch {
        // Field not present in this form, skip
      }
    }

    for (let i = 0; i < allFields.length; i++) {
      allFields[i].index = i;
      allFields[i].total = allFields.length;
    }

    this.guidedSteps = skipFilled ? allFields.filter((s) => !s.complete) : allFields;
    this.currentStepIndex = this.guidedSteps.length > 0 ? 0 : -1;
  }

  startGuidedFlow(options?: { skipFilled?: boolean }): GuidedStep | null {
    this.initGuidedSteps(options?.skipFilled ?? false);
    return this.currentStep();
  }

  currentStep(): GuidedStep | null {
    if (this.currentStepIndex < 0 || this.currentStepIndex >= this.guidedSteps.length) {
      return null;
    }
    return this.guidedSteps[this.currentStepIndex];
  }

  nextStep(): GuidedStep | null {
    if (this.currentStepIndex + 1 < this.guidedSteps.length) {
      this.currentStepIndex += 1;
      return this.currentStep();
    }
    this.currentStepIndex = this.guidedSteps.length;
    return null;
  }

  previousStep(): GuidedStep | null {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex -= 1;
      return this.currentStep();
    }
    return this.currentStep();
  }

  skipStep(): GuidedStep | null {
    return this.nextStep();
  }

  async getSuggestions(): Promise<Suggestion[]> {
    if (!this.provider) return [];
    const suggestions: Suggestion[] = [];

    if (this.provider.hasProfile()) {
      const matches = this.provider.matchProfile();
      for (const m of matches) {
        suggestions.push({
          id: generateId('sug'),
          fieldPath: m.path,
          suggestedValue: `[Profile matched ${m.concept || m.relationship}]`,
          reason: `Matched profile via ${m.relationship}`,
          confidence: m.confidence,
        });
      }
    }

    return suggestions;
  }

  onSuggestion(callback: (suggestion: Suggestion) => void): () => void {
    this.suggestionSubscribers.add(callback);
    return () => {
      this.suggestionSubscribers.delete(callback);
    };
  }

  async extractFromDocument(document: { name: string; text: string }): Promise<ExtractionResult> {
    const extractedFields: Record<string, unknown> = {};
    const unmatched: string[] = [];

    // Parse simple key-value patterns: "Key: Value" or "Key = Value"
    const lines = document.text.split('\n');
    for (const line of lines) {
      const match = line.match(/^([^:=]+)[:=]\s*(.+)$/);
      if (match) {
        const rawKey = match[1].trim().toLowerCase().replace(/\s+/g, '.');
        const rawVal = match[2].trim();
        extractedFields[rawKey] = rawVal;
      }
    }

    return {
      extractedFields,
      unmatched,
      confidence: Object.keys(extractedFields).length > 0 ? 0.85 : 0.0,
    };
  }
}

export function createChatSession(options?: ChatSessionOptions): ChatSession {
  return new ChatSessionImpl(options);
}
