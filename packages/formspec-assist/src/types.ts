/** @filedesc Public type vocabulary for the formspec-assist package. */

import type {
  FormProgress as EngineFormProgress,
  IFormEngine,
  RegistryEntry,
} from '@formspec-org/engine';
import type {
  ComponentDocument,
  Reference,
  ReferencesDocument,
  RegistryDocument,
  ThemeDocument,
  ValidationReport,
  ValidationResult,
} from '@formspec-org/types';

export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The schema-generated References types; resolution lives beside them in `@formspec-org/types`. */
export type { ReferencesDocument };

/** One resolved reference, as returned in {@link FieldHelp.references}. */
export type ReferenceEntry = Reference;

/** A reference still carrying the item path it is bound to. */
export type BoundReference = Reference & { target: string };

export interface ConceptEquivalent {
  system: string;
  code: string;
  display?: string;
  type?: string;
  concept?: string;
}

export interface ConceptBinding {
  concept: string;
  system?: string;
  display?: string;
  code?: string;
  equivalents?: ConceptEquivalent[];
}

export interface OntologyDocument {
  $formspecOntology: '1.0';
  version: string;
  targetDefinition: { url: string; compatibleVersions?: string };
  defaultSystem?: string;
  concepts?: Record<string, ConceptBinding>;
}

export interface ProfileEntry {
  value: unknown;
  confidence: number;
  source: ProfileEntrySource;
  lastUsed: string;
  verified: boolean;
}

export type ProfileEntrySource =
  | { type: 'form-fill'; formUrl: string; fieldPath: string; timestamp: string }
  | { type: 'manual'; timestamp: string }
  | { type: 'import'; source: string; timestamp: string }
  | { type: 'extension'; extensionId: string; timestamp: string };

export interface UserProfile {
  id: string;
  label: string;
  created: string;
  updated: string;
  concepts: Record<string, ProfileEntry>;
  fields: Record<string, ProfileEntry>;
}

export interface ProfileMatch {
  path: string;
  concept?: string;
  value: unknown;
  confidence: number;
  relationship?: 'exact' | 'close' | 'broader' | 'narrower' | 'related' | 'field-key';
  source: ProfileEntrySource;
}

export interface FieldHelp {
  path: string;
  label: string;
  references: Partial<Record<string, ReferenceEntry[]>>;
  concept?: ConceptBinding;
  equivalents?: ConceptEquivalent[];
  summary?: string;
  commonMistakes?: string[];
}

export interface FormProgress extends EngineFormProgress {
  pages?: Array<{ id: string; title?: string; fieldCount: number; filledCount: number; complete: boolean }>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolDeclaration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface AssistProviderOptions {
  engine: IFormEngine;
  references?: ReferencesDocument | ReferencesDocument[];
  ontology?: OntologyDocument | OntologyDocument[];
  component?: ComponentDocument;
  theme?: ThemeDocument;
  profile?: UserProfile;
  registries?: RegistryDocument[] | RegistryEntry[];
  storage?: StorageBackend;
  profileMatchThreshold?: number;
  confirmProfileApply?: (request: {
    matches: Array<{ path: string; value: unknown }>;
  }) => boolean | Promise<boolean>;
  registerWebMCP?: boolean;
  now?: () => Date;
}

export interface AssistProvider {
  attach(engine: IFormEngine): void;
  detach(): void;
  dispose(): void;
  loadReferences(refs: ReferencesDocument | ReferencesDocument[]): void;
  loadOntology(ontology: OntologyDocument | OntologyDocument[]): void;
  loadProfile(profile: UserProfile): void;
  getFieldHelp(path: string, audience?: 'human' | 'agent' | 'both'): FieldHelp;
  getProgress(): FormProgress;
  matchProfile(profileRef?: string): ProfileMatch[];
  invokeTool(name: string, input: Record<string, unknown>): Promise<ToolResult>;
  getTools(): ToolDeclaration[];
}

export interface SetValueResult {
  accepted: boolean;
  value: unknown;
  validation: ValidationResult[];
}

export interface ProfileApplyResult {
  filled: Array<{ path: string; value: unknown }>;
  skipped: Array<{ path: string; reason: string }>;
  validation?: ValidationReport;
}
