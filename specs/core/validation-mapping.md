---
title: Formspec Validation Mapping
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
---

# Formspec Validation Mapping v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-22
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 — A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft normative companion** to [Formspec v1.0 core specification](spec.md). It reconciles validation-related vocabulary across Core §5 (Validation), Component §5.19 (SubmitButton), Component §6.13 (ValidationSummary), and the Response status lifecycle so that future Response Actions documents have a single mapping to cite.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md). It addresses the **§9 row 3** promotion gate (one reconciliation table over action intent, Core global modes, per-shape timing, `SubmitButton.mode`, `ValidationSummary.source`, severity, and Response status transitions) and the **§11.2** open question (validation profile names).

This document **MUST land before any Response Actions schema** (concept §10 order).

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259].

Terms defined in the Formspec v1.0 core specification — including *Definition*, *Response*, *ValidationReport*, *ValidationResult*, *Bind*, *Shape*, *validation mode*, *per-shape timing*, and *conformant processor* — retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **Action Intent** — A closed, abstract identifier naming what a form caller is trying to do (e.g., save a draft, submit, request evidence). See §2.
- **Validation Profile** — A closed, named profile that pins a (Core global mode, per-shape timing filter) pair under a single identifier. See §3.
- **Blocking Policy** — A closed enum naming whether validation findings of `error` severity stop the surrounding intent. See §4.
- **Persistence Policy** — A closed enum naming the Response lifecycle effect produced by the intent. See §5.
- **Master Mapping Table** — The default (Action Intent → Validation Profile, Blocking Policy, Persistence Policy) tuple per Action Intent. See §6.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=validation-mapping.bluf.md -->
<!-- bluf:end -->

---
