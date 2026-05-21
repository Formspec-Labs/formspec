# Reviews — `2026-05-20-formspec-semantic-layers.md`

**Date:** 2026-05-20
**Target:** [`2026-05-20-formspec-semantic-layers.md`](./2026-05-20-formspec-semantic-layers.md)
**Reviewers:**
- `formspec-specs:formspec-scout` — semi-formal code review
- `formspec-specs:cross-stack-scout` — semi-formal architecture review
- `codex:codex-rescue` — adversarial review via Codex

**Verdicts:**
- formspec-scout: **REQUEST CHANGES** (2 BLOCKERs, 2 WARNINGs, 4 NITs/OBSERVATIONs)
- cross-stack-scout: **RECONSIDER** (2 BLOCKERs, 5 CONCERNs, 1 OBSERVATION)
- codex: **REJECT-IN-DETAIL** (6 BLOCKERs, 24 MAJORs, 5 MINORs)

---

# 1. formspec-scout — Semi-Formal Code Review

## 1.1 Patch Summary

A new conceptual architecture note (provisional v0) at `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md` (619 lines). Names three semantic layers — Experience, Response Actions, Trace — beside Definition / Component / Theme / Mapping / References. Supersedes `2026-05-19-ui-schema.md`. Specifies layer ownership, cross-stack seams (Formspec / Trellis / WOS), primitive vocabulary, locale discipline, design commitments, open questions, follow-on spec order.

**Status:** Conceptual architecture note, provisional v0, explicitly **not normative** (§Scope, §12 last paragraph).

**Stated intent:** make the architecture hard to misunderstand before the follow-on companion specs (Locale, Experience, Response Actions, Component additions, Trace) ratify the details.

**Directly affected sections of interest to audit focus:**

- §1 Thesis (`formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:11-39`)
- §3.3 Response Actions (`:90-204`)
- §4 Cross-Stack Seams (`:237-253`)
- §5.4 Worked example (`:316-422`)
- §6 Trace (`:426-457`)
- §8 Locale Discipline (`:482-492`)
- §10 Lineage (`:524-542`)
- §11 Open Questions (`:546-588`)
- §13 Final Direction (`:608-618`)

## 1.2 Source-Citation Verification Table

| Citation in note | Resolves? | Supports claim? |
| --- | --- | --- |
| `trellis-core.md §22.2` (per-event binding) | yes | yes — §22.2 Per-event binding at `trellis/specs/trellis-core.md:2582` |
| `trellis-core.md §18.2` (Required archive members) | yes | yes — `:1385` |
| `respondent-ledger-spec.md §15A` (Profiles A/B/C) | yes | yes — `formspec/specs/audit/respondent-ledger-spec.md:1176`+ |
| `respondent-ledger-spec.md §6.4` (`actor.kind` taxonomy) | yes | yes — `:303-313` verbatim match for `respondent / delegate / system / support-agent / unknown` |
| `work-spec/specs/kernel/spec.md §11.3 Instance Operations` (`acceptIntakeHandoff`) | yes | PARTIAL — `acceptIntakeHandoff` appears in §11.3 table at `:1893`, but the **normative algorithm** producing `intakeAccepted / intakeRejected / intakeDeferred` lives in §11.4 Intake Acceptance (`:1903-1953`). See Finding 1. |
| `work-spec/specs/kernel/spec.md §13.7` (WOS "case ledger") | yes | NO — §13.7 "Ledger and Notice" is about WOS **consuming Respondent Ledger evidence** for the submit boundary, not about a WOS-owned case ledger. The actual case-ledger references are in §5 Case State (`:726-732`) and §8.2 Facts Tier Record (`:967`). See Finding 2 (BLOCKER). |
| `wos-trellis-verification.md` WOS-TV-007/008/009 | yes | yes — `trellis/specs/wos-trellis-verification.md:73-75` verbatim |
| ADR 0073 D-3, D-5, D-7 | yes | yes — `thoughts/adr/0073-stack-case-initiation-and-intake-handoff.md:45,74,120` |
| ADR 0075 I-2 (FEL as only expression language) | yes | yes — `thoughts/adr/0075-rejection-register.md:33` |
| `trellis-operational-companion.md §11` (Posture Declaration) | yes | yes — §11 Posture-Declaration Honesty at `:368` |
| `intake-handoff.schema.json` field list | yes | yes — `formspec/schemas/intake-handoff.schema.json:12-15,119,128,139,148,158,170,182` (responseRef, responseHash, validationReportRef, intakeSessionId, ledgerHeadRef, actorRef, subjectRef all present) |

## 1.3 Cross-Reference Resolution

All relative paths from `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md` resolve. Spot-checked:

- `../../specs/audit/respondent-ledger-spec.md` → `formspec/specs/audit/respondent-ledger-spec.md` (exists)
- `../../schemas/intake-handoff.schema.json` → `formspec/schemas/intake-handoff.schema.json` (exists)
- `../../../thoughts/adr/0073-…md`, `…0075-…md` (exist)
- `../../../trellis/specs/trellis-core.md`, `trellis-operational-companion.md` (exist)
- `../../../work-spec/specs/kernel/spec.md` (exists)
- `../../../stack-common/crates/stack-common-hash/`, `…/stack-common-typeid/`, `../../../integrity-stack/crates/integrity-canonical/` (exist)
- `./2026-05-19-ui-schema.md` (exists)

No broken paths.

## 1.4 Internal-Consistency Checks

### Triadic summary (§1 / §10 / §13)

§1 table (`:23-27`) and §10 table (`:536-540`) are character-identical. §13 prose-form bullets (`:612-614`) preserve the load-bearing predicates ("derivable / executable / explainable"). Tradition assignments match across all three: Experience ← UsiXML / CAMELEON; Response Actions ← XForms (runtime operations); Trace ← XIML. **Consistent.**

### Validation modes (closed enum)

The closed set `save / submit / demand / autosave` appears at `:99` (prose) and `:183-188` (enum table). Schema sketches at `:139` and `:161` use `"validation": "submit"`, consistent with the enum. **Consistent.** See Finding 5 for one naming-precision NIT (property `"validation"` vs prose phrase "validation modes").

### Locale refs-only commitment (§8)

§8 (`:482-492`) declares: "Raw strings in Component nodes are disallowed." §3.4 Component additions (`:217`) restates this. §5.4 worked example (`:319-411`) uses `labelRef`, `titleRef`, `descriptionRef`, `accessibility.labelRef` / `accessibility.descriptionRef` exclusively — no raw human-readable strings appear in Component or Experience nodes. **Consistent.**

### Trace framing (relationship index, not derivation substrate)

§1.3 (`:31`), §3.8 (`:233`), §6 (`:426-457`), §9.6 (`:518-520`), §11.2 (`:556-560`), §13 (`:614`) all hold Trace as *relationship index*, *generated*, *not part of the rendering pipeline*. §6 explicitly states "Trace ≠ derivation engine" (`:452`). v0 commitment "posture only" (§6, `:457`) and §11.2's "posture committed; predicates and language deferred" agree. **Consistent**, with one phrasing NIT (Finding 6).

### Cross-references between §3.3, §3.3.1, §3.3.2, §10, §11.3

§3.3 prose ownership block (`:96-105`) lists: action identity/intent/actor, preconditions, validation modes, effects, submission policy, lifecycle policy, transaction semantics, Intake Handoff production. §3.3.1 schema sketches realize each of these with concrete property names. §3.3.2 transaction semantics (`:190-204`) matches the prose "preconditions → effects → validation → evidence → commit" (`:103`). §10 lineage row (`:530`) and §13 bullet (`:613`) preserve the same enumeration. **Largely consistent**; see Findings 4 and 5 for surface drift.

## 1.5 Findings

### FINDING 1

- **Severity:** WARNING
- **Category:** correctness (citation precision)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:110, :244`
- **Description:** The §3.3 prose and the §4 seam-table both cite **`work-spec/specs/kernel/spec.md` §11.3 Instance Operations** as the section that "validates the handoff and emits `intakeAccepted / intakeRejected / intakeDeferred`." §11.3 (`work-spec/specs/kernel/spec.md:1886-1901`) only enumerates `acceptIntakeHandoff` in a one-row table. The normative algorithm — input validation, the closed outcome space (`accepted / rejected / deferred`), and the `intakeAccepted / intakeRejected / intakeDeferred` `recordKind` literals — is in **§11.4 Intake Acceptance**, specifically §11.4.1 Normative Algorithm (`:1907-1931`) and §11.4.3 Outcome Semantics (`:1945-1953`).
- **Evidence chain:** §11.3 line 1893 lists `acceptIntakeHandoff` only as one operation in the operations table. The normative algorithm is in §11.4.1 (`:1909`). The outcome literals are pinned in §11.4.3 (`:1947-1951`). The note's claim is supported by §11.4 more than by §11.3.
- **Suggestion:** Change both citations to `§11.3 Instance Operations + §11.4 Intake Acceptance` (or to `§11.4`). The anchor `#113-instance-operations` should follow.

### FINDING 2 — BLOCKER

- **Severity:** BLOCKER
- **Category:** correctness (unsupported claim with load-bearing citation)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:251` ("WOS Kernel **does not maintain a parallel respondent ledger**. It maintains its own **case ledger** at the case scope ([`work-spec/specs/kernel/spec.md` §13.7](...)) and references Respondent Ledger evidence by handle when a rights-impacting task requires it.")
- **Description:** The cited §13.7 is **"Ledger and Notice"** (`work-spec/specs/kernel/spec.md:2139-2145`), which says the *opposite* of what the note implies: §13.7 specifies that WOS *consumes Respondent Ledger evidence* at the submit boundary for rights-impacting tasks. It does **not** describe a WOS-owned case ledger. The actual WOS case-ledger model is §5 Case State (`:726`) and the durable `caseLedgerId` field in §8.2 Facts Tier provenance records (`:967`). The kernel's CLAUDE.md system reminder also makes clear that "Case Ledger" terminology aligns with the Trellis Core §1.2 case-ledger term and that the Formspec Respondent Ledger remains Formspec-owned (ADR-0084 D-1).
- **Evidence chain:** `work-spec/specs/kernel/spec.md:2139-2145` is unambiguously about *consuming* Respondent Ledger evidence, not about *maintaining* a case ledger. `work-spec/specs/kernel/spec.md:732` and `:967` are the load-bearing case-ledger references.
- **Suggestion:** Replace §13.7 with `§5 Case State + §8.2 Facts Tier Record` (citing line 732's "durable case ledger" prose and the §8.2 `caseLedgerId` reference). Optionally also reference the kernel's §11.4 `caseCreated` record kind for the case-creation moment.

### FINDING 3 — BLOCKER

- **Severity:** BLOCKER
- **Category:** maintainability (decay-class rule violation)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:586` ("Doc impact is pervasive (~131 files across `formspec/`, `trellis/`, `work-spec/`, and `thoughts/` reference the current name).")
- **Description:** This is a numerical count in prose that decays every commit. Stack CLAUDE.md decay-class rule §1 explicitly bans this: "**No numerical counts in prose.** Counts decay every commit. Use pointers (`see filemap.json`, `see Cargo.toml workspace members`, `see <dir>/`). Exception: spec-pinned design constants with citation." A live grep across `formspec/`, `trellis/`, `work-spec/`, `thoughts/` already returns 158, not 131. The count is decorative — the argument ("Doc impact is pervasive") stands without it.
- **Evidence chain:** Live `grep -r -l "respondent.ledger\|Respondent Ledger\|respondentLedger\|RespondentLedger"` across the four named trees returns 158. The count is not spec-pinned, has no citation, and serves a "this is a lot" rhetorical purpose that prose handles without arithmetic.
- **Suggestion:** Replace "~131 files across `formspec/`, `trellis/`, `work-spec/`, and `thoughts/`" with "every layer of the stack". Or drop the count and keep the qualitative "Doc impact is pervasive."

### FINDING 4

- **Severity:** WARNING
- **Category:** correctness (cross-layer authority split)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:104` ("production of Intake Handoff envelopes")
- **Description:** The §3.3 ownership block attributes "production of Intake Handoff **envelopes**" to Response Actions. The §4 seam table — accurately — attributes the **payload** to Formspec and the **envelope** to Trellis (`trellis-core.md §18.2`, `wos-trellis-verification.md` WOS-TV-007/008/009). The two columns of the seam table are reconciled but the §3.3 ownership prose contradicts the seam table by using "envelopes" rather than "payloads." This is the exact authority confusion §4 was added to disambiguate.
- **Evidence chain:** §4 Cross-Stack Seams (`:244`): "Boundary payload contract — content pointers and metadata" (Formspec) vs "Cryptographic envelope wrapping the payload — COSE_Sign1 tag-18 with protected-header labels, Ed25519 signature, domain-separation hashing" (Trellis). §3.3 line 104 says "production of Intake Handoff envelopes," which crosses into the Trellis column.
- **Suggestion:** Change line 104 to "production of Intake Handoff **payloads** (envelope cryptography is Trellis-owned per §4)." Or simply "production of Intake Handoff payloads."

### FINDING 5

- **Severity:** NIT
- **Category:** maintainability (vocabulary precision)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:99, :139, :161, :183-188`
- **Description:** Prose at `:99` and the enum table at `:183-188` call the closed enum **"validation modes"**. The §3.3.1 schema sketches use property name `"validation"` (singular, no "mode" suffix) at `:139` and `:161`. The provisional-v0 disclaimer at `:129` covers this, but the formal Response Actions spec should explicitly pick one. A reader could reasonably parse `"validation": "submit"` as a Boolean or a validation-shape reference rather than a mode value.
- **Evidence chain:** `:99` says "validation modes (closed enum: save / submit / demand / autosave)". `:139` says `"validation": "submit"`. `:183` heading reads "Validation modes (closed enum at v0)".
- **Suggestion:** When the formal spec lands, prefer property name `"validationMode"` to disambiguate. No change needed at v0; flag for §12 follow-on.

### FINDING 6

- **Severity:** NIT
- **Category:** maintainability (vocabulary drift)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:558`
- **Description:** §11.2 introduces the phrase **"query primary, materialized cache subordinate with digest staleness"** as a summary of §6's posture. The phrase "query primary" does not appear in §6. §6 says "v0 commitment: posture only. The predicate set ... and the query language are deferred." The "query primary" framing is a §11.2-only coinage that could be read as a normative claim (queries are the primary access path) even though §6 explicitly defers the query language.
- **Evidence chain:** §6 line 457 says the query language is deferred. §11.2 line 558 implies queries are the primary form factor. The two are not strictly contradictory but they diverge in voice.
- **Suggestion:** Restate §11.2 as "§6 commits the posture (relationship index, generated from sources, materialized cache subordinate with digest staleness). The closed predicate set and the query language are deferred." Drops "query primary," uses the §6-anchored "generated from sources" phrasing.

### FINDING 7

- **Severity:** NIT
- **Category:** maintainability (potential drift between §1 axioms and §5.2)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:37` vs `:283`
- **Description:** §1 axiom #3 says "**Generated, not authored.** Component drafts derive from sources via the rendering pipeline; Trace is generated from the result and its sources." But §5.2 (`:283`) says: "**Hand-authoring** is also valid; the rendering pipeline does not require any particular tool produce the Component." So Component **can** be hand-authored; only Trace is strictly generated-not-authored. §1's grouping flattens the distinction.
- **Evidence chain:** Lines 37 and 283 are in tension. §5.3 regeneration merge rules (`:303-311`) explicitly preserve "designer-edited Component" alongside generated nodes, confirming that hand-authoring is a first-class workflow.
- **Suggestion:** Sharpen §1 axiom #3 to: "**Trace is generated, not authored. Components may be either.** Component drafts derive from sources via the rendering pipeline; designer-authored Components are also valid. Trace is always generated from the result and its sources. Source artifacts win on conflict."

### FINDING 8

- **Severity:** OBSERVATION
- **Category:** maintainability (decay-class rule §1, milder than Finding 3)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:82, :91, :233, :265-272`
- **Description:** The note refers to "Initial registered values include `data-entry`, `review`, `confirmation`, `evidence-upload`, `signature`, `agent-assist`, `error-resolution`" (line 82) and an identical enumeration at `:265-272`. These are open enumerations at v0 (note says "the closed enum lands in the formal Experience companion spec"), so listing initial values is appropriate. No decay-class violation here, but the dual-location enumeration in §3.2 and §5.1 is a maintenance risk — the lists must move together. Pin one as primary and reference it from the other.
- **Evidence chain:** §3.2 (`:82`) and §5.1 (`:265-272`) both enumerate the seven kinds verbatim.
- **Suggestion:** Pick one as primary (probably §3.2, since it appears first and is in the Layer Ownership section) and let §5.1 reference it: "The `kind` field on an Experience unit signals abstract intent (§3.2 initial registered values)." Or accept the duplication at v0 and flag for §12 reconciliation.

### FINDING 9

- **Severity:** OBSERVATION
- **Category:** correctness (cross-layer naming question is already in scope)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:580-588`
- **Description:** §11.6 proposes renaming Respondent Ledger → Response Ledger and explicitly notes that wire-format impact is bounded (`$formspecRespondentLedger: "0.1"` is schema-pinned). The proposal coheres with the §4 substrate / projection pattern. The system reminder for `work-spec/CLAUDE.md` confirms a parallel rewrite is already pending on the Trellis side (Trellis Core §1.2 uses "Case Ledger"; the rewrite from `respondent-ledger-spec.md` → `case-ledger-spec.md` is pending). ADR-0084 D-1 keeps the Formspec ledger Formspec-owned and response-scoped, which preserves the existing artifact identity while making room for the rename. **This question deserves its own stack-level ADR rather than living as an open-question entry** — both because it crosses three specs (formspec, trellis, wos) and because Trellis is already moving in that direction.
- **Evidence chain:** §11.6 (`:580-588`); WOS CLAUDE.md "Case Ledger (Trellis Core §1.2 term) is the canonical Trellis-side name for what was called Subject Ledger in older Trellis prose; the Trellis spec rewrite from `respondent-ledger-spec.md` → `case-ledger-spec.md` is pending. Do not rename the Formspec Respondent Ledger artifact: ADR-0084 D-1 keeps it Formspec-owned and response-scoped."
- **Suggestion:** Flag this in §12 follow-on order or open a stack ADR for "Ledger naming alignment across Formspec / Trellis / WOS." Leave §11.6 in place; add a forward-pointer to the future ADR.

### FINDING 10

- **Severity:** OBSERVATION
- **Category:** maintainability (single-source-of-truth for cross-stack seam table)
- **Location:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md:241-246`
- **Description:** The §4 cross-stack seam table is well-researched and cited. It will drift as Trellis §22 / §18 / `wos-trellis-verification.md` / `intake-handoff.schema.json` / ADR 0073 evolve. For a `thoughts/specs/` provisional note this is fine. **When the follow-on Response Actions companion spec lands (§12 item 3), the seam table belongs in that companion spec, not duplicated here.** Today the table is uniquely valuable because no formal companion exists.
- **Evidence chain:** §4 cites four downstream documents that own pieces of the seam contract. Each citation is verified against source. Drift would happen if any of those documents move sections.
- **Suggestion:** When §12 item 3 lands, move §4 verbatim into the Response Actions companion spec and replace it here with a pointer.

## 1.6 Conclusion

```text
VERDICT: REQUEST CHANGES

Justification:
  - The patch is a well-researched and internally coherent conceptual architecture note
    that achieves its stated intent (make the architecture hard to misunderstand before
    formal specs begin). The triadic summary (derivable / executable / explainable) is
    held consistently across §1, §10, §13. Validation modes match across prose, enum,
    and schema sketches. Locale refs-only discipline is held throughout including the
    §5.4 worked example. Trace framing as relationship-index-not-derivation-substrate
    is held consistently.
  - Two BLOCKER findings prevent ship-as-is:
      F2: §13.7 citation for "WOS maintains its own case ledger" does not support the
          claim; §13.7 is about WOS consuming Respondent Ledger evidence at submit.
          The actual case-ledger references are §5 Case State + §8.2 Facts Tier.
      F3: "~131 files" numerical count in §11.6 violates stack CLAUDE.md decay-class
          rule §1 ("No numerical counts in prose"). Count is already drifted (live:
          158). Argument stands without arithmetic.
  - Two WARNINGs deserve fix before the doctrine propagates into companion specs:
      F1: §11.3 vs §11.4 citation precision for the acceptIntakeHandoff algorithm.
      F4: "production of Intake Handoff envelopes" in §3.3 contradicts the §4 seam
          table's correct payload-vs-envelope split.
  - Four NITs and OBSERVATIONs are non-blocking but worth flagging for the follow-on
    Locale / Experience / Response Actions / Trace companion specs.
  - Coverage of changed paths: ADEQUATE for a thoughts/specs/ provisional note. The
    note has no test surface; verification is citation-resolution and internal
    consistency, both of which were performed.
  - Confidence: HIGH on the cited-source verification (each citation read in source).
    MEDIUM on the rhetorical-coherence findings (F6, F7) which are voice judgments
    rather than provable errors.
```

## 1.7 Files relevant to remediation

- `/Users/mikewolfd/Work/formspec-stack/formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md` (the note itself; lines named in each finding)
- `/Users/mikewolfd/Work/formspec-stack/work-spec/specs/kernel/spec.md` (§5 line 726, §8.2 line 967 for F2 replacement citations; §11.4 line 1903 for F1 replacement citation)
- `/Users/mikewolfd/Work/formspec-stack/trellis/specs/trellis-core.md` (§22.2 line 2582, §18.2 line 1385 — already correctly cited)
- `/Users/mikewolfd/Work/formspec-stack/trellis/specs/wos-trellis-verification.md` (WOS-TV-007/008/009 at lines 73-75 — already correctly cited)
- `/Users/mikewolfd/Work/formspec-stack/formspec/specs/audit/respondent-ledger-spec.md` (§6.4 line 303 — already correctly cited)
- `/Users/mikewolfd/Work/formspec-stack/formspec/schemas/intake-handoff.schema.json` (responseHash field at line 128 — already correctly cited)
- `/Users/mikewolfd/Work/formspec-stack/CLAUDE.md` (decay-class rule §1 invoked by F3)

---

# 2. cross-stack-scout — Semi-Formal Architecture Review

## 2.1 Artifact Summary

- **Path:** `formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md`
- **Status:** Conceptual architecture note (provisional v0); supersedes `2026-05-19-ui-schema.md`
- **Stated problem:** Definition + Component + Theme + Mapping is sufficient when UI is hand-built but insufficient when UI must be *generated* from semantic source — wireframes, prototypes, multi-output projections, AI authoring.
- **Stated decision:** Introduce three new semantic layers beside Definition — **Experience** (abstract task intent, CAMELEON), **Response Actions** (XForms-derived runtime), **Trace** (XIML-derived relationship index). Reshape §4 into a cross-stack seam table.
- **Category:** Product surface (Formspec spec evolution), with proof-infrastructure obligations at the §4 seam table
- **Subsystems touched:** Formspec (additive layer + seam restatement) → WOS (Kernel §11.3 `acceptIntakeHandoff` boundary cited) → Trellis (Core §1.2 case-ledger scope, §22 Respondent Ledger composition, §11 Operational Companion posture, §18 export catalog)
- **Prior artifacts cited:** ADR-0073 (case initiation), ADR-0075 (FEL rejection register / FEL as cross-stack predicate language), `respondent-ledger-spec.md` §6.4 + §15A, `trellis-core.md` §22.2 + §18.2, `work-spec/specs/kernel/spec.md` §11.3, `trellis-operational-companion.md` §11
- **Prior artifacts it SHOULD have cited but didn't:** ADR-0084 D-1 (the Respondent Ledger boundary cleanup that already settled the rename question §11.6 reopens); ADR-0090 (Posture Declaration is deployment-owned, schema lives in Formspec, consumed by WOS); ADR-0095 (Trellis platform substrate posture); ADR-0106 (WOS-server governance overlay over Trellis); `wos-trellis-verification.md` WOS-TV-007/008/009 (which already pin the Intake Handoff envelope discipline); Trellis Core §22.4 (case-ledger composition rule); Locale spec (cited by short name in §8, §12 but the spec carries no path)

## 2.2 Lineage And Relationship Tables

| Prior Artifact | Type | Relation | Citation |
|---|---|---|---|
| `2026-05-19-ui-schema.md` | superseded predecessor | Spec explicitly supersedes | Spec header (`Supersedes:`) |
| ADR-0073 D-3 | parent | Intake Handoff seam Formspec-side ownership | `thoughts/adr/0073-stack-case-initiation-and-intake-handoff.md` §D-3, §D-5, §D-7 |
| ADR-0075 I-2 | parent | FEL as cross-stack predicate language | `thoughts/adr/0075-rejection-register.md` |
| ADR-0084 D-1 | **missing parent** | Respondent Ledger Formspec-owned, response-scoped — directly contradicts the §11.6 rename framing | `thoughts/adr/0084-respondent-ledger-boundary-cleanup.md` §D-1 |
| ADR-0090 | **missing parent** | Posture Declaration deployment-owned schema, lives in Formspec, consumed by WOS | `thoughts/adr/0090-stack-posture-declaration-object.md` |
| ADR-0095 | **missing parent** | Trellis platform substrate posture | `thoughts/adr/0095-trellis-platform-substrate-infrastructure.md` |
| ADR-0106 | **missing parent** | WOS-server overlay over Trellis | `thoughts/adr/0106-wos-server-governance-overlay.md` |
| Trellis Core §22 | sibling | Already normatively binds Respondent Ledger composition (§22.2) and defines case-ledger composition (§22.4) | `trellis/specs/trellis-core.md` §22.1-22.5 |
| Trellis Core §1.2 | sibling | Defines the three append-only scopes (event / response ledger / case ledger / agency log / federation log) | `trellis/specs/trellis-core.md:73-85` |
| `wos-trellis-verification.md` WOS-TV-007/008/009 | sibling | Already specifies the Intake Handoff envelope verification rules | `trellis/specs/wos-trellis-verification.md:73-75` |
| Locale spec | child (declared §12 prerequisite) | Hard prerequisite for Component ratification per §8 — but no path is cited; doc may not exist yet | Spec §8, §12 |

| Component / Seam | Owner | Depends On | Depended On By | Seam Named? |
|---|---|---|---|---|
| Experience | Formspec (new) | Definition, Registry, Ontology | Component derivation | No spec yet — §12 item 2 |
| Response Actions | Formspec (new) | FEL, Mapping, Respondent Ledger, Intake Handoff | WOS Kernel §11.3 (post-handoff side) | No spec yet — §12 item 3 |
| Trace | Formspec (new) | All other Formspec artifacts (read-only) | Generators, AI authoring reviewers, compliance auditors | No spec yet — §12 item 5; predicate set deferred per §11.2 |
| Respondent Ledger seam | Formspec (event semantics) ⊕ Trellis (substrate, optional `trellis-wrapped` profile) | RL §6.2 + §13; Trellis §22.2 + §22.3 | WOS case ledger composes RL heads | Yes — Trellis §22 |
| Intake Handoff seam | Formspec (payload schema) ⊕ Trellis (event-envelope around the WOS-side admit event) ⊕ WOS (consumer obligations) | `intake-handoff.schema.json`, ADR-0073, WOS Kernel §11.3, `wos-trellis-verification.md` WOS-TV-007/008/009 | WOS `acceptIntakeHandoff`; Trellis `063-intake-handoffs.cbor` export catalog | **Misnamed in §4** — see Finding 1 |
| Posture Declaration | **Formspec schema + deployment authorship** ⊕ WOS (admission consumer) ⊕ Trellis (operator-publication honesty floor) | `formspec/schemas/posture-declaration.schema.json`, ADR-0090, Trellis Op Companion §11 | WOS admission gating | **Misnamed in §4** — see Finding 2 |
| Validation Report | Formspec | Core spec §5 | Intake Handoff (referenced by handle), Response Actions (`outputs`) | **Missing from §4 table** — see Finding 5 |
| Verification Receipt | Formspec schema ⊕ WOS admission consumer ⊕ Trellis (signed-receipt option) | `formspec/schemas/verification-receipt.schema.json`, ADR-0088 | WOS admission, posture floor | **Missing from §4 table** — see Finding 5 |

## 2.3 Invariants And Commitments

```text
INVARIANT 1:
  Statement: Additive layers MUST NOT modify Definition, override Component/Theme,
             or redefine Mapping. (Spec §1 thesis property #1.)
  Source: 2026-05-20-formspec-semantic-layers.md §1, §3.4-3.7
  Status: RELIED-UPON (claimed); RISK OF LEAKAGE (see Finding 3)
  Evidence: §3.3.2 transaction semantics — "preconditions → effects → validation
            → evidence → commit" — declares a transaction shape that, if read
            strictly, names lifecycle policy and rollback discipline that
            Definition does not currently carry.
  Failure mode: A "no-man's-land" between Definition's processing model
                (Core S2.4) and the new Response Actions transaction.

INVARIANT 2:
  Statement: Rust > CDDL > prose > matrix > Python > archives (Trellis ADR 0004).
  Source: trellis/CLAUDE.md "Engineering philosophy"; ADR 0004
  Status: NOT-VIOLATED (the spec is a conceptual prose note, not byte-level)
  Evidence: §4 cites trellis-core.md prose only. Architecturally appropriate
            given the document scope — but where §4 claims byte-level facts
            ("COSE_Sign1 tag-18 with protected-header labels, Ed25519 signature,
             domain-separation hashing"), prose citation alone is weak. See
            Finding 1's narrower form.
  Failure mode: A reader takes the §4 table as the byte-shape spec when it is
                actually a forwarding pointer to Trellis Core §7 + §18 + §22.

INVARIANT 3:
  Statement: Stack-wide primitives route through their existing homes; Formspec
             does not start a local foundations package (§11.1; closed).
  Source: 2026-05-20 §7, §11.1
  Status: PRESERVED — explicitly declared, with re-open trigger.
  Evidence: §7 routes HashString through stack-common-hash and the urn:wos:
            grammar through stack-common-typeid; no parallel package.

INVARIANT 4:
  Statement: WOS owns case identity and `case.created`. Formspec hands off
             via IntakeHandoff (ADR 0073). The two seams "never overlap on the
             same lifecycle moment" (spec §3.3).
  Source: 2026-05-20 §3.3, ADR-0073, WOS Kernel §11.3
  Status: PRESERVED in §3.3 prose. PARTIALLY CONFUSED in §4 (see Finding 1).
  Evidence: §3.3 names Response Actions on the Formspec side and
            `acceptIntakeHandoff` on the WOS side cleanly. §4 then re-renders
            the same seam with a Trellis "envelope" column that conflates two
            different envelope concepts.
  Failure mode: A reader implementing Response Actions thinks Trellis
                COSE_Sign1-wraps the IntakeHandoff document itself, when in
                reality the COSE_Sign1 envelope wraps the WOS-side
                `wos.kernel.intake_accepted` event whose payload references
                the handoff bytes (per wos-trellis-verification.md
                WOS-TV-007/008/009).

INVARIANT 5:
  Statement: Respondent Ledger is Formspec-owned and response-scoped (ADR-0084
             D-1); "Case Ledger" is the canonical Trellis scope name (Trellis
             Core §1.2); the Trellis-side "Respondent Ledger / Subject Ledger"
             naming is retired downstream when WOS-bound (trellis/CLAUDE.md).
  Source: ADR-0084 D-1; trellis-core.md §1.2; trellis/CLAUDE.md
  Status: PARTIAL DRIFT — see Finding 6.
  Evidence: §11.6 reopens a settled question. ADR-0084 D-1 explicitly says
            "The Respondent Ledger remains Formspec-owned and response-scoped"
            and the spec note never cites that ADR. The rename §11.6 proposes
            ("Response Ledger") is not the same as the canonical Trellis-side
            scope name ("case ledger"), but the spec's substrate/projection
            framing in §4's closing paragraph implies they cohere.
  Failure mode: A reader concludes the rename is open and undertakes a
                stack-wide audit-naming refactor without ADR-0084's framing.

INVARIANT 6:
  Statement: Layered sieve additivity (companion specs MUST NOT alter core
             processing semantics — Formspec SKILL.md Tier-Precedence note).
  Source: formspec/specs spec architecture, SKILL.md decision tree
  Status: NEWLY-INTRODUCED (Response Actions does add runtime-operations
          semantics Definition does not currently carry).
  Evidence: §3.3 explicitly claims "Adds the XForms-derived runtime layer that
            Formspec's existing model (Definition) doesn't carry." This is
            new behavioral semantics — actions, validation modes, lifecycle
            policy, transaction semantics. The "additive" framing in §1
            therefore needs sharpening: it's additive to Definition's *model*,
            but it introduces runtime-operations semantics that the
            existing Processing Model (Core S2.4) does not have.
  Failure mode: A reader takes §1's "additive" claim at face value and
                under-budgets the conformance-fixture work required when
                Response Actions ratifies.
```

## 2.4 User-Value Analysis

- **User-visible outcome.** With Experience + Response Actions + Trace, Formspec becomes capable of *generating* UI from semantic source — wireframes that are clickable semantic prototypes (§5.2 last paragraph), AI authoring at named levels of abstraction (§5.2), regeneration that preserves designer edits (§5.3), multi-output projections from one Definition (§5.2). This is a real product capability and traces to a beneficiary (form authors at LLM-authoring time + designers regenerating + AI agents proposing UI).
- **Beneficiary.** Form authors (initial), designers regenerating against source changes (medium-term), AI-authoring loop (medium-term), compliance reviewers (Trace consumer), multi-projection consumers — web, mobile, PDF, agent, CLI (long-term).
- **Conceptual debt added.** Three new layer specs, two new schema corpora (Experience + Response Actions), a relationship-index spec (Trace) with predicate set deferred, four new Component reference fields, refs-only locale discipline. Net **substantial** at the spec layer; restraint comes from §11.2's deferral of the Trace query model and §12's named ordering.
- **Conceptual debt paid down.** The note retires implicit drift between hand-built UI and Definition's runtime model (§3.3's "buttons are UI objects and host-app code secretly owns the real behavior") — a real ongoing debt source. The seam table in §4, even with its errors (Findings 1, 2, 5), surfaces stack-level vocabulary drift that previously lived only in three submodules' CLAUDE.md files.
- **Falsifiability test.** Six months from now: do form authors using LLM-authoring loops generate Experience+Component drafts that designers iterate on? If the dominant authoring pattern is still hand-built Component trees with no Experience, the layers paid spec debt and shipped no user value.
- **Smaller-shape candidates.** (i) Skip Trace; ship Experience + Response Actions only. §11.2 already defers Trace's predicate set, but the *posture* of Trace is committed in §6 — that posture could be deferred entirely until a consumer asks for it. (ii) Skip Experience; bind the abstract intent inside Response Actions's `lifecycle` shape. (iii) Land Response Actions only as a Definition v2 (the §11.3 re-open trigger). Each is smaller; the spec note's choice (all three new layers + a §12 ordering) is the *largest* shape it could have taken.

## 2.5 Counterfactual Analysis

- **Kill criterion.** If, after the Response Actions companion spec ratifies, host applications still own action lifecycle semantics outside Formspec — buttons in the Component tree still wired to host-app code that secretly runs preconditions and validation — Response Actions failed.
- **Counter-decision.** A counter-decision: **don't add new layers; extend Definition.** Definition v2 absorbs actions, submissions, validation modes, lifecycle policy. CAMELEON-ladder abstraction lives in tooling, not in the spec. This is what §11.3's re-open trigger describes. What would simplify: one spec to maintain, one schema, no derivation pipeline, no merge rules. What would break: multi-projection consistency (every projection re-implements the runtime layer), AI authoring (one giant spec is harder to propose against), Trace (no longer needs a separate index because there's only one artifact).
- **Removal probe.** Remove Trace entirely. What breaks first? §5.3 regeneration merge — without Trace, "regeneration falls back to diff heuristics." Loudness: low at v0 (Trace already deferred per §6 last paragraph and §11.2); high at v2 when AI authoring expects per-element explanations. Trace's removal-cost grows non-linearly with adoption.
- **Sibling subsumption.** Response Actions overlaps with WOS Kernel §11.3 `acceptIntakeHandoff` and with WOS `signature` embedded block. The spec note correctly identifies the Formspec-side / WOS-side seam in §3.3 prose, but §4 then partially confuses the envelope discipline (Finding 1). The signature embedded block in WOS is not mentioned at all — when a Response Action runs a submission that pulls signature evidence, where does the signature scope live? Spec is silent.
- **Six-month-future critic.** Most likely flags: (a) §4 seam table conflates the IntakeHandoff payload envelope with the COSE_Sign1 event envelope around the WOS-side admit event; (b) §11.6 rename re-opens a settled question (ADR-0084 D-1) without citing the settling ADR; (c) Trace posture is committed without a consumer (§6 last paragraph admits this — "becomes load-bearing when…"). The next reviewer is most likely to say "kill Trace until consumer arrives" and "fix §4 to forward to wos-trellis-verification.md."

## 2.6 Findings

```text
FINDING 1:
  Severity: BLOCKER
  Category: named-seam, intent-vs-shape, citation-by-vibes
  Location: §4 row 2 "Intake Handoff" — Trellis column
  Description: The §4 Trellis column for Intake Handoff claims Trellis "owns"
               the "Cryptographic envelope wrapping the payload — COSE_Sign1
               tag-18 with protected-header labels, Ed25519 signature,
               domain-separation hashing" and cites `trellis-core.md §18.2`.
               §18.2 is the export-ZIP required-archive-members listing; it
               does NOT define a COSE_Sign1 envelope around the
               `IntakeHandoff` document. What actually exists:
                 (a) An optional chain-derived export catalog member
                     `063-intake-handoffs.cbor` (Trellis Core §6.7 +
                     §18.2:1402) that carries Formspec IntakeHandoff bytes
                     plus canonical Response bytes for offline `responseHash`
                     verification — bound by digest in
                     `ExportManifestPayload.extensions
                     ["trellis.export.intake-handoffs.v1"]`.
                 (b) The COSE_Sign1 envelope wraps the WOS-side
                     `wos.kernel.intake_accepted` event whose payload
                     references the handoff bytes — pinned normatively by
                     `wos-trellis-verification.md` WOS-TV-007/008/009, not by
                     Trellis Core.
               The seam therefore has three columns:
                 Formspec: payload schema + canonical-Response bytes
                 WOS:      `acceptIntakeHandoff` + canonical event shape
                 Trellis:  digest-bound export-catalog row + envelope around
                           the WOS event (per wos-trellis-verification.md)
               The current row collapses (a) and (b) into "envelope wrapping
               the payload," which is structurally wrong. The
               `wos-trellis-verification.md` reference (cited downstream of
               the WOS column in §4) does name WOS-TV-007/008/009 but never
               clarifies the Trellis-column claim's structural shape.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §4 row 2 Trellis column
    - trellis/specs/trellis-core.md §18.2:1402 — export member listing only
    - trellis/specs/trellis-core.md §6.7 + §6 catalog extensions:1208 — chain-
      derived export catalog members
    - trellis/specs/wos-trellis-verification.md WOS-TV-007/008/009:73-75 — the
      actual normative pin for IntakeHandoff envelope verification
  Recommendation: RESHAPE — Rewrite the §4 Intake Handoff row's Trellis column
                  to: "Optional chain-derived export catalog member
                  (`063-intake-handoffs.cbor`) carrying the Formspec
                  IntakeHandoff and canonical Response bytes for offline
                  `responseHash` verification, bound by digest in the export
                  manifest. The COSE_Sign1 envelope wraps the WOS-side
                  `wos.kernel.intake_accepted` event per
                  wos-trellis-verification.md WOS-TV-007/008/009, not the
                  IntakeHandoff document itself." Cite trellis-core.md §6.7,
                  §18.2, and wos-trellis-verification.md WOS-TV-007/008/009.

FINDING 2:
  Severity: BLOCKER
  Category: named-seam, ownership, sibling-conflict
  Location: §4 row 3 "Posture Declaration"
  Description: The row places Posture Declaration entirely in the Trellis
               column (em-dash in Formspec and WOS columns) and cites
               `trellis-operational-companion.md §11`. This is doubly wrong:
                 (a) The Posture Declaration schema lives in Formspec —
                     `formspec/schemas/posture-declaration.schema.json` with
                     `$id: https://formspec.org/schemas/posture-declaration/1.0`.
                     Formspec's SKILL.md Schema Decision Tree row
                     "Posture declaration (admission policy)" routes to
                     `posture-declaration.schema.json`.
                 (b) ADR-0090 establishes Posture Declaration as a
                     per-deployment configuration object **consumed by WOS
                     admission**: "Posture Declaration is a per-deployment
                     configuration object consumed by WOS admission. It
                     lives at a deployment-controlled URL; WOS workflows
                     reference it" (ADR-0090 §Decision:21-28).
               Trellis Operational Companion §11 covers the **operator's
               publication and honesty obligations** when a Trellis
               deployment is involved — that is one face of the artifact,
               not the artifact's sole ownership. The full seam is:
                 Formspec: schema authority
                 WOS:      admission consumer
                 Trellis:  operator-publication honesty floor (when adopted)
               The em-dashes in two columns hide the cross-stack contract
               surface this note is supposed to surface.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §4 row 3
    - formspec/schemas/posture-declaration.schema.json (exists)
    - thoughts/adr/0090-stack-posture-declaration-object.md §Decision:21-28
    - formspec/.claude-plugin/skills/formspec-specs/SKILL.md
      "Posture declaration" decision-tree row
    - trellis/specs/trellis-operational-companion.md §11 (operator-side
      obligations only)
  Recommendation: RESHAPE — Fill in all three columns. Formspec column:
                  "Schema authority — `formspec/schemas/
                  posture-declaration.schema.json`." WOS column: "Admission
                  consumer per ADR-0090; workflow references the declaration
                  URL; admission enforces the declared posture." Trellis
                  column: "Operator publication and honesty obligations when
                  a Trellis-bound deployment claims a posture
                  (`trellis-operational-companion.md` §11)." Cite ADR-0090.

FINDING 3:
  Severity: CONCERN
  Category: intent-vs-shape, debt-accretion, leaky-abstraction
  Location: §3.3, §3.3.1, §3.3.2
  Description: The note opens (§1) with three additivity properties: "Additive.
               New layers project *from* Definition, never *into* it. They
               cannot modify Definition semantics, override Component or
               Theme, or redefine Mapping." §3.3.2's transaction semantics
               then introduces:
                 - preconditions checked
                 - effects applied in declared order
                 - validation run (per mode)
                 - evidence produced
                 - durable events recorded
                 - commit (or rollback on failure)
               This is a runtime-operations transaction layer that Definition's
               existing Processing Model (Core S2.4 — Rebuild → Recalculate
               → Revalidate → Notify) does not carry. The §3.3.2 last
               sentence "A UI MUST NOT observe state where preconditions
               passed but effects failed silently. The transaction boundary
               is part of the spec, not engine-private" makes the new
               transaction load-bearing on conformance. That is not
               "additive to Definition" in the same sense Theme or
               References are — those don't add new processing-model phases.
               The note's §11.3 re-open trigger ("If Response Actions starts
               changing Definition behavior, it becomes an explicit behavioral
               overlay") implicitly acknowledges this risk but treats it as a
               future failure mode rather than a present framing tension.
               Sharper would be: §1 should distinguish "additive to
               Definition's *data model*" (true) from "additive to
               Definition's *runtime processing*" (in tension — Response
               Actions wraps and extends it).
  Evidence chain:
    - 2026-05-20-semantic-layers.md §1 (additivity claim #1)
    - 2026-05-20-semantic-layers.md §3.3 ("Adds the XForms-derived runtime
      layer that Formspec's existing model (Definition) doesn't carry")
    - 2026-05-20-semantic-layers.md §3.3.2 (transaction semantics)
    - 2026-05-20-semantic-layers.md §11.3 (re-open trigger)
    - formspec/.claude-plugin/skills/formspec-specs/SKILL.md "Processing
      model is synchronous 4-phase" rule
  Recommendation: RESHAPE — In §1, refine the additivity property to
                  distinguish data-model additivity (Experience, Trace) from
                  runtime-operations extension (Response Actions). Name
                  Response Actions as a *runtime extension* of Definition's
                  Processing Model, not as a peer-additive layer like Theme.
                  Or, alternatively, narrow §3.3.2's transaction shape to a
                  recipe over Definition's existing Processing Model rather
                  than a parallel transaction. The Response Actions companion
                  spec (§12 item 3) is where this lands normatively; the
                  conceptual note should at minimum not paper over the
                  tension.

FINDING 4:
  Severity: CONCERN
  Category: dependency-chain, scope, sibling-conflict
  Location: §8, §12
  Description: §8 declares Locale spec a *hard prerequisite* for Component
               ratification. §12 then orders:
                 1. Locale companion spec
                 2. Experience companion spec
                 3. Response Actions companion spec
                 4. Component reference additions
                 5. Trace query / cache spec
               The Locale spec is referenced by short name only — no path,
               no `.md` link. The Formspec specs tree includes
               `formspec/specs/locale-spec.md` (1263 lines, per the
               `formspec-specs` skill SKILL.md) — but the note never confirms
               whether that spec already exists at the depth §8 requires
               (refs-only ratification, `*Ref` grammar, fallback rules,
               resolution at render time) or whether Locale needs new work.
               This matters for §12 sequencing:
                 - If Locale already covers §8's needs, the §12 prerequisite
                   chain decouples — Experience + Response Actions can be
                   drafted in parallel.
                 - If Locale needs new ratification work to support §8's
                   `*Ref` grammar, the §12 chain serializes — everything
                   downstream waits.
               §11 (open questions) does not pose a re-open trigger on Locale
               readiness, which is the load-bearing prerequisite.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §8
    - 2026-05-20-semantic-layers.md §12
    - formspec/specs/locale/locale-spec.md (file exists; depth vs §8 needs
      not audited in this review)
    - formspec/.claude-plugin/skills/formspec-specs/SKILL.md "Locale spec"
      reference-map row
  Recommendation: RESHAPE — In §8, cite the existing Locale spec path
                  (`formspec/specs/locale/locale-spec.md`) and state whether
                  it already satisfies §8's `*Ref` grammar, fallback, and
                  resolution requirements — or what gap §12 item 1 must
                  close. In §12, mark Locale item 1 as either "audit-only
                  pass" (if Locale is sufficient) or "new spec work required"
                  (if not). Without that audit, §12 is a sequence with an
                  unstated dependency-graph blocker.

FINDING 5:
  Severity: CONCERN
  Category: named-seam, scope (omission)
  Location: §4 (cross-stack seam table)
  Description: The §4 table names three seams: Respondent Ledger, Intake
               Handoff, Posture Declaration. The note's reviewer prompt
               explicitly asks whether Validation Report and Verification
               Receipt should appear. They should:
                 - **Validation Report.** §3.3.1's example submission has
                   `"outputs": [{ "type": "validationReport" }, ...]`.
                   `formspec/schemas/validation-report.schema.json` exists.
                   WOS's `acceptIntakeHandoff` (Kernel §11.3) references
                   "any stored ValidationReport referenced by the handoff
                   still resolves" (§11.4.2). Cross-stack contract surface
                   exists; the §4 table omits it.
                 - **Verification Receipt.** ADR-0088 establishes the
                   Verification Receipt as a tri-state crypto-verifier
                   output consumed by WOS admission. Schema lives in Formspec
                   (`verification-receipt.schema.json`). Same three-column
                   shape as Posture Declaration: Formspec schema authority,
                   WOS admission consumer, Trellis optional signed-receipt
                   evidence. The §4 table omits it.
               The omissions matter because §4's stated purpose is "Several
               artifacts have split or shared authority across Formspec,
               Trellis, and WOS. A Formspec-side spec that references one of
               these MUST point downstream at the relevant owner." That
               MUST applies to every split-authority artifact, not just the
               three named.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §3.3.1 (submission outputs reference
      validationReport)
    - formspec/schemas/validation-report.schema.json (exists)
    - work-spec/specs/kernel/spec.md §11.4.2:1937-1944 (acceptIntakeHandoff
      ValidationReport check)
    - formspec/schemas/verification-receipt.schema.json (exists)
    - thoughts/adr/0088-stack-verification-receipt-shape.md (referenced by
      SKILL.md)
    - 2026-05-20-semantic-layers.md §4 opening paragraph (MUST claim)
  Recommendation: RESHAPE — Add two rows to the §4 table: Validation Report
                  (Formspec schema authority; WOS consumes through
                  acceptIntakeHandoff; Trellis no native role unless wrapped
                  via Respondent Ledger Trellis profile §22.2) and
                  Verification Receipt (Formspec schema authority; WOS
                  admission consumer; Trellis optional signed COSE_Sign1
                  receipt). Both already exist as schemas and are cited
                  across stack boundaries; their absence from the seam table
                  is a coverage gap.

FINDING 6:
  Severity: CONCERN
  Category: unstated-assumption, sibling-conflict
  Location: §11.6 "Respondent Ledger naming"
  Description: §11.6 proposes renaming "Respondent Ledger" to "Response
               Ledger" and frames it as cohering with §4's substrate/projection
               pattern. The proposal does not cite ADR-0084. ADR-0084 D-1
               explicitly settles the boundary question: "The Respondent
               Ledger remains Formspec-owned and response-scoped" and goes
               on to enumerate what Formspec owns / does not own.
               ADR-0084's settling does not say "the name 'Respondent
               Ledger' is permanent" — it says the boundary is set; renaming
               is in scope. But:
                 (a) The proposal frames itself as "[a] more accurate name"
                     in language that re-opens a settled boundary question
                     rather than acknowledging that the *boundary* is settled
                     and only the *name* is open.
                 (b) The substrate/projection-pattern claim in §4 closing
                     paragraph implies coherence with the Trellis-side
                     canonical scope ("case ledger" per Trellis Core §1.2).
                     A Trellis-coherent rename would be **"response ledger"**
                     (lowercase, scope-style, paralleling "case ledger") —
                     not **"Response Ledger"** (Title Case, artifact-style).
                     The note conflates the two registers.
                 (c) trellis/CLAUDE.md states "'Respondent Ledger' / 'Subject
                     Ledger' naming is retired downstream when WOS-bound" —
                     that's about the **Trellis-side scope name**, not the
                     **Formspec-side artifact name**. ADR-0084 D-1 keeps the
                     Formspec-side artifact's identity.
               The re-open trigger ("a major-version cleanup of the ledger
               spec, or a stack-wide audit-naming refactor") is reasonable,
               but until that trigger fires, surfacing the rename as a §11
               open question without citing ADR-0084 risks downstream
               readers thinking the boundary itself is reopening, not just
               the naming question.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §11.6
    - thoughts/adr/0084-respondent-ledger-boundary-cleanup.md §D-1:27-48
    - trellis/specs/trellis-core.md §1.2:73-85 (canonical scope: "case ledger")
    - trellis/CLAUDE.md "Case ledger" / Respondent Ledger naming rule
    - work-spec/CLAUDE.md ADR-0084 D-1 quoted directly
  Recommendation: RESHAPE — In §11.6, cite ADR-0084 D-1 as the settled
                  boundary precedent. Explicitly state the boundary is not
                  reopening; only the name is open. If the substrate/
                  projection-pattern coherence is the motivation, name the
                  Trellis-side scope ("case ledger" — lowercase) explicitly
                  and propose the rename to match that register
                  ("response ledger" — lowercase, scope-style) rather than
                  the artifact-style "Response Ledger" the §11.6 prose
                  proposes. Or, alternatively, defer the rename question
                  entirely until the §11.6 re-open trigger fires; the spec
                  note is large enough already.

FINDING 7:
  Severity: CONCERN
  Category: scope, sibling-conflict (no-man's-land)
  Location: §3.3 last paragraph + §4 row 2
  Description: §3.3 commits "The corresponding post-handoff surface is WOS
               Kernel `acceptIntakeHandoff` (§11.3 Instance Operations) ...
               The two seams never overlap on the same lifecycle moment."
               That statement is correct for *normal* intake-acceptance
               paths. But WOS Kernel §11.4.1 normative algorithm has eight
               steps that include resolution of replay identity, durable
               intake receipt persistence, host acceptance policy
               evaluation, finalization of binding-owned provenance — any
               of which can take a non-zero wall-clock window. In that
               window:
                 - Formspec's Response Actions has finished its transaction
                   (§3.3.2: "commit (or rollback on failure)").
                 - WOS has not yet emitted `intakeAccepted` / `intakeRejected`
                   / `intakeDeferred`.
                 - The respondent's UI sees "submitted" but the case is in
                   limbo.
               Who owns the **respondent-visible state during the WOS
               intake-acceptance window**? Spec is silent. The Respondent
               Ledger has events for `response.completed`, but not for
               "WOS has not yet decided." If WOS emits `intakeDeferred`
               (Kernel §11.3 outcome semantics), what Formspec-side
               artifact records that the respondent's submission is
               provisional? The §3.3 lifecycle policy example
               (`emit: ["action.completed", ...]`) does not cover this seam.
               This is a no-man's-land lifecycle moment — present in WOS
               Kernel §11.3-§11.4 but unreferenced in the Formspec-side
               §3.3 lifecycle.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §3.3 closing paragraph
    - 2026-05-20-semantic-layers.md §3.3.1 lifecycle policy example
    - work-spec/specs/kernel/spec.md §11.3:1893 (intakeAccepted /
      intakeRejected / intakeDeferred outcomes)
    - work-spec/specs/kernel/spec.md §11.4.1:1907-1932 (eight-step
      normative algorithm)
    - work-spec/specs/kernel/spec.md §11.4.3:1947-1953 (outcome semantics)
  Recommendation: RESHAPE — In §3.3, add one paragraph naming the
                  intake-acceptance window as the post-Response-Actions /
                  pre-WOS-acceptance lifecycle slice. Name the
                  Formspec-side artifact (or seam) that records the
                  provisional state — or explicitly state it is host-app
                  scope. If host-app scope, the note's earlier framing
                  ("host-app code secretly owns the real runtime behavior
                  — drift that Formspec exists to eliminate") cuts against
                  the silence. The Response Actions companion spec (§12
                  item 3) is the right place to lock this; at minimum,
                  surface it in §11 as an open question with a re-open
                  trigger.

FINDING 8:
  Severity: OBSERVATION
  Category: scope, sibling-conflict
  Location: §3.7, §3.8, §6
  Description: §3.7 (References) distinguishes from Trace (§3.8): "References
               attaches external resources *to* artifacts; Trace indexes
               structural relationships *between* artifacts." The
               distinction is clear in prose. §6 then lists Trace example
               queries:
                 "Which reference explains which target?"
                 "Which receipt verifies which signature against which posture?"
               Both queries cross References territory: the first answers
               "which Reference document points at which item" — which is a
               structural fact References itself owns. The second crosses
               Verification Receipt territory (Finding 5). Trace claims
               authority to index *all* structural relationships, including
               those that adjacent specs already own at the artifact level.
               This is not a fatal overlap, but the §3.7-vs-§3.8 boundary
               will get tested as soon as a Trace consumer asks "should I
               build my reference-resolution index using References content
               or Trace's index of References?" The note's defense
               ("Trace is generated; source artifacts win on conflict")
               handles the resolution rule but not the *which-tool-to-reach-
               for* question, which is what matters for adopter ergonomics.
  Evidence chain:
    - 2026-05-20-semantic-layers.md §3.7, §3.8, §6
  Recommendation: KEEP — for v0 a posture-only commitment. The §11.2
                  re-open trigger ("a named consumer specifies which queries
                  it needs") is the right place for this to surface
                  concretely. Mention briefly in §6 that Trace indexes
                  relationships *also* visible at the artifact level and
                  source-artifact authority wins.
```

## 2.7 Verdict

```text
VERDICT: RECONSIDER

Justification:
  - Intent vs. shape: DIVERGES — §4's three-column seam table is the
    load-bearing cross-stack contract artifact in the note, and three of
    its claims are structurally wrong or incomplete: Intake Handoff (Finding
    1, BLOCKER), Posture Declaration (Finding 2, BLOCKER), and the missing
    Validation Report / Verification Receipt rows (Finding 5). The body
    prose in §3.3 is clean; the seam-table summary in §4 contradicts it on
    the IntakeHandoff envelope shape.
  - User-value claim: SUPPORTED — wireframes-as-clickable-semantic-prototypes
    (§5.2), AI authoring at named levels of abstraction, and multi-output
    projection from one Definition are real product capabilities with
    real beneficiaries. Falsifiability test is concrete.
  - Commitment status: DRIFTING — Invariant 1 (additivity) is sharper than
    §3.3.2 honors (Finding 3); Invariant 5 (ADR-0084 D-1) is reopened
    without citation in §11.6 (Finding 6); Invariant 4 (no-overlap) is
    correct in §3.3 but partially confused in §4 (Finding 1) and silent on
    the intake-acceptance window (Finding 7).
  - Conceptual debt delta: ACCRETES — three new layer specs + four new
    Component reference fields + a relationship index spec, against the
    drift the layers prevent. The §11 deferrals (Trace query model,
    primitives) keep the accretion bounded for v0; the §12 ordering with
    Locale as a hard prerequisite (Finding 4) is at risk of serializing
    a chain that could parallelize.
  - Sibling subsumption: PARTIAL — §4 forwards correctly for Respondent
    Ledger (Trellis §22.2 owns the binding) but mis-forwards for Intake
    Handoff and Posture Declaration. ADR-0084, ADR-0090, ADR-0095, ADR-0106
    are not cited at all and at least the first two should be load-bearing
    in §4 and §11.6.
  - Confidence: HIGH — every BLOCKER finding has direct citation to
    spec/ADR text that contradicts the note's claim. The CONCERN findings
    are tractable in the same edit pass.

Concrete reshape:
  1. Rewrite §4's Intake Handoff row Trellis column per Finding 1.
  2. Fill in all three columns of §4's Posture Declaration row per Finding 2;
     cite ADR-0090.
  3. Add Validation Report and Verification Receipt rows to §4 per Finding 5.
  4. Cite ADR-0084 D-1 in §11.6 and clarify that the boundary is settled;
     only the name is open per Finding 6.
  5. Refine §1's "additive" property to distinguish data-model additivity
     from runtime-operations extension per Finding 3.
  6. In §3.3, name the WOS intake-acceptance window as a seam concern per
     Finding 7 (either lock it here or surface as a §11 open question).
  7. In §8 and §12, confirm whether the existing Locale spec satisfies the
     §8 prerequisite or whether §12 item 1 is new spec work per Finding 4.

Findings 1, 2, and 5 must land before the note advances from "provisional
v0" to "stable conceptual baseline." Findings 3, 4, 6, 7 can land in a
follow-on pass but should not be ignored. Finding 8 is an OBSERVATION; no
action required at v0.
```

## 2.8 Relevant Paths

- `/Users/mikewolfd/Work/formspec-stack/formspec/thoughts/specs/2026-05-20-formspec-semantic-layers.md` — artifact under review
- `/Users/mikewolfd/Work/formspec-stack/trellis/specs/trellis-core.md` (§1.2:73-85, §6.7:1208, §18.2:1385-1417, §22:2574-2618) — Trellis-side load-bearing references
- `/Users/mikewolfd/Work/formspec-stack/trellis/specs/wos-trellis-verification.md` (WOS-TV-007/008/009) — actual Intake Handoff envelope discipline
- `/Users/mikewolfd/Work/formspec-stack/work-spec/specs/kernel/spec.md` (§11.3:1886, §11.4:1903-1953) — `acceptIntakeHandoff` algorithm + outcome semantics
- `/Users/mikewolfd/Work/formspec-stack/formspec/specs/audit/respondent-ledger-spec.md` (§6.4:303-313, §15A:1176-1213) — actor.kind + Profile A/B/C
- `/Users/mikewolfd/Work/formspec-stack/thoughts/adr/0073-stack-case-initiation-and-intake-handoff.md` — Intake Handoff parent ADR
- `/Users/mikewolfd/Work/formspec-stack/thoughts/adr/0084-respondent-ledger-boundary-cleanup.md` (§D-1:27-48) — Respondent Ledger boundary precedent (uncited in §11.6)
- `/Users/mikewolfd/Work/formspec-stack/thoughts/adr/0090-stack-posture-declaration-object.md` — Posture Declaration ownership (uncited in §4)
- `/Users/mikewolfd/Work/formspec-stack/formspec/schemas/posture-declaration.schema.json` — Formspec-owned Posture Declaration schema
- `/Users/mikewolfd/Work/formspec-stack/formspec/schemas/validation-report.schema.json` — Validation Report schema (missing from §4)
- `/Users/mikewolfd/Work/formspec-stack/formspec/schemas/verification-receipt.schema.json` — Verification Receipt schema (missing from §4)

---

# 3. codex-rescue — Adversarial Review via Codex

Target: [`2026-05-20-formspec-semantic-layers.md`](./2026-05-20-formspec-semantic-layers.md). All 618 lines read.

## 3.1 Weak Architectural Claims

- **MAJOR — §1 / §10, lines 21-27 and 534-540.** Quote: "Each new layer maps cleanly to one tradition" and "Experience makes UI derivable / Response Actions makes UI executable / Trace makes UI explainable."
  Finding: the triad is cleaner than the architecture. Response Actions is not merely "executable"; the rendering pipeline explicitly includes it: "Definition + Experience + Response Actions → Component → final UI" (line 60), and §5 says "Component drafts derive from `Definition + Experience + Response Actions`" (line 259).
  Consequence: the layer split is being justified by a slogan while the actual dataflow makes Response Actions part of derivation, not an orthogonal execution layer.

- **BLOCKER — §1 / §3.3 / §11.3, lines 35, 98-103, 140-146, 196-201, 562-566.** Quote: "New layers project from Definition, never into it" and "action preconditions," "effects," "preconditions → effects → validation → evidence → commit."
  Finding: "additive, never into Definition" does not survive the precondition/effect machinery. Preconditions read model state; effects trigger submission, validation, evidence, ledger records, and commit behavior. The spec even admits leakage: "If it starts changing Definition behavior, it becomes an explicit behavioral overlay" (line 564).
  Consequence: the core ownership claim is unstable at the exact point where runtime semantics become real.

- **MAJOR — §6, lines 428-457.** Quote: "Trace is what makes the result trustworthy" and "v0 commitment: posture only."
  Finding: Trace is sold as the trust mechanism while the actual predicate set and query language are deferred. That is not a weak v0; it is a trust claim with no contract.
  Consequence: "explainable" becomes architectural branding, not an implementable assurance layer.

## 3.2 Missing Alternatives

- **MAJOR — §1 / §2 / §5, lines 29-31, 60, 82, 92, 259.** Quote: "Experience" owns "action references," while "Response Actions" owns runtime operations, and both feed Component derivation.
  Finding: the spec never evaluates a single combined Behavior layer covering abstract task flow plus runtime actions. The current split is asserted, not chosen.
  Consequence: two companion specs may be created before proving that the seam between task intent and executable action is real.

- **MAJOR — §1 / §5, lines 13 and 259.** Quote: "That spine is sufficient when someone hand-builds UI" but "not sufficient when the goal is to be generated."
  Finding: the spec never tests whether Definition-only Component derivation is sufficient for ordinary forms. It jumps from "hand-built UI" to "generated from semantic source" and assumes Experience is mandatory.
  Consequence: the architecture may impose Experience authoring even where Definition already contains enough structure to generate useful UI.

- **MINOR — §3.4 / §6, lines 208-217 and 426-457.** Quote: Component already adds `unitRef`, `taskRefs`, `actionRef`, `conceptRefs`, while Trace is "posture only."
  Finding: the spec never evaluates whether existing refs plus queries over source artifacts are enough for v0 instead of a named Trace layer.
  Consequence: Trace may become a separately named artifact whose v0 value is already covered by references embedded elsewhere.

## 3.3 Inverted Reasoning

- **MAJOR — §1 / §10, lines 15-21 and 526-542.** Quote: "Three engineering traditions inform the missing layers" and "The three new layers map cleanly."
  Finding: the standards grid appears to drive the architecture. The document repeatedly proves the layer count by mapping to UsiXML/CAMELEON, XForms, and XIML, then says "The goal is not standards parity" (line 542).
  Consequence: the spec risks fitting Formspec to prior-art taxonomy rather than deriving boundaries from Formspec's own required behaviors.

- **MAJOR — §1 / §3.3, lines 17 and 92.** Quote: "Without it, buttons are UI objects and host-app code secretly owns the real behavior."
  Finding: the anti-drift claim is treated as proof that Response Actions must exist, but the spec does not independently show which host behaviors must be portable Formspec semantics.
  Consequence: any host behavior can be pulled into Response Actions under the banner of eliminating drift.

- **MAJOR — §6 / §11.2, lines 428, 455-457, 558-560.** Quote: "Trace is what makes the result trustworthy" and "the query language are deferred."
  Finding: the conclusion precedes the requirement. Trustworthiness is claimed before the spec has a named consumer, predicate set, query model, or conformance shape.
  Consequence: Trace can justify itself indefinitely without becoming falsifiable.

## 3.4 Over-Specification

- **MAJOR — §3.3.1, lines 99, 129, 181-188.** Quote: "validation modes (closed enum: save / submit / demand / autosave)."
  Finding: the validation enum is locked at v0 before the host-app interaction contract exists; line 129 says that contract is still for the formal companion spec.
  Consequence: runtime authors inherit a closed mode taxonomy before the actual runtime contract has been proven.

- **MAJOR — §3.3 / §3.3.1, lines 102, 111, 170-177.** Quote: "which events emit transiently vs record durably."
  Finding: "emit" versus "record" is asserted as a lifecycle policy, but no semantic criterion distinguishes the two lists. The example records `draft.saved` but only emits `submission.completed`.
  Consequence: audit behavior becomes convention by event name, not a portable semantic rule.

- **MINOR — §5.2, lines 259, 279-281.** Quote: "The derivation is the spec contract; how it runs is implementation" and `generation.strategy` is "a registered enumeration."
  Finding: the spec says implementation is outside the contract, then registers implementation strategy names.
  Consequence: tool metadata becomes a portability surface without proving it belongs there.

- **MINOR — §3.2 / §5.1, lines 82 and 263-275.** Quote: `unit.kind` "drives default Component patterns" and the closed enum lands later.
  Finding: the abstract UI taxonomy is being locked before real generation behavior exists.
  Consequence: future generators may have to encode domain-specific UX into a prematurely closed kind list.

## 3.5 Under-Specification

- **MAJOR — §5.1 / §5.2, lines 275 and 281.** Quote: "The mapping from `unit.kind` to Component patterns is the generator's concern" and strategies include `unit-to-card`, `unit-to-page`, `unit-to-step`, `unit-to-panel`.
  Finding: generation strategies are named but semantically empty.
  Consequence: two generators can claim the same strategy while producing incompatible Component structures.

- **MAJOR — §3.3 / §3.3.1 / §4 / §11.4, lines 97, 137, 243, 570.** Quote: action owns "actor," the example says `"actor": "respondent"`, ledger actor taxonomy admits five values, and TypedRef candidate kinds include `actor`.
  Finding: `actor` is not defined as a literal, ref, ledger actor kind, Experience actor, or authorization principal.
  Consequence: action visibility, permission, audit attribution, and ledger recording are left to implementation debate.

- **MAJOR — §3.3.1, lines 97 and 138.** Quote: `"intent": "finalize_response"`.
  Finding: `intent` has no contract. The spec never says whether it drives UI labels, analytics, policy, submission routing, audit classification, or nothing.
  Consequence: `intent` becomes decorative metadata or hidden behavior, depending on the implementer.

- **BLOCKER — §3.3, lines 100, 129, 152-164.** Quote: "effects (runSubmission, recordLedgerEvent, …)" and "Property names below are provisional v0."
  Finding: the effect model is not specified. The ellipsis is where the runtime contract should be.
  Consequence: a competent engineer can implement the example, not a portable Response Actions runtime.

- **BLOCKER — §3.3.1 / §3.3.2, lines 185 and 197-198.** Quote: `submit` "blocks effects if invalid," but the transaction order says "apply effects in declared order" before "run validation."
  Finding: the transaction order contradicts the validation mode semantics.
  Consequence: submit behavior is ambiguous at the most important runtime boundary.

- **MAJOR — §3.3 / §3.3.1, lines 125 and 140-142.** Quote: "FEL drives action preconditions" with examples `valid(#)` and `$certificationAccepted = true`.
  Finding: the evaluation context is unspecified: what `#` denotes, how `$` variables bind, which response snapshot is read, and whether validation reports are cached or recomputed.
  Consequence: precondition behavior will diverge across runtimes.

## 3.6 Naming Wobbles

- **MAJOR — §3.3 / §4 / §11.6, lines 92, 117-118, 249, 582.** Quote: "Response Actions" owns save, submit, evidence, and Intake Handoff, while "Respondent Ledger" is actually response-scoped.
  Finding: "Response Actions" inherits the same response/respondent ambiguity the spec identifies in the ledger name. It also undernames orchestration, handoff production, validation, and evidence.
  Consequence: the vocabulary will blur response mutation, runtime operations, ledger events, and handoff production.

- **MAJOR — §11.6, lines 582-586.** Quote: "The current name is partially metonymic" and doc impact is "~131 files."
  Finding: the spec builds new architecture on a known unstable term.
  Consequence: follow-on specs will either freeze the wrong name or absorb broad terminology churn.

- **MINOR — §3.8 / §6, lines 231-233 and 449-453.** Quote: Trace is a "relationship index," not authored trace history.
  Finding: "Trace" misrepresents its referent. It sounds like audit/runtime provenance, while the spec defines a generated relationship index.
  Consequence: readers will confuse Trace with ledger/audit trails, especially because §6 asks "Which ledger event records which runtime action?" (line 445).

- **MINOR — §3.2 / §9.3, lines 72, 84, 508.** Quote: "Experience" captures task intent but "MUST NOT encode concrete layout, widget choice, or host-specific workflow."
  Finding: "Experience" is broader than the thing it names. The term suggests UX surface ownership while the spec forbids several UX-defining facts.
  Consequence: authors will put concrete UX concerns into Experience and then be told the layer does not own them.

## 3.7 Hidden Coupling

- **BLOCKER — §1 / §3.3 / §3.6 / §4, lines 36, 98-104, 109, 145-164, 225.** Quote: "Each fact has one owner," but Response Actions references Definition preconditions, Mapping payloads, Ledger events, Intake Handoff outputs, and commit semantics.
  Finding: handle references do not eliminate coupling. Response Actions cannot run without knowing enough about every downstream owner to sequence and validate behavior.
  Consequence: changes in Definition, Mapping, Ledger, or Handoff semantics can break Response Actions while the spec still claims single ownership.

- **MAJOR — §5 / §6, lines 285, 291-301, 428, 452-453.** Quote: Trace is "not part of the rendering pipeline," but "Trace verifies projections are consistent" and provides an "impact map" for regeneration.
  Finding: Trace is decoupled only by definition. As soon as regeneration or multi-output consistency matters, generation tools must read Trace or reimplement its logic.
  Consequence: v0 can claim Trace is optional while downstream tooling quietly depends on it.

- **MAJOR — §3.3 / §3.3.1, lines 111, 129, 170-177.** Quote: "The host owns its own event system," but Response Actions "emits transient lifecycle events."
  Finding: the host boundary is coupled but unspecified. Response Actions emits events into a host-owned system without defining the contract until later.
  Consequence: host integrations will define incompatible event payloads and lifecycle expectations.

- **MAJOR — §3.2 / §3.4 / §5, lines 82, 211-214, 259.** Quote: Experience units carry `actionRefs`; Component nodes carry `actionRef`; derivation uses Response Actions.
  Finding: Experience, Component, and Response Actions are mutually entangled by references even though the note presents them as cleanly separated layers.
  Consequence: companion specs cannot evolve independently without cross-version compatibility rules.

## 3.8 Conceptual Debt

- **MAJOR — §8 / §12, lines 490-492 and 596.** Quote: "Locale spec is a hard prerequisite for Component ratification."
  Finding: Component ratification is blocked behind Locale fallback and resolution rules.
  Consequence: Component reference additions and derivation work are delayed by a separate localization contract.

- **MAJOR — §6 / §11.2 / §12, lines 457, 558-560, 600.** Quote: "posture only" and "a named consumer specifies which queries it needs."
  Finding: Trace deferral has no owner, date, or required consumer.
  Consequence: the relationship index can remain permanently doctrinal while still justifying architectural claims.

- **MAJOR — §11.3, lines 562-566.** Quote: "If it starts changing Definition behavior, it becomes an explicit behavioral overlay."
  Finding: the peer-versus-overlay problem is knowingly deferred until "leakage" appears.
  Consequence: the hardest merge-semantics question is pushed into implementation failure.

- **MAJOR — §7 / §11.4 / §12, lines 467-470, 570-572, 597.** Quote: TypedRef's closed kind list is "v0 TBD" and "ratifies there."
  Finding: the spec relies on typed cross-artifact refs before defining their closed taxonomy.
  Consequence: early Component, Experience, and Trace examples may not survive the companion spec unchanged.

## 3.9 Implementation Feasibility

- **BLOCKER — §3.3.1 / §12, lines 129 and 602-604.** Quote: the formal spec later ratifies "closed enums, schemas, conformance fixtures, and the host-app interaction contract," and "This concept note carries none of those details."
  Finding: §3.3 alone is not implementable as a portable runtime. The document explicitly says the required details are absent.
  Consequence: any implementation becomes the de facto spec.

- **BLOCKER — §3.3.2, lines 192-204.** Quote: "commit (or rollback on failure)" and "transaction boundary is part of the spec."
  Finding: rollback is named but not specified: failure categories, durable event rollback, submission side effects, evidence artifact cleanup, retries, and idempotency are all absent from the text.
  Consequence: transaction semantics will fragment across runtimes.

- **MAJOR — §3.3 / §3.3.1, lines 100, 145-146, 162-164.** Quote: effects include `runSubmission`, `recordLedgerEvent`, and outputs include `validationReport` and `intakeHandoff`.
  Finding: effect and output registries are examples, not contracts.
  Consequence: runtimes cannot know which effects are valid, blocking, durable, reversible, or host-visible.

- **MAJOR — §3.3 / §3.3.2, lines 111 and 204.** Quote: "Response Actions emits transient lifecycle events for the host to consume" and "A UI MUST NOT observe state where preconditions passed but effects failed silently."
  Finding: UI observability is mandated, but the state/event interface that enforces it is not specified.
  Consequence: different engines will expose different action states, failure states, and UI timing behavior.

## 3.10 Severity Summary

| Category | BLOCKER | MAJOR | MINOR |
|---|---:|---:|---:|
| 1. Weak Architectural Claims | 1 | 2 | 0 |
| 2. Missing Alternatives | 0 | 2 | 1 |
| 3. Inverted Reasoning | 0 | 3 | 0 |
| 4. Over-Specification | 0 | 2 | 2 |
| 5. Under-Specification | 2 | 4 | 0 |
| 6. Naming Wobbles | 0 | 2 | 2 |
| 7. Hidden Coupling | 1 | 3 | 0 |
| 8. Conceptual Debt | 0 | 4 | 0 |
| 9. Implementation Feasibility | 2 | 2 | 0 |
| **Total** | **6** | **24** | **5** |

**Codex session ID:** `019e46d3-d210-7430-be0a-6366c6be6df4`
**Resume:** `codex resume 019e46d3-d210-7430-be0a-6366c6be6df4`

---

# 4. Cross-Review Consolidation

## 4.1 BLOCKERs (10 total)

### Bucket A — Editorial / citation (4)

Surgical edits, craftsman scope:

1. **§4 closing paragraph** cites kernel §13.7 for "WOS case ledger"; §13.7 is about WOS consuming Respondent Ledger evidence, not maintaining a case ledger. Real refs: §5 case state + §8.2 Facts Tier `caseLedgerId`. *(formspec-scout F2)*
2. **§11.6** "~131 files" violates stack CLAUDE.md decay-class rule §1; already drifted to 158 live. Replace with "every layer of the stack" or drop. *(formspec-scout F3)*
3. **§4 Intake Handoff row Trellis column** — §18.2 (cited) is export-ZIP archive-members listing, not COSE_Sign1 envelope definition. The envelope wraps the WOS-side `wos.kernel.intake_accepted` event per `wos-trellis-verification.md` WOS-TV-007/008/009, not the IntakeHandoff document. `063-intake-handoffs.cbor` is a separate digest-bound export catalog member. *(cross-stack-scout F1)*
4. **§4 Posture Declaration row** em-dashes Formspec and WOS columns; both wrong. `formspec/schemas/posture-declaration.schema.json` exists (Formspec schema authority); ADR-0090 places it as deployment-owned + WOS-admission-consumed. *(cross-stack-scout F2)*

### Bucket B — Spec-shape (6, all Codex)

Real spec defects:

5. **§3.3.2 transaction order contradicts validation modes.** Transaction says "apply effects → run validation"; `submit` mode says "blocks effects if invalid". Order inconsistent.
6. **Effect contract is undefined.** Examples `runSubmission, recordLedgerEvent, …` are not a contract. The ellipsis is where the runtime contract should be.
7. **`actor` field undefined.** Not specified as literal / ref / ledger actor kind / Experience actor / authorization principal.
8. **`intent` field has no contract.** Not specified whether it drives UI labels, analytics, policy, submission routing, audit classification, or nothing.
9. **FEL precondition context unspecified.** `valid(#)` — what `#` denotes. `$certificationAccepted` — how `$` variables bind. Which response snapshot is read.
10. **Rollback semantics named but not specified.** Failure categories, durable event rollback, submission side effects, evidence cleanup, retries, idempotency — all absent.

### Bucket C — Architectural-framing (Codex MAJORs, called BLOCKER-equivalent for decisions)

User-level decisions, not editorial:

- **Triadic mapping is rhetoric, not architecture.** Response Actions appears *in* the rendering pipeline (`Definition + Experience + Response Actions → Component`), not orthogonal to it.
- **"Additive, never into Definition" doesn't survive preconditions/effects.** Preconditions read model state; effects trigger validation, evidence, ledger, commit behavior.
- **Trace is sold as trustworthiness layer with no contract.** v0 posture-only means "trustworthy" is architectural branding.
- **Standards grid drives the architecture** despite §10 saying "not standards parity".
- **Whether Experience is necessary isn't tested.** Spec assumes it.
- **Single-Behavior-layer alternative** (Experience + Response Actions merged) never evaluated.
- **Hidden coupling.** Single-ownership claim doesn't hold when Response Actions cross-depends on Definition / Mapping / Ledger / Handoff.

## 4.2 CONCERNs / MAJORs (subset, beyond BLOCKERs)

- **§3.3 + §4 citation precision:** kernel §11.3 → §11.3 + §11.4 (algorithm + outcome literals live in §11.4) *(formspec-scout F1)*
- **§3.3 line 104 "envelopes" → "payloads"** (contradicts §4 split) *(formspec-scout F4)*
- **§1 additivity refinement:** distinguish data-model additivity from runtime-operations extension *(cross-stack-scout F3)*
- **§8 / §12 Locale spec:** cite existing `formspec/specs/locale/locale-spec.md` and audit gap vs §8 refs-only requirements *(cross-stack-scout F4)*
- **§4 missing rows:** Validation Report and Verification Receipt have schemas and cross-stack consumers; absence is coverage gap *(cross-stack-scout F5)*
- **§11.6 cite ADR-0084 D-1:** boundary settled; only name is open. Register issue: "Response Ledger" (Title Case, artifact-style) vs "response ledger" (lowercase, scope-style paralleling "case ledger") *(cross-stack-scout F6)*
- **§3.3 intake-acceptance window:** no-man's-land between Response Actions commit and WOS `acceptIntakeHandoff` outcome; Formspec-side state during 8-step §11.4.1 algorithm is unspecified *(cross-stack-scout F7)*

## 4.3 Missing ADR citations (load-bearing per cross-stack-scout)

- ADR-0084 D-1 — Respondent Ledger boundary cleanup
- ADR-0090 — Posture Declaration deployment-owned
- ADR-0095 — Trellis platform substrate posture
- ADR-0106 — WOS-server governance overlay

## 4.4 NITs / OBSERVATIONs (defer to follow-on)

- §1 axiom #3 flattens Component (can be hand-authored) with Trace (strictly generated) *(formspec-scout F7)*
- §11.2 "query primary" phrasing not anchored in §6 *(formspec-scout F6)*
- `unit.kind` enum duplicated between §3.2 and §5.1 *(formspec-scout F8)*
- `"validation"` vs `"validationMode"` property naming *(formspec-scout F5)*
- Trace/References boundary tested by example queries crossing References territory *(cross-stack-scout F8)*
- §4 belongs in Response Actions companion spec when that lands; pointer here when §12 item 3 ships *(formspec-scout F10)*
