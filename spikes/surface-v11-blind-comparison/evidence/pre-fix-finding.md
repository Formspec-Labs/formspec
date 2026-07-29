# v11 pre-fix finding

Two fresh builders received the Northstar mission and the generated
`tool-catalog.json`. Neither saw source, tests, schemas, or prior evidence.

Both builders found `formspec_wireframes_bind_slot`,
`formspec_wireframes_edit_definition`, and
`formspec_wireframes_edit_registry` advertised as:

```json
{ "type": "object", "properties": {} }
```

The first builder guessed a top-level `kind` and `content`. The second guessed
`slot_type` correctly but still placed `content` at the top level. All six slot
calls failed in both runs. The catalog also described transition triggers as
plain strings without saying they must resolve to Response Actions. The first
builder used human labels; the second used dotted navigation names. All
transition calls failed, and neither run could export.

Measured results:

| Run | Calls | Slot errors | Transition errors | Export |
|---|---:|---:|---:|---|
| attempt 1 | 32 | 6 | 15 | refused |
| attempt 2 | 28 | 6 | 11 | refused |

This was a public discoverability defect, not evidence that generic
wireframing itself failed. The MCP SDK can execute top-level Zod discriminated
unions, but its `tools/list` conversion emitted empty schemas for them.

The correction replaces those top-level unions with explicit object schemas,
keeps the binding variants as a nested union, adds stable server-side checks
for operation-specific required fields, and explains the transition trigger
rule. A regression now checks that all three catalog entries expose their
fields and that slot bindings publish all five variants.

The corrected slot catalog exposed a second problem. A fresh builder could add
routes and slots, but the Action catalog did not show the allowed intent and
effect shapes. Its first recovery used unsupported intent names, so all seven
Action calls failed. Publishing the closed-core-or-`x-*` intent rule and all
five effect variants made those fields usable.

The builder then used valid `x-*` intents but received seven
`MODULE-CONTRIBUTION-MISSING` errors. A module declaration alone did not create
the named Registry contributions. The final catalog guidance now directs local
navigation toward a closed-core intent when an extension is unnecessary. The
final replay retained distinct Action ids, used the closed-core `review`
intent, and reached zero schema, graph, and validation errors.
