# @formspec-org/core

## 3.0.0

### Minor Changes

- 307b20d: <!-- tier: foundation -->

  Breaking: native evaluation now rejects choice and multiChoice values outside named option sets and reports `prePopulate.editable: false` fields as readonly, including through FEL `readonly()`. FormEngine retains the authored Definition: `getDefinition()` and `engine.definition` no longer carry resolved `options` for `optionSet` fields; read them through `getOptions(path)` or `optionSignals`. FormEngine uses evaluator readonly results directly.

- 49c104a: <!-- tier: foundation -->

  Breaking: native, WASM, and Python evaluation omit `source` on `MIN_REPEAT` and `MAX_REPEAT` findings, matching the validation-result schema. Rust `ValidationResult.source` is now optional. FormEngine passes evaluator results through without rewriting cardinality findings.

- 2cb3f74: <!-- tier: foundation -->

  Breaking: Rebuild rejects Definitions that traverse a repeatable group without a subscript. The `UNSUBSCRIPTED_REPEAT_REFERENCE` definition error names the authored expression, including when the repeat has zero rows. Use the sibling key for the current row or `[*]` for all rows.

- d02f0af: <!-- tier: foundation -->

  Breaking: Formspec lint reports E304 for field paths that continue through a repeatable group without a subscript. Use `$amount` or `@current.amount` for a sibling in the current row, `$rows[1].amount` for one explicit row, and `$rows[*].amount` for all rows.

- 9e50ff3: <!-- tier: foundation -->

  Breaking: Untouched fields are null in editing signals and absent from Response data. Validations comparing a field to `""` no longer fire on untouched fields. Use `responseData` to prefill a new Response and `savedResponseData` to resume. `loadResponseData` replaces current data. Resume applies no padding or creation values, and added repeat rows receive no relative prefill. Prefill and saved values retain their input types, so a string supplied for a numeric field reports `TYPE_MISMATCH`. Creation waits for URL-fetched sources before applying their `seedFrom` and `prePopulate` values.

- b0b7393: <!-- tier: foundation -->

  Breaking: FEL expressions at repeat sites use the same scope in evaluation and ad-hoc reads. A sibling key reads the current row, `[*]` reads the whole collection, and scoped variables evaluate per row. The engine removes `wasmPrepareFelExpression`. Pass authored FEL directly to the evaluator.

  `compileExpression` and `{{…}}` expressions in labels and hints now bind bare `$` to the item (Core §3.2.1).

- 624fafb: <!-- tier: foundation -->

  Breaking: FormEngine recomputes calculated values and drops answers that become non-relevant after other answers are pruned when preparing submit data. The submit report uses the final evaluator findings as-is and includes relevant external findings. APIs that request the submit profile can throw “Submit evaluation did not converge on stable Response data”.

### Patch Changes

- 6e3468f: <!-- tier: foundation -->

  Assemble Group `$ref` inclusions with a host-supplied resolver before evaluating
  or validating the Definition. An unassembled Group now produces an error at
  its authored reference.

- Updated dependencies [bc35e3d]
- Updated dependencies [e190c49]
- Updated dependencies [e190c49]
- Updated dependencies [7566f80]
- Updated dependencies [6e3468f]
- Updated dependencies [307b20d]
- Updated dependencies [49c104a]
- Updated dependencies [3f7c97d]
- Updated dependencies [a097e0d]
- Updated dependencies [a8e3230]
- Updated dependencies [226b1d3]
- Updated dependencies [582f4b7]
- Updated dependencies [96331a0]
- Updated dependencies [37c2c94]
- Updated dependencies [77182ed]
- Updated dependencies [bfda53a]
- Updated dependencies [c9ed6d8]
- Updated dependencies [e25db1a]
- Updated dependencies [b494889]
- Updated dependencies [b494889]
- Updated dependencies [6471622]
- Updated dependencies [7566f80]
- Updated dependencies [96331a0]
- Updated dependencies [2cb3f74]
- Updated dependencies [d02f0af]
- Updated dependencies [9e50ff3]
- Updated dependencies [b0b7393]
- Updated dependencies [2285933]
- Updated dependencies [9c44160]
- Updated dependencies [9c44160]
- Updated dependencies [f3aa11f]
- Updated dependencies [624fafb]
- Updated dependencies [582f4b7]
- Updated dependencies [ceb352e]
- Updated dependencies [1cca148]
  - @formspec-org/engine@3.0.0
  - @formspec-org/types@0.3.0

## 2.1.0

### Minor Changes

- <!-- tier: foundation -->

  A repeatable group can declare `seedFrom` so a new Response opens with one row per JSON array element from a secondary instance; relative `prePopulate` fills those fields. Host data, including a present empty array, wins. `<formspec-render>` passes constructor `responseData` (hydrate-then-seed); a later saved tree uses `loadResponseData`.

### Patch Changes

- Updated dependencies
- Updated dependencies
  - @formspec-org/engine@2.1.0
  - @formspec-org/types@0.2.1

## 2.0.2

### Patch Changes

- @formspec-org/engine@2.0.2

## 2.0.1

### Patch Changes

- <!-- tier: foundation -->

  The registry refuses `2.0.0` for app-graph and surface — those numbers were used and
  unpublished once, and npm never lets an unpublished number back. The fixed group moves
  to 2.0.1 together so every package still carries one number.

- Updated dependencies
  - @formspec-org/engine@2.0.1

## 2.0.0

### Minor Changes

- 96f5f6d: <!-- tier: foundation -->

  Add production signed-bundle admission, complete vNext AppGraph validation,
  platform-under-tenant Theme layering, target-aware Locale handling, and
  runtime Surface data, action, form, and widget integrations. Add generic
  semantic controls, deterministic preview/test Definition Response delivery,
  and data-only outcome verification.

### Patch Changes

- Updated dependencies [96f5f6d]
- Updated dependencies [96f5f6d]
- Updated dependencies [aa22031]
- Updated dependencies [aa22031]
  - @formspec-org/types@0.2.0
  - @formspec-org/engine@2.0.0
