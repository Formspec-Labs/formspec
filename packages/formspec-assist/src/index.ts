/** @filedesc Public API barrel for the formspec-assist package. */

export { createAssistProvider } from './provider.js';
export { ContextResolver } from './context-resolver.js';
export { targetDefinitionMatches } from '@formspec-org/types';
export { DEFAULT_WEBMCP_TOOLS, PROFILE_WEBMCP_TOOLS, registerAssistTools } from './webmcp-binding.js';
export type { RegisterAssistToolsOptions } from './webmcp-binding.js';

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
  ResolvedConcept,
  SetValueResult,
  StorageBackend,
  ToolAnnotations,
  ToolDeclaration,
  ToolError,
  ToolResult,
  WebMCPRegistrationOptions,
  UserProfile,
} from './types.js';
