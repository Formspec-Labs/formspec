# v12 UX/UI audit

Date: 2026-07-30

Target: the generic v12 Surface preview rendering the SaaS V1 bundle and the
independent control bundle.

## Dog-food acceptance rule

“Data-only” is the acceptance test, not an explanation for rough output. Every
product-specific field, feature, route, action, state, content choice, semantic
binding, and meaningful presentation choice must come from structured Formspec
artifacts. The host and renderer remain generic.

A valid bundle with no custom Theme must still produce a coherent, responsive,
accessible, and usable product through strong framework defaults. When this
exercise exposes a failure:

- correct the artifact when the model already supports the intended result;
- otherwise add the missing capability to the schema, generic
  renderer/runtime, linting, and regression fixtures;
- never rescue the demo with SaaS-specific JSX, route branches, copy, layout
  code, or CSS;
- confirm the fix still renders an unrelated control bundle without product
  knowledge.

## Final closure

All audit findings are addressed. The final preview is fully demoable as a
wireframing-framework proof: 15 SaaS routes and one unrelated community room
bundle render through the same unchanged host, with product behavior supplied
only by structured data.

The final Playwright pass covered all 15 routes at desktop and mobile widths
and every route under all five profiles. It found no overflow, duplicate visible
heading, unnamed control, untraced interactive element, authoring-language leak,
or browser warning/error. Additional checks passed at 320 and 768 px and at
200% CSS zoom.

Closure by finding:

- **Need traceability and fulfillment:** every rendered item carries a direct
  Need identity. `NeedRef.completion.shape` and the opt-in usable-outcome
  validator now reject actionable Needs represented only by prose. Response
  rows, exports, support, trust, downloads, navigation, and form submission are
  operable structured actions.
- **Authoring-model leakage:** Experience titles and Need rationale are hidden
  from customer DOM by default. Human References render as help; agent
  References and Ontology identifiers remain metadata. Duplicate visible
  titles have a built-in lint warning. Raw response identifiers are replaced
  by an authored `displayReference` in customer views.
- **Zero-Theme baseline and mobile shell:** shared defaults now provide
  responsive gutters, centered content, wide-screen navigation, a compact
  mobile menu, consistent typography and controls, 44 px targets, visible
  focus, and resilient action groups.
- **Data states:** `StructuredPanel` accepts authored loading, empty,
  unavailable, and error views with recovery actions. The preview scenario also
  supports thrown-loader error outcomes. Empty, unavailable, and error states
  remain distinct.
- **Tables and long content:** structured `responsiveMode` and row actions drive
  stacked mobile rows, readable labels, and record navigation. The
  `longContent` profile passes without horizontal overflow.
- **Contrast:** stronger field and switch defaults meet the intended non-text
  contrast floor. Theme lint code `W714` checks inferred renderer pairs and
  authored contrast pairs, including boundaries and focus indicators.
- **Billing and support context:** usage period, renewal, remaining allowance,
  support destinations, service status, and trust resources are structured,
  rendered, and operable.
- **Native semantic extensions:** two References and two Ontology Documents are
  bundled and resolved. Customer help uses the References path; Ontology
  supports semantic identity without exposing vocabulary identifiers. The
  default browser renderer admits only HTTPS and same-app relative Reference
  links; non-browser schemes remain plain text unless a host policy translates
  them.
- **Independent-control regression:** the unrelated community room bundle
  renders through the same compiled host. The artifact verifier now resolves
  every declared widget against the actual host module and fails a Registry
  delivery mismatch before browser review.

Final captures are under [`after/`](after/), including desktop, mobile,
loaded, empty, unavailable, error, public form, receipt, and independent
control views.

## Initial result (before fixes; retained as audit history)

The preview is demoable as a test of the data-driven wireframing framework. It
is not yet a convincing SaaS product prototype.

The strongest result is structural: the generic host renders fourteen SaaS
routes, three data states, a public form, and an unrelated control bundle
without product-specific UI code. Visible controls have labels and direct Need
identity. The main UX defect is that the product renders parts of the authoring
model—task labels, reasoning summaries, detail wrappers, and generic `LIVE`
markers. An end user should see none of that. Experience and Needs explain why
the product exists; they belong in the artifact graph, lint output, authoring
tools, and developer inspection—not in the customer interface.

This is also the boundary defined by the Formspec Experience specification:
Experience names abstract task intent, while Definition, Surface, Component,
and Theme own what the user sees. The current renderer crosses that boundary by
automatically turning Experience unit titles into visible headings.

## Scope and checks

Playwright covered all fourteen SaaS routes at 1440 px and 390 px, with
additional 768 px and 320 px checks. Representative loaded, empty,
unavailable, onboarding, billing, support, public-form, focus, and independent
control states were captured.

Verified:

- No route produced horizontal document overflow at 1440, 390, or the sampled
  320 px stress width.
- The browser console produced no warning or error during the final route pass.
- Every visible interactive element had an accessible name in the sampled
  routes.
- Every visible interactive element exposed a direct `data-need-ids` identity,
  either on the control or its field label.
- The workspace navigation exposes `aria-current="page"` on the active route.
- The public form follows the expected keyboard order: full name, email,
  response, consent switch, submit.
- The focused text field has a visible 2 px teal outline and a 4 px halo.
- Loaded, empty, and unavailable response states are visibly distinct.
- The public flow omits workspace navigation.

## Priority findings

### P1 — Need traceability does not yet prove Need fulfillment

The responses page claims response review and export, but response rows are
inert and `CSV`/`JSON` are static bullets. Its only actions open signatures and
support. The support page lists email support, a status page, a security
overview, and a subprocessor list, but none is an operable destination; its
only action returns to the dashboard.

This is the most important conceptual finding. `data-need-ids` proves where a
rendered item came from. It does not prove that the product lets a person
complete the Need. Static copy should not be allowed to close an actionable
Need such as review, export, reach support, or open a document.

Recommended framework change:

- Give actionable Needs an explicit completion shape: an action, submitted
  Definition, downloadable resource, navigable record, or observable result.
- Require each claimed capability to bind to one of those shapes.
- Make lint reject an actionable Need represented only by prose or decorative
  data.
- Keep the direct rendered-to-Need check that already works, and add the
  inverse Need-to-usable-outcome check.

### P1 — The authoring model leaks into the customer interface

Most workspace pages show the same concept four or five times: the page `h1`,
an "`… task`" region, a second page title, a summary, an "`… details`" region,
and a panel title. Generic `LIVE` copy and badges expose implementation status
without telling the user anything useful.

This makes traceability visible, but it does not make the product easier to
use. The dashboard mobile capture spends roughly the first half of the screen
on navigation and repeated scaffolding before the first useful action.

Recommended framework change:

- Stop automatically rendering Experience titles or descriptions. Keep their
  references and Need links attached to the route, slot, Component, or action
  as metadata.
- Render only explicitly authored Definition, Surface, Component, Theme,
  Reference, Data Source, and Response Action content in the customer product.
- Clean up the current artifact immediately by omitting optional duplicate
  titles and removing task/rationale copy from visible Surface slots.
- Preserve Need identity as DOM trace attributes and tooling data, not visible
  labels.
- If authors need to inspect reasoning, provide a separate authoring/debug
  surface outside the customer product.
- Add a lint warning when normalized page, task, section, and panel titles
  repeat in the default user presentation.

### P1 — The zero-configuration renderer needs a strong product baseline

The current result is not merely "unbranded." With no custom Theme, the app has
no shell gutters or readable content width, cards and tables run edge to edge,
navigation wraps as raw pills, controls use inconsistent 32/40/46 px heights,
and simple routes leave most of the viewport unused.

Playwright confirmed that `body`, `.fs-surface-app`, `.fs-surface-main`, and
`.fs-surface-route` all have zero padding and no maximum width; the app and main
surfaces also have transparent backgrounds.

Formspec already defines the right principle: the null-Theme path must produce
a usable form from renderer defaults. The same rule should apply to a complete
Surface app. A Theme is for intentional variation and brand, not for repairing
basic layout.

Required shared defaults:

- a responsive app shell with page gutters, safe-area padding, a centered
  content width, and an intentional wide-data escape;
- one coherent typography and spacing scale across route chrome, native
  Definition fields, and extension widgets;
- adaptive navigation that remains compact on small screens;
- consistent control heights, focus treatment, border contrast, disabled
  states, and primary/secondary/danger emphasis;
- standard loading, empty, unavailable, error, and success presentations;
- resilient tables, action groups, forms, cards, and long-content wrapping;
- good results at 320, 390, 768, and 1440 px without bundle-specific CSS.

The existing default Theme already supplies useful color, spacing, typography,
radius, and focus tokens. The generic Surface stylesheet needs to apply those
tokens to the whole app shell and provide layout defaults. Custom Theme and
Component data may override the baseline without being required to reach it.

### P1 — The mobile application shell is functional but not usable enough

Nine workspace links render as one row at 1440 px, two rows at 768 px, and
three rows at 390 px. Each link is 32 px high. The wrapped links push the main
content down and create a dense block with no grouping or product/workspace
context.

The current page is programmatically identified correctly. The problem is the
visual and spatial behavior.

Recommended framework change:

- Keep navigation items as structured data.
- Let the generic renderer choose an adaptive shell: full navigation at wide
  widths and a compact menu, drawer, or prioritized navigation pattern at
  narrow widths.
- Support structured groups and priorities so the renderer does not need
  product-specific route logic.
- Raise default mobile target height and strengthen the selected state.

### P1 — Empty and unavailable states are distinct but lead nowhere

The empty responses profile removes the table but leaves export-format bullets,
`Proof status — No responses`, and signature/support actions. It does not
explain how to collect the first response. The unavailable profile preserves
page context, which is good, but offers only a generic sentence with no retry,
affected-resource name, alternate path, or escalation action.

Recommended framework change:

- Define loading, empty, unavailable, and error views as structured data-source
  outcomes with a heading, explanation, applicable actions, and optional retry.
- Use the existing table `emptyMessage` immediately; the current response table
  leaves it unset.
- Let state predicates hide actions that cannot work without data.
- Lint empty states that retain export/proof actions without results.
- Lint unavailable states that have neither retry nor a recovery destination.
- Require every state-specific message and action to trace to a Need.

### P1 — Unfocused public-form controls are too faint

The sampled input border is approximately 1.7:1 against its background and the
off-switch track is approximately 2.1:1. These are below the 3:1 non-text
contrast target for meaningful control boundaries and states in
[WCAG 2.2 SC 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
The focused state is much stronger and should be retained.

Recommended framework change:

- Strengthen the default field border and off-state switch token.
- Enforce safe renderer defaults first, then add a Theme-token contrast lint so
  authored overrides cannot regress control boundaries, state indicators, or
  focus colors.

## P2 findings

### Layout lacks gutters and readable width limits

Cards and tables stretch to nearly the full 1440 px viewport, even when their
content occupies only a small area. At 390 px, public-form fields run from
`x=19` to the exact right edge at `x=390`; the 4 px focus halo is clipped on
that side. Headings and cards also sit directly against the viewport edge.

Add generic shell gutters, safe-area padding, border-box sizing, and a centered
maximum content width. Allow full-width data regions only when a structured
layout hint requests them.

### Action hierarchy is weak

The dashboard presents seven pill actions in a largely undifferentiated wrap.
At 390 px they form a ragged stack, and most action buttons are 40 px high.
Use structured action groups, priority, and responsive layout hints so the
generic renderer can produce a stable hierarchy and larger touch targets.

### Response and support content lacks affordance and context

Label export formats explicitly and render actual download actions when the
product supports exports. Make rows navigable when response review is claimed.
Render support and trust resources as links or actions grouped by purpose.

### Billing lacks decision context

The progress indicator and exact `420 / 1000` relationship work well. The page
still needs the usage period, reset date, remaining allowance, and a more
specific account state before a user can make a plan decision.

### Responsive tables need a declared fallback

The response and status tables fit at 390 px because the sample values are
short. Define structured column priority, wrapping, or stacked-row behavior for
long names, translations, and text zoom.

## What works

- The independent control bundle renders through the same host and visual
  system, which is strong evidence that the renderer remains generic.
- Route, state, and public/workspace separation are coherent.
- Labels, table headers, explicit text statuses, and keyboard order provide a
  solid accessibility base.
- The public form has generous input height, a clear primary action, and a
  strong focus treatment.
- Billing combines an exact value with a progress indicator.
- The unavailable state fails honestly instead of silently looking empty.
- Need identity survives into the rendered controls without requiring visible
  trace scaffolding.

## Use Formspec's native semantic extensions

The v12 bundle currently includes Definitions, Experience, Response Actions,
Registry, Surface, and Data Sources. It includes neither a References Document
nor an Ontology Document. That leaves useful native Formspec capabilities out
of the dogfood test.

The corrected separation is:

| Formspec layer | What it should do | What the end user sees |
| --- | --- | --- |
| Needs and Experience | Record product intent, rationale, and traceability | Nothing directly; their effect is a coherent product |
| Definition | Define fields, labels, validation, relevance, and submission data | The actual form |
| References | Bind human help, examples, policies, and documentation to a form or field, filtered by `audience` and priority | Contextual help, examples, and useful resource links on demand |
| Ontology and Registry concepts | Give fields stable semantic identity, vocabulary bindings, and cross-system equivalence | Better autofill, consistent labels, meaningful exports, and integration mapping—not concept URIs |
| Surface, Component, and Theme | Define page hierarchy, navigation, layout, component choice, and visual tokens | The product UI |
| Data Sources and Response Actions | Supply state and perform real operations | Loaded data, honest states, and working actions |

Concrete v12 changes:

- Add human-audience References sidecars for organization setup and public
  response. Use them for environment guidance, consent explanation, examples,
  support policy, and trust documents instead of exposing Experience rationale.
- Add Ontology sidecars for the Definition fields. The email field already has
  an inline `semanticType`; complete the semantic coverage for name,
  organization, environment, response content, and notice consent where
  authoritative concepts exist.
- Resolve References through the existing Formspec context-resolution
  capability and add a generic field/form help presentation to the renderer.
  Show concise inline help or a disclosure, filtered to `human` or `both`.
- Use Ontology identity to support semantic export, profile matching/autofill,
  and integration mappings. Ontology is metadata and should not change
  validation or expose raw ontology vocabulary in the default UI.
- Keep export and support operations in Response Actions. References can supply
  documentation and policies; they must not substitute for an operation.
- Keep layout and hierarchy in Surface/Component/Theme data. Do not encode UX
  layout in Experience prose and do not add SaaS-specific host code.

## Structured framework changes

| User-visible problem | Structured input needed | Generic renderer behavior | Lint or test gate |
| --- | --- | --- | --- |
| Visible task and reasoning text | Keep Experience/Need links as metadata; omit duplicate Surface copy | Never auto-render Experience metadata; render only explicitly authored product content | Assert that Experience title changes do not change customer-visible DOM |
| Wrapped nine-link mobile navigation | Navigation groups, priority, and optional pattern | Select a compact shell at narrow widths | Responsive route screenshots and minimum target checks |
| Dead-end data states | Per-outcome heading, body, actions, and retry policy | Render state-specific recovery without host branches | Reject unusable empty/unavailable states |
| Need is traced but not fulfilled | Actionable-Need completion shape | Render an action, resource, submitted Definition, or result | Require Need-to-usable-outcome coverage |
| Missing contextual help | Human/both References bound to `#` or item paths | Render concise, on-demand form and field help | Validate target paths, audience filtering, and broken resources |
| Weak semantic exports and integrations | Ontology bindings and Registry concepts | Use semantic identity in export/autofill/integration adapters | Require concept coverage where the product makes interoperability claims |
| Edge-to-edge content and clipped focus | No required author input; optional Theme layout overrides | Apply safe shell gutters, width, density, and focus space by default | 320/390/768/1440 visual and overflow checks |
| Fragile tables | Column priority and responsive fallback | Wrap, scroll with an affordance, or stack rows | Long-content and text-zoom fixtures |
| Weak control contrast | Semantic Theme tokens for boundaries and states | Use accessible defaults and preserve visible focus | Contrast lint for authored Theme tokens |

Prefer existing Formspec artifacts and stronger renderer defaults. Extend the
structured vocabulary only where meaningful product variation cannot already
be expressed. Do not add SaaS-specific JSX, route branches, or hand-authored
product CSS.

## Ownership and fix boundary

The source mapping separates quick artifact corrections from missing framework
features:

- **Repeated headings — renderer boundary plus artifact correction.** The route, slot,
  Experience unit, and `StructuredPanel` each author their own title in
  `spikes/surface-v12-saas-v1-dogfood/artifacts/saas-v1.bundle.json`
  (`1967–2043`). Slot and Experience titles are optional in
  `schemas/surface.schema.json` and `schemas/experience.schema.json`. The
  Experience specification says units describe intent, not what a renderer
  draws, but `packages/formspec-surface-react/src/SurfaceSlot.tsx` currently
  renders unit titles. Stop that automatic rendering, remove redundant
  customer-facing Surface copy, and add regression coverage.
- **Navigation, gutters, and target sizes — shared renderer.**
  `packages/formspec-surface-react/src/formspec-surface.css` renders one
  wrapping flex navigation list, has no shell gutter or content-width rule, and
  gives links and panel actions no minimum target height. The current navigation
  schema can order, label, scope, and hide links, but cannot express groups,
  breakpoint behavior, or an adaptive shell. These are default-renderer
  responsibilities; structured navigation data should only express meaningful
  product grouping and priority.
- **Visual baseline — existing tokens, incomplete application.**
  `packages/formspec-layout/src/default-theme.json` already defines the shared
  color, spacing, typography, radius, and focus vocabulary. The v12 manifest
  intentionally supplies no custom Theme, which is a valid null-Theme case.
  `packages/formspec-surface-react/src/formspec-surface.css` currently applies
  only a small part of that vocabulary to the app shell. Improve the generic
  defaults and keep custom Theme data optional.
- **Empty responses — existing data plus one missing condition feature.**
  `saas-v1.preview-scenario.json` correctly supplies an empty array. The table
  block in `saas-v1.bundle.json` omits its supported `emptyMessage`. Add that
  now. Hiding proof/export/actions when data is empty requires state-aware
  action presentation in the generic widget.
- **Unavailable responses — shared runtime feature.** The preview scenario
  carries a specific failure reason, but
  `packages/formspec-surface-react/src/SurfaceSlot.tsx` replaces the whole
  widget with one generic string and discards the reason. The current widget
  never mounts, so authored recovery copy and actions cannot appear.
- **Form focus clipping — shared shell CSS.**
  `packages/formspec-layout/src/styles/default.base.css` makes controls
  `width: 100%` and draws focus outward, while the Surface shell supplies no
  right gutter. Generic inline shell padding fixes this without product code.
- **Exports and support — structured actions first.** `CSV` and `JSON` are
  authored as passive list items. Existing Response Actions, Surface action
  bindings, and panel action presentation can make them operable. Add new
  schema only if downloads, external links, grouping, or state-dependent
  visibility need presentation that the current action model cannot express.

The artifact integrity gate also passed after the audit. Its stored reasoning
review reports all 256 SaaS semantic pointers traced with zero unresolved
pointers. Native form inputs intentionally carry trace identity on their field
root and label rather than on the input itself; this still gives each field a
direct semantic trace, but it should be made explicit if the policy literally
requires the attribute on every native control.

## Screenshot index

1. [Dashboard — desktop](01-dashboard-desktop.png)
2. [Responses loaded — desktop](02-responses-loaded-desktop.png)
3. [Responses empty — desktop](03-responses-empty-desktop.png)
4. [Responses unavailable — desktop](04-responses-unavailable-desktop.png)
5. [Organization setup — desktop](05-onboarding-desktop.png)
6. [Usage and billing — desktop](06-billing-desktop.png)
7. [Support, status, and trust — desktop](07-support-desktop.png)
8. [Dashboard — mobile](08-dashboard-mobile.png)
9. [Responses — mobile](09-responses-mobile.png)
10. [Public form — mobile](10-public-form-mobile.png)
11. [Public form keyboard focus — mobile](11-public-form-focus-mobile.png)
12. [Dashboard — tablet](12-dashboard-tablet.png)
13. [Independent control — desktop](13-control-desktop.png)
