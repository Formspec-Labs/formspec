/**
 * @filedesc Bar 5 — THE MOAT BAR, measured in three independent parts.
 *
 * ADR 0159 §The technical move nobody else has: *"Regeneration with edit
 * preservation. Source anchors on every generated node. Three-way merge on
 * source change… This is the substrate's load-bearing wedge."* That claim has
 * never been demonstrated on any artifact, which is why ADR 0159's own promotion
 * condition 3 names it.
 *
 * This module does NOT implement a merge. Writing one here would make the bar
 * unfalsifiable: the claim under test is what the *substrate* does, and a
 * spike-local merge is not the substrate. Instead it measures three things a
 * reader can independently re-derive:
 *
 * - **5a** — what the substrate's own package exports actually contain.
 * - **5b** — what the shipped conformance corpus contains, and what executes it.
 * - **5c** — what a consumer of the substrate as it ships today actually
 *   receives when regeneration runs over a designer-edited artifact.
 *
 * Each part can independently falsify the pre-registered prediction that this
 * bar fails. If 5a finds a merge entry point, the prediction is wrong and this
 * module says so.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
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
  /** Every test the conformance suite collects under `-k regeneration`. */
  collectedTests: string[];
  /** The files those collected tests live in. */
  collectedTestFiles: string[];
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
    specStatus: `${draft} ${versionLine}`.trim(),
    schemaExists: existsSync(resolve(FORMSPEC_ROOT, 'schemas', 'regeneration-merge-report.schema.json')),
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
 * so only something that executes a merge has a reason to read it. Uses
 * `git grep` over the tracked tree so the answer is about the repo rather than
 * about one package's node_modules.
 */
function findFixtureConsumers(): {
  executesFixtures: string[];
  mentionsOnly: string[];
  collectedTests: string[];
  collectedTestFiles: string[];
} {
  const IS_TEST = /(^|\/)test_[^/]+\.py$|\.(test|spec)\.(ts|tsx|js|mjs)$/;
  const grep = (pattern: string): string[] => {
    try {
      return execFileSync('git', ['grep', '-l', '--', pattern], { cwd: FORMSPEC_ROOT, encoding: 'utf8' })
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.includes('tests/conformance/fixtures/regeneration-merge/'));
    } catch {
      return []; // git grep exits 1 on no match
    }
  };
  // A file that merely NAMES the corpus is not a consumer of it. The first pass
  // of this probe counted `tests/conformance/tools/comp_bundle_id_audit.py`,
  // whose only match is an EXCLUDED_TREES entry that skips the corpus — the
  // opposite of executing it. So the discriminator is: reads the merge OUTPUT
  // fixture AND is itself a test.
  const executes = new Set(grep('expected-merged').filter((f) => IS_TEST.test(f)));
  const mentions = new Set(
    [...grep('fixtures/regeneration-merge'), ...grep('expected-merged')].filter((f) => !executes.has(f)),
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
