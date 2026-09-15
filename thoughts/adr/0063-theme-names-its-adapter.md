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

One presentation fact had two owners, and each was wrong about half of it.

A Theme's `selectors`, `widgetConfig`, and `cssClass` are written against exactly
one design system — `usa-input` means nothing outside USWDS markup — but nothing
in the document said which. Hosts closed the gap by hand: the demo at
`~/NJUI/formspec-demo` listed `node_modules/...` URLs in the Theme's
`stylesheets` and copied the USWDS palette into `tokens`, restating in a document
what the adapter package already knew.

The adapter side failed in the mirror image. ADR 0047's `integrationCSS` carried
a CSS *string*, which cannot reference a font or an image; ADR 0048 therefore
chose system fonts and bundled none — correct for a JS-embedded string. Commit
`6681ff62c` moved that CSS to a linked subpath export, removing the constraint,
but left relative `../fonts/` and `../img/` paths: the shipped
`uswds-integration.css` referenced 18 fonts and 23 images the package never
shipped.

The visible cost: no host besides the examples loaded any adapter, so a USWDS
Theme could not be previewed in Studio, the Surface shell, or formspec-web.

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

### D-4. An adapter's stylesheet is layered; the renderer links only what the page lacks (amendment, 2026-09-15)

A page that already loads its design system — a government site with USWDS from
a CDN — must not receive it a second time, and D-3 must still hold: the host
imports nothing on the renderer's behalf. So an adapter declares `stylesheets`
as ordered layers, each with a presence probe:

```ts
stylesheets: [
  { href: uswdsBase,    presentWhen: { className: 'usa-sr-only', property: 'position', value: 'absolute' } },
  { href: uswdsFormspec, presentWhen: { className: 'formspec-container', property: '--formspec-uswds-rules', value: '1' } },
]
```

Before linking a layer the renderer appends a hidden probe element carrying the
class to the render root's tree, reads the computed property, and skips the
layer when the value matches. The USWDS adapter ships two layers: the design
system itself (components, typefaces, icons — self-contained, ~480 KB), probed
by a class every USWDS build defines; and Formspec's own USWDS rules (the render
root extends `usa-form`, USWDS's reset scoped to the render root, field rhythm
from `spacing.field`, help row, rich-text paragraphs, the modal host — a few
KB), probed by a marker only that sheet defines. A bare page gets both. A USWDS
page gets the second only. Every stylesheet the renderer links is a layer — the
structural sheet (`--formspec-layout`), the default skin
(`--formspec-default-skin`), Tailwind's sheet (`--formspec-tailwind-rules`) — so
one probe answers "does the page already have this CSS?" for all of them; a bare
URL string is not a valid entry.

A variant (ADR 0064) compiles its own base layer from the partial with its
settings and reuses the package's rules layer unchanged; its marker is the rules
layer's, so no per-adapter marker name is needed. The old per-adapter
`--formspec-adapter` marker is gone.

Reusing a host's design system means the host's version drives the adapter's
markup. That is the host's risk, the same one any component takes on a USWDS
site, and it is named in the adapter README. The same rule governs script: the
DatePicker mounts USWDS's own module, and when the page flags USWDS as present
(`window.uswdsPresent`) the adapter only enhances the markup and leaves the
page's delegated handlers to drive it.

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
