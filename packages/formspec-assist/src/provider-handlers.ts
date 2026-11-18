/** @filedesc Validated Assist tool inputs mapped to provider responsibilities. */
import { minimizeFieldHelp } from './context-resolver.js';
import { jsonError } from './errors.js';
import { readAudience, readNextIncompleteScope, readPath, readValidationProfile } from './tool-input.js';
import type { ProviderFields } from './provider-fields.js';
import type { ProviderWrites, WriteRequest } from './provider-writes.js';
import type { ProviderProfiles } from './provider-profiles.js';
import type { ProviderProgress } from './provider-progress.js';
import type { AssistProvider, FieldHelpOptions, InvokeToolOptions } from './types.js';

export type ToolHandler = (input: Record<string, unknown>, options: InvokeToolOptions) => Promise<unknown> | unknown;

// Input readers for the write tools; validateToolInput has already enforced each shape.

function readWriteEntries(input: Record<string, unknown>): WriteRequest[] {
  return (input.entries as WriteRequest[]).map(({ path, value, expected }) => ({ path, value, expected }));
}

function readApplyPaths(input: Record<string, unknown>): Array<{ path: string; expected?: unknown }> | undefined {
  if (!Array.isArray(input.paths)) {
    return undefined;
  }
  return (input.paths as Array<string | { path: string; expected?: unknown }>)
    .map((entry) => (typeof entry === 'string' ? { path: entry } : { path: entry.path, expected: entry.expected }));
}

function readFieldHelpOptions(input: Record<string, unknown>): FieldHelpOptions {
  return {
    includeContent: input.includeContent === true,
    ...(typeof input.maxBytes === 'number' ? { maxBytes: input.maxBytes } : {}),
  };
}

export function buildToolHandler(
  name: string,
  provider: AssistProvider,
  fields: ProviderFields,
  writes: ProviderWrites,
  profiles: ProviderProfiles,
  progress: ProviderProgress,
): ToolHandler {
  switch (name) {
    case 'formspec.form.describe':
      return () => {
        const definition = fields.engine.getDefinition();
        const state = provider.getProgress();
        return {
          title: definition.title,
          description: definition.description,
          url: definition.url,
          version: definition.version,
          fieldCount: fields.engine.getFieldPaths().length,
          pageCount: state.pages?.length ?? 0,
          status: state.ready === null ? 'unavailable' : state.ready ? 'complete' : 'in-progress',
        };
      };
    case 'formspec.field.list':
      return (input) => fields.listFields(typeof input.filter === 'string' ? input.filter : 'relevant');
    case 'formspec.field.describe':
      return (input) => fields.describeField(readPath(input));
    case 'formspec.field.help':
      return (input) => minimizeFieldHelp(provider.getFieldHelp(readPath(input), readAudience(input)), readFieldHelpOptions(input));
    case 'formspec.form.progress':
      return () => provider.getProgress();
    case 'formspec.field.set':
      return (input) => writes.setField({ path: readPath(input), value: input.value, expected: input.expected });
    case 'formspec.field.bulkSet':
      return (input) => writes.bulkSet(readWriteEntries(input));
    case 'formspec.form.validate':
      return (input) => fields.engine.getValidationReport({ profile: readValidationProfile(input) });
    case 'formspec.field.validate':
      return (input) => ({
        results: fields.fieldValidation(readPath(input)),
      });
    case 'formspec.profile.match':
      return (input) => ({
        matches: profiles.matchProfile(typeof input.profileRef === 'string' ? input.profileRef : undefined),
      });
    case 'formspec.profile.apply':
      return (input, options) => profiles.applyProfile(readApplyPaths(input), input.confirm === true, options.signal);
    case 'formspec.profile.learn':
      return (input) => profiles.learnProfile(typeof input.profileRef === 'string' ? input.profileRef : undefined);
    case 'formspec.form.pages':
      return () => ({
        pages: provider.getProgress().pages,
      });
    case 'formspec.form.nextIncomplete':
      return (input) => progress.nextIncomplete(readNextIncompleteScope(input));
    default:
      return () => {
        throw jsonError('UNSUPPORTED', `Unknown tool: ${name}`);
      };
  }
}
