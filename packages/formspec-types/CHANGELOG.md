# @formspec-org/types

## 0.2.1

### Patch Changes

- <!-- tier: kernel -->

  A repeatable group can declare `seedFrom`. Generated `SeedFrom` types match the definition schema so authoring and the engine share one shape.

## 0.2.0

### Minor Changes

- 96f5f6d: <!-- tier: kernel -->

  Add generated types for the versioned Surface 0.2, Registry 1.1, App Manifest
  2.4, Locale 2.0, deterministic Definition Response sources, and Outcome
  Verification Case and Report document formats.

- aa22031: <!-- tier: kernel -->

  Regenerate the Locale and Theme types: the closed `$ui.<ChromeStringKey>` family now
  covers every word a renderer draws for itself, and a token registry entry can declare
  `adapterDefault` — a token each adapter resolves from its own design system while a
  Theme leaves it unset.

**Velocity tier:** 0 — Kernel
**Target cadence:** 6–12 months

All notable changes to this package will be documented in this file.

## [Unreleased]
