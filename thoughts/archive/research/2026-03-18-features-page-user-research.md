# Features Page User Research — Non-Technical Personas

**Date:** 2026-03-18
**Page reviewed:** `/features/`
**Method:** Three independent cold reads, zero context given, each with a distinct non-technical persona.

---

## Persona 1: SaaS Product Manager

Evaluating form tools for a mid-size SaaS platform.

**Kept reading** — the BLUF table hooked them and the versioning/migration story is directly relevant to a compliance problem they're dealing with.

**Strongest signal:** Genuinely compelled by money precision, structured `ValidationReport`, response pinning, and the Mapping DSL replacing custom export scripts. Called these differentiated.

**Core friction:**

- Right column of the checklist speaks developer-language while the left speaks buyer-language. "`relevant` bind with full expression support" loses them immediately.
- "No code. Just formulas." followed by `sum($items[*].qty * $items[*].price)` reads as dishonest. "That IS code. It's a DSL."
- Missing entirely: live demo, pricing, deployment model (SaaS vs. self-hosted?), and customer evidence.
- Screener routing is buried — called it a top-level feature that deserves its own spotlight.

---

## Persona 2: VP of Operations, Healthcare

Overseeing intake, compliance, and internal workflows. Evaluating for a patient intake project.

**Skimmed then slowed** — BLUF checklist kept them on the page, FEL/Binds sections got scrolled past, versioning pulled them back to careful reading.

**Strongest signal:** The versioning paragraph — *"what was the user shown? which version? can existing responses still be validated?"* — was called out verbatim as the thing they'd forward to their IT director. "Someone who understands my world."

**Core friction:**

- "0.1 + 0.2 = 0.3, guaranteed" reads as an inside joke. "I don't understand why this would ever not be the case."
- **HIPAA is completely absent.** "For a product that mentions 'regulated industries' and 'EHR pre-fill,' this is a glaring omission." Can't forward to compliance officer without it.
- "28 MCP tools" = meaningless. "Open spec, MIT license" raises support/BAA questions, not confidence.
- EHR pre-fill gets one passing mention — deserves its own section. Which EHRs? Epic? Cerner?

---

## Persona 3: Grants Administrator, Nonprofit

Manages grant applications, intake, and HR forms at a nonprofit. Current tools: JotForm, Google Forms. Primary pain points: budget calculations, conditional intake questions, manual data re-entry, volunteer submission errors.

**Most detailed and most honest** — recognized their own pain points throughout, but felt the page wasn't actually written for them.

**Strongest signal:** The repeatable data table description — *"add/remove row buttons, type-appropriate inputs per column, computed cells (line totals)"* — was called "our grant budget form described in one sentence."

**Core friction:**

- Spent the entire FEL section worried they'd have to write formulas by hand, only to discover Formspec Studio in the final section. "That's critical information that should be much higher on the page."
- No screenshots. "Not a single screenshot or example of a rendered form on this entire page."
- **Pricing absent.** "That's a red flag."
- Produced a full glossary of terms that need plain-language rewrites:

| Technical term used | Plain-language alternative |
|---|---|
| `bind` | rule / condition |
| "cascades to all children" | applies to everything inside that section |
| cardinality | minimum and maximum number of rows |
| element-wise array math | row-by-row calculations |
| DSL | never use without explanation |
| deterministic | drop it entirely |
| `{amount, currency}` type | money fields store the amount and currency together |
| data-URL export | saves as an image |
| JSON document | structured data (or skip the format) |

---

## Cross-Cutting Findings

Three independent reads, three versions of the same complaints:

1. **BLUF table is the best thing on the page** — all three said this explicitly
2. **Right column of BLUF speaks developer, not buyer** — all three flagged jargon in the answers column
3. **No demo, no pricing, no screenshots** — all three missing-feature lists converge on these three gaps
4. **Versioning section lands hardest for regulated-industry readers** — both the exec and PM called it out as the most compelling section
5. **Formspec Studio is buried** — two of three personas were confused about whether they'd need to write code until the very last section

---

## Open Questions Surfaced

- Is this SaaS or self-hosted? (all three personas)
- What does the form look like to the person filling it out? (PM and grants admin)
- Pricing? (PM and grants admin — exec assumed enterprise/contact-sales)
- HIPAA / BAA availability? (exec, critical)
- Which EHR/CRM systems integrate out of the box? (exec and grants admin re: Salesforce)
- Accessibility / WCAG compliance? (grants admin — federal grant requirement)
- Mobile support for form-fillers? (grants admin)
- Migration path from JotForm/Google Forms? (grants admin)
- Support model — GitHub issues or humans? (grants admin)
- Customer evidence / case studies? (PM, exec)
