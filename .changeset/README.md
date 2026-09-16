# Changesets

Managed by `@changesets/cli`. Full docs at [changesets/changesets](https://github.com/changesets/changesets). Config in [config.json](./config.json).

Tier rationale and decision table: [ADR 0063](../../thoughts/adr/0063-release-trains-by-tier.md).

## npm releases (maintainers)

Pushes to `main` run [.github/workflows/publish.yml](../.github/workflows/publish.yml): one release train — with changesets pending it opens (or updates) the "Version Packages" PR; with none pending it runs `changeset publish`, which publishes every package whose version is not on npm yet, under `latest`. The tiers still shape the changesets (fixed groups in `config.json`, the `<!-- tier: … -->` sentinel every changeset carries, per-tier CHANGELOGs) but do not run as separate jobs: `changesets/action` names its head branch after its base, so per-tier jobs would share one head. Publishing uses **npm Trusted Publishing** (OIDC from GitHub Actions), not a long-lived `NPM_TOKEN`.

**Adding a new `@formspec-org/*` workspace package:** npm's trusted publishing cannot create a package, so the first version is published by hand (`npm publish --access public` from a logged-in machine); then open the package on [npmjs.com](https://www.npmjs.com/), **Settings → Trusted Publisher → GitHub Actions**, organization `Formspec-Labs`, repository `formspec`, workflow file **`publish.yml`**, with "Allow npm publish" on (the workflow runs `changeset publish`, not the staged flow). Without this the registry returns `E404` on publish. The workflow installs **npm ≥ 11.5.1** because Trusted Publishing requires that CLI version. Also add the package to `TIER_PACKAGES` in `scripts/changeset-tiers.mjs` so the filter and lint recognise it.

## Authoring a changeset (tier-aware)

Each `.changeset/*.md` file MUST declare its release tier. The tier controls which `publish.yml` job picks the changeset up and what dist-tag its packages publish under.

**Format.** After the standard Changesets frontmatter, the first line of the summary body must contain an HTML-comment sentinel:

```md
---
"@formspec-org/engine": minor
"@formspec-org/webcomponent": minor
---

<!-- tier: foundation -->

Describe the change here as usual. Downstream CHANGELOG entries drop the
sentinel automatically.
```

Valid tier values: `kernel`, `foundation`, `integration`, `ai`. The sentinel lives in the body (not in frontmatter) because Changesets' own parser rejects any frontmatter key that is not a `<package>: <bump-type>` pair.

**One tier per changeset.** A changeset may only bump packages from a single tier. Cross-tier changes — e.g. a shared-type update in `@formspec-org/types` that also tweaks `@formspec-org/engine` — MUST be authored as two separate changesets (one tagged `tier: kernel`, one tagged `tier: foundation`). The `check:changesets` script enforces this.

**Validation.** Run locally before pushing:

```bash
npm run check:changesets   # validates tier sentinel + single-tier packages
npm run changeset          # interactive author
```

`npm run docs:check` also invokes `check:changesets`, so CI catches missing or mis-declared tiers.

**Dry-run a release locally.** `npx changeset status` lists what would bump and to what; `npx changeset version` in a throwaway worktree shows the resulting versions and CHANGELOGs without touching your tree.

**Dist-tags.** Every package publishes under `latest`. ADR 0063's per-tier dist-tags (`kernel-latest`, `ai-latest`, …) are not in use: they needed a job per tier, which `changesets/action` cannot run (see the workflow's comment).

