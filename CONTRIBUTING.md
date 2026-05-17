# Contributing to Formspec

Thanks for your interest in contributing to Formspec.

## License terms for contributions

Formspec is an open-core project with two licenses:

- **Apache-2.0** for runtime packages (engine, renderers, types, Rust crates, Python package, specs, schemas)
- **BSL 1.1** for authoring packages (studio, core, chat, MCP, assist, linter, changeset)

By submitting a pull request, you agree to license your contribution under the same license that applies to the file(s) you are modifying. See [LICENSING.md](LICENSING.md) for which packages use which license.

You also acknowledge that the maintainers may offer the project (including your contributions) under commercial license terms to third parties. If you are not comfortable with this, please do not submit a contribution.

## Getting started

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes following the conventions in [CLAUDE.md](CLAUDE.md)
4. Run the relevant test suites before submitting
5. Open a pull request with a clear description of what you changed and why

## Development workflow

We follow red-green-refactor. Every bugfix or feature starts with a failing test. See the "Development Workflow" section in [CLAUDE.md](CLAUDE.md) for details.

## Package dependency versions

In `packages/*/package.json`, use a caret range matching the sibling package’s declared version for `dependencies` and `devDependencies` on other `@formspec-org/*` packages (for example `^1.0.0` for `@formspec-org/engine`, `^0.1.0` for `@formspec-org/types`). npm workspaces symlink siblings when the range matches; Changesets bumps these on release. Do not use `"*"` — it claims compatibility with every past and future version.

Use explicit caret ranges in `peerDependencies` when the consuming app must supply the package outside the workspace (same pattern as `@formspec-org/adapters` peer on `@formspec-org/webcomponent`: `^1.0.0`). The `workspace:` protocol is for pnpm/Yarn; this repo uses npm workspaces and does not support `workspace:*` in manifests.

## Package versioning

Published packages do not share one semver line. Runtime packages (`@formspec-org/engine`, `@formspec-org/layout`, `@formspec-org/webcomponent`, `@formspec-org/types`) may sit at `1.x` while integration packages still stabilizing API (`@formspec-org/react` at `0.x`) catch up. Before a public release cut, coordinate a stack-wide bump so `peerDependencies`, changelog entries, and consumer docs stay aligned — especially `@formspec-org/layout` (already `1.0.0`) versus `@formspec-org/react` (`0.1.0` with `^1.0.0` peers on engine/layout). Do not bump one consumer-facing package in isolation without checking dependents.

## Commit convention

Use semantic prefixes: `feat:`, `fix:`, `build:`, `docs:`, `test:`, `refactor:`.

## Reporting issues

Open an issue on GitHub. Include steps to reproduce, expected behavior, and actual behavior. For spec questions, reference the relevant section from `specs/`.
