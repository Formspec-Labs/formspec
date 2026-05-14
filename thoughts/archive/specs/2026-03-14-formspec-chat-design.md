# Formspec Chat — Product Requirements Document

**Date:** 2026-03-14
**Status:** Draft

---

## The Problem

Building forms with conditional logic, validation rules, calculated fields, and repeating sections requires technical expertise that most form creators don't have. Program coordinators, compliance officers, HR managers, and small business owners know exactly what data they need — they just can't translate that knowledge into structured form logic.

Today they either hire a developer, use a tool that only supports flat question lists, or build something incomplete that requires manual review of every submission.

---

## The Product

Formspec Chat is a conversational form builder. Users describe what they need in plain language. The AI builds a complete, structured form through conversation — including the logic, validation, and conditional behavior that no other AI form builder generates.

When the form is ready, it's a stable, inspectable artifact. The AI drafts; a human approves. Once approved, the form behaves deterministically — no AI in the loop at runtime.

---

## Who It's For

**Primary users:** Non-technical professionals who create forms as part of their job but are not form designers or developers.

- A program coordinator building a housing intake form with income-based eligibility branching
- A grants manager creating an application that calculates budget totals and validates line items
- A compliance officer assembling a checklist where sign-off requirements depend on review findings
- An HR manager building an onboarding form that adapts based on employment type

**What they have in common:** They can describe what they need in conversation. They cannot — and should not need to — write conditional logic, validation expressions, or calculation formulas.

---

## How It Works

### Starting a form

The user arrives at a dedicated entry screen with four options:

1. **Start blank** — jump straight into conversation
2. **Pick a template** — choose from common archetypes (housing intake, grant application, patient intake, compliance checklist, employee onboarding)
3. **Upload an existing form** — hand over a PDF, photo of a paper form, spreadsheet, or existing Formspec JSON
4. **Resume a recent session** — continue where they left off

If the user hasn't set up an AI provider yet, a simple setup appears here: pick a provider, enter an API key, test the connection, done. Templates and blank-start work without a provider — AI features are simply unavailable until one is configured.

### Having the conversation

The user describes what they need. The AI responds — asking clarifying questions, suggesting structure, and building understanding. There are no visible phases, progress bars, or step-by-step wizards. The conversation flows naturally.

The AI explores five dimensions as the conversation develops:

- **Purpose** — what regulation, program, or workflow does this form serve?
- **Audience** — who fills this out? Applicants? Case workers? Reviewers?
- **Data** — what information needs to be captured?
- **Logic** — are there parts that appear only under certain conditions?
- **Flow** — single page or multiple steps? Sections that repeat?

Users can drop files into the chat at any time — photos of paper forms, PDFs, spreadsheets. The AI extracts structure and folds it into the conversation.

**The first draft appears fast.** After the user's first meaningful input — a template choice, a substantive description, or an uploaded document — the system shows a rough scaffold within seconds. A fast, imperfect draft the user can react to is worth more than a polished draft that takes thirty seconds.

### Seeing the form

When the scaffold reaches a useful state, the screen transitions to a full-screen form preview. The chat collapses into a drawer the user can pull open anytime.

Two features make the preview trustworthy:

**Source traces.** Every field, rule, and section links back to where it came from — a conversation message, an uploaded document, or a template. "This field came from your message about income verification." Users see *why* each element exists, not just *that* it exists.

**Issue queue.** A persistent badge shows unresolved items — missing configuration, contradictions between sources, elements the AI was uncertain about. Each issue links to the relevant form element. Issues stay until the user explicitly resolves or defers them. No ephemeral toasts that vanish before you read them.

### Refining through chat

The user opens the chat drawer and describes what they want changed. Natural language, not technical instructions:

- "Add more detail to the address section"
- "Make the budget section repeat for each funding source"
- "Only show the supervisor approval fields if the amount exceeds $10,000"
- "Simplify the income questions"

The AI applies changes and the preview updates live. Changed or added fields highlight briefly so the user sees what moved. No before/after comparison screens, no manual accept step.

The issue queue updates as edits resolve problems or introduce new ones. Source traces on new elements link to the refinement message that created them.

### Exporting the result

When satisfied, the user has three options:

- **Download JSON** — get the Formspec definition file
- **Open in Studio** — hand off to the visual editor for fine-tuning. Two modes:
  - *New project* — Studio creates a fresh project from the Chat output
  - *Import subform* — merge the Chat output into an existing project
- **Close and resume later** — the session saves automatically in the browser

---

## What Makes This Different

Every AI form builder on the market generates a flat list of questions from a text prompt. That's it. None of them generate:

| Capability | What competitors do | What Chat does |
|---|---|---|
| Conditional logic | User sets it up manually after generation | Generated from conversation — "show X only when Y" |
| Validation rules | User configures manually | Generated — required fields, pattern matching, constraints |
| Calculated fields | Not supported or manual | Generated — "total = sum of line items" |
| Cross-field constraints | Not supported | Generated — "end date must be after start date" |
| Repeating sections | Not supported | Generated — "add another budget line item" with min/max |
| Source tracing | Not available | Every element links to the conversation that created it |
| Deterministic output | AI runs every time the form is used | AI drafts once; approved form is a stable artifact |
| Open format | Proprietary or none | Open JSON spec (Formspec) |

### The trust problem

Users won't trust AI-generated forms for serious work — grant applications, compliance checklists, patient intake — without four guarantees:

1. **Full inspectability** — every field, rule, and branch is reviewable before deployment
2. **Source tracing** — every element explains why it exists
3. **Deterministic behavior** — once approved, the form works the same way every time
4. **Human approval gate** — the AI proposes; a human decides

Chat delivers all four.

---

## MVP Scope

### In scope

- Chat-first conversational interface — no visible phases or progress steppers
- Template library at entry (5 archetypes)
- File upload (PDF, image, spreadsheet) with AI extraction
- Fast first scaffold from first meaningful input
- Incremental refinement via continued chat after preview
- Full-screen form preview with collapsible chat drawer
- Live update with diff highlighting on refinements
- Source traces on every generated element
- Persistent issue queue with resolve/defer
- Provider setup with BYOK (Anthropic, Google, OpenAI)
- Deterministic fallback (works offline, no API key needed)
- Session persistence in browser storage
- Studio handoff (new project and import subform)
- JSON download

### Out of scope

- Working modes (draft fast vs. verify carefully) — single mode for MVP
- Per-element confidence indicators — issues cover the critical cases
- Visual editor embedded in Chat — handoff to Studio instead
- Click-to-edit fields in preview — chat-only refinement for MVP
- Share links or hosted form serving
- Multi-user collaboration or cloud sync
- Analytics or telemetry
- Multi-form programs

---

## Design Principles

**Chat has its own identity.** It's a sister product to Studio, not a skin of it. The feel is a professional research assistant — calm, precise, trustworthy.

**Accessibility is non-negotiable.** Generated forms meet WCAG 2.1 Level AA. The chat interface and preview support keyboard navigation and screen readers. Issue severity uses icon + label, not color alone.

**Speed matters.** The first scaffold appears within seconds. The deterministic fallback makes this possible without waiting for an LLM round-trip. When the LLM result arrives, it replaces the fast draft seamlessly.

**Your data stays with you.** All data lives in the browser. No cloud sync, no server-side storage, no telemetry. API keys are stored locally, clearable at any time, sent only to the selected provider's API.

---

## Entry Points

1. **Direct URL** — standalone at `/chat/`
2. **Studio: new project** — "Describe your form" option launches Chat
3. **Studio: empty state** — empty canvas shows "Start with Chat" call-to-action
4. **Studio: command palette** — "New Chat" targets merge into the current project
5. **Studio: re-entry** — projects created via Chat expose "Reopen Chat" linking back to the session

---

## Edge Cases

**Minimal input.** "I need a patient intake form" generates a broad scaffold from common patterns. Source traces mark elements as template-derived. The issue queue flags low-confidence items.

**Contradictory input.** When conversation and uploads conflict, the contradiction surfaces in the issue queue with citations to both sources. The user must resolve it before export.

**Large documents.** Lengthy PDFs get summarized first. The user narrows scope before full generation.

**Multiple uploads.** Multiple photos of a multi-page paper form maintain page order and produce a unified field inventory.

**Session recovery.** Tab refresh restores from browser storage. If storage is cleared, the session is gone — the product says so plainly.

**Provider failure.** LLM errors produce a chat message, not a blocking modal. The deterministic fallback provides a scaffold. Existing session state remains intact.

---

## Success Criteria

1. A user with no technical background can describe a form with conditional logic and receive a working Formspec definition in under 5 minutes
2. The generated form includes validation rules, calculated fields, or conditional visibility when the conversation implies them — not just a flat question list
3. Every generated element traces back to a specific source (conversation message, upload, or template)
4. The exported definition works identically in Studio and in any Formspec-compatible renderer
5. The system works offline with the deterministic adapter (no API key required)

---

## Future Work

- **Working modes** — speed-first vs. accuracy-first generation
- **Confidence indicators** — per-element confidence levels beyond the issue queue
- **Direct manipulation** — click fields in preview to edit; drag to reorder
- **Share links** — shareable URLs or embed codes
- **Iterative re-inquest** — upload new guidance against an existing form for targeted updates
- **Multi-form programs** — related form suites with shared option sets
- **Collaboration** — shared sessions with attribution and cloud sync

---

*End of document.*
