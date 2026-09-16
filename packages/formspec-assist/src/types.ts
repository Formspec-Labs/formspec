/** @filedesc Public type vocabulary for the formspec-assist package. */

import type {
  FormProgress as EngineFormProgress,
  IFormEngine,
  RegistryEntry,
} from '@formspec-org/engine';
import type {
  ComponentDocument,
  ConceptBinding,
  ConceptEquivalent,
  OntologyDocument,
  Reference,
  ReferencesDocument,
  RegistryDocument,
  ThemeDocument,
  ValidationReport,
  ValidationResult,
} from '@formspec-org/types';
import type { WebMCP } from 'webmcp-types';

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

/** The schema-generated Ontology types (Ontology spec): one shape here and in the document a page publishes. */
export type { ConceptBinding, ConceptEquivalent, OntologyDocument };

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

/** WebMCP `ToolAnnotations`: the hints a browser or agent uses to gate a call (Assist spec §7.2). */
export type ToolAnnotations = WebMCP.ToolAnnotations;

export interface ToolDeclaration {
  /** `formspec.{category}.{action}`; WebMCP-legal (1–128 chars of `[A-Za-z0-9_.-]`). */
  name: string;
  /** Human-readable label a browser shows in its consent UI. */
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: ToolAnnotations;
}

export interface InvokeToolOptions {
  /** Cancellation from the caller; WebMCP passes the agent's signal through `execute`. */
  signal?: AbortSignal;
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
  /** Register the catalog on `modelContext` (default: `document.modelContext`). Default `true`; a no-op when neither exists. */
  registerWebMCP?: boolean;
  /** The WebMCP surface to register on. Hosts inject a polyfill or a fake here; the provider never installs one. */
  modelContext?: WebMCP.ModelContext;
  now?: () => Date;
}

export interface AssistProvider {
  /** Settles once WebMCP registration is acknowledged (immediately when not registering). Rejects if the host refused a tool. */
  readonly ready: Promise<void>;
  attach(engine: IFormEngine): void;
  /** Unregister from WebMCP. Idempotent. */
  detach(): void;
  dispose(): void;
  loadReferences(refs: ReferencesDocument | ReferencesDocument[]): void;
  loadOntology(ontology: OntologyDocument | OntologyDocument[]): void;
  loadProfile(profile: UserProfile): void;
  getFieldHelp(path: string, audience?: 'human' | 'agent' | 'both'): FieldHelp;
  getProgress(): FormProgress;
  matchProfile(profileRef?: string): ProfileMatch[];
  invokeTool(name: string, input: Record<string, unknown>, options?: InvokeToolOptions): Promise<ToolResult>;
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
