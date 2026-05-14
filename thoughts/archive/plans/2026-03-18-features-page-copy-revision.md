# Features Page Copy Revision — Handoff to Copywriter

**Date:** 2026-03-18
**Context:** Three non-technical personas cold-read the features page. Feedback was consistent: the page is thorough but speaks to developers, not buyers. This document gives the writer everything needed to fix it.

---

## 1. Editorial Diagnosis

### What's working

- **The BLUF table is the star of the page.** All three personas gravitated to it first. The left column (requirements) is near-perfect — it mirrors the questions buyers actually ask. Keep the format.
- **Versioning section lands hard with regulated-industry readers.** The VP of Operations said she'd forward it to her IT director. Don't touch the substance — just clean up the language.
- **Repeatable groups / data table description.** The grants admin recognized her own budget form in the description. That's a sign the feature framing is right.
- **Comprehensiveness.** The page covers the full lifecycle. Nobody said "I wonder if it can do X" — they said "I can't tell if it can do X because the language lost me."

### What's broken

- **The right column of the BLUF table is developer documentation, not buyer answers.** Backtick-formatted code tokens (`relevant`, `required`, `{amount, currency}`), acronyms without expansion (FEL, DSL, MCP), and implementation details (data-URL export, JSON document) that mean nothing to the target audience.
- **Studio is buried at the bottom.** Two of three personas assumed they'd need to write code until they reached the final section. This is a structural failure — the no-code authoring story needs to appear in the first 30 seconds of reading.
- **"No code. Just formulas." immediately followed by code syntax feels dishonest.** The SaaS PM flagged this specifically. The page promises no-code and then shows `let x = complex_expr in x + 1`. Pick a lane: either lead with the visual builder and position the expression language as power-user depth, or stop claiming "no code."
- **HIPAA is completely absent.** The healthcare VP cannot forward this page to a compliance officer. For regulated industries — the segment most likely to need Formspec's versioning and validation — this is a deal-breaker gap.
- **No screenshots anywhere.** Every persona mentioned it. A features page with zero visuals asks the reader to imagine the product. That's too much work.
- **Open-source positioning is defensive, not confident.** "Open spec, MIT license" in the BLUF reads as a footnote. Open-source is a genuine differentiator (auditability, no lock-in, community ownership, self-hostable) — it needs to be framed as a strength, not just stated as a fact.
- **Screener routing is buried inside the Versioning section** (last bullet point). The SaaS PM flagged it as a top-level feature. It has nothing to do with versioning semantically.

### Quick fixes vs. structural problems

| Type | Item |
|---|---|
| Quick fix | Rewrite BLUF right-column jargon (1–2 hours of copy work) |
| Quick fix | Add "Free and open-source (MIT)" to the page header or BLUF |
| Quick fix | Cut or reframe the `0.1 + 0.2 = 0.3` line |
| Quick fix | Move screener routing out of Versioning into its own callout or into Integration |
| Structural | Move Studio from last section to first or second section |
| Structural | Add HIPAA/compliance content block (needs product input) |
| Structural | Add screenshots/visuals throughout (needs design asset creation) |
| Structural | Reframe FEL section to lead with what it enables, not what it is |
| Structural | Add open-source value-prop block |

---

## 2. Structural Changes

### New section order

Current order:
1. Header
2. BLUF table
3. Fields
4. FEL
5. Binds
6. Validation
7. Pages & Components
8. Repeats
9. Integration
10. Versioning
11. Build it (Studio, Chat, MCP)

**Revised order:**

1. **Header** — keep, but revise (see section 4)
2. **How you build** (renamed from "Build it") — move here from position 11. Lead with Studio, the visual builder. This answers "do I need to code?" in the first 10 seconds.
3. **BLUF table** — keep in position, revised copy
4. **Open-source & compliance** — NEW section. Addresses pricing, lock-in, auditability, and compliance posture in one block.
5. **Fields** — keep, light copy revision
6. **Calculated fields & conditions** — MERGE of FEL + Binds. Rename away from "FEL" (nobody outside the project knows what FEL is). Lead with outcomes, push syntax details to a "for developers" expandable or footnote.
7. **Validation** — keep, revised copy
8. **Pages & Components** — keep, light revision
9. **Repeats** — keep, light revision
10. **Integration** — keep, add screener routing as first or second bullet
11. **Versioning & migrations** — keep, move screener routing out
12. **Screener routing** — either fold into Integration (preferred) or give it a short standalone callout before Integration

### Sections to collapse

- **FEL and Binds become one section.** The distinction between "the language" and "how the language attaches to fields" is an implementation detail. Buyers think: "can I set up calculated fields and conditional logic?" That's one mental category, not two.

### Sections to add

- **Open-source & compliance** (see New Content, item 1)
- **Screenshots/visuals** — not a copy section, but the writer should leave placeholder callouts (`[Screenshot: Studio editor with a budget form]`) so design knows what to produce.

---

## 3. BLUF Table Revisions

Rewrite every right-column cell. Left column stays as-is (it's good). Here's the row-by-row rewrite:

| Requirement | Current (developer) | Revised (buyer) |
|---|---|---|
| Calculated fields that update in real time | 61 built-in functions, decimal-precision math, named variables — no code | 61 built-in functions for math, dates, text, and more. Calculations update instantly as the user types. No coding required — works like spreadsheet formulas. |
| Show/hide fields based on other answers | `relevant` bind with full expression support; cascades to all children | Set a condition on any field or section. When the condition is false, the field hides — and everything inside that section hides with it. |
| Required fields that depend on other answers | `required` bind — a FEL expression, not just a checkbox | Make any field conditionally required based on other answers. "Required when the applicant selected Nonprofit" is a single rule, not custom code. |
| Cross-field validation with custom error messages | Named shapes: composable rules with error/warning/info severity | Write business rules that check across multiple fields — with custom messages at three severity levels: error (blocks submission), warning (flags for review), and info (context only). |
| Multi-step wizard navigation | Wizard, tabs, and single-page modes built in | Wizard (step-by-step), tabbed, and single-page layouts — all built in. Switch modes without rebuilding your form. |
| Repeatable sections (add/remove rows) | Repeatable groups and nested repeats with min/max cardinality | Users add and remove rows freely. Set minimum and maximum number of rows. Nest groups inside groups (e.g., budget categories → line items). |
| Money fields with no rounding errors | Structured {amount, currency} type; decimal-precision arithmetic | Money fields store the amount and currency together. Decimal-precision math means $0.10 + $0.20 always equals $0.30 — no floating-point surprises. |
| File upload with drag-and-drop | FileUpload component with drop zone, MIME filtering, multiple files | Drag-and-drop file upload with file-type restrictions and multi-file support. |
| Signature capture | Canvas-based Signature component with data-URL export | Draw-on-screen signature capture. Saves as an image. |
| Pre-populate fields from another system | Secondary data instances; EHR/CRM/API pre-fill; editable or locked | Pull data from EHR, CRM, or any API to pre-fill fields. Each pre-filled field can be editable or locked. |
| Export data in our format (JSON/XML/CSV) | Bidirectional Mapping DSL with value translation and conditional rules | Export responses as JSON, XML, or CSV — with field renaming, value translation, and conditional rules. The same mapping works for import and export. |
| Forms that work offline | Validation and logic run client-side; no server required at runtime | All form logic runs in the browser. No server connection needed while filling out the form. |
| Same validation on server as client | Python runtime implements identical FEL evaluation | Server-side validation uses the same rules as client-side — guaranteed identical results. No rule duplication. |
| Version-lock forms once deployed | Immutable versioned forms; responses pinned to the version they were filled on | Once published, a form version is locked. Every response records which version it was filled on. Old responses always validate against their original form — never a newer one. |
| Migrate old responses to a new form version | Migration rules: preserve/drop/expression per field | When you update a form, define what happens to each field from the old version: keep the value, discard it, or compute a new value. The original response is always preserved. |
| Route applicants to the right form | Pre-form screener with FEL routing rules | Add a short screening questionnaire before the main form. Answers automatically route the user to the right form version or intake path. |
| Design control (tokens, widgets, layout) | Theme documents + 37 built-in components; all swappable | Full design control: color tokens, typography, spacing, and layout. 37 built-in components. Apply a theme without changing the form itself. |
| Build forms with AI | 28 MCP tools + conversational chat builder | Describe what you need in plain language. An AI chat builder creates the form live. Also integrates with AI coding assistants via 28 structured tool actions. |
| No vendor lock-in | Open spec, MIT license; definition files are portable JSON | Free and open-source (MIT license). Your form definitions are portable JSON files you own. No proprietary format, no lock-in. |
| Static linting before deployment | Multi-pass Python validator; errors before applicants see the form | Catch errors before you publish. A static checker validates your form's logic, references, and structure — so users never see a broken form. |

---

## 4. Section-by-Section Copy Notes

### Header

**Current:**
> What's included [eyebrow]
> Everything complex forms require.
> Formspec covers the full form lifecycle — from first render to final export — with nothing bolted on.

**Notes:**
- "From first render to final export" is developer framing. Rewrite the subhead around the buyer's journey: from building the form to collecting and exporting responses.
- Add a one-liner about open-source and Studio up here so readers know immediately: (a) it's free, (b) there's a visual builder.
- Suggested rewrite:

> **What's included**
> Everything complex forms require — nothing bolted on.
> Design, logic, validation, and export in one open-source platform. Build visually in Studio or describe what you need to an AI assistant.

### How You Build (moved from "Build it")

**This is now section 2 — right after the header, before the BLUF table.**

- **Rename** from "Build it — Three ways to build" to something like "How you build" or "Three ways to create forms."
- **Lead with Studio.** The current copy buries Studio as the first of three equal options. Make Studio the headline, with Chat and MCP as supporting options.
- Rewrite the Studio description to lead with the outcome, not the feature inventory. The current copy reads like a product spec ("7 workspace tabs: Editor, Logic, Data, Pages, Theme, Mapping, Preview"). Replace with a benefit-first description and a screenshot placeholder.
- Suggested structure:
  - **Formspec Studio** — headline item. "A visual form builder with drag-and-drop editing, live preview, and every setting accessible without code. Build logic rules, design themes, and configure exports — all in one workspace." `[Screenshot: Studio editor showing a grant budget form with live preview]`
  - **Chat builder** — "Describe your form in plain language. A conversational AI builds it live alongside the conversation." Keep brief.
  - **AI tool integration** — "For teams using AI coding assistants: 28 structured actions for adding fields, setting rules, configuring validation, and more." Drop "MCP" from the heading — nobody outside the AI-tools world knows what MCP is. If you must mention it, parenthetical: "(via Model Context Protocol)."
- End with: "All three produce the same portable JSON definition. Mix and match freely."

### BLUF Table

- Apply the row-by-row rewrites from section 3 above.
- Consider adding a thin row at the top or a note above the table: "Free and open-source — MIT license. No per-seat pricing, no usage limits."

### Open-Source & Compliance (NEW)

See "New Content to Add," item 1.

### Fields

- Current copy is acceptable. Light revisions:
- Rewrite the section headline. "13 field types. Every specialized input covered." is fine but could be warmer. Consider: "13 field types — from plain text to money and signatures."
- In the Money bullet, replace `{amount, currency}` with "Money fields store the amount and currency together." (per jargon glossary).
- In Signatures, replace "data-URL export" with "saves as an image."
- In Text & Numbers, "Whitespace normalization (trim, collapse, remove) applied before storage and validation" is implementation detail. Cut or simplify to: "Automatic whitespace cleanup before storage."
- Add screenshot placeholder for a rendered form showing several field types.

### Calculated Fields & Conditions (MERGED from FEL + Binds)

**This is the biggest rewrite on the page.**

- **New headline:** "Calculated fields, conditions, and business rules" or "Logic — calculations, conditions, and rules without code."
- **New lead:** "Set up calculated fields, show/hide logic, conditional requirements, and read-only rules — all using spreadsheet-style formulas. No programming required. Power users can write complex expressions; everyone else uses Studio's visual rule builder."
- **Kill the name "FEL" in the headline.** You can mention it once in the body as "(powered by Formspec Expression Language)" for SEO and developer docs linkage, but it should not be a section title.
- **Restructure around outcomes, not language features:**
  1. Calculated fields — "Build formulas using 61 built-in functions: sums, averages, date math, text operations, and more. Results update in real time as the user types."
  2. Show/hide conditions — "Set a condition on any field or section. When false, the field hides and everything inside it hides too. Hidden fields are automatically excluded from validation and output."
  3. Conditional requirements — "Make any field required only when another condition is met. 'Required when Organization Type is Nonprofit' is a single rule."
  4. Read-only fields — "Lock fields with a condition. A locked section locks everything inside it. Calculated fields are automatically read-only."
  5. Precision & power (for the technically inclined) — "Decimal-precision arithmetic (no floating-point rounding). Row-by-row calculations across repeating sections. Named variables to reuse intermediate values."
- **Cut or reframe:**
  - "0.1 + 0.2 = 0.3, guaranteed" — the healthcare VP read this as an inside joke. Replace with: "Decimal-precision math eliminates rounding errors in financial and scientific calculations."
  - "deterministic" — drop per jargon glossary.
  - "Element-wise array math" — replace with "row-by-row calculations across repeating sections" and give a plain example: "Multiply quantity by price in each row, then sum the total."
  - "Let expressions: `let x = complex_expr in x + 1`" — cut from the main copy. This is developer documentation, not a selling point. If it must appear, put it in a "for developers" aside.
  - "No code. No plugins. Just formulas." — cut "No code" since the section shows code-like syntax. Replace with: "Spreadsheet-style formulas — no plugins, no scripting languages."

### Validation

- Good substance, needs language cleanup.
- Rewrite lead: "Field-level checks and cross-field business rules — with structured results your systems can act on, not just red error text."
- Replace "Named shapes: composable rules" with "Named validation rules you can combine (and, or, not, exactly-one)."
- Replace "Structured ValidationReport" explanation. Current copy says "Every validation run produces a JSON document with a valid flag, per-violation results..." Rewrite as: "Every validation run produces a structured report: pass/fail status, every violation with its field, severity, message, and a machine-readable code. Your backend can react to specific violations, not just 'the form failed.'"
- "Shape composition" — drop the word "shape." Use "rule" or "validation rule" throughout.
- Keep the three-severity-level explanation. It's clear and lands well.

### Pages & Components

- Headline is good.
- "37 built-in components" list is fine for completeness but reads like a data sheet. Consider collapsing the parenthetical component lists into a summary: "37 components across five categories: layout, inputs, display, interactive, and special-purpose." Link to a full component reference page if one exists.
- Replace "Theme documents: A sidecar JSON file with design tokens" with "Theme files: separate design configuration with color tokens, typography, spacing, and layout rules. Change the look without touching the form definition."
- Cut "three-level cascade (form → type → field)" — implementation detail that doesn't help buyers.
- "Responsive layout: Component tree supports per-breakpoint overrides" — rewrite as: "Responsive design: forms adapt to phone, tablet, and desktop automatically. Override layout per screen size without writing media queries."
- Add screenshot placeholder for wizard navigation and a themed form.

### Repeats

- This section is in good shape. Minor edits:
- Replace "min/max cardinality" with "minimum and maximum number of rows" (per jargon glossary).
- The data table description is a highlight — the grants admin recognized it immediately. Keep it prominent. Consider making it the lead bullet.
- "Repeat navigation in expressions: @index, @count, prev(), next(), parent()" — this is developer detail. Move to a "for developers" aside or cut from this page entirely.

### Integration

- **Add screener routing as the first or second bullet.** Move it here from Versioning. Rewrite: "Screener routing: Add a short questionnaire before the main form. Based on answers, automatically route each person to the right form or intake path. First-match logic: emergency → emergency intake, urgent → urgent care, everyone else → standard."
- "Secondary data instances" — rename to "Pre-fill from any source" (which is what the section header already says, but the bullet name contradicts it). Rewrite: "Connect to EHR, CRM, or any API to pre-fill fields. Data can come from a URL, an inline dataset, or a function your host app provides. Each pre-filled field can be editable or locked."
- "Mapping DSL" — never say "DSL" without explanation (per jargon glossary). Rewrite: "Export mapping: a separate configuration file that transforms responses into your external format. Supports JSON (restructure and rename fields), XML (with namespaces and attributes), and CSV (configurable delimiters and encoding)."
- "Bidirectional transforms" — keep but clarify: "The same mapping works for both import and export."
- "Reversibility guarantees" — this is valuable but written for developers. Rewrite: "Mappings track whether each transformation is reversible. Lossless transforms round-trip automatically; lossy ones require you to define the reverse explicitly."
- Expand the EHR pre-fill mention. The healthcare VP flagged this as under-represented. Add a sentence: "Pre-fill patient demographics, insurance details, or prior responses from your EHR — editable or locked per field."

### Versioning & Migrations

- **Remove screener routing** (moved to Integration).
- This section is the strongest on the page for regulated-industry buyers. Preserve the substance.
- Rewrite the lead to speak directly to the compliance concern: "When a regulated organization changes a form, three questions follow immediately: What was the user shown? Which version? Can existing responses still be validated? Formspec answers all three by design."
- "Immutable versions" — good, keep.
- "Response pinning" — good, keep. Consider adding: "This is critical for audit trails in healthcare, financial services, and government."
- "Formal migrations" — rewrite "preserve/drop/expression per field" as "For each field, choose: keep the value as-is, discard it, or compute a new value from the old data. The original response is always preserved."
- "Changelog format" — rewrite "semverImpact for CI/CD gates" as: "Each change is classified by impact (breaking, compatible, or cosmetic) so your deployment pipeline can gate on it automatically."

---

## 5. New Content to Add

### Item 1: Open-Source & Compliance Section

**Position:** After the BLUF table, before Fields.

**Suggested headline:** "Open-source, auditable, yours to own"

**Suggested lead:** "Formspec is free and open-source under the MIT license. Your form definitions, response data, and validation rules are portable JSON files — not locked inside a proprietary platform."

**Key points to cover:**

- **No per-seat pricing, no usage tiers.** Free for every team, every form, every response.
- **Auditability.** Regulated industries can inspect every line of logic. The specification is public. Validation behavior is deterministic and testable.
- **No lock-in.** Form definitions are JSON documents conforming to a published spec. Move between implementations, host on your own infrastructure, or build custom tooling against the spec.
- **Community.** Open spec means third-party implementations, community extensions, and shared component registries. (Keep this brief until there's actually a community to point to — don't overstate.)
- **Support model.** Writer needs product input here — see Questions for Product, item 1.

**Compliance subsection within this block (or a distinct callout):**

- **Accessibility.** Writer needs product input — see Questions for Product, item 3.
- **HIPAA.** Writer needs product input — see Questions for Product, item 2. At minimum, state Formspec's architectural posture: "Formspec runs client-side by default. No form data passes through Formspec servers. Your hosting environment, not Formspec, determines your compliance boundary." If the project offers a BAA or HIPAA-eligible hosted option, say so. If not, be clear that self-hosting on HIPAA-compliant infrastructure is the path.
- **Mobile support.** State clearly: "Forms are responsive by default. Built-in components adapt to phone, tablet, and desktop viewports." Writer needs product input on whether native mobile SDKs exist or are planned — see Questions for Product, item 4.

### Item 2: Screenshot / Visual Placeholders

The writer should insert placeholder callouts at these locations so the design team knows what assets to produce:

1. After the "How you build" section — Studio editor screenshot (the most important visual on the page)
2. In the Fields section — a rendered form showing 4-5 field types
3. In the Validation section — a form with error, warning, and info messages visible
4. In the Pages & Components section — wizard navigation with step indicator
5. In the Repeats section — an editable data table with calculated row totals
6. In the Versioning section — (optional) a version timeline or diff view if one exists in Studio

### Item 3: Social Proof / Customer Evidence Placeholder

The SaaS PM flagged the absence of customer evidence. The page doesn't need a testimonials section, but it should have at least:

- A callout or aside after the BLUF table: "Used by [X organizations / in Y forms / for Z submissions]" — or whatever metric is honest at this stage.
- If there are no usage metrics yet (the product is pre-launch), skip this entirely. Do not fabricate social proof. A confident open-source positioning is more credible than empty social proof.

---

## 6. Questions for Product

The writer cannot resolve these from the existing page content. Product owner needs to provide answers before final copy.

1. **Support model for open-source users.** Is there a community forum, Discord, GitHub Discussions? Is commercial support or a paid tier planned? The "open spec, MIT license" line raises support questions for the healthcare VP. The writer needs to know what to promise.

2. **HIPAA posture.** Can the product team provide a clear statement? Options:
   - "Formspec is a client-side engine; no PHI touches Formspec infrastructure. HIPAA compliance depends on your hosting environment."
   - "We offer a BAA for our hosted offering."
   - "We provide a HIPAA deployment guide for self-hosted environments."
   - The writer needs the real answer. The healthcare persona cannot forward this page without it.

3. **Accessibility / WCAG compliance.** What level of WCAG conformance do the built-in components target? 2.1 AA? Is there an accessibility statement or audit? This is a checkbox requirement for government and healthcare buyers.

4. **Mobile support.** Is "responsive built-in components" the full story, or are there native mobile SDKs, a mobile-specific renderer, or offline-capable PWA support?

5. **EHR/CRM integrations.** The healthcare VP asked "which systems connect out of the box?" The current page says "EHR/CRM/API pre-fill" but names zero systems. Can we list specific systems (Epic, Cerner, Salesforce, etc.) or is the answer "any system via API, no pre-built connectors yet"?

6. **Usage metrics.** Are there any honest numbers to cite? Forms created, responses collected, organizations using it? If not, skip social proof and lean on the open-source credibility angle.

7. **Screener routing — real examples.** The SaaS PM wants this surfaced prominently. Can product provide 2-3 concrete routing scenarios beyond the emergency/urgent/standard example? Grant eligibility screening, benefits determination, and intake triage are natural fits.
