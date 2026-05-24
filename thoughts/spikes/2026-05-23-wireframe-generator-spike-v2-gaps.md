# Wireframe Generator Spike v2 — Missing Pieces And Edge Cases

**Status:** follow-up note  
**Related:** [`2026-05-23-wireframe-generator-spike-v2.md`](./2026-05-23-wireframe-generator-spike-v2.md), [`../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md`](../../../thoughts/adr/0150-formspec-as-layered-ui-substrate.md)

## Verdict

The v2 spike is a good architectural proof, but it proves the shape, not the operating model.

It shows that ADR 0150's layered substrate can generate real route Components from App Manifest, Registry, Surface, Experience, per-view Definitions, and per-Definition Response Actions. What it does not yet prove is that a whole app graph can be validated, executed, versioned, and kept coherent without hidden product assumptions.

## Missing Pieces

1. **App coherence validation**

   The spike validates individual artifacts, but not the whole app graph. A real validator needs to check route connectivity, slot refs, unit refs, Definition refs, action refs, module resolution, contribution payload schemas, and bundle-wide Component ID uniqueness.

2. **Official Surface schema**

   Surface is still spike-local. Until `x-formspec-surface` has a real schema, fixtures, lint rules, and conformance suite, this remains architecture evidence rather than production substrate.

3. **Multi-sidecar indexing**

   Current schemas still lean singular in places: Experience has one `targetDefinition`, and App Manifest has singular `experience` / `responseActions` fields. The app model needs first-class indexing for multiple Definitions and multiple action sidecars.

4. **Non-form Component identity**

   The `targetDefinition` shim is the biggest smell. Non-form route Components should be able to target a Surface route or app context without pretending to belong to a form Definition.

5. **Runtime state semantics**

   The spike does not define how route state, Response lifecycle, session state, transitions, URL params, draft persistence, and per-Definition submissions compose in a live app.

6. **Module admission and trust**

   ADR 0150's `modules[]` story implies version ranges, dependency resolution, lock hashes, allowed modules, conflict handling, and payload validation. The spike names modules but does not enforce the policy surface.

7. **Data-source model for non-form slots**

   Non-form data currently lives in Experience/widget fixture payloads. That is fine for wireframes. Production needs query bindings, instance data, host data, document resources, conversation streams, cache rules, and staleness behavior.

8. **Accessibility, responsive behavior, and Locale**

   The generated UI is useful as a low-fidelity proof, but it does not prove accessible route navigation, keyboard behavior, responsive Surface layouts, Locale addressing for module widgets, or Theme interaction.

9. **AI runtime behavior**

   `x-formspec-ai` is only a carry-point. Missing behavior includes prompt lineage, human approval, ledger events, regeneration/merge behavior, provider boundaries, and the line between Response data and ambient app state.

10. **Screener and deep-link behavior**

    ADR 0150 says Surface and Screener are orthogonal. The spike does not test terminal screener hops into `surface:<route-id>`, modal routes, nested routes, route guards, invalid params, or deep links into form slots.

## Edge Cases To Test Next

- A route has two `definition-form` slots. Which Definition owns submit/navigation?
- One Experience unit is reused across routes but points at different Definitions.
- Two Response Actions sidecars define the same action id.
- A module widget needs data from both a Definition Response and host state.
- A non-form app has zero Definitions; current Component schema still requires `targetDefinition`.
- Route transitions fire host events that should be durable, idempotent, or undoable.
- Module versions conflict across sibling artifacts.
- Generated Component IDs collide across routes.
- A Surface slot payload validates structurally but violates module semantics.
- A route is reachable only through a Screener terminal hop, not normal app navigation.
- A Surface route embeds another route that itself has a form slot.
- A Definition form slot is hidden by route policy while its Response is mid-draft.
- Locale strings for module widgets collide across modules or route instances.
- A Theme wants to style a module widget whose `widgetShape` did not declare token slots.

## Next Test

The next meaningful test is not whether v2 can render. It can.

The next test is whether Formspec can validate and execute a whole app graph:

```text
App Manifest
  -> module admission
  -> artifact resolution
  -> Surface route graph
  -> slot payload validation
  -> per-view Definition lifecycle
  -> per-Definition Response Actions
  -> generated Component bundle
  -> route/session/runtime behavior
```

If that graph can be validated and executed without product-specific assumptions, ADR 0150 is on solid ground. If not, Surface and module payloads are still too informal.
