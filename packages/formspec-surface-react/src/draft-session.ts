/** @filedesc Retain editable draft sessions across browser history and qualify all access by key. */
import {
  createFormEngine, initFormspecEngine, initFormspecEngineTools, responseSubjectId, type FormDraftSnapshot, type IFormEngine,
} from '@formspec-org/engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { resolvePageSequence } from '@formspec-org/layout';
import type { BrowserDraftPort, DataSourceSubject, DraftKey, DraftLoadResult, DraftPort } from '@formspec-org/surface';
import { definitionResponseRequests, resolveDefinitionReads } from './definition-response-reads.js';
import type { FormResponse, ResponseSelector } from '@formspec-org/types';
import { createDraftWriter, type DraftCheckpointPorts, type DraftNoticeReporter, type DraftWriter } from './draft-writer.js';
import type { SurfaceDefinitionFormRenderInput } from './SurfaceSlot.js';

export interface SurfaceDraftStorage {
  port: DraftPort;
  responses?: ResponseSelector | undefined;
  scope: string;
  author?: { id: string; name?: string };
}

export async function deriveDraftSubject(subject: DataSourceSubject | undefined): Promise<DraftKey['subject']> {
  if (!subject) return undefined;
  await initFormspecEngine();
  await initFormspecEngineTools();
  return { ...subject, id: responseSubjectId(subject.type, subject.keys) };
}

type CommittedDraft =
  | { status: 'loaded'; response: FormResponse; revision: string; key: DraftKey }
  | { status: 'absent' | 'denied' | 'version-mismatch' | 'unavailable' | 'save-failed' };

type DraftOpen =
  | { status: 'ready'; engine: IFormEngine; writer: DraftWriter }
  | (Extract<DraftLoadResult, { status: 'version-mismatch' }> & { key: DraftKey })
  | { status: 'denied' | 'unavailable' | 'loading' };

type Entry = {
  consumers: Map<DraftNoticeReporter, (() => void) | undefined>;
  result: Promise<DraftOpen>;
  seed: Pick<SurfaceDefinitionFormRenderInput, 'initialData' | 'draftSeed'>;
  opened?: DraftOpen;
};

function sessionKey(key: DraftKey, version: string): string {
  return JSON.stringify([key.scope, key.definitionUrl, key.subject?.id ?? null, version]);
}

export function createDraftSession(
  storage: SurfaceDraftStorage, browserPort?: BrowserDraftPort, checkpointPorts?: DraftCheckpointPorts,
) {
  const entries = new Map<string, Entry>();
  const lifetime = new AbortController();

  async function load(key: DraftKey, version: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const result = await storage.port.load(key, version, signal);
    signal.throwIfAborted();
    return result;
  }

  function release(entry: Entry) {
    if (entry.consumers.size === 0 && entry.opened?.status === 'ready') entry.opened.writer.setMounted(false);
  }

  function disposeEntry(entry: Entry) {
    if (entry.opened?.status === 'ready') {
      entry.opened.writer.dispose();
      entry.opened.engine.dispose();
    }
  }

  return {
    scope: storage.scope,
    port: storage.port,
    restart: browserPort?.restart,

    acquire(key: DraftKey, input: SurfaceDefinitionFormRenderInput, report: DraftNoticeReporter, onReopen?: () => void) {
      const definition = input.plan.definition;
      const id = sessionKey(key, definition.version);
      let entry = entries.get(id);
      const previous = entry?.opened;
      const previousConsumers = entry?.consumers;
      if (entry && previous && entry.consumers.size === 0 && (previous.status !== 'ready' || !previous.writer.dirty)) {
        entries.delete(id);
        entry = undefined;
      }
      if (!entry) {
        const reusable = previous?.status === 'ready' ? previous : undefined;
        const consumers = previousConsumers ?? new Map<DraftNoticeReporter, (() => void) | undefined>();
        const opened = async (): Promise<DraftOpen> => {
          let loaded: DraftLoadResult;
          try {
            loaded = await load(key, definition.version, lifetime.signal);
          } catch (error) {
            if (reusable) {
              reusable.writer.dispose();
              reusable.engine.dispose();
            }
            throw error;
          }
          const draft = loaded.status === 'loaded' ? loaded.draft : undefined;
          if (reusable) {
            if (draft && draft.revision === reusable.writer.revision &&
                !Object.values(definition.instances ?? {}).some(instance => instance.response)) {
              return reusable;
            }
            reusable.writer.dispose();
            reusable.engine.dispose();
          }
          if (loaded.status === 'version-mismatch') return { ...loaded, key };
          if (loaded.status === 'denied' || loaded.status === 'unavailable') return { status: loaded.status };
          const seed = created.seed;
          if (!draft && seed.draftSeed) return { status: seed.draftSeed };
          const response = draft && parseJsonExact(draft.responseJson) as FormResponse;
          const draftSnapshot = draft && parseJsonExact(draft.snapshotJson) as FormDraftSnapshot;
          const requests = definitionResponseRequests(definition, key, draft?.pins);
          const resolutions = await resolveDefinitionReads(storage.responses, requests, lifetime.signal);
          const engine = createFormEngine(definition, {
            responseInstanceResolutions: resolutions,
            ...(key.subject && { responseSubject: key.subject }),
            ...(draftSnapshot && { draftSnapshot }),
            ...(!draftSnapshot && seed.initialData?.data !== undefined && {
              responseData: seed.initialData.data as Parameters<IFormEngine['loadResponseData']>[0],
            }),
          });
          try {
            const writer = createDraftWriter({
              engine, key, draft, port: storage.port,
              creationPins: Object.fromEntries(Object.entries(resolutions).filter(([, delivery]) => delivery.pinned)),
              responseId: response?.id ?? input.semanticControlScope?.responseId,
              author: response?.author ?? storage.author,
              locally: browserPort !== undefined,
              sections: resolvePageSequence(definition, {
                ...(input.componentDocument ? { component: input.componentDocument } : {}),
                ...(input.grant.themeDocument ? { theme: input.grant.themeDocument } : {}),
              }),
              actions: input.responseActionsDocument,
              invoker: input.responseActionInvoker,
              checkpointPorts,
              report: (notice, options) => { for (const notify of consumers.keys()) notify(notice, options); },
            });
            return { status: 'ready', engine, writer };
          } catch (error) {
            engine.dispose();
            throw error;
          }
        };
        const created: Entry = {
          consumers,
          seed: { initialData: input.initialData, draftSeed: input.draftSeed },
          result: opened().catch((): DraftOpen => ({ status: 'unavailable' })).then(result => {
            created.opened = result;
            if (lifetime.signal.aborted) disposeEntry(created);
            else if (result.status === 'ready') result.writer.setMounted(consumers.size > 0);
            return result;
          }),
        };
        entries.set(id, created);
        entry = created;
      }

      const tracked = entry;
      if (tracked.consumers.size === 0) {
        tracked.seed = { initialData: input.initialData, draftSeed: input.draftSeed };
      }
      tracked.consumers.set(report, onReopen);
      if (tracked.opened?.status === 'ready') tracked.opened.writer.setMounted(true);
      return {
        result: tracked.result,
        release() {
          tracked.consumers.delete(report);
          release(tracked);
        },
      };
    },

    async readCommitted(
      definition: { url: string; version: string }, subject: DataSourceSubject | undefined,
      options?: { afterPendingSaves?: boolean; signal?: AbortSignal },
    ): Promise<CommittedDraft> {
      try {
        const signal = options?.signal ? AbortSignal.any([lifetime.signal, options.signal]) : lifetime.signal;
        signal.throwIfAborted();
        const key = { scope: storage.scope, definitionUrl: definition.url, subject: await deriveDraftSubject(subject) };
        if (options?.afterPendingSaves) {
          const entry = await entries.get(sessionKey(key, definition.version))?.result;
          if (entry?.status === 'ready' && !await entry.writer.waitForSaves()) return { status: 'save-failed' };
        }
        const result = await load(key, definition.version, signal);
        if (result.status !== 'loaded') return { status: result.status };
        const response = parseJsonExact(result.draft.responseJson) as FormResponse;
        return { status: 'loaded', response, revision: result.draft.revision, key };
      } catch {
        return { status: 'unavailable' };
      }
    },

    async leave() {
      const results = await Promise.all([...entries.values()].filter(entry => entry.consumers.size > 0).map(async entry => {
        const opened = await entry.result;
        return opened.status !== 'ready' || await opened.writer.leave();
      }));
      return results.every(Boolean);
    },

    discardForReopen(writer: DraftWriter) {
      for (const [id, entry] of entries) {
        if (entry.opened?.status === 'ready' && entry.opened.writer === writer) {
          entries.delete(id);
          disposeEntry(entry);
          for (const reopen of entry.consumers.values()) reopen?.();
          break;
        }
      }
    },

    writerFor(key: DraftKey, version: string) {
      const opened = entries.get(sessionKey(key, version))?.opened;
      return opened?.status === 'ready' ? opened.writer : undefined;
    },

    dispose() {
      lifetime.abort();
      for (const entry of entries.values()) disposeEntry(entry);
      entries.clear();
    },
  };
}

export type DraftSession = ReturnType<typeof createDraftSession>;
