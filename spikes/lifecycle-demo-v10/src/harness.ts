/**
 * @filedesc Spike v10 harness — output-root guard, real Ajv over the shipped
 * schema corpus, the one posture declaration all six stages share, and the
 * evidence recorder the walkthrough is generated from.
 *
 * Carried from v9 by import where the shape is identical (`realSchemaValidators`
 * is v9's E4 pattern verbatim); everything else is new because v10 measures a
 * different thing. v9 measured what a walled-off author could close on twelve
 * exemplars; v10 walks ONE exemplar through six lifecycle stages and measures
 * what the substrate carries between them.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv2020, { type AnySchemaObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AuthorActor, ProposalManagerFacadeOptions, SessionRef } from '@formspec-org/studio-core';
import type { WireframesContext } from '@formspec-org/mcp-wireframes';

export const SPIKE_ROOT = resolve(import.meta.dirname, '..');

/**
 * Output root. Defaults to the spike dir, so a deliberate re-measurement
 * rewrites the checked-in evidence — which is the point of a re-measurement.
 *
 * `V10_OUTPUT_ROOT` redirects it. **Use it for any run that is not a
 * re-measurement.** `evidence/lifecycle.json` and the generated walkthrough are
 * what the spike doc's Part 2 cites; a run that executes only to prove the
 * harness still compiles must not overwrite them, and a run that fails partway
 * must not leave a half-written evidence set behind that reads as a measurement.
 *
 * Same guard v9 carries as `V9_OUTPUT_ROOT`, same reason.
 */
const OUTPUT_ROOT = process.env.V10_OUTPUT_ROOT ? resolve(process.env.V10_OUTPUT_ROOT) : SPIKE_ROOT;
export const EVIDENCE_DIR = resolve(OUTPUT_ROOT, 'evidence');
export const WALKTHROUGH_PATH = resolve(OUTPUT_ROOT, 'lifecycle-walkthrough.html');
const SCHEMAS_DIR = resolve(SPIKE_ROOT, '..', '..', 'schemas');

// ─────────────────────────────────────────────────────────────────────────────
// Real Ajv over the shipped schema corpus (v9's E4 pattern — no stubs)
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_ID_BY_KIND: Record<string, string> = {
  appManifest: 'https://formspec.org/schemas/bundleManifest/2.3',
  definition: 'https://formspec.org/schemas/definition/1.0',
  surface: 'https://formspec.org/schemas/surface/0.1',
  registry: 'https://formspec.org/schemas/registry/v1.0/registry.json',
  theme: 'https://formspec.org/schemas/theme/1.0',
  dataSources: 'https://formspec.org/schemas/dataSources/1.0',
  responseActions: 'https://formspec.org/schemas/responseActions/1.0',
  experience: 'https://formspec.org/schemas/experience/1.0',
};

let ajvSingleton: Ajv2020 | undefined;

export function ajv(): Ajv2020 {
  if (ajvSingleton) return ajvSingleton;
  const instance = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
  addFormats(instance as never);
  for (const file of readdirSync(SCHEMAS_DIR).filter((name) => name.endsWith('.json'))) {
    const schema = JSON.parse(readFileSync(resolve(SCHEMAS_DIR, file), 'utf8')) as AnySchemaObject;
    if (typeof schema.$id !== 'string') continue;
    instance.addSchema(schema, schema.$id);
  }
  ajvSingleton = instance;
  return instance;
}

function compiled(schemaId: string): ValidateFunction | undefined {
  try {
    return ajv().getSchema(schemaId);
  } catch {
    return undefined;
  }
}

export interface SchemaCheck {
  ok: boolean;
  issues: Array<{ code: string; message: string; path?: string }>;
}

function outcomeFor(schemaId: string | undefined, document: unknown): SchemaCheck {
  if (!schemaId) return { ok: true, issues: [] };
  const validate = compiled(schemaId);
  if (!validate) {
    return { ok: false, issues: [{ code: 'V10-SCHEMA-UNAVAILABLE', message: `No compiled schema for ${schemaId}.` }] };
  }
  if (validate(document)) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: (validate.errors ?? []).map((error) => ({
      code: 'APP-GRAPH-SCHEMA',
      message: `${error.instancePath || '/'} ${error.message ?? 'failed'}`,
      path: error.instancePath,
    })),
  };
}

export function realSchemaValidators() {
  return (input: { artifactKind: string; schemaId?: string; document: unknown }) =>
    outcomeFor(input.schemaId ?? SCHEMA_ID_BY_KIND[input.artifactKind], input.document);
}

export function realEvidenceSchemaValidators() {
  return (input: { schemaId?: string; document: unknown }) => outcomeFor(input.schemaId, input.document);
}

/**
 * Validates a document against a `$defs` subschema of a published schema —
 * used for the `AuthoredSignature` record, which has no `$id` of its own
 * because it is a Response member, not a standalone artifact.
 */
export function checkAgainstDef(schemaId: string, defName: string, document: unknown): SchemaCheck {
  const root = ajv().getSchema(schemaId);
  if (!root) return { ok: false, issues: [{ code: 'V10-SCHEMA-UNAVAILABLE', message: `No compiled schema for ${schemaId}.` }] };
  const key = `${schemaId}#/$defs/${defName}`;
  const validate = ajv().getSchema(key);
  if (!validate) return { ok: false, issues: [{ code: 'V10-SCHEMA-UNAVAILABLE', message: `No compiled subschema ${key}.` }] };
  if (validate(document)) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: (validate.errors ?? []).map((e) => ({ code: 'AUTHORED-SIGNATURE-SCHEMA', message: `${e.instancePath || '/'} ${e.message ?? 'failed'}`, path: e.instancePath })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Actors and the one posture every stage shares
// ─────────────────────────────────────────────────────────────────────────────

export const AI_AGENT_URN = 'urn:formspec:actor:ai-agent:wireframes-mcp:lifecycle-v10';
export const HUMAN_URN = 'urn:formspec:actor:human:product-owner:lifecycle-v10';

/**
 * The deployment's declared write authority — ONE document, driving every stage.
 *
 * Three handles, all `human`-only. The demo's whole authorization claim is that
 * a single posture produces both the agent's refusals (stages 2 and 3) and the
 * human's successes (stages 3 and 4); two postures would prove nothing but that
 * two documents differ. Same shape as `demo-beats-adr-0152.test.ts`, which is
 * the acceptance scenario this exemplar extends.
 */
export const LIFECYCLE_POSTURE: ProposalManagerFacadeOptions['postureDeclaration'] = {
  extensions: {
    'x-formspec-actor-scope': {
      $actorScope: '1.0',
      protects: [
        { vocabulary: 'surface.routeClass', writableBy: { kinds: ['human'] } },
        { vocabulary: 'theme.declaration', writableBy: { kinds: ['human'] } },
        { vocabulary: 'theme.assignment', writableBy: { kinds: ['human'] } },
      ],
    },
  },
};

export function contextFor(kind: AuthorActor['kind'], sessionSuffix: string): WireframesContext {
  const author: AuthorActor = {
    id: kind === 'human' ? HUMAN_URN : AI_AGENT_URN,
    kind,
    actChannel: kind === 'human' ? 'human' : 'mcp',
  };
  const session: SessionRef = {
    id: `urn:formspec:session:lifecycle-v10:${sessionSuffix}`,
    openedAt: '2026-07-27T09:00:00Z',
    actors: [author.id],
  };
  return { authoredBy: author, session };
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence recorder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One recorded moment inside a stage. `refusal` beats and `write` beats share a
 * shape so the walkthrough can narrate them in one timeline: the story is that
 * the same posture produced both.
 */
export interface Beat {
  /** Ordinal within the whole walk — the walkthrough's timeline key. */
  seq: number;
  stage: StageName;
  actor: 'ai-agent' | 'human' | 'system';
  verb: string;
  /** What the actor was trying to do, in plain language. */
  intent: string;
  outcome: 'admitted' | 'refused' | 'recorded';
  /** The substrate's own words. Quoted verbatim — never paraphrased. */
  message?: string;
  details?: Record<string, unknown>;
}

export type StageName = 'idea' | 'plan' | 'needs' | 'build' | 'sign-off' | 'release' | 'feedback';

export interface StageRecord {
  stage: StageName;
  /** Plain-language narration for a non-engineer. No substrate vocabulary. */
  narration: string;
  /** What exists in the substrate once this stage finishes. */
  substrateState: Record<string, unknown>;
  beats: Beat[];
}

export interface BarResult {
  id: string;
  title: string;
  met: boolean;
  /** What the bar asked for, restated so the reader need not hold the doc. */
  criterion: string;
  /**
   * A material limit on a `met: true` verdict, carried in the headline rather
   * than in the evidence payload.
   *
   * Exists because a qualifier that only appears inside a collapsed `<details>`
   * is a qualifier the reader does not have. If the honest one-line reading of
   * a met bar is "met, but only over N of M", that clause belongs beside the
   * verdict — otherwise the board overclaims and the detail exonerates it.
   */
  qualifier?: string;
  evidence: Record<string, unknown>;
  /** Present when `met` is false — what actually happened instead. */
  finding?: string;
}

export class Evidence {
  private seq = 0;
  readonly stages: StageRecord[] = [];
  readonly bars: BarResult[] = [];
  private current: StageRecord | undefined;

  openStage(stage: StageName, narration: string): void {
    this.current = { stage, narration, substrateState: {}, beats: [] };
    this.stages.push(this.current);
  }

  closeStage(substrateState: Record<string, unknown>): void {
    if (!this.current) throw new Error('closeStage without openStage');
    this.current.substrateState = substrateState;
    this.current = undefined;
  }

  beat(b: Omit<Beat, 'seq' | 'stage'>): Beat {
    if (!this.current) throw new Error('beat outside a stage');
    const beat: Beat = { seq: ++this.seq, stage: this.current.stage, ...b };
    this.current.beats.push(beat);
    return beat;
  }

  bar(result: BarResult): void {
    this.bars.push(result);
  }

  write(extra: Record<string, unknown>): string {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const doc = {
      $spike: 'formspec-lifecycle-demo-v10',
      exemplar: extra.exemplar,
      generatedAt: '2026-07-27T09:00:00Z',
      stages: this.stages,
      bars: this.bars,
      ...extra,
    };
    const path = resolve(EVIDENCE_DIR, 'lifecycle.json');
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
    return path;
  }
}

/** Writes one stage artifact beside the rollup so each stage is readable alone. */
export function writeArtifact(name: string, document: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`);
  return path;
}

export function readArtifact<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(EVIDENCE_DIR, name), 'utf8')) as T;
}
