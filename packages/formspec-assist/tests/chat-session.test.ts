/** @filedesc Tests for conversational form runtime (fs-5xuj / M16). */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  createChatSession,
  DeterministicMockAdapter,
  type LLMAdapter,
} from '../src/chat/index.js';
import { createAssistProvider } from '../src/provider.js';
import { createEngine, ensureEngine } from './helpers.js';

describe('Conversational Form Runtime (fs-5xuj / M16)', () => {
  beforeAll(async () => {
    await ensureEngine();
  });

  it('createChatSession returns a valid ChatSession instance', () => {
    const session = createChatSession();
    expect(session).toBeDefined();
    expect(typeof session.sendMessage).toBe('function');
    expect(typeof session.startGuidedFlow).toBe('function');
    expect(session.getHistory()).toEqual([]);
  });

  it('maintains message history and executes user and assistant turns', async () => {
    const session = createChatSession({
      systemPrompt: 'You are an intelligent form completion assistant.',
    });

    const initialHistory = session.getHistory();
    expect(initialHistory.length).toBe(1);
    expect(initialHistory[0].role).toBe('system');

    const reply = await session.sendMessage('Hello, can you help me?');
    expect(reply.role).toBe('assistant');
    expect(reply.content).toContain('How can I help you');

    const updatedHistory = session.getHistory();
    expect(updatedHistory.length).toBe(3); // system, user, assistant
    expect(updatedHistory[1].role).toBe('user');
    expect(updatedHistory[1].content).toBe('Hello, can you help me?');
    expect(updatedHistory[2].role).toBe('assistant');

    session.clearHistory();
    expect(session.getHistory().length).toBe(0);
  });

  it('invokes AssistProvider tools from conversational turns', async () => {
    const engine = createEngine();
    const provider = createAssistProvider({ engine });
    const session = createChatSession({ provider });

    // Request help for a field
    const helpReply = await session.sendMessage('Help with organization.name');
    expect(helpReply.role).toBe('assistant');
    expect(helpReply.toolCalls).toBeDefined();
    expect(helpReply.toolCalls?.length).toBe(1);
    expect(helpReply.toolCalls?.[0].name).toBe('formspec.field.help');
    expect(helpReply.toolCalls?.[0].result).toBeDefined();

    // Set field value via conversational instruction
    const setReply = await session.sendMessage('Set organization.name to Acme Global Foundation');
    expect(setReply.role).toBe('assistant');
    expect(setReply.toolCalls).toBeDefined();
    expect(setReply.toolCalls?.[0].name).toBe('formspec.field.set');
    const setResult = setReply.toolCalls?.[0].result as { accepted?: boolean; value?: unknown };
    expect(setResult?.accepted).toBe(true);
    expect(setResult?.value).toBe('Acme Global Foundation');

    // Verify engine state was mutated through the tool
    const vm = engine.getFieldVM('organization.name');
    expect(vm?.value.value).toBe('Acme Global Foundation');
  });

  it('supports custom LLMAdapter implementations', async () => {
    const customAdapter: LLMAdapter = {
      name: 'custom-echo',
      async chat(messages) {
        const last = messages[messages.length - 1];
        return {
          message: `Echo: ${last.content}`,
        };
      },
    };

    const session = createChatSession({ adapter: customAdapter });
    const reply = await session.sendMessage('Testing custom adapter');
    expect(reply.content).toBe('Echo: Testing custom adapter');
    expect(session.getAdapter().name).toBe('custom-echo');
  });

  it('runs guided step walkthrough mode', () => {
    const engine = createEngine();
    const provider = createAssistProvider({ engine });
    const session = createChatSession({ provider });

    const step1 = session.startGuidedFlow();
    if (step1) {
      expect(step1.fieldPath).toBeDefined();
      expect(step1.index).toBe(0);

      const step2 = session.nextStep();
      if (step2) {
        expect(step2.index).toBe(1);

        const prev = session.previousStep();
        expect(prev?.index).toBe(0);
      }
    }
  });

  it('extracts field values from document text', async () => {
    const session = createChatSession();
    const documentText = `
Organization Name: Wayne Enterprises
Contact Email: bruce@wayne.com
Budget Total: 250000
    `;

    const extracted = await session.extractFromDocument({
      name: 'intake.txt',
      text: documentText,
    });

    expect(extracted.extractedFields['organization.name']).toBe('Wayne Enterprises');
    expect(extracted.extractedFields['contact.email']).toBe('bruce@wayne.com');
    expect(extracted.extractedFields['budget.total']).toBe('250000');
    expect(extracted.confidence).toBeGreaterThan(0.5);
  });
});
