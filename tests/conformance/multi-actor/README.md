# Multi-Actor Conformance Suite Shell (ADR 0151 §9)

This directory contains multi-actor editing conformance fixtures and tests verifying cross-runtime byte parity and replica convergence under Automerge 2.0.

- `byte-parity.case.json`: Byte-parity test vectors for `formspec-document-kernel`.
- `node-id-kernel-ref-stability.case.json`: ADR 0151 P1 fixture corpus proving `node.id ↔ KernelObjectRef` stability across replay, merge, export/import, cross-document moves, and bundle-unique collision rejection.
- Consumed by Rust kernel (`formspec-document-kernel`), JS WASM binding, and Python binding shells.
