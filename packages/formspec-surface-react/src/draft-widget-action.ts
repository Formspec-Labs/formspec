/** @filedesc Bind maintained filing widget actions to the committed form draft. */
import { resolveResponseAction } from '@formspec-org/engine';
import type { FormDefinition } from '@formspec-org/types';
import type { DraftKey } from '@formspec-org/surface';
import type { DraftSession } from './draft-session.js';
import { filingAction } from '@formspec-org/surface';
import { usesDraftCheckpoint } from './draft-writer.js';
import type { SurfaceWidgetActionExecutor } from './widget-api.js';

export function fenceDraftWidgetActions(
  executor: SurfaceWidgetActionExecutor, session: DraftSession, definitions: ReadonlyMap<string, FormDefinition>,
  current: () => boolean,
): SurfaceWidgetActionExecutor {
  return async input => {
    if (input.document.scope === 'app') return executor(input);
    const { action } = resolveResponseAction(input.document, input.actionRef);
    const kind = filingAction(input.document, action);
    const checkpoint = action && usesDraftCheckpoint(action);
    if (!kind && !checkpoint) return executor(input);

    const definition = input.responseContext?.definition ?? definitions.get(input.document.targetDefinition?.url ?? '');
    if (!definition) throw new Error('The filing action has no resolved Definition.');
    const subject = input.responseContext?.response.subject;
    if (definition.subject && (!subject?.type || !subject.keys)) throw new Error('The filing action has no resolved filing unit.');
    const key: DraftKey = {
      scope: session.scope, definitionUrl: definition.url,
      subject: definition.subject && subject?.type && subject.keys ? { id: subject.id, type: subject.type, keys: subject.keys } : undefined,
    };
    const writer = session.writerFor(key, definition.version);
    if (!writer) {
      if (!kind) throw new Error('Open the draft before saving edits.');
      if (!current()) throw new Error('The filing action visit ended.');
      const loaded = await session.port.load(key, definition.version);
      if (!current()) throw new Error('The filing action visit ended.');
      if (loaded.status !== 'loaded') throw new Error('The filing action has no qualified draft.');
      const { revision, responseJson } = loaded.draft;
      const draftFence = Object.freeze({ key, definitionVersion: definition.version, revision, responseJson });
      return executor({ ...input, draftFence });
    }
    if (!kind) {
      return writer.invoke({
        document: input.document, actionRef: input.actionRef,
        invocationContext: { invocationId: input.invocationId },
        ports: { submit: writer.captureActionResponse, dispatchHostEvent: () => {} },
      }, { current });
    }
    return writer.runFenced(kind, async (draftFence, isCurrent) => {
      if (!isCurrent()) throw new Error('The filing action visit ended.');
      return executor({ ...input, draftFence });
    }, {
      completed: result => ('invocation' in result ? result.invocation : result).status === 'completed',
      committedRevision: result => result.committedDraftRevision,
      current,
    });
  };
}
