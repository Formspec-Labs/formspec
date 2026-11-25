# Definition rule mutation coverage

Run an external conformance suite against one changed authored rule at a time through the shared conformance runner (`@formspec-org/engine/conformance` and the `formspec-conformance` CLI).

```sh
node packages/formspec-engine/conformance/cli.mjs mutate --root ./fixtures --suite suite.json --definition form.json
node scripts/conformance/rule-mutation.mjs --root ./fixtures --suite suite.json --definition form.json \
  --only /binds/0/required --workers 2
```

The library exports `runMutationCoverage({ suite, definitionPath, root, ledger, named, only, workers, exhaustive, native })` from `@formspec-org/engine/conformance` (and re-exported from `scripts/conformance/rule-mutation.mjs`). The suite may be a case object, a suite object with shared defaults, a file, or a directory. Paths resolve from `root`.

Mutated Definitions are evaluated strictly in memory via the conformance runner's `definitionOverride` option without writing temporary fixture files to disk. The tool checks every case against the original Definition first; a failing baseline aborts the run. `--ledger FILE` applies parity-ledger divergence entries to both baseline and mutant verdicts. Reports explicitly name `runners`, `legsCovered`, `selectionMode`, and `totalEvaluations`. Pass `--native BINARY` (the `formspec-eval` `conformance-case` example executable) to evaluate native Rust legs and use Rust's `definition_dependency_scopes` directly for selection.

Built-in mutant IDs are JSON Pointers into the original Definition. Repeat `--only ID` to select specific mutants. Pass `--named FILE` (or `named` in the library) for caller-supplied edits:

```json
[{"id":"raise-threshold","path":["shapes",0,"constraint"],"value":"$score >= 5"}]
```

Conservative scoped dependency analysis resolves grouped items, repeatable rows, lexical variables, Binds, and Shapes to prune unrelated cases while keeping whole-form observations, cycles, and ledgered cases eligible. `--exhaustive` disables case pruning so witness parity and evaluation counts can be compared directly.
