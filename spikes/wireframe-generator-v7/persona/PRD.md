# Customer Brief: Policy Studio UI — v7 persona input

**You are:** a product manager at Policy Studio, briefing an AI authoring agent (Wireframes-MCP) to scaffold the first usable version of Policy Studio's web UI.

**You have read:** [`VISION.md`](../../../../policy-studio/VISION.md), [`CONCEPT-MODEL.md`](../../../../policy-studio/CONCEPT-MODEL.md), [`STUDIO-FEATURE-MATRIX.md`](../../../../policy-studio/STUDIO-FEATURE-MATRIX.md).

**You have NOT read:** any Formspec internals. You don't know what an "App Manifest", "Surface", "Component", "Data Source", or "UI Graph Policy" means until the MCP tells you. You will discover those terms by trying to express what Policy Studio needs.

**You are scoped to three surfaces** of Policy Studio (not the whole tool):

1. **Source Vault Browser**
2. **Lint Findings**
3. **Scenario Result Viewer**

If a primitive you need isn't expressible, write down what you tried and what the MCP refused. Findings are the deliverable; a perfect app is not.

---

## What Policy Studio is (in your words)

Policy Studio takes federal regulations, state agency manuals, and policy memos and turns them into reviewable, source-backed, workflow-aligned specifications. Non-technical users — policy analysts, program managers, compliance reviewers — work in operational language (notices, deadlines, appeals, evidence requirements), not in workflow-engine internals.

The product flow:

```
Upload sources → AI extracts policy objects → Humans review/approve →
Map to workflow concepts → Generate workflow draft → Validate (6 readiness tiers) →
Simulate scenarios → Review & approve → Publish package.
```

The user types you're authoring for:

- **Program / operations managers** — model and review workflows, no code.
- **Policy / legal / compliance staff** — verify against authoritative sources.
- **Service designers** — translate operations into structured workflows.
- **Technical implementers** — inspect generated WOS artifacts.

---

## Surface 1: Source Vault Browser

### What this surface does

The user can browse uploaded policy / regulation / memo documents, see which ones are current vs. superseded, drill into a source to see its parsed sections, and trace which extracted policy objects came from which source excerpts.

### Layout you have in mind

- **Left:** a file-tree-style list of uploaded sources, grouped by program / jurisdiction. Each node shows source title + authority class (federal regulation / state manual / agency memo / SME note) + version state (current / superseded / preliminary / disputed).
- **Right (main):** when a source is selected, show its metadata (effective dates, supersession lineage, authority rank, canonical URL ref) and a viewer for its parsed sections (paragraphs, tables, list items, form fields), each with an anchor like `§3.2.1` or `page=4,para=2`.
- **Bottom right (drawer):** when a section is selected, show the list of extracted policy objects anchored to that section (with confidence scores).

### What the user does here

- Click a source in the tree to load its detail.
- Click a section to see its extracted objects.
- Filter the tree by program or jurisdiction.
- See at a glance which sources are superseded (greyed out, with a pointer to the replacement).

### Why this is hard

Tree views. Multi-column layouts with selection-driven detail. List-with-drawer patterns. None of this is "fill in a form".

---

## Surface 2: Lint Findings

### What this surface does

Show the user every readiness finding produced by the validation engine (124 rules across S1 source / S2 policy-object / S3 mapping / S4 workflow / S5 scenario / S6 publication tiers). Each finding has a severity (info / warn / error / block) and may be waived with rationale + authority check.

### Layout you have in mind

- **Top filter bar:** filter by tier (S1–S6), severity, status (open / acknowledged / resolved / waived).
- **Main:** a list of findings, each row showing rule id, severity badge, plain-language message, subject (which policy object / mapping / workflow element it points at), and lifecycle state.
- **Right drawer:** when a finding is selected, show the full message, suggested fix, the subject's source-citation chain, and a waive button (which opens a waiver-rationale form). The waive button only appears if the current user has an AuthorityGrant covering that rule and severity.

### What the user does here

- Filter to see only S6 publication blockers.
- Select a finding; read its message + suggested fix.
- Waive the finding (if authorized) by filling in the waiver-rationale form.
- See acknowledgment that the waiver was recorded against the user's identity.

### Why this is hard

Filtered lists. Conditional action visibility (the waive button depends on a separate authority-grant artifact). The waiver form is the only intake-shaped piece on this surface — everything else is display.

---

## Surface 3: Scenario Result Viewer

### What this surface does

Show the user the result of running a Scenario (concrete test case) against a Workflow Intent. Scenarios have an expected path, expected outcomes, and an actual trace from the simulation runtime. The user needs to see expected-vs-actual side-by-side and understand why a divergence happened.

### Layout you have in mind

- **Top:** scenario metadata — name, scenario type (happy-path / deadline-missed / adverse-determination / appeal-filed / etc.), linked policy objects.
- **Main split (two columns):** left column = expected (workflow path, decisions, deadlines, notices, appeals); right column = actual (the simulated trace). Highlight divergences inline.
- **Bottom panel:** plain-language explanation of why the actual diverged from expected (cites the policy objects involved).

### What the user does here

- Open a scenario from a list (separate surface, out of scope for v7).
- Inspect expected vs. actual.
- See which policy objects drove the divergent decision.
- Re-run the scenario (call a Response Action that the runtime executes).

### Why this is hard

Two-column data display where both columns are tree-shaped (workflow paths). Inline divergence highlighting. A non-form action (re-run) bound to a runtime operation.

---

## What you can ask the MCP to do

The MCP exposes verbs like:

- `wireframeFromBrief` — start a new app with a Surface URL.
- `addRoute` — add a route to the Surface.
- `bindSlot` — bind a slot on a route (slot types: `definition-form`, `experience-unit`, `module-widget`, `static-content`, `embed-route`).
- `declareModule` — declare a substrate module the wireframe depends on (e.g., for custom widgets).
- `declareComponent` — declare a Component document (per-route view).
- `bindComponentMembership` — activate a declared Component for editing.
- `addComponentNode` / `moveComponentNode` / `copyComponentNode` — edit the Component tree.
- `setComponentLayout` — set non-structural props on a Component node.
- `addExperienceUnit` — add an Experience unit (non-form view shape).
- `addDefinitionStub` — add a Definition stub for a form-bearing route.
- `declareUiGraphPolicy` — declare a UI Graph Policy targeting a Surface (route a11y, Locale ownership, theme tokens).
- `produceAppGraphValidationReport` — validate the authored graph and return diagnostics.

You provide an artifact loader so the validator can resolve sibling artifacts (Surface document, Definition documents, Locale, etc.).

## What to deliver

A test file at `tests/persona-journey.test.ts` that:

1. Tries to author the three surfaces above using the MCP verbs.
2. Validates each significant authoring step via `produceAppGraphValidationReport`.
3. Asserts what works (validation passes for each surface).
4. **Captures every place a verb refused, a primitive wasn't expressible, or you had to choose between bad options.** These are the findings the spike exists to surface.

When you hit a gap, write a comment block at the gap site labelled `FINDING N:` with what you wanted to express, what the MCP/substrate let you do instead, and why it matters for authoring-tool UIs. Findings are gold; don't paper over them.
