---
title: Formspec Notification Template Sidecar Placement
version: 1.0.0-draft.1
date: 2026-05-25
status: draft
---

# Formspec Notification Template Sidecar Placement v1.0

**Version:** 1.0.0-draft.1
**Date:** 2026-05-25
**Editors:** Formspec Working Group
**Companion to:** Formspec v1.0, WOS Delivery, and formspec-web NotificationDelivery ports

## Status of This Document

This document ratifies the SC-1 placement decision for Formspec: Formspec does
not mint a second notification-template sidecar schema.

Notification template content already has a normative stack home in WOS
Delivery: `work-spec/schemas/sidecars/wos-delivery.schema.json#/$defs/NotificationsBlock`
under the `$wosDelivery.notifications` block. The absorbed WOS notification
reference remains at `work-spec/specs/sidecars/notification-template.md`.

## 1. Purpose

The SC-1 queue item exists because respondent-facing notification surfaces need
template provenance, not because Formspec needs a new form-owned document type.
For WOS-governed workflows, notification templates are delivery configuration
joined to a workflow. For non-WOS deployments, notification authoring and
transport remain composition concerns behind the consuming application's
notification port.

Formspec therefore records the boundary rather than duplicating the WOS
template vocabulary.

## 2. Ratified Boundary

A conforming Formspec implementation:

1. MUST NOT define or require a `$formspecNotificationTemplate` document type.
2. MUST NOT treat notification-template content as Definition behavior,
   validation behavior, Response payload semantics, or receipt semantics.
3. MAY preserve references to WOS delivery notification templates when a
   deployment composes Formspec with WOS.
4. MAY expose notification-template provenance through an application port,
   but that port is not a Formspec schema surface.
5. MUST NOT reinterpret WOS `notificationTemplateKey`, `noticeTemplateKey`, or
   `$wosDelivery.notifications` semantics inside Formspec core.

The active schema for WOS notification templates remains WOS Delivery. The
active Formspec contract is absence: no additional Formspec schema is required
for SC-1.

## 3. Relationship to WOS Delivery

WOS Delivery owns reusable notice template content for adverse decisions, holds,
appeals, SLA warnings, status updates, and resume notifications. Its
`notifications` block is joined to `targetWorkflow`, not to a Formspec
Definition.

That distinction is intentional. A single Formspec Definition can be embedded in
many deployment compositions, some governed by WOS and some not. Binding notice
templates directly to the Definition would invert ownership and create a second
template vocabulary for the same legal-notice surface.

## 4. Formspec Conformance

There is no `schemas/notification-template.schema.json` in Formspec. A processor
that sees a document marked `$formspecNotificationTemplate` MUST treat it as an
unknown Formspec document unless a deployment-specific extension explicitly
registers that marker outside the base Formspec schema set.

No Formspec conformance fixture is required for SC-1 because there is no
Formspec document shape to validate. WOS Delivery fixtures remain the evidence
for notification-template structure.

## 5. Non-Goals

This placement document does not define:

- email, SMS, portal, or postal delivery behavior;
- notification rendering algorithms;
- legal sufficiency of a notice;
- WOS delivery-side lint;
- formspec-web runtime behavior.

Those remain owned by their respective WOS or application-composition surfaces.
