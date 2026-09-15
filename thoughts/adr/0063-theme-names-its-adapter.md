# ADR 0063: The Theme Names Its Adapter

**Status:** Accepted
**Date:** 2026-09-14

## Supersedes

- [ADR 0047](../archive/adr/0047-css-architecture-split.md) — the
  `integrationCSS?: string` adapter property. Superseded for CSS delivery: an
  adapter declares `stylesheets: string[]` (absolute URLs) and the renderer
  links them; `integrationCSS` is removed.
- [ADR 0048](../archive/adr/0048-uswds-trimmed-sass-build.md) §"Font strategy"
  ("use system fonts… No font files are bundled"). Superseded: that constraint
  existed because the CSS was an embedded JS string, and it does not apply to a
  URL-linked file. The adapter ships a self-contained stylesheet carrying the
  real USWDS typefaces (subset) and icon images.
- [ADR 0048](../archive/adr/0048-uswds-trimmed-sass-build.md) §Decision, "Themes
  using the USWDS adapter no longer need a `stylesheets` entry for the USWDS
  CDN." Generalized into the rule: Theme `stylesheets` is the **additional**
  brand layer, never any design system's base CSS.

## Context

One presentation fact had two owners, and both were wrong about half of it.

A Theme's `selectors`, `widgetConfig`, and `cssClass` values are written against
exactly one design system — `usa-input` means nothing outside USWDS markup — but
nothing in the Theme document said which one. Hosts closed the gap by hand. The
demo at `~/NJUI/formspec-demo` had to list `node_modules/...` stylesheet URLs in
the Theme's `stylesheets` and copy the USWDS palette into `tokens`, restating
inside a document what the adapter package already knew.

The adapter side was incomplete in the mirror image. ADR 0047's `integrationCSS`
carried a CSS *string*, which cannot reference a font or an image; ADR 0048
therefore chose system fonts and bundled no font files, correctly, for a
JS-embedded string. Commit `6681ff62c` moved that CSS to a linked subpath export
— removing the string constraint — but left relative `../fonts/` and `../img/`
paths: the shipped `uswds-integration.css` referenced 18 fonts and 23 images the
package never shipped. This ADR closes that.

The visible cost: no host besides the examples loaded any adapter, so a USWDS
Theme could not be previewed in Studio, in the Surface shell, or in
formspec-web. The document described a design system that only one hand-wired
host could render.

## Decision

### D-1. The render adapter owns a design system completely

A `RenderAdapter` owns both halves of a design system: the markup functions for
every widget, and a **self-contained stylesheet** — one it declares on
`RenderAdapter.stylesheets: string[]` as absolute URLs (typically
`new URL('./x.css', import.meta.url).href`), with fonts and images inlined as
data URIs or served from the adapter's own package.

Self-contained is the load-bearing word. The stylesheet MUST style the entire
render root unaided: no inherited host `body` font or color, no host reset, no
separately delivered asset. A host that embeds the renderer imports no CSS at
all.

The renderer links these sheets, ref-counted, before any Theme `stylesheets`.

`RenderAdapter.integrationCSS` is retired. It could not carry fonts or images —
the defect this ADR exists to close — and no adapter used it.

The Formspec default skin is not a special case: it is simply the default
adapter's stylesheet.

### D-2. The Theme owns selection and configuration, and names its adapter

New OPTIONAL top-level string `adapter` on the Theme document: the registered
name of the render adapter the Theme's `selectors`, `widgetConfig`, and
`cssClass` values are written for (`"uswds"`, `"tailwind"`). Absent means the
renderer's default adapter.

A renderer MUST resolve the name in its adapter registry. An unregistered name
is `THEME-ADAPTER-MISSING` (severity `error`, naming the value); the renderer
MUST fall back to its default adapter and MUST NOT fail the render. The finding
is what distinguishes "USWDS class names on default markup" from USWDS.

Theme `stylesheets` is the **additional** layer — an agency's brand overrides,
loaded after the adapter's own CSS, never a design system's base CSS.

Theme `tokens` are read only by adapters that consume them. The default adapter
does. A compiled design system does not: USWDS bakes its palette in at adapter
build time, so a Theme for it SHOULD NOT restate that palette.

Normative text: [`specs/theme/theme-spec.md` §2.4 Adapter
Declaration](../../specs/theme/theme-spec.md); `stylesheets` as the additional
layer, §2.6. Schema: `schemas/theme.schema.json` → `#/properties/adapter`.
Adapter type: [`packages/formspec-webcomponent/src/adapters/types.ts`](../../packages/formspec-webcomponent/src/adapters/types.ts).

### D-3. The host owns nothing about the form's look

A host registers the adapter modules it bundles and sets Theme + Definition.
That is the whole of its presentation responsibility. It imports no renderer CSS
and no adapter CSS, and it does not restate a palette.

The consequence is the point of the ADR: Studio preview, the Surface shell, and
formspec-web each render a USWDS Theme as USWDS from the document alone.

## Consequences

### Positive

- One owner per presentation fact. The Theme selects and configures; the adapter
  supplies markup and CSS; the host supplies neither.
- A Theme is portable across hosts. Any host that registers the named adapter
  renders it identically.
- A design system's fonts and icons ship with the design system, so the shipped
  CSS no longer references files that do not exist.
- A mismatch is reported (`THEME-ADAPTER-MISSING`) instead of rendering as
  plausible-looking wrong output.

### Negative

- Adapter stylesheets grow: inlined fonts and images are bytes the CDN-linked
  CSS did not carry. They are cacheable, linked (not parsed as JS), and the
  alternative is a stylesheet that cannot render its own icons.
- Every renderer needs an adapter registry keyed by name, and a default.
- Themes authored before this field render under the default adapter until they
  declare one — the intended behavior, but design-system Themes must be
  revisited to gain it.

## Related ADRs

- [ADR 0046](../archive/adr/0046-headless-component-adapters.md): Headless
  Component Architecture with Render Adapters — the adapter seam this builds on.
- [ADR 0055](0055-single-ownership-per-concern-role-purity.md): Single Ownership
  Per Concern / Role Purity — the rule this applies to presentation.
- [ADR 0062](0062-fallback-transformation-is-a-render-time-projection.md):
  Fallback Transformation Is a Render-Time Projection — the adjacent render-time
  resolution step; adapter resolution precedes it.
