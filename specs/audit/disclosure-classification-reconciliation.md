# Reconciled Formspec Disclosure Classification Axis

**Status:** Accepted  
**Date:** 2026-10-23  
**Ticket:** `fs-lb8y`  
**Owner:** DATA Concern Port (`sys:formspec`)  
**Links:** `respondent-ledger-spec.md`, `thoughts/adr/0159-product-substrate-recognition.md` §Follow-on work item 8, `formspec/TODO.md` (`fs-du1p`, `fs-fvgk`)

---

## 1. Context and Problem Statement

Two competing disclosure classification proposals existed in the Formspec ecosystem:

1. **`accessControl.class`** — Originating from ADR 0074 (`thoughts/adr/0074-formspec-native-field-level-transparency.md`, `Proposed`), proposing field-level access classes, bucketed response encryption, key bags, and a closed "Access-Class Registry". While `respondent-ledger-spec.md` §7.8 referenced `accessControl.class` and schema fields `ChangeSetEntry.accessClass` / `DataErasedData.classesErased`, the property was declared in zero Definition schemas and the Access-Class Registry companion was never implemented.
2. **`x-data-classification`** — Proposed in `formspec/TODO.md` (`fs-du1p`) and compliance research (`thoughts/research/2026-03-23-compliance-exploration.md`), providing standardized metadata for sensitivity levels (`public`, `internal`, `confidential`, `restricted`, `pii`), categories (`PII`, `PHI`, `financial`), and regulatory tags.

ADR 0159 identified this collision as Substrate Rejection #6: a conformant processor could not satisfy Respondent Ledger §7.8 because the input it was required to read was undeclarable without introducing parallel vocabularies. Ticket `fs-lb8y` mandates choosing a single canonical classification axis and owner.

---

## 2. Decision

### 2.1 Canonical Axis: `x-data-classification`
`x-data-classification` is adopted as the single canonical disclosure classification axis in Formspec.
- **Port Owner:** DATA concern port.
- **Core Vocabulary:** Defined by the `x-data-classification` extension specification, covering:
  - `sensitivity`: closed enum (`"public"`, `"internal"`, `"confidential"`, `"restricted"`, `"pii"`);
  - `categories`: array of category tokens (e.g. `"PII"`, `"PHI"`, `"financial"`);
  - `regulatory`: array of compliance tags (e.g. `"HIPAA"`, `"GDPR"`, `"FERPA"`).

### 2.2 Retirement of `accessControl.class`
The premature ADR 0074 `accessControl.class` proposal is formally **retired** as a separate classification axis. Formspec will not maintain parallel classification vocabularies or require a separate standalone Access-Class Registry before field annotations can be declared.

### 2.3 Respondent Ledger Mapping
The Respondent Ledger (`respondent-ledger-spec.md` and `respondent-ledger-event.schema.json`) retains its existing field names for backward compatibility, mapped directly to `x-data-classification`:
- `ChangeSetEntry.accessClass`: When present, inherits the resolved `x-data-classification.sensitivity` level (or primary category token) of the corresponding Definition field.
- `DataErasedData.classesErased`: Populated with the set of `x-data-classification` tokens (`sensitivity` levels or `categories`) whose stored values were erased under right-to-erasure workflows.
- Raw value protection in §7.8 continues to apply: raw `before`/`after` values classified under sensitive tiers (`restricted`, `confidential`, `pii`) MUST NOT be exposed to readers lacking appropriate clearance, regardless of encryption architecture.

---

## 3. Conformance and Downstream Agreement

1. **Definition:** Fields declare disclosure classification using `x-data-classification`. No undeclared `accessControl.class` property is expected or validated.
2. **Respondent Ledger:** Prose in `respondent-ledger-spec.md` §7.8 and §8.7 references `x-data-classification` tokens as the source of truth for `accessClass` and `classesErased`.
3. **Schemas:** `schemas/respondent-ledger-event.schema.json` docstrings explicitly document resolution from `x-data-classification`.
4. **TODO Ledger:** Downstream ticket `fs-du1p` proceeds with `x-data-classification` as the canonical axis; ticket `fs-fvgk` (bucketed response encryption) remains deferred and is bound to this axis.
