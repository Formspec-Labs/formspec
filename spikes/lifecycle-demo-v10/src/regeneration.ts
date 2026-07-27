/**
 * @filedesc Bar 5 — THE MOAT BAR, measured in three independent parts.
 *
 * ADR 0159 §The technical move nobody else has: *"Regeneration with edit
 * preservation. Source anchors on every generated node. Three-way merge on
 * source change… This is the substrate's load-bearing wedge."*
 *
 * 2026-07-26 — the first run of this module measured that claim as UNMET: no
 * merge entry point shipped, no test executed the conformance corpus, and both
 * designer edits were lost on rebuild. 2026-07-27 — the merge shipped
 * (`regenerationMerge` / `regenerationMergeSurface` in `@formspec-org/core`,
 * re-exported by `@formspec-org/studio-core`, reached through
 * `kernel.regenerateSurfaceDocument`), and the same three probes now measure it
 * as MET. The probes did not change shape; their answers did.
 *
 * This module still does NOT implement a merge. Writing one here would make the
 * bar unfalsifiable: the claim under test is what the *substrate* does, and a
 * spike-local merge is not the substrate. It measures three things a reader can
 * independently re-derive:
 *
 * - **5a** — what the substrate's own package exports actually contain.
 * - **5b** — what the shipped conformance corpus contains, what executes it,
 *   and — by running every scenario through the shipped entry point — whether
 *   the corpus actually passes.
 * - **5c** — what a consumer of the substrate as it ships today actually
 *   receives when regeneration runs over a designer-edited artifact.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { regenerationMerge, type MergeReport } from '@formspec-org/studio-core';
import { SPIKE_ROOT } from './harness.js';

const FORMSPEC_ROOT = resolve(SPIKE_ROOT, '..', '..');
const STACK_ROOT = resolve(FORMSPEC_ROOT, '..');

// ─────────────────────────────────────────────────────────────────────────────
// 5a — API-surface probe
// ─────────────────────────────────────────────────────────────────────────────

/** Names that would BE a merge entry point if any existed. */
const MERGE_ENTRY_POINT_PATTERN = /regenerat|three.?way|mergereport|mergedraft|sourceanchor/i;

/**
 * The merge spec's OWN identity vocabulary — §3 source-anchor identity, §4
 * generation markers, §9 anchor mapping.
 *
 * Scanned as a SECOND, wider pass because the entry-point pattern alone is a
 * name guess: a shipped merge could surface under a name it misses, and the
 * walkthrough's most prominent negative would then overstate what was actually
 * checked. Anything a real merge does has to touch this vocabulary, so a clean
 * sweep here is what licenses the claim.
 *
 * `merge` on its own is deliberately absent: `mergeBreakpointNamespace`
 * (`@formspec-org/types`, Theme breakpoints) shows the word is generic in this
 * corpus, and a pattern that fires on it would report a merge that is not one.
 */
const ANCHOR_IDENTITY_PATTERN = /anchor|x-?generation|generationmarker|designeredit|preservation/i;

export interface ApiProbeResult {
  /** Packages whose runtime export list was enumerated. */
  packagesProbed: string[];
  /** Total exported member names seen across them. */
  exportsSeen: number;
  /** The two name patterns scanned, so the reader can re-run the same sweep. */
  patternsScanned: { mergeEntryPoint: string; anchorIdentity: string };
  /** Every export whose name matches {@link MERGE_ENTRY_POINT_PATTERN}. */
  matches: Array<{ pkg: string; name: string; type: string }>;
  /**
   * Every export whose name matches {@link ANCHOR_IDENTITY_PATTERN}. These are
   * NOT merge entry points; they are the identity primitives the merge spec's
   * §3/§9 vocabulary names, shipped for other consumers.
   */
  anchorVocabulary: Array<{ pkg: string; name: string; type: string }>;
  /** True when nothing matched the entry-point pattern — the pre-registered prediction. */
  noMergeEntryPoint: boolean;
}

/**
 * Enumerates the RUNTIME export list of every substrate package this spike
 * depends on and reports anything merge-shaped. Runtime, not grep: a grep can
 * miss a re-export and a d.ts can promise what the JS does not ship.
 *
 * Two passes, reported separately. The entry-point pass answers "does a merge
 * ship?"; the anchor-identity pass answers "does any of the machinery a merge
 * needs ship?" — a question the first pass cannot reach, and one the negative
 * result has to survive before it can be stated as broadly as it is.
 */
export async function probeApiSurface(): Promise<ApiProbeResult> {
  const specs = [
    '@formspec-org/studio-core',
    '@formspec-org/mcp-wireframes',
    '@formspec-org/app-graph',
    '@formspec-org/engine',
    '@formspec-org/types',
  ];
  const matches: ApiProbeResult['matches'] = [];
  const anchorVocabulary: ApiProbeResult['anchorVocabulary'] = [];
  const packagesProbed: string[] = [];
  let exportsSeen = 0;
  for (const spec of specs) {
    const mod = (await import(spec)) as Record<string, unknown>;
    packagesProbed.push(spec);
    for (const name of Object.keys(mod)) {
      exportsSeen += 1;
      if (MERGE_ENTRY_POINT_PATTERN.test(name)) {
        matches.push({ pkg: spec, name, type: typeof mod[name] });
      }
      if (ANCHOR_IDENTITY_PATTERN.test(name)) {
        anchorVocabulary.push({ pkg: spec, name, type: typeof mod[name] });
      }
    }
  }
  return {
    packagesProbed,
    exportsSeen,
    patternsScanned: {
      mergeEntryPoint: String(MERGE_ENTRY_POINT_PATTERN),
      anchorIdentity: String(ANCHOR_IDENTITY_PATTERN),
    },
    matches,
    anchorVocabulary,
    noMergeEntryPoint: matches.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5b — fixture-corpus probe
// ─────────────────────────────────────────────────────────────────────────────

export interface FixtureProbeResult {
  fixtureDir: string;
  /** Scenario directories under the fixture root. */
  scenarios: number;
  /** Scenarios carrying the full three-way input triple plus expected outputs. */
  completeTriples: number;
  /** Scenarios whose `expected-merged.json` preserves a designer-only value. */
  assertingPreservation: number;
  /** Scenario names that assert preservation — quoted into the walkthrough. */
  preservationScenarios: string[];
  /** CODE that reads `expected-merged.json` — i.e. that executes a merge. */
  executesFixtures: string[];
  /** Files that name the corpus without running it (plans, lint exclusions, notes). */
  mentionsOnly: string[];
  /** Every test the Python conformance suite collects under `-k regeneration`. */
  collectedTests: string[];
  /** The files those collected tests live in. */
  collectedTestFiles: string[];
  /** Scenarios this spike replayed through the SHIPPED merge entry point. */
  executedHere: number;
  /** Of those, how many reproduced `expected-merged.json` byte-for-byte. */
  reproducedExpectedMerged: number;
  /**
   * Of those, how many reproduced `expected-report.json` on every field the
   * spec makes normative — array placement, entry order, `code`, `severity`,
   * `anchors`, `nodePath`, `propertyDeltas`, and the orphan reattachment flags.
   * `reason` is free-form review prose (§11.3 requires the field, §7 gives it
   * no wording), so it is checked for presence, not for text.
   */
  reproducedExpectedReport: number;
  /** Scenarios that did not reproduce, named so a failure is not a number. */
  failures: string[];
  specStatus: string;
  schemaExists: boolean;
}

/**
 * Counts what the shipped conformance corpus contains and what executes it.
 *
 * "Asserts preservation" is decided mechanically, not by reading names: a
 * scenario asserts preservation when a value present in `designer-edited.json`
 * but absent from `new-generated.json` is present in `expected-merged.json`.
 * That is the merge spec's own §5.4 preservation-only match, computed here over
 * the JSON rather than taken on faith from a directory name.
 */
export function probeFixtureCorpus(): FixtureProbeResult {
  const fixtureDir = resolve(FORMSPEC_ROOT, 'tests', 'conformance', 'fixtures', 'regeneration-merge');
  const scenarioDirs = existsSync(fixtureDir)
    ? readdirSync(fixtureDir).filter((n) => !n.startsWith('_') && statSync(resolve(fixtureDir, n)).isDirectory())
    : [];

  let completeTriples = 0;
  const preservationScenarios: string[] = [];
  for (const name of scenarioDirs) {
    const dir = resolve(fixtureDir, name);
    const has = (f: string) => existsSync(resolve(dir, f));
    if (has('old-generated.json') && has('designer-edited.json') && has('new-generated.json') && has('expected-merged.json')) {
      completeTriples += 1;
      const designer = readFileSync(resolve(dir, 'designer-edited.json'), 'utf8');
      const regenerated = readFileSync(resolve(dir, 'new-generated.json'), 'utf8');
      const merged = readFileSync(resolve(dir, 'expected-merged.json'), 'utf8');
      if (preservesDesignerOnlyValue(designer, regenerated, merged)) preservationScenarios.push(name);
    }
  }

  const specPath = resolve(FORMSPEC_ROOT, 'specs', 'component', 'regeneration-merge-spec.md');
  const specHead = existsSync(specPath) ? readFileSync(specPath, 'utf8').slice(0, 2000) : '';
  const versionLine = /^version:\s*(.+)$/m.exec(specHead)?.[1] ?? '(no version)';
  const draft = /\*\*Draft\*\*/.test(specHead) ? 'Draft' : 'unknown';

  return {
    fixtureDir: fixtureDir.replace(`${STACK_ROOT}/`, ''),
    scenarios: scenarioDirs.length,
    completeTriples,
    assertingPreservation: preservationScenarios.length,
    preservationScenarios: preservationScenarios.sort(),
    ...findFixtureConsumers(),
    ...replayCorpus(fixtureDir, scenarioDirs),
    specStatus: `${draft} ${versionLine}`.trim(),
    schemaExists: existsSync(resolve(FORMSPEC_ROOT, 'schemas', 'regeneration-merge-report.schema.json')),
  };
}

/**
 * Replays every scenario through the SHIPPED merge entry point and compares
 * against the corpus's own expected outputs.
 *
 * This is the part 5b could not do while no merge shipped. It is not a second
 * conformance suite — `formspec/packages/formspec-core/tests/regeneration-merge-conformance.test.ts`
 * is that — it is the same corpus driven from OUTSIDE the package that
 * implements it, through the public export, so the walkthrough's number is not
 * the implementation grading its own homework.
 */
function replayCorpus(
  fixtureDir: string,
  scenarioDirs: string[],
): Pick<FixtureProbeResult, 'executedHere' | 'reproducedExpectedMerged' | 'reproducedExpectedReport' | 'failures'> {
  let executedHere = 0;
  let reproducedExpectedMerged = 0;
  let reproducedExpectedReport = 0;
  const failures: string[] = [];

  for (const name of scenarioDirs.sort()) {
    const dir = resolve(fixtureDir, name);
    const read = (file: string): unknown => JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
    const contextPath = resolve(dir, 'context.json');
    const { merged, report } = regenerationMerge(
      {
        oldGenerated: read('old-generated.json') as never,
        designerEdited: read('designer-edited.json') as never,
        newGenerated: read('new-generated.json') as never,
      },
      existsSync(contextPath) ? { anchorMappings: read('context.json') as never } : {},
    );
    executedHere += 1;
    const mergedOk = JSON.stringify(sortKeys(merged)) === JSON.stringify(sortKeys(read('expected-merged.json')));
    const reportOk =
      JSON.stringify(reportWithoutProse(report))
      === JSON.stringify(reportWithoutProse(read('expected-report.json') as MergeReport));
    if (mergedOk) reproducedExpectedMerged += 1;
    if (reportOk) reproducedExpectedReport += 1;
    if (!mergedOk || !reportOk) {
      failures.push(`${name}${mergedOk ? '' : ' (merged)'}${reportOk ? '' : ' (report)'}`);
    }
  }
  return { executedHere, reproducedExpectedMerged, reproducedExpectedReport, failures };
}

/** Key-order-insensitive JSON view, so member order is not a false failure. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1));
  return Object.fromEntries(entries.map(([k, v]) => [k, sortKeys(v)]));
}

/** Every normative report field, with the free-form `reason` dropped. */
function reportWithoutProse(report: MergeReport): unknown {
  const strip = (entries: ReadonlyArray<{ reason: string }>): unknown[] =>
    entries.map(({ reason: _reason, ...rest }) => sortKeys(rest));
  return {
    version: report.version,
    surviving: strip(report.surviving),
    regenerated: strip(report.regenerated),
    orphaned: strip(report.orphaned),
    pendingReview: strip(report.pendingReview),
    conflicts: strip(report.conflicts),
  };
}

/**
 * A designer-only string value survives the merge: present in `designer-edited`,
 * absent from `new-generated`, present in `expected-merged`. String-level rather
 * than tree-level on purpose — the question is only whether the corpus asserts
 * survival at all, and a tree walk would need the merge semantics under test.
 */
function preservesDesignerOnlyValue(designer: string, regenerated: string, merged: string): boolean {
  const values = (text: string): Set<string> => {
    const found = new Set<string>();
    const walk = (v: unknown): void => {
      if (typeof v === 'string') { if (v.length > 3) found.add(v); return; }
      if (Array.isArray(v)) { for (const x of v) walk(x); return; }
      if (v !== null && typeof v === 'object') { for (const x of Object.values(v)) walk(x); }
    };
    walk(JSON.parse(text));
    return found;
  };
  const d = values(designer);
  const r = values(regenerated);
  const m = values(merged);
  for (const value of d) {
    if (!r.has(value) && m.has(value)) return true;
  }
  return false;
}

/**
 * CODE that reads the fixture corpus as test input, split from prose that
 * merely mentions it.
 *
 * The distinction is the whole point of 5b: a plan, a migration note and a lint
 * exclusion list all name the fixture directory, and none of them runs a merge.
 * `expected-merged.json` is the discriminator — it is the merge OUTPUT fixture,
 * so only something that executes a merge has a reason to read it.
 *
 * Walks the working tree rather than `git grep`. The question is what code is
 * present and runs, and staging state is not part of that question — a merge
 * runner that exists and passes is a consumer of the corpus whether or not it
 * has been committed yet. Build output, dependencies and virtualenvs are
 * skipped so the answer is about the repo rather than about one package's
 * `node_modules`.
 */
function findFixtureConsumers(): {
  executesFixtures: string[];
  mentionsOnly: string[];
  collectedTests: string[];
  collectedTestFiles: string[];
} {
  const IS_TEST = /(^|\/)test_[^/]+\.py$|\.(test|spec)\.(ts|tsx|js|mjs)$/;
  const SKIP_DIR = /^(node_modules|dist|target|\.git|\.venv|\.claude|coverage|wasm-pkg.*|build)$/;
  const SEARCHABLE = /\.(ts|tsx|js|mjs|cjs|py|rs|md|json|html)$/;

  const scan = (): Array<{ path: string; text: string }> => {
    const out: Array<{ path: string; text: string }> = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (!SKIP_DIR.test(entry.name)) walk(full);
          continue;
        }
        if (!SEARCHABLE.test(entry.name)) continue;
        const rel = relative(FORMSPEC_ROOT, full);
        if (rel.includes('tests/conformance/fixtures/regeneration-merge/')) continue;
        try {
          out.push({ path: rel, text: readFileSync(full, 'utf8') });
        } catch {
          // unreadable file — not a consumer
        }
      }
    };
    walk(FORMSPEC_ROOT);
    return out;
  };
  const files = scan();
  const matching = (pattern: string): string[] =>
    files.filter((f) => f.text.includes(pattern)).map((f) => f.path);

  // A file that merely NAMES the corpus is not a consumer of it. The first pass
  // of this probe counted `tests/conformance/tools/comp_bundle_id_audit.py`,
  // whose only match is an EXCLUDED_TREES entry that skips the corpus — the
  // opposite of executing it. So the discriminator is: reads the merge OUTPUT
  // fixture AND is itself a test.
  const executes = new Set(matching('expected-merged').filter((f) => IS_TEST.test(f)));
  const mentions = new Set(
    [...matching('fixtures/regeneration-merge'), ...matching('expected-merged')].filter((f) => !executes.has(f)),
  );

  // The decisive fact, taken from the test runner rather than from grep: what
  // does the conformance suite actually collect under this name?
  let collectedTests: string[] = [];
  try {
    collectedTests = execFileSync(
      resolve(FORMSPEC_ROOT, '.venv', 'bin', 'python'),
      ['-m', 'pytest', 'tests/', '--collect-only', '-q', '-k', 'regeneration'],
      { cwd: FORMSPEC_ROOT, encoding: 'utf8' },
    )
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.includes('::'));
  } catch {
    collectedTests = ['(pytest collection unavailable in this environment)'];
  }
  const collectedTestFiles = [...new Set(collectedTests.map((t) => t.split('::')[0]!))].sort();

  return {
    executesFixtures: [...executes].sort(),
    mentionsOnly: [...mentions].sort(),
    collectedTests,
    collectedTestFiles,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5c — live measurement
// ─────────────────────────────────────────────────────────────────────────────

export interface EditProbe {
  id: string;
  /** Plain-language description of what the designer did. */
  what: string;
  /** `regeneration-merge-spec.md` §5.3 delta class. */
  deltaClass: 'designer-inserted' | 'designer-modified';
  presentInOldGenerated: boolean;
  presentInDesignerEdited: boolean;
  presentInNewGenerated: boolean;
  presentInMerged: boolean | null;
  survived: boolean;
}

export interface LiveMergeResult {
  /** The three-way inputs the merge spec §2.2 names. */
  inputs: { oldGenerated: string; designerEdited: string; newGenerated: string };
  /** What the merge produced, or why nothing did. */
  mergeAttempt: {
    attempted: boolean;
    entryPoint: string | null;
    outcome: string;
  };
  /** What a consumer receives today, per edit. */
  edits: EditProbe[];
  survivingEdits: number;
  totalEdits: number;
}

/** The shipped merge, reached through the kernel op the regeneration path owns. */
export interface SubstrateMergeResult {
  /** The kernel op that ran, quoted into the walkthrough. */
  entryPoint: string;
  merged: unknown;
  report: MergeReport;
  /** Non-`info` findings — what a review surface would put in front of a human. */
  reviewQueue: Array<{ code: string; severity: string; nodePath: string }>;
}

/** The kernel surface this spike drives. Structural, so no MCP type is imported. */
interface RegenerationCapableKernel {
  regenerateSurfaceDocument(input: {
    surfaceId: string;
    oldGenerated: unknown;
    designerEdited: unknown;
  }): Promise<
    | { ok: true; value: { merged: unknown; report: MergeReport; reviewQueue: Array<{ code: string; severity: string; nodePath: string }> } }
    | { ok: false; error: { code: string; message: string } }
  >;
}

/**
 * Runs the merge THROUGH THE SUBSTRATE — `kernel.regenerateSurfaceDocument`,
 * the op the regeneration path owns. The session's own re-authored Surface is
 * `new_generated`; the host hands back the retained baseline and the designer's
 * version (merge spec §2.2).
 *
 * There is no merge logic in this file. If the kernel op disappears, this throws
 * and bar 5 fails — which is the property that makes the bar worth reporting.
 */
export async function mergeThroughSubstrate(
  kernel: RegenerationCapableKernel,
  input: { surfaceId: string; oldGenerated: unknown; designerEdited: unknown },
): Promise<SubstrateMergeResult> {
  const result = await kernel.regenerateSurfaceDocument(input);
  if (!result.ok) {
    throw new Error(`kernel.regenerateSurfaceDocument refused: ${result.error.code} — ${result.error.message}`);
  }
  return {
    entryPoint: 'kernel.regenerateSurfaceDocument',
    merged: result.value.merged,
    report: result.value.report,
    reviewQueue: result.value.reviewQueue,
  };
}

/** Does this exact slot exist on this route of this Surface document? */
export function slotPresent(surface: unknown, routeId: string, slotId: string): boolean {
  return findSlot(surface, routeId, slotId) !== undefined;
}

/** The slot's `title`, or undefined when the slot is absent. */
export function slotTitle(surface: unknown, routeId: string, slotId: string): string | undefined {
  const slot = findSlot(surface, routeId, slotId);
  return slot === undefined ? undefined : (slot as { title?: string }).title;
}

function findSlot(surface: unknown, routeId: string, slotId: string): unknown {
  if (surface === null || typeof surface !== 'object') return undefined;
  const routes = (surface as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) return undefined;
  const route = routes.find((r) => (r as { id?: unknown }).id === routeId) as { slots?: unknown } | undefined;
  if (!route || !Array.isArray(route.slots)) return undefined;
  return route.slots.find((s) => (s as { id?: unknown }).id === slotId);
}
