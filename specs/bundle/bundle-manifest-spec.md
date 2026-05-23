---
title: Formspec Bundle Manifest Specification
version: 1.0.0-draft.1
date: 2026-05-22
status: draft
---

# Formspec Bundle Manifest Specification v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-22
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0 -- A JSON-Native Declarative Form Standard

---

## Status of This Document

This document is a **draft specification**. It is a companion to the [Formspec v1.0 core specification](../core/spec.md) and does not modify or extend the core processing model. Implementors are encouraged to experiment with this specification and provide feedback, but MUST NOT treat it as stable for production use until a 1.0.0 release is published.

This spec was promoted from the concept architecture note [`thoughts/specs/2026-05-20-formspec-semantic-layers.md`](../../thoughts/specs/2026-05-20-formspec-semantic-layers.md) (Open Question §11.5 "Bundle Manifest"). It resolves the authoring-bundle promotion gate from §9 of that note.

## Conventions and Terminology

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14][rfc2119] [RFC 2119] [RFC 8174] when, and only when, they appear in ALL CAPITALS, as shown here.

JSON syntax and data types are as defined in [RFC 8259]. URI syntax is as defined in [RFC 3986].

Terms defined in the Formspec v1.0 core specification retain their core-specification meanings throughout this document unless explicitly redefined.

Additional terms:

- **Bundle Manifest** -- A JSON document conforming to this specification, identified by `$formspecBundle: "1.0"`. The author-facing single composition envelope above a Formspec form.
- **Sibling reference** -- An entry inside a Bundle Manifest that names one composed artifact by canonical URL and (optional) version pin or range.
- **Definition-only bundle** -- A Bundle Manifest whose sole sibling reference is `definition`. Renders via Definition's existing widget defaults; no Experience or Component is synthesized.

[rfc2119]: https://www.rfc-editor.org/rfc/rfc2119
[RFC 8174]: https://www.rfc-editor.org/rfc/rfc8174
[RFC 3986]: https://www.rfc-editor.org/rfc/rfc3986
[RFC 8259]: https://www.rfc-editor.org/rfc/rfc8259

---

## Bottom Line Up Front

<!-- bluf:start file=bundle-manifest-spec.bluf.md -->
<!-- bluf:end -->

---

## Table of Contents

- [§1 Introduction](#1-introduction)
- [§2 Identity and Versioning](#2-identity-and-versioning)
- [§3 Members](#3-members)
- [§4 Absence Semantics](#4-absence-semantics)
- [§5 Relationship to the Reference Graph](#5-relationship-to-the-reference-graph)
- [§6 Conformance](#6-conformance)

---

## 1. Introduction

The Formspec architecture composes a form from up to ten authored siblings -- Definition, Experience, Response Actions, Component, Theme, Locale, Mapping, References, Ontology, Registry -- plus generated artifacts (Trace) and response-scoped artifacts (Response, Respondent Ledger, ValidationReport, Intake Handoff, Determination Record). Each sibling carries its own URL, its own version, and its own `targetDefinition` back-reference.

This composition graph works when a renderer or generator already knows which siblings to load. It fails for the author opening a form for the first time: a form is implicit in the union of artifacts that target a Definition, but no single artifact names the form. There is no stable URL the author can publish, no single file Studio can open, no version a deployer can pin.

This specification defines the **Bundle Manifest**: a single authored JSON artifact that names a Formspec form as one thing. The Bundle Manifest references exactly one Definition (REQUIRED) and any combination of optional siblings, each by canonical URL and (optional) version. The bundle's own `id` is the stable form identity URL; the bundle's `version` is the coherent published-form version that pins sibling versions.

The Bundle Manifest is a **pure composition envelope**. It MUST NOT:

- inline sibling document bodies (a `locale` reference names a URL; the locale strings live at that URL),
- synthesize absent siblings (a bundle that references only `definition` does NOT cause a renderer to fabricate an Experience document; see §4 Absence Semantics),
- override sibling semantics (sibling versions, sibling identities, and sibling spec rules are unchanged by being named in a bundle),
- replace Definition as the core executable model (Definition stays the source of behavior; bundle is the optional envelope above it).

A Definition without a Bundle Manifest remains a valid Formspec form. The Bundle Manifest is the **opt-in** seam between architectural breadth (many specs) and authoring ergonomics (open one thing).

## 2. Identity and Versioning

<!-- §2 prose lands in Task 14 -->

## 3. Members

<!-- §3 prose lands in Task 15 -->

## 4. Absence Semantics

<!-- §4 prose lands in Task 16 -->

## 5. Relationship to the Reference Graph

<!-- §5 prose lands in Task 17 -->

## 6. Conformance

<!-- §6 prose lands in Task 18 -->
