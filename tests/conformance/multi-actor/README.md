# Multi-Actor Conformance Suite Shell (ADR 0151 §9)

This directory contains multi-actor editing conformance fixtures and tests verifying cross-runtime byte parity and replica convergence under Automerge 2.0.

- `byte-parity.case.json`: Byte-parity test vectors for `formspec-document-kernel`.
- `node-id-kernel-ref-stability.case.json`: ADR 0151 P1 fixture corpus proving `node.id ↔ KernelObjectRef` stability across replay, merge, export/import, cross-document moves, and bundle-unique collision rejection.
- `fel-rename-worked-example.case.json`: ADR 0151 §5.2 gate fixtures proving schema-aware convergence on concurrent field renames (deterministic repair reanchoring, MCP reject-and-rollback, and human quarantine-and-surface).
- `cross-mcp-conflicts.case.json`: ADR 0151 §7 gate fixtures covering multi-MCP authoring (Forms-MCP + Wireframes-MCP concurrent edits and bundle ID collisions).
- `trellis-binding.case.json`: ADR 0151 §9 & §13.1 gate fixtures verifying `SessionOpBatch` Trellis canonical event serialization and idempotency-key cross-language parity.
- Consumed by Rust kernel (`formspec-document-kernel`), JS WASM binding, and Python binding shells.
