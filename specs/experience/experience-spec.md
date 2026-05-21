---
title: Formspec Experience Specification
version: 1.0.0-draft.1
date: 2026-05-21
status: draft
---

# Formspec Experience Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-21
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft specification**. It is a companion to the [Formspec v1.0 core specification](../core/spec.md) and does not modify or extend the core processing model. Implementors are encouraged to experiment with this specification and provide feedback, but MUST NOT treat it as stable for production use until a 1.0.0 release is published.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md) (the "Experience" semantic layer). It addresses the **Experience shape** promotion gate from §9 of that note: actors, tasks, units, applicability, typed references, abstract `unit.kind`, coverage expectations, and seed-from-Definition guidance.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as defined in [RFC 3986]. JSON Pointer syntax is as defined in [RFC 6901].

Terms defined in the Formspec v1.0 core specification -- including *Definition*, *Item*, *Response*, *Bind*, *FEL*, and *conformant processor* -- retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **Experience Document** -- A JSON document conforming to this specification, identified by `$formspecExperience: "1.0"`.
- **Actor** -- A role that interacts with the form (e.g., applicant, reviewer, assister).
- **Task** -- A unit of user-visible work the form supports (e.g., "identify applicant", "submit application").
- **Unit** -- A grouping of typed references to Definition items, concepts, and actions, organized under a single task and `unit.kind`.
- **Coverage** -- A static predicate over a Definition and an Experience asserting that every required, visibly relevant Definition item is referenced by at least one Unit.
- **Coverage-aware processor** -- An Extended processor that, in addition to schema validation, computes and reports coverage findings.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 6901]: https://www.rfc-editor.org/rfc/rfc6901
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=experience-spec.bluf.md -->
<!-- bluf:end -->

---
