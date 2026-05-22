# Grant Application — Formspec Walkthrough

This guide walks through `examples/grant-application/` as a first-principles introduction to
Formspec. It is aimed at developers who want to understand the *why* behind the design, not just
follow a tutorial. Each section pairs explanation with concrete snippets drawn from the actual
files in that directory.

## 1. What This Example Builds

The grant application example constructs a five-page federal grant form and runs it through
the full Formspec lifecycle: a `definition.json` specifies the form structure, a `component.json`
controls wizard layout and data-table presentation, a `theme.json` supplies a USWDS-flavored
token set, `mapping.json` transforms a validated submission into a downstream grants-management
payload, and `server/main.py` implements a FastAPI endpoint that re-validates and maps on the
server side.

The domain — a federal grant application — is deliberately bureaucratic. It gives us a natural
excuse to exercise money arithmetic, conditional field visibility, cross-field validation rules,
repeatable groups, and server-side constraint re-evaluation all in a single coherent example.
The result is not a toy: the same patterns scale to real government forms.

The five wizard pages are: *Applicant Info*, *Project Narrative*, *Budget*, *Subcontractors*, and
*Review & Submit*. The Subcontractors page renders conditionally — only when the applicant has
declared they will use subcontractors. That conditional rendering is not a UI trick; it is driven
by a bind in `definition.json` and backed by `nonRelevantBehavior: "remove"`, which strips the
data on submission. The final Review & Submit page collects supporting documents and presents a
read-back summary of all prior answers before the applicant commits.

## 2. Form Definition Structure

The definition lives at `examples/grant-application/definition.json`. Every Formspec definition
starts with a small header block:

```json
{
  "$formspec": "1.0",
  "url": "https://example.gov/forms/grant-application",
  "version": "1.0.0",
  "status": "active",
  "nonRelevantBehavior": "remove",
  "formPresentation": {
    "pageMode": "wizard",
    "labelPosition": "top",
    "density": "comfortable"
  }
}
```

`$formspec` pins the spec version. `url` is the stable canonical identifier — the server uses it
to reject submissions for unknown forms. `nonRelevantBehavior: "remove"` is a form-wide policy:
any field that is not relevant (hidden by a bind condition) is omitted from the response entirely,
preventing the client from smuggling hidden-field data through.

`optionSets` are named palettes of `{value, label}` pairs. Declaring them once at the top and
referencing them by name from fields (`"optionSet": "orgTypes"`) prevents value/label drift
across multiple choice fields. The `orgTypes` palette, for example, is consumed by
`applicantInfo.orgType` and also referenced in several FEL expressions.

The `items` array encodes the field hierarchy. Top-level groups carry a `"presentation": { "page":
"..." }` annotation that tells the wizard renderer where each page boundary falls. A field's path
is the dot-joined sequence of its ancestor group keys plus its own key — so `applicantInfo.ein`
lives inside the `applicantInfo` group. Nested groups (like `lineItems` inside `budget`) simply
extend the path further.

## 3. FEL in Practice

FEL (Formspec Expression Language) is a typed expression language embedded in `variables`,
`binds`, `shapes`, and `mapping` rules. Two sigils distinguish reference types: `$path`
references a field value by its dot-path, while `@name` references a definition-scoped variable.

The three `variables` in this form illustrate the language's range.

**Wildcard aggregation.** `$lineItems[*].subtotal` fans out across every instance of the
repeatable `lineItems` group and collects the `subtotal` field from each. `moneySum` then folds
the resulting list into a single money value:

```json
{
  "name": "totalDirect",
  "expression": "moneySum($lineItems[*].subtotal)"
}
```

**Conditional logic, null-coalescing, and money construction.** Government entities are not
eligible for indirect costs, so `@indirectCosts` must return zero for them. The `??` operator
coalesces a null `indirectRate` to zero, preventing a multiply-by-null error:

```json
{
  "name": "indirectCosts",
  "expression": "if($applicantInfo.orgType = 'government') then money(0, 'USD') else money(moneyAmount(@totalDirect) * ($projectNarrative.indirectRate ?? 0) / 100, moneyCurrency(@totalDirect))"
}
```

**Per-row calculated subtotals.** Inside a `calculate` bind on `lineItems[*].subtotal`, the
path references (`$unitCost`, `$quantity`) resolve relative to each repeat instance:

```
money(moneyAmount($unitCost) * $quantity, moneyCurrency($unitCost))
```

**Date arithmetic.** The `duration` field is auto-calculated and read-only in practice.
`dateDiff(d1, d2)` computes `d1 − d2`, so the arguments are ordered end-first to produce a
positive month count:

```
dateDiff($projectNarrative.endDate, $projectNarrative.startDate, 'months')
```

Variables are evaluated lazily and cached reactively. `@grandTotal` depends on `@indirectCosts`
which depends on `@totalDirect` — the engine wires these dependencies automatically via Preact
Signals, so any line-item edit propagates through the whole chain.

## 4. Binds and Conditional Logic

Binds are the per-field policy layer. Each bind targets a path (or a wildcard path like
`lineItems[*].subtotal`) and can attach any combination of `relevant`, `required`, `readonly`,
`calculate`, `constraint`, and `constraintMessage`.

The EIN field enforces a format rule:

```json
{
  "path": "applicantInfo.ein",
  "constraint": "matches($applicantInfo.ein, '^[0-9]{2}-[0-9]{7}$')",
  "constraintMessage": "EIN must be in the format XX-XXXXXXX (e.g. 12-3456789)."
}
```

`constraint` expressions must evaluate to a boolean. When they return `false`, the engine adds an
error-severity `ValidationResult` to the report.

The entire Subcontractors page is hidden via a `relevant` bind on its group key:

```json
{
  "path": "subcontractors",
  "relevant": "$budget.usesSubcontractors"
}
```

When `usesSubcontractors` is false, the group is non-relevant. Because the form sets
`nonRelevantBehavior: "remove"`, the subcontractor data is stripped from `getResponse()` output.
The page never appears in the wizard navigation and its data is never submitted — both the UI
and the data contract enforce the same invariant.

## 5. Validation Shapes

Bind constraints enforce field-level rules. Shapes enforce rules that span multiple fields or
the entire form. The three shapes in this example cover the main budget integrity requirements.

**`budgetMatch`** targets `budget.requestedAmount` directly and checks that the value the
applicant manually entered matches the engine-computed grand total within a $1 tolerance:

```json
{
  "id": "budgetMatch",
  "target": "budget.requestedAmount",
  "severity": "error",
  "constraint": "abs(moneyAmount($budget.requestedAmount) - moneyAmount(@grandTotal)) < 1",
  "message": "Requested amount must match the calculated grand total (within $1)."
}
```

**`budgetReasonable`** uses `target: "#"` to attach the result to the form root rather than any
specific field. Its `severity` is `"warning"`, so it appears in the validation report but does not
block submission if the consuming application chooses to allow it:

```json
{
  "id": "budgetReasonable",
  "target": "#",
  "severity": "warning",
  "constraint": "moneyAmount(@grandTotal) < 500000"
}
```

**`subcontractorCap`** uses `activeWhen` to gate the entire shape. The 49% cap is a federal
requirement, but it is meaningless unless subcontractors are declared. `activeWhen` prevents
false positives when the condition is irrelevant:

```json
{
  "id": "subcontractorCap",
  "activeWhen": "$budget.usesSubcontractors",
  "constraint": "moneyAmount(moneySum($subcontractors[*].subAmount)) <= moneyAmount(@grandTotal) * 0.49"
}
```

Each shape that fires produces a `ValidationResult` object in the report. The report is what the
server receives and re-evaluates independently.

## 6. Server-Side Re-Validation

Client-side FEL evaluation is a user-experience feature, not a security boundary. A determined
client can POST arbitrary JSON directly to the server. `server/main.py` closes that gap by
re-running the same constraint logic on the server using the Python FEL evaluator:

```python
@app.post("/submit", response_model=SubmitResponse)
def submit(request: SubmitRequest):
    if request.definitionUrl != _definition["url"]:
        raise HTTPException(status_code=400, detail=...)

    # Re-validate EIN format, date ordering, budget match, and subcontractor cap
    result = evaluate(expression, field_data)
    value = to_python(result.value)
    if value is False:
        validation_results.append({ "severity": "error", ... })
```

`formspec.fel.evaluate` in `src/formspec/fel/evaluator.py` is a complete Python FEL
implementation that shares no runtime code with the TypeScript engine. The two implementations
must agree: the conformance test suite (`tests/`) enforces that they produce identical results
on the same inputs.

The server builds its own evaluation context from `request.data` rather than trusting any
client-computed values. Budget totals are recomputed from raw line-item figures; the grand total
is derived from scratch. A client that submits a manipulated `requestedAmount` with a plausible
looking total will be caught by the `budgetMatch` re-check. After validation, the server calls
`MappingEngine.forward(data)` to produce the grants-management output, and returns both the
validation report and the mapped payload.

## 7. The Mapping Document

`examples/grant-application/mapping.json` describes how a validated Formspec response is
transformed into a different JSON shape expected by a hypothetical grants-management system. The
mapping document is separate from the definition — mapping is a deployment concern, not a form
authoring concern.

Three transform types appear in this example:

**`preserve`** copies a value unchanged from source path to target path:

```json
{ "sourcePath": "applicantInfo.orgName", "targetPath": "organization.name",
  "transform": "preserve", "priority": 100 }
```

**`valueMap`** translates coded values into the target system's vocabulary:

```json
{ "sourcePath": "applicantInfo.orgType", "targetPath": "organization.type_code",
  "transform": "valueMap",
  "valueMap": { "forward": { "nonprofit": "NPO", "university": "EDU", "government": "GOV" } } }
```

**`expression`** applies a FEL snippet to extract or derive a value. Money fields in Formspec
are structured objects `{amount, currency}`. The grants-management API expects them split across
two fields:

```json
{ "sourcePath": "budget.requestedAmount", "targetPath": "budget.requested_amount",
  "transform": "expression", "expression": "@source.amount" }
```

The subcontractor array rule carries a `condition` that mirrors the relevance bind:

```json
{ "sourcePath": "subcontractors", "targetPath": "subcontractors",
  "condition": "$budget.usesSubcontractors = true" }
```

`priority` controls rule ordering when multiple rules write to overlapping paths. Higher numbers
run first.

**`coerce`** casts a field to a target primitive type. The `duration` field is stored as an
integer in Formspec but must arrive at the grants-management API as a JSON number, not a string:

```json
{ "sourcePath": "projectNarrative.duration",
  "targetPath": "project.duration_months",
  "transform": "coerce",
  "coerce": "number" }
```

**`array: each`** with nested rules maps each element of a repeatable group individually instead
of copying the whole array verbatim. Each element's fields are renamed and optionally transformed:

```json
{
  "sourcePath": "budget.lineItems",
  "targetPath": "budget.line_items",
  "transform": "preserve",
  "array": {
    "mode": "each",
    "rules": [
      { "sourcePath": "category",    "targetPath": "cat",        "transform": "preserve" },
      { "sourcePath": "quantity",    "targetPath": "qty",        "transform": "coerce", "coerce": "number" },
      { "sourcePath": "unitCost",    "targetPath": "unit_cost",  "transform": "expression",
        "expression": "moneyAmount(@source.unitCost)" }
    ]
  }
}
```

**`concat`** assembles a derived string from a FEL expression without needing a source path.
The contact display name is synthesised from two fields:

```json
{
  "targetPath": "organization.contact.display",
  "transform": "concat",
  "expression": "$applicantInfo.contactName & ' <' & $applicantInfo.contactEmail & '>'"
}
```

## 8. Bind Completeness — Required, Readonly, Default, and Whitespace

Every field in a Formspec definition starts life with no behavioral constraints beyond what its
`dataType` implies. The bind layer is where per-field policy is attached. Four bind properties are
worth examining together because they describe the full range of input control.

**`required`** marks a field as mandatory. A field can exist in the definition and even appear in
the UI without being required — the form can be saved as a draft. The grant application marks the
nine fields that cannot be blank on submission:

```json
{ "path": "applicantInfo.orgName",         "required": "true" },
{ "path": "applicantInfo.ein",             "required": "true" },
{ "path": "applicantInfo.orgType",         "required": "true" },
{ "path": "applicantInfo.contactName",     "required": "true" },
{ "path": "applicantInfo.contactEmail",    "required": "true" },
{ "path": "projectNarrative.projectTitle", "required": "true" },
{ "path": "projectNarrative.abstract",     "required": "true" },
{ "path": "projectNarrative.startDate",    "required": "true" },
{ "path": "projectNarrative.endDate",      "required": "true" }
```

The value `"true"` is a FEL expression, not a JSON boolean — required-ness can be made
conditional, e.g. `"$applicantInfo.orgType = 'nonprofit'"` for a field that is only mandatory
when certain org types apply.

**`readonly`** prevents user edits and is applied here to computed fields. Once a field has a
`calculate` expression attached, allowing the user to overwrite it would break the invariant the
expression enforces. Both `duration` and `lineItems[*].subtotal` are locked:

```json
{ "path": "projectNarrative.duration",
  "calculate": "dateDiff($projectNarrative.startDate, $projectNarrative.endDate, 'months')",
  "readonly": "true" },

{ "path": "budget.lineItems[*].subtotal",
  "calculate": "money(moneyAmount($unitCost) * $quantity, moneyCurrency($unitCost))",
  "readonly": "true" }
```

The `*` wildcard in `lineItems[*].subtotal` means the bind applies to every instance of the
repeatable group. The engine expands it across all current rows automatically.

**`default`** pre-populates a field with a value the user can then change. For `requestedAmount`
the currency should default to USD so the applicant does not need to discover the money-input
format before entering a number:

```json
{ "path": "budget.requestedAmount", "default": "money(0, 'USD')" }
```

Like `required`, the `default` value is a FEL expression, so it can reference other fields if
a sensible starting value is derivable from earlier inputs.

**`whitespace`** normalises whitespace before the value is stored. Two common modes appear in
this form. `"trim"` strips leading and trailing whitespace from the email address (copy-pasting
an email from a client often carries a trailing space):

```json
{ "path": "applicantInfo.contactEmail", "whitespace": "trim" }
```

`"normalize"` on the EIN collapses interior runs of whitespace to a single space and then trims.
This is appropriate for identifiers where the user might type spaces around the dash:

```json
{ "path": "applicantInfo.ein", "whitespace": "normalize" }
```

Whitespace normalisation happens before constraint evaluation, so the EIN regex check sees the
cleaned value.

## 9. Shapes in Depth — Severity, Timing, and Context

Shape rules differ from bind constraints in scope: a bind constraint tests a single field
against its own value, while a shape rule can reference any field in the form, compare values
across groups, or evaluate aggregate expressions. The four shapes in this example exercise the
full range of shape properties.

**Three severity levels.** `"error"` blocks submission — `getValidationReport({ profile: "on-submit" })`
sets `valid: false` when any error fires. `"warning"` is advisory; a consuming application may
choose to require acknowledgment but the spec does not mandate it. `"info"` provides real-time
guidance:

| Severity | Effect |
|---|---|
| `error` | Blocks submission; `valid: false` in report |
| `warning` | Appears in report; does not block submission by default |
| `info` | Informational only; useful for character counts, guidance |

The `abstractLength` shape demonstrates `info` severity combined with `timing: continuous`:

```json
{
  "id": "abstractLength",
  "target": "projectNarrative.abstract",
  "severity": "info",
  "timing": "continuous",
  "constraint": "length($projectNarrative.abstract) <= 3000",
  "message": "Abstract is approaching the 500-word / 3,000-character limit.",
  "code": "ABSTRACT_NEAR_LIMIT"
}
```

**`timing`** controls when the shape is evaluated. The default timing (no property specified) is
equivalent to `"submit"` — the shape only fires during a submit-mode validation check. Setting
`"timing": "continuous"` causes the engine to re-evaluate the shape reactively as the field
changes, making it useful for live character counts, soft limits, and guidance that should appear
while the user is still filling the field.

**`code`** provides a stable machine-readable identifier for a shape result, independent of the
`message` string. Client code can branch on `result.code === "ABSTRACT_NEAR_LIMIT"` without
parsing the human-readable message.

**Shape `context`.** The `budgetMatch` shape detects a mismatch between the manually entered
requested amount and the computed grand total. When it fires, it is not enough to say "amounts
differ" — the consuming UI needs the actual values to render a useful error callout. The `context`
block attaches computed values to the shape result:

```json
{
  "id": "budgetMatch",
  "target": "budget.requestedAmount",
  "severity": "error",
  "constraint": "abs(moneyAmount($budget.requestedAmount) - moneyAmount(@grandTotal)) < 1",
  "message": "Requested amount must match the calculated grand total (within $1). Check your line items.",
  "code": "BUDGET_MISMATCH",
  "context": {
    "grandTotal":  "string(moneyAmount(@grandTotal))",
    "requested":   "string(moneyAmount($budget.requestedAmount))",
    "difference":  "string(abs(moneyAmount($budget.requestedAmount) - moneyAmount(@grandTotal)))"
  }
}
```

Each key in `context` is a FEL expression evaluated at the time the shape fires. The resulting
`ValidationResult` object carries a `context` map that the UI can destructure to show: "Grand
total is $12,500.00 but you entered $12,000.00 — difference: $500.00." This keeps diagnostic
intelligence in the definition rather than duplicated across every consumer.

## 10. Review & Submit — Summary, Collapsible, Alert, and FileUpload

Long multi-page forms have a structural problem: by the time an applicant reaches the submit
button, answers from page one are invisible. A review step solves this by presenting a read-back
of all prior answers before committing. Formspec's `Summary` component is purpose-built for this
pattern.

**`Alert`** provides an inline instruction banner at the top of the page without requiring the
applicant to find a tooltip or read a footnote:

```json
{
  "component": "Alert",
  "severity": "info",
  "text": "Review all information below before submitting. Use Previous to go back and make corrections."
}
```

**`Collapsible` + `Summary`.** Each section of the form is wrapped in a `Collapsible` (a
disclosure widget) containing a `Summary` (a definition-list read-back). The applicant can
expand or collapse each section as needed:

```json
{
  "component": "Collapsible",
  "title": "Applicant Information",
  "children": [
    {
      "component": "Summary",
      "items": [
        { "label": "Organization Name", "bind": "applicantInfo.orgName" },
        { "label": "EIN",              "bind": "applicantInfo.ein" },
        { "label": "Contact Name",     "bind": "applicantInfo.contactName" },
        { "label": "Contact Email",    "bind": "applicantInfo.contactEmail" }
      ]
    }
  ]
}
```

`Summary` items that `bind` to a field path resolve the current value through the engine's
signal graph and format it for display. Money values are automatically formatted as currency.
Computed variables like `grandTotal` are bound using their bare name (e.g. `"bind": "grandTotal"`)
and the engine checks `variableSignals` as a fallback, making the same `bind` syntax work for
both fields and computed values transparently.

**`FileUpload`** collects document attachments. `allowedTypes` restricts the browser file picker
to specific MIME types; `maxSize` sets an upper bound in bytes that the component enforces
client-side before uploading:

```json
{
  "component": "FileUpload",
  "bind": "attachments.narrativeDoc",
  "allowedTypes": [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ],
  "maxSize": 10485760,
  "label": "Project Narrative Document"
}
```

The corresponding definition entry uses `"dataType": "string"` for file-reference fields because
the value ultimately stored is a file name or URL string — the upload mechanism is an
implementation concern handled outside the form spec itself.

**Binding the review page to the definition.** The attachments group is declared in
`definition.json` under its own top-level entry with `"presentation": { "page": "Review & Submit" }`.
This connects the `FileUpload` component bindings to the definition's field schema, ensuring that
the attachments go through the same relevance, required, and response-collection machinery as
every other field.

## 11. What This Example Does Not Cover

This walkthrough focuses on the core mechanics. Several Formspec features are not exercised here:

- **Screener routing** — branching logic that routes applicants to different form paths based on
  early answers. See `specs/core/spec.llm.md` § Routing.
- **Modular composition (`$ref`)** — embedding reusable sub-form fragments by reference rather
  than inline. See `specs/core/spec.llm.md` § References.
- **Version migrations** — how definitions evolve over time and how stored responses are migrated.
  See `specs/registry/changelog-spec.llm.md`.
- **Extension registry** — publishing and discovering custom components and theme tokens.
  See `specs/registry/extension-registry.llm.md`.
- **Remote data sources (`@instance()`)** — binding choice fields to server-fetched option lists.
  See `specs/core/spec.llm.md` § Remote Options.
- **CSV/XML adapter output** — producing non-JSON output from a mapping document using the
  built-in adapters. See `specs/mapping/mapping-spec.llm.md` § Adapters.
