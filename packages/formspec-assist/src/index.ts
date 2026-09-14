/** @filedesc Public API barrel for the formspec-assist package. */

export { createAssistProvider } from './provider.js';
export { ContextResolver } from './context-resolver.js';
export { targetDefinitionMatches } from '@formspec-org/types';
export { ensureModelContext } from './webmcp-shim.js';

export type {
  AssistProvider,
  AssistProviderOptions,
  BoundReference,
  ConceptBinding,
  ConceptEquivalent,
  FieldHelp,
  FormProgress,
  OntologyDocument,
  ProfileApplyResult,
  ProfileEntry,
  ProfileEntrySource,
  ProfileMatch,
  ReferenceEntry,
  ReferencesDocument,
  SetValueResult,
  StorageBackend,
  ToolDeclaration,
  ToolResult,
  UserProfile,
} from './types.js';
