# Surface Shell — three review passes, full findings

**Date:** 2026-07-28
**Subject:** [`specs/surface/surface-shell-spec.md`](../../specs/surface/surface-shell-spec.md) and the packages it governs — `@formspec-org/surface`, `@formspec-org/surface-react`
**Status:** open. Every finding below is unremediated as of `formspec f171f86d`.

The spec carries a condensed version of these as Appendices C / C.1 / C.2 so a reader of the spec sees the open defects without a second lookup. This file is the long form: what each pass measured, and the reasoning behind each recommendation.

**Why three passes.** The implementation was built before its contract existed — a process inversion the stack's own rule forbids for a new named seam. The spec was written afterwards as the correction, then reviewed; the implementation was verified against it; and the theme fixes that landed alongside were verified separately. The passes disagree in useful places, and where they do, the disagreement is recorded rather than resolved by preference.

**One process note worth keeping.** The implementation verifier's verdict sat unread while its build report was treated as the result — the summary and the verdict were separate fields, and only the summary was opened. The blocker below shipped because of that. A build report is not a verdict.

---

## Pass 1 — Architecture review of the spec

**Verdict: RECONSIDER.** The decisions survive; four defects gate the version bump out of draft.

### BLOCKER — two MUSTs point opposite ways

The spec makes reading the platform token registry at render time a core conformance requirement (§4.2, §7.2's `THEME-TOKEN-UNKNOWN`, §8.2 item 24). [`token-registry-spec.md`](../../specs/theme/token-registry-spec.md) §5.2 states renderers MUST NOT depend on the registry at runtime — *"the registry exists for tooling only."* The spec never cites or rebuts that sentence.

A conformance suite for §8.2 item 24 and a conformance suite for token-registry §6 cannot both pass. The shell already ships the check.

**Preferred resolution:** move the check to the validator. Token-registry §5.3's `THEME-TOKEN-UNREGISTERED` already owns the same predicate at the same severity, and §1.2's own layering table already lists it in the validation-time row. Drop `THEME-TOKEN-UNKNOWN`. The alternative — amending §5.2 to carve out a shell that reports but does not resolve — costs the shell a declared registry dependency and must be written in the Theme tier's own spec, not here.

### CONCERN — the stronger contrary sentence is unrebutted

§4.3 identifies one statement pulling against its fail-closed decision and rebuts it. It misses the stronger one in the same paragraph of [`surface-spec.md`](../../specs/surface/surface-spec.md) §3: *"the two states have opposite theme postures … `operation` refuses tenant chrome theming, and an unclassified route refuses nothing."* Under §4.3 the two states have the **same** runtime posture. [`ui-graph-policy-spec.md`](../../specs/app-graph/ui-graph-policy-spec.md) §5.7's first composition consequence says the same thing, and §4.4 drops that consequence while claiming to mirror all three.

This matters beyond tidiness: the spec-lookup reference map every agent in this repo consults carries surface-spec's answer and not this one. An agent asked today what happens to an unclassified route's theming gets the reversed answer.

**Resolution:** quote the sentence verbatim in §4.3 and rebut it — the "because" clause scopes it to rule-firing, the headline does not survive — then file an amendment narrowing surface-spec §3 to authoring-time posture with a pointer here. **The decision itself is right and should not change.**

### CONCERN — the spec contradicts itself on transition controls

§5.3 says a binding MAY render a control for a `fireable` transition (one where the host supplied an executor). §8.3 prohibition 2 forbids synthesizing "a navigation control bound to a declared transition," with no exception. Same act, opposite modality. A conformance author implementing item 2 fails any binding implementing §5.3.

The shipped binding already draws exactly that control, in the ambiguous case.

**Resolution:** except a transition §5.3 resolves as `fireable` — the host's supply of an executor *is* the request. [`response-actions-spec.md`](../../specs/response-actions/response-actions-spec.md) §10 already blesses that shape ("MAY place or synthesize inert ActionButton nodes when explicitly configured with an `actionRef`") and is the citation §5.3 should carry.

### CONCERN — the proposed publication gate is too strict to ship

`E611` (`SURFACE-TRANSITION-UNFIREABLE`) is proposed at severity `error`. Two soundness gaps:

1. Authoring time cannot see a host-supplied executor, so the gate blocks publication of exactly the route shape §5.3 blesses as `fireable`. The does-not-fire list has no host-executor arm. The spec's own worked example is the artifact: `/certify` under a host that supplies a `submit` executor is fireable per §5.3 and unpublishable per §5.4.
2. The module-widget exclusion rests on "nothing in the substrate lets it declare a trigger." True of the Registry contribution vocabulary; false of `widgetShape.props`, where a module may declare an `actionRef`-shaped prop whose widget renders an ActionButton — which response-actions §10 permits. The honest claim is *"nothing lets it declare one in a form a validator can read"* — which describes a schema gap, and means the check will error on legitimately-wired widget routes.

**Resolution:** mint at `warning`, escalating to `error` when the Registry gains an action-declaration channel. Restate the module-widget row as the weaker, truer claim. Everything else about `E611` holds — the code is free, the band placement is right, and reachability-is-not-traversability is a real gap the existing route-graph check does not cover.

### Pre-1.0, not pre-commit

- **Two Theme-tier rules originate on a Rendering-ring spec.** Theme-spec says nothing about token emission target and carries no platform/tenant layering model, so §4.5's emission invariant and §4.2's layering rule are stated only here. The spec's own Appendix B diagnoses this precisely and then files no Theme amendment — breaking its own rule that a spec reports a needed amendment rather than absorbing it. Consequence: the non-shell Theme consumers, including the provider whose unscoped write is the motivating defect, are bound by nothing.
- **`level`'s meaning was reinterpreted without amending the schema.** [`surface.schema.json`](../../schemas/surface.schema.json) documents it as "OPTIONAL heading level (1-6)"; §3.4.1 redefines it as a rank within the route and forbids reading it absolutely. The reinterpretation is right — it is what stops a page shipping two top-level headings — but the schema is the structural source of truth and generated types, authoring, and lint all read the old meaning.
- **Four fail-closed branches have no diagnostic code.** Unrecognised slot type, unrecognised static-content kind, ambiguous route handle, unevaluable transition condition. A conforming shell must therefore either throw (violating the no-throw rule) or stay silent (violating the report-everything principle). Mint them or record why not — silence in the not-minted table is the one thing that table exists to prevent.
- **Registry-entry collisions get a tie-break the spec refuses to give route paths.** Colliding paths resolve to no route, on the ground that two shells would disagree about what a signed URL means. Colliding entry names resolve first-declaration-wins at `warning`. Two conforming shells render different widgets from one signed bundle — same ambiguity class, opposite posture, no stated reason.
- **The divergence register cannot self-certify completeness.** It claims to list *every* place the shipped packages contradict the document; pass 2 found three contract-level divergences it missed. Soften the claim.
- **Decay-rule drift.** The route-class partition is tabulated in §9.3 and §10 one line below asserting the shell never names those values in connection with theming; the lint-code list is written out twice though another file owns it; one citation points at a section that does not exist.

### Placement — settled

The move into the normative spec tree is **correct and stands.** Three grounds: the tree distinguishes maturity by version string, not directory (its sibling is itself a draft living there); a date-stamped filename cannot be a primary reference, and this is enforced mechanically — the lint registry gate requires a spec reference that starts with `specs/` and resolves, so `E611` is unmintable from a drafts folder; and schema-inexpressible behavioural semantics belong in the spec tree by the repo's own authoring contract. The review-discipline rule triggers on the *seam*, not the directory, and this review discharges it.

**But:** the document must be committed, and [`surface-spec.md`](../../specs/surface/surface-spec.md) §1 must carry a one-line pointer to its runtime companion. The precedent exists one directory over. Without it the spec is orphaned from the lookup surface that gives every agent the now-reversed answer.

---

## Pass 2 — Implementation verifier, against the spec

**Verdict: RECONSIDER.** The shell genuinely runs on shipped code and the gap ledger is honest — both confirmed by measurement. Two defects are not.

### BLOCKER — an inferred transition status that reports nothing

The binding treats `supplied-by-slot` as satisfied by **inference, never verification**, and it is the one status in §5.3 that renders no control, states no refusal, and emits no diagnostic.

The consequence is present in the bundle the spec's own worked example ships: the application → certificate edge is **dead, and the application is silent about it**. That is precisely the silent-failure shape the package's own first principle forbids, and it is the shape the whole surrounding effort exists to eliminate.

**Resolution:** verify the slot actually publishes a trigger source against §5.2's closed table; where it does not, report `TRANSITION-UNFIREABLE` rather than assuming.

### MAJOR — eight of the seventeen codes cannot reach a host

Route-level and href-level diagnostics are computed per route and discarded in the binding. `SLOT-BINDING-INCOMPLETE`, `STATIC-IMAGE-NO-ALT`, the embed-route and widget codes, per-slot missing-document, and every unfireable-transition report never arrive. `STATIC-IMAGE-NO-ALT` has no on-page rendering either, so it vanishes entirely.

This is the spec's own D4 confirmed at source, and it makes the reporting obligation unmeetable by the shipped binding.

### MINOR

- The embed-route branch reintroduces the authored-title loss the route-level path documents as fixed, and renders embedded slot titles at the host's heading level instead of the stepped-down child level.
- Package source and the spike ledger both assert the exemplar bundle "carries no Response Actions document at all" — false for the bundle they ship against, and false even before the manifest-slot fix landed.
- Three resolved ledger entries cite a landing site the same work deleted.
- Two ledger test counts are inflated, and per the stack's decay rule should not be counts in prose at all.

### NIT

A docblock pins a twin-walk test that does not exist; the spike's page head still credits a deleted component with setting the document title; one evidence screenshot is byte-identical to another, so it reads as a duplicate rather than as the distinct evidence it is.

### Three divergences the register missed

Each is a contract-level violation of a MUST in the spec:

1. **A throwing slot dispatch.** Core throws on an unrecognised slot type inside render with no error boundary shipped; the binding's switch returns nothing. One malformed slot takes the whole application down — in the package whose stated thesis is that it collects every absence and lets the host decide. Core and binding disagree at runtime on identical malformed input.
2. **A nav link that emits an unsubstituted marker.** An unsupplied path parameter leaves the marker intact and the accompanying diagnostic is dropped, so the link matches its own pattern and renders the route with the marker as the parameter value — the exact failure the spec was written against, with the binding's own docblock claiming the opposite.
3. **A submit result discarded before advancing.** The submit outcome is dropped, so a non-blocking action advances the route with an invalid validation report — violating the rule that a shell advances only after the host reports a successful terminal outcome and MUST NOT infer success from a click.

---

## Pass 3 — Theme-fix verifier

**Verdict: APPROVE_WITH_MINORS.** Both product bugs are genuinely closed, measured rather than asserted: the tenant accent paints on the focus ring and the submit control, and zero tenant properties survive an intake → proof navigation, including after repeat navigation.

### MAJOR — the shell's own chrome fails contrast in dark mode

Shell chrome paints its foreground with no dark arm and no dark-token fallback; measured **1.06:1** on the route heading against the dark shell panel — effectively invisible. The spec's accessibility section names the shell's chrome, so this is the shell's to fix, in both themes and across every shell-owned surface, not only the heading.

### MINOR

- The brand rules the fix added — a heading accent and a legend marker — **match zero elements in the running application.** A fix present in the stylesheet and absent on screen.
- The unregistered-token diagnostic is reported and gates nothing. Correct per token-registry §5.3, which forbids rejecting on registry grounds; the open question is ordering, which is Pass 1's blocker.
- The same token map is emitted onto three nested elements — shell route, provider scope, form container. Harmless today, and exactly the redundancy the spec's single-owner emission rule exists to prevent.

---

## The punch list, in dependency order

1. Resolve the token-registry conflict — move the check to the validator (Pass 1 blocker).
2. Verify `supplied-by-slot` instead of inferring it; report the unfireable transition (Pass 2 blocker).
3. Deliver per-route diagnostics to the host (Pass 2 major; the spec's D4).
4. Rebut the surface-spec sentence and file the amendment narrowing it (Pass 1).
5. Except `fireable` from the synthesis prohibition (Pass 1).
6. Mint `E611` at warning; restate the module-widget row (Pass 1).
7. Fix shell chrome contrast in both themes; make the brand rules match real elements (Pass 3).
8. Fix the three missed divergences: the throwing dispatch, the unsubstituted marker link, the discarded submit result (Pass 2).
9. File the Theme-tier and schema amendments; mint or decline the four missing codes; apply the refusal posture to entry-name collisions; soften the register's completeness claim (Pass 1, pre-1.0).
10. Commit the spec, backlink it from surface-spec §1, register it in the artifact pipeline and the lookup map (Pass 1) — partly done; the backlink is not.
