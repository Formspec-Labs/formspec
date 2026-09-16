# Ontology JSON-LD round-trip fixture

`definition.json` + `ontology.json` (no authored `context`) → derived `@context` (Ontology spec §6.2) applied to `response.json`'s `data` under the subject `urn:formspec:response:jsonld-roundtrip`, canonicalized with URDNA2015. `expected.nq` is the canonical N-Quads a conformant derivation plus a JSON-LD 1.1 processor produce: every bound leaf lifts, `notes` (unbound) does not, `eligibility` nests, `claimant` and each `jobs` instance are scoped nodes, `pay` is a `schema:value` / `schema:currency` node, `grossEarnings` keeps native JSON-LD number typing.

Runner: `packages/formspec-core/tests/jsonld-context.test.ts`.
