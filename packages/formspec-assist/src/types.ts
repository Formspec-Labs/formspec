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

/**
 * A binding as Assist resolves it (Assist spec §5.3): the Ontology `ConceptBinding` merged with the Registry
 * concept entry its `concept` URI names — `definition` is that entry's `description`; `display`, `system`,
 * `code` fall back to the entry; `equivalents` are the union, the binding's winning on the same URI.
 */
export type ResolvedConcept = ConceptBinding & { definition?: string };

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

/**
 * A field the active profile can fill (Assist spec §6.1). The wire shape carries no value and no
 * provenance: values stay in-page until `profile.apply`, where the respondent sees them.
 * `concept` is present when the match came through concept identity (exact or equivalent), absent for
 * a `field-key` match.
 */
export interface ProfileMatch {
  path: string;
  concept?: string;
  confidence: number;
  relationship: 'exact' | 'close' | 'broader' | 'narrower' | 'related' | 'field-key';
}

export interface FieldHelp {
  path: string;
  label: string;
  references: Partial<Record<string, ReferenceEntry[]>>;
  /** On the wire, `definition` is cut at 1024 UTF-8 bytes with a trailing `…` (§5.1); in-page it is whole. */
  concept?: ResolvedConcept;
  equivalents?: ConceptEquivalent[];
  summary?: string;
  commonMistakes?: string[];
  /**
   * Present when the §5.2 byte cap cut anything: `omitted` counts whole entries dropped per reference
   * type (empty when only `content` / `excerpt` were stripped). Raise `maxBytes` or narrow `audience`.
   */
  truncated?: { omitted: Partial<Record<string, number>> };
}

/** `formspec.field.help` output controls (Assist spec §3.2, §5.1–5.2). */
export interface FieldHelpOptions {
  /** Include each entry's `content`; off by default because it is the largest, least trusted text relayed. */
  includeContent?: boolean;
  /** Cap on the serialized `references` object in UTF-8 bytes. Default 4096; anything below 512 is raised to 512. */
  maxBytes?: number;
}

export interface FormProgress extends EngineFormProgress {
  pages?: Array<{ id: string; title?: string; fieldCount: number; filledCount: number; complete: boolean }>;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Assist spec §4.2. `retryable`: the same call can succeed with corrected arguments; otherwise ask the human. */
export interface ToolError {
  code: string;
  message: string;
  path?: string;
  retryable: boolean;
}

/** Which catalog tools a WebMCP registration exposes (Assist spec §7.2 registration profile). */
export interface WebMCPRegistrationOptions {
  /** `'default'`: the non-overlapping set (+ `profile.*` when a profile is configured). `'all'`: every catalog tool. */
  tools?: 'default' | 'all';
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
  /**
   * Provider-side confirmation for `confirm: true`. `matches` is exactly what approval writes — every
   * path already decided (unknown, unmatched, readonly, non-relevant, respondent-written without a matching
   * `expected`) is skipped before the handler runs, in the caller's order. `signal` aborts when the caller
   * cancels — dismiss the dialog.
   */
  confirmProfileApply?: (request: {
    matches: Array<{ path: string; value: unknown }>;
    signal?: AbortSignal;
  }) => boolean | Promise<boolean>;
  /**
   * Register on `modelContext` (default: `document.modelContext`). `true` registers the `'default'` set;
   * an object picks the set (§7.2 registration profile); `false` skips; a no-op when no context exists.
   */
  registerWebMCP?: boolean | WebMCPRegistrationOptions;
  /** The WebMCP surface to register on. Hosts inject a polyfill or a fake here; the provider never installs one. */
  modelContext?: WebMCP.ModelContext;
  now?: () => Date;
}

export interface AssistProvider {
  /** Settles once WebMCP registration is acknowledged (immediately when not registering, or when detached first). Rejects only if the host refused a tool. */
  readonly ready: Promise<void>;
  attach(engine: IFormEngine): void;
  /** Unregister from WebMCP. Idempotent. */
  detach(): void;
  dispose(): void;
  loadReferences(refs: ReferencesDocument | ReferencesDocument[]): void;
  loadOntology(ontology: OntologyDocument | OntologyDocument[]): void;
  /** Make `profile` current and persist it. After a `'default'` WebMCP registration without a profile, this also registers the `profile.*` tools. */
  /** Resolves once any profile tools this adds to WebMCP are acknowledged (immediately when none are). */
  loadProfile(profile: UserProfile): Promise<void>;
  /** The full in-page help object; the `field.help` tool returns its minimized projection (§5.1). */
  getFieldHelp(path: string, audience?: 'human' | 'agent' | 'both'): FieldHelp;
  getProgress(): FormProgress;
  /** Wire-shaped matches for the active (or named) profile — no values; `profile.apply` resolves them in-page. */
  matchProfile(profileRef?: string): ProfileMatch[];
  /** Profile capability: a profile was given or loaded, or a storage backend was configured. Gates the `profile.*` tools in a `'default'` WebMCP registration. */
  hasProfile(): boolean;
  invokeTool(name: string, input: Record<string, unknown>, options?: InvokeToolOptions): Promise<ToolResult>;
  getTools(): ToolDeclaration[];
}

export interface SetValueResult {
  accepted: boolean;
  value: unknown;
  validation: ValidationResult[];
}

/** Assist spec §4.4. `filled` names paths only — the value is on the form, not in the tool result. */
export interface ProfileApplyResult {
  filled: Array<{ path: string }>;
  skipped: Array<{ path: string; reason: string }>;
  validation?: ValidationReport;
}
