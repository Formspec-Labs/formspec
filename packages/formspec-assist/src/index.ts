/** @filedesc Public API barrel for the formspec-assist package. */

export { createAssistProvider } from './provider.js';
export { ContextResolver } from './context-resolver.js';
export { targetDefinitionMatches } from '@formspec-org/types';
export { registerAssistTools } from './webmcp-binding.js';

export type {
  AssistProvider,
  AssistProviderOptions,
  BoundReference,
  ConceptBinding,
  ConceptEquivalent,
  FieldHelp,
  FormProgress,
  InvokeToolOptions,
  OntologyDocument,
  ProfileApplyResult,
  ProfileEntry,
  ProfileEntrySource,
  ProfileMatch,
  ReferenceEntry,
  ReferencesDocument,
  SetValueResult,
  StorageBackend,
  ToolAnnotations,
  ToolDeclaration,
  ToolResult,
  UserProfile,
} from './types.js';
