# Formspec Data-Contract Projector Spike Trace

The original spike body was not present in this checkout when ADR 0057 was
implemented. This note preserves the red-team case disposition captured in
ADR 0057 and ties each case to the lint/projector ownership used by the
companion semantic-lint implementation.

Source of record: `thoughts/adr/0057-mapping-semantic-lint-and-contract-projection-analysis.md`,
section "Red-team case disposition".

| Spike case | Lint/projector ownership | Current coverage |
| --- | --- | --- |
| `unresolved_source_path` | Mapping lint emits `E1110` when paired Definition context is supplied. | `tests/fixtures/lint/E1100-mapping-semantic-invalid.json` |
| `array_inner_requiredness` | Mapping static analysis exposes requiredness facts for the projector to consume when preserving array item requiredness. | `tests/fixtures/lint/valid-mapping-semantic.json` plus `analyze_mapping` regressions |
| `bracket_target_path` | Mapping lint accepts valid JSON bracket target paths and returns normalized target segments for projector input. | `tests/fixtures/lint/valid-mapping-semantic.json` plus `analyze_mapping` regressions |
| `numeric_constant` | Projector-owned literal lowering; Mapping lint only reports `E1101` when the expression does not parse. | Projector-owned; lint fixture keeps parse-error coverage |
| `projection_emit_false` | Mapping lint treats `projection.emit: false` as intentional omission. | `tests/fixtures/lint/valid-mapping-semantic.json` |
| `inconsistent_projection_hint` | Mapping lint emits `E1103`. | `tests/fixtures/lint/E1100-mapping-semantic-invalid.json` |
| `required_source_paths_for_concat` | Mapping lint emits `E1112` for unresolved source paths; static analysis exposes requiredness when resolvable. | `tests/fixtures/lint/E1100-mapping-semantic-invalid.json` plus `analyze_mapping` regressions |
| `target_path_collision` | Mapping lint emits `E1102` for unsatisfiable parent/child writes. | `tests/fixtures/lint/E1100-mapping-semantic-invalid.json` |

Projector-output schema validation remains projector-owned. Mapping lint
validates Mapping document semantics and exposes static facts; it does not
validate generated contract artifacts.
