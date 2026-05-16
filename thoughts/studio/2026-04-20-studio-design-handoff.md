# Formspec Studio — Design Exploration Brief

**Date:** 2026-04-20
**Status:** Exploratory brief. Multiple directions. Functional demos.
**Audience:** AI design team building functional demos of Formspec Studio.

---

## 1. How to use this document

This brief describes what Studio is, who uses it, what it must do, and what cannot change. It does not list screens to build. Produce **several exploratory directions, each a functional demo** — different takes on how Studio could look, feel, and work, each running well enough to walk through end-to-end.

Read the brief, form your own opinions, and build directions you believe in. If two of your directions contradict each other, good. If one contradicts the brief, say so in the demo. The brief is our current thinking, not a contract.

Studio already exists. §8 describes it at a product level, and a running instance is available as reference. Treat it as evidence of *what* the product does, not a template for *how* it should look. Start from zero.

A functional demo convinces more than a Figma file, and tells the truth faster. Moments that look fine in a still image collapse in motion. Lean into that. The goal is not a shipped product — it is a direction a person can use for ten minutes and feel.

---

## 2. What Formspec is

Formspec defines complex forms as portable, version-controlled documents. It is not a builder tool and not a hosted service. It is aimed at forms where behavior is most of the work: tax returns, grant applications, clinical intake, insurance claims, regulatory filings, inspection checklists. Not contact forms. Not surveys.

A Formspec form carries its own rules. Conditional sections, calculations, cross-field validation, output formats for downstream systems, translations, offline use — the form itself describes all of it. The same definition renders on a web page, a phone, a tablet at a remote clinic, and a server rechecking answers after submission. The rules behave identically everywhere.

Formspec is a specification and a set of open-source tools. Authors own the forms they create — they can move them, version them, hand them off, keep them forever.

---

## 3. What Studio is

Studio is where someone builds a Formspec form. Authors open it with a blank page and close it with a working form. Respondents — the people who fill the form out — never see Studio.

Studio has one job with two halves.

**Direct manipulation.** The author builds the form by working on it: adding fields, writing rules, arranging pages, adjusting the look, mapping answers to downstream systems.

**Conversation with an AI.** The author also builds the form by talking to an AI that understands it and makes the same kinds of changes the author would. The AI does nothing the author could not do. Everything it does is reviewable and reversible.

Neither half is a side-panel on the other. Both are first-class. The internal pitch is **"ChatGPT for forms"**: describe what you need, watch a first draft appear, refine it in conversation or by hand, leave with a working form. Take the frame seriously, not literally. Whether conversation dominates, shares the canvas, or lives alongside direct manipulation is open. Different directions should try different answers.

One promise the design can keep: the AI cannot break the form. It works through the same controlled operations a human uses, and the system rejects structurally invalid changes from anyone.

---

## 4. Design philosophy

Formspec is simple enough to hand-write a small form and rich enough for an AI to compose an enormous one. A grant budget form runs a few dozen lines of readable description. A 300-field tax return with conditional sections, cascading calculations, and multi-format output has the same shape, only larger. The specification does not grow heavier as the form grows harder. Studio's job is to open that full range to authors without overwhelming them at any point on the curve.

Formspec separates several concerns on purpose: what the form collects, how it looks, how it is laid out, how its data flows to downstream systems, what languages it speaks. The separation is valuable. The author should not feel it as four or five tools. Let the *benefits* surface as natural product moments — swap the look without touching the logic, reuse one data model in two layouts, feed three downstream systems from a single mapping. Hide the *mechanics*.

The form definition is structured text — portable, versionable, readable, editable outside Studio. The author never needs to touch it. Offer export. Offer "view source" for transparency. Neither belongs at the center. The primary user never opens the raw form to do their job.

---

## 5. Who uses Studio

Design for a **non-technical program manager or analyst** — the person who today files IT tickets to get a form built, or spends months trading drafts with developers. They know their domain cold: grants, eligibility, clinical intake, inspections, compliance, benefits, licensing, underwriting. They do not write code. They do not read schemas. They will not hand-edit structured text to ship a form.

They *can* read and write simple formulas, the way anyone uses Excel or Google Sheets. The form's logic — "show this section if income is over $50,000", "the total is the sum of personnel, travel, and equipment", "warn if the budget is over $500,000" — is written in an Excel-like formula language. The AI writes most formulas; the author reads them and tweaks a number or comparison. For the occasional case the AI gets wrong, the author edits the formula directly. Treat formulas like spreadsheet formulas — something the user reads and adjusts, not something scary.

Typical settings:

- **Government program staff** — benefits, permitting, tax, licensing. Compliance-sensitive. Often required to meet accessibility standards.
- **Nonprofit and grant operations** — applications, reports, submissions. Small teams. One person wearing many hats.
- **Clinical and health intake** — patient questionnaires, screening, referrals. Coded medical vocabularies matter.
- **Insurance and financial services** — claims, applications, underwriting. Calculation correctness and audit trails matter.
- **Field inspection and compliance** — safety checklists, site surveys. Forms must work offline.

Shared traits:

- They are accountable for correctness. A calculation error is their problem.
- They iterate constantly. Rules change mid-cycle. Wording shifts. Sections come and go.
- They do not read docs. They expect the tool to teach them by being legible.
- They are used to forms being a second-class citizen in every tool they own. A tool that takes this work seriously will surprise them.

A secondary user is the developer who integrates the finished form into a larger system. They are not blocked by the design — they can export and work in their own tools — but the screen is not for them. When a choice trades clarity for the program manager against convenience for the engineer, the program manager wins.

---

## 6. What the author needs to do

Verbs the product must support. How to group, surface, or sequence them is the design.

**Start a form.** From nothing. From a conversation with the AI. From a built-in template — a housing intake, a grant application, a patient intake form. From an uploaded PDF, Word doc, or screenshot, which the AI converts to a starting draft. From a pasted form someone else made.

**Shape what the form collects.** Add, remove, rename, reorder, and move the parts of the form. The building blocks are fields (where a respondent enters a value), groups (sections that nest fields), and content (headings, paragraphs, banners, dividers — visible, not collected). Fields come in common kinds: text, number, yes/no, date, single choice, multiple choice, money, email, phone, file upload, signature, rating, slider. Sections can repeat with a minimum and maximum — "household members," "line items."

**Set up reusable building blocks.** Named option lists, edited in one place and used in several. Named formulas, computed once and referenced anywhere. External data sources, pointing to a list that lives outside the form.

**Express logic.** The author writes rules like "this field is required if the respondent selected 'yes' above," "hide this section unless they're applying for grant type A," "the total is the sum of these three line items," "warn if the budget exceeds $500,000 but don't block submission." Rules come in two kinds. Field rules attach to one field: is it required? hidden? computed? valid? Form rules span the whole form: does the budget balance? does the start date come before the end date? Form rules also carry a *severity* — error, warning, or note — and fire continuously or only on submit. The AI writes most rules; the author reads and adjusts.

**Organize the respondent's journey.** Break a long form into pages. Multi-page forms run as wizards (one page at a time, next/back), tabs (free movement), or a single scrolling page. Authors can also set up a **screener** — a short set of questions up front that routes the respondent into a branch of the form based on their answers.

**Shape how the form looks.** Global choices — colors, type, spacing, density, label position. Overrides for field kinds or specific fields. Responsive behavior for mobile, tablet, desktop. Themes swap without touching logic or data.

**Shape how the form is laid out.** Where each field sits, how fields cluster into cards or columns, what widget a field uses — dropdown, radio group, segmented control. Visual arrangement, separate from what the form collects.

**Shape where the answers go.** On submit, answers usually feed one or more downstream systems — a JSON API, a legacy XML system, a CSV spreadsheet. The author maps each field to each format, previews the result, adjusts. One submission can feed many formats without re-entry.

**Preview and test.** See the form as a respondent sees it — phone, tablet, desktop. Fill it with sample answers and watch the logic, calculations, and validation react live. Inspect which rules fire and why. Feed in a saved response and check whether it would pass validation.

**Converse with the AI.** Two moments:
- *Empty or early form.* The AI interviews the author, asks what they're building, and produces a first draft.
- *Existing form.* The author asks the AI to change it: "add an email field with validation," "split the address into street, city, state, zip," "make the budget section appear only for large grants." The AI changes the form, shows what it did, and the author accepts, rejects, or modifies.

The two moments may share one surface or split into two. That is a design question.

**Review what the AI did.** The author sees a clear before/after before accepting — changes grouped into one coherent unit, accepted or rejected as a whole. Once accepted, changes undo like any other edit.

**See problems.** A queue surfaces issues with severities: contradictions between rules, low-confidence AI choices, missing configuration, references to things that don't exist, rules that can never fire. The author resolves an issue, defers it, or reopens one they resolved.

**Undo and redo.** Every change reverses — whether the author or the AI made it. The author walks back any number of steps.

**Save, leave, come back.** Authors close tabs, walk away, crash, and return the next day. The form is still there. The conversation is still there. They pick up where they left off. Authors can also keep several forms in flight, list them, and switch between them.

**Export and hand off.** At any point, the author exports the form as files — to a developer, a shared drive, or version control.

**Work at real form sizes.** Real forms run 50–300 fields with dozens of rules, several pages, and multiple repeatable sections. Finding a field, filtering rules by field, searching across the form — these stop being nice-to-haves past about 30 fields.

**Set form metadata.** Title, description, version, status, page mode, density. Specialized sidecar documents also exist — translations, regulatory citations, semantic tagging for medical or legal concepts — that only some authors will touch. Whether and how those surface in Studio is a scope question worth flagging.

---

## 7. What can't change

A few things are load-bearing. The design can express them any way, but not work around them.

**The author works in concepts, not code.** Program managers do not write code or read raw form files. The design cannot require them to.

**The form's logic is Excel-like formulas.** The author occasionally reads and tweaks them, mostly with the AI's help. Give formulas a place — writing, reading, debugging — that feels like editing a spreadsheet formula, not like editing code.

**The AI is always reviewable and reversible.** Everything the AI does must be visible, understandable, and undoable. Answer: when the AI acts, how does the author see it, evaluate it, and keep or roll it back?

**Two kinds of rules. The difference matters.** Field rules ("is this required?", "what's the computed value?") and form rules ("does the budget balance?", "is the start date before the end date?") are structurally different. Form rules also carry severity and timing. Make the distinction legible or the author will conflate them.

**Several concerns are separate on purpose.** Data model, theme, layout, downstream output — different things. Changing one does not change the others. The design can hide the separation from the author's attention, but the *benefits* (swap the theme, reuse the data, retarget the output) should surface as natural product moments.

**Preview is real.** What the author sees in preview is what a respondent sees — same logic, same calculations, same validation. Lean on this truthfully.

**The form must work at 200+ fields. Not 20.** Real forms are large. Search, filter, scoping, and navigation at scale matter from the start.

**Accessibility is first-class.** Government, nonprofit, and clinical audiences often require accessibility conformance. Studio itself must meet accessibility standards, and it must help authors produce forms that do — for instance, by flagging a field without a label.

**Authors walk away and come back.** Sessions persist. The form in progress and the AI conversation remain, in a new tab, the next morning, after a crash.

---

## 8. Today's Studio, at a product level

A short description of what the current Studio does, so you know what exists to react to. A running instance is available. Use it to understand the capability surface. Do not treat it as a layout proposal.

- The workspace organizes around **tabs** — structure, logic, reference data (options, formulas, external sources), layout, theme, downstream mapping, and preview.
- A **sidebar** lets the author jump between views of the form — structure, variables, options, settings — with counts for each.
- A **properties panel** on the other side changes with whatever is selected.
- A **header** holds the tab switcher, undo/redo, import/export, and a search palette.
- **Two separate AI surfaces** exist today — one embedded in the editor for refining an existing form, one standalone for starting a form from a conversation. A single unified experience would be welcome.
- **Preview** has a viewport switcher, a place to feed in sample answers, and a diagnostics panel showing which rules fire.
- An **issue queue** surfaces problems the AI or the system has flagged.

That is one answer to the brief. The exercise is to explore others.

---

## 9. Questions a good exploration answers

Every direction should have a point of view on these. The design should answer them by how it is put together, not in words.

1. What does a first-time author see in the first ten seconds, and what does the product look like it is for?
2. How does an author go from "I need a form" to "I have a first draft"?
3. How does conversation relate to direct manipulation, and how does switching between them mid-task feel?
4. When the AI acts, how does the author see what changed and decide whether to keep it?
5. Where do the form's rules live, and how does the author stay oriented at 40+ rules?
6. When and where does the author see the form-as-respondent? Is preview a mode, a companion, an overlay, or something else?
7. How do the benefits of separation — swap the theme, reuse the data model, retarget the output — surface as natural product moments?
8. How does search and navigation work at 200 fields?
9. What does a broken form look like — a rule that can never fire, a reference to a missing field, a failed import?
10. What does the product look like three months into the life of a real form, when the author is maintaining it rather than building it?

---

## 10. The real tension

Studio must do two things at once.

It must be a tool a program manager uses for hours to build and maintain a correct, complex, high-stakes form. That is craft work — restrained, legible, forgiving, built for the ninety-eighth minute of use, not the first.

It must *also* be the most visible surface of the Formspec project — the thing someone sees in a screenshot or a short demo before deciding whether any of this is worth their attention. The design must look, at a glance, meaningfully different from the form builders it competes with. Because it is.

The two pressures reinforce each other when they can: a tool that pleases for hours also demos well. They pull apart when they can't: hero-shot flourishes get in the way at hour six, and depth takes a walkthrough to appreciate. Hold both. A direction that serves only the program manager will be competent and invisible. A direction that serves only the screenshot will be beautiful and unusable.

---

## 11. What we're asking for

**Multiple exploratory directions, each a functional demo.** Not one refined design. Ideally three to five distinct directions, each taking a different position on the open questions: different relationships between conversation and direct manipulation, different homes for preview, different takes on navigating a large form, different visual languages, different mental-model anchors. Pick directions you believe in. Widen the space before we narrow it.

Each direction should be a runnable application that a person can open and use for one canonical end-to-end flow: land in an empty state, go from "I need a form" to a first draft through conversation, make at least one meaningful edit by direct manipulation, watch the AI respond to a follow-up with a visible and reviewable change, preview the form as a respondent, hand off the result. Real interactions beat mocked ones. Stubs are fine where necessary — a scripted AI response rather than a live one, for example — but mark them clearly and keep them faithful to what the real thing would do.

Fidelity guidance:

- **High enough to read the direction.** Typography, spacing, rhythm, motion, and state transitions carry more than half of what a direction is saying. Rough sketches in code read as rough sketches.
- **Coverage over polish.** A full end-to-end flow at medium fidelity beats one beautiful screen with dead links around it.
- **Edge cases on the canonical flow only.** Empty state, loading state, AI-thinking state, error state, and "the author made a choice that needs confirmation" state should exist along the canonical flow. You do not need every field type, every rule kind, every sidecar, or every import source.

Use real form content throughout. We will provide canonical example forms. No lorem ipsum.

Deliver each direction with:

1. A short written framing: what this direction's point of view is and why you took it.
2. The running demo.
3. A ~2 minute walkthrough video of the canonical flow, with voiceover explaining what the direction does differently.
4. A summary: what this direction does better than the others, and where it pays for it.

If you have strong opinions about the brief, build them into the demos as counter-proposals. A direction that ignores part of the brief because you think we are wrong is welcome. Tell us which part, and why.

---

## 12. What you'll have access to

**The Formspec stack is yours.** You are building real demos, so you have real resources.

- **The form runtime.** An open-source package that renders and runs Formspec forms — live preview, conditional logic, calculations, validation. Preview should use the real engine. That is one of the few truthful promises the product can make. Do not mock it.
- **The authoring API.** Programmatic access to create and modify form definitions, themes, components, and mappings. Route every mutation through it. Undo/redo, audit history, and AI tool-calling then all work. The AI half of your demo has a real surface to call into.
- **AI integration.** A working integration with a major model provider, for both scaffolding (first draft from conversation) and refinement (modifying an existing form through conversation). Use the live integration, or stub for reliability. If stubbing, use real scripts captured from the live integration, not invented dialog.
- **Example form content.** Two or three canonical forms at different sizes — a small one (grant budget), a medium one (patient intake), a large one (regulatory application or tax form). Use them in every demo so the directions compare directly.
- **Today's Studio.** A running instance and its source, as reference. Do not match its structure. Treat it as one possible answer.
- **Formspec brand assets** — logo, typography, palette — where they exist. Where they do not, or where they do not fit a direction, propose.
- **Subject-matter experts.** People who know the product, the specification, and the audiences. Ask, in writing or synchronously. Do not guess in the dark on answerable questions.

**What you do not need to build.** Authentication. Storage. Deployment. Billing. Real-time collaboration. Workflow after submission. Anything downstream of "the form is authored and ready to hand off." The demos end at hand-off.

**What the demos are not.** Not production software. Not a single shared system behind all directions. Not responsive to every viewport. Not internationalized. Not instrumented. Not accessibility-conformant — though the design should not obviously violate accessibility. Keyboard operability, focus management, and sensible contrast are table stakes even at demo fidelity. Each direction is a disposable exploration, built to answer "what could this feel like," and nothing more.





