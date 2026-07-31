/** @filedesc Shared tier metadata for Changesets filtering and placement lint. */
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const TIERS = ['kernel', 'foundation', 'integration', 'ai'];

export const TIER_PACKAGES = {
  kernel: ['@formspec-org/types'],
  foundation: [
    '@formspec-org/engine',
    '@formspec-org/outcome-verification',
    '@formspec-org/app-graph',
    '@formspec-org/layout',
    '@formspec-org/webcomponent',
    '@formspec-org/react',
    '@formspec-org/core',
    '@formspec-org/assist',
    '@formspec-org/surface',
    '@formspec-org/surface-react',
    '@formspec-org/surface-bundle-signing',
  ],
  integration: ['@formspec-org/adapters', '@formspec-org/studio-core'],
  ai: ['@formspec-org/mcp', '@formspec-org/chat'],
};

// Private packages that Changesets ignores entirely.
export const IGNORED_PACKAGES = new Set(['@formspec-org/studio']);

export const PACKAGE_TO_TIER = (() => {
  const map = new Map();
  for (const [tier, pkgs] of Object.entries(TIER_PACKAGES)) {
    for (const p of pkgs) map.set(p, tier);
  }
  return map;
})();

const TIER_SENTINEL = /<!--\s*tier:\s*([a-z]+)\s*-->/i;

/**
 * Extract the declared tier from a changeset file body. Returns the tier name
 * (lowercased) or `null` if no sentinel was found.
 */
export function extractTier(source) {
  const match = TIER_SENTINEL.exec(source);
  if (!match) return null;
  return match[1].toLowerCase();
}

/**
 * Parse `---`-delimited YAML-ish frontmatter to extract package names being
 * released. Intentionally minimal — we do not care about version types here,
 * just which packages the changeset targets.
 */
export function extractPackages(source) {
  const match = /\s*---([^]*?)\n\s*---/m.exec(source);
  if (!match) return [];
  const body = match[1];
  const names = [];
  for (const line of body.split('\n')) {
    const m = /^\s*["']?(@?[a-z0-9][a-z0-9._\-/]*)["']?\s*:/i.exec(line);
    if (m) names.push(m[1]);
  }
  return names;
}

/**
 * List every `*.md` changeset file under `.changeset/` (excluding README.md).
 */
export function listChangesetFiles(changesetDir) {
  const entries = readdirSync(changesetDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'README.md')
    .map((e) => join(changesetDir, e.name));
}

export function readChangeset(path) {
  return readFileSync(path, 'utf8');
}
