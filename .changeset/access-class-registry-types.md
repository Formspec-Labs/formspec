---
"@formspec-org/types": minor
---

<!-- tier: kernel -->

Field classification has one axis: Definition `accessControl.class` (Core §4.2.1), drawn from the closed Access-Class Registry (Extension Registry §3.2.3). The generated `Item` type gains optional `accessControl: AccessControl` (`class`, plus the renderer-only `subjectKind` for `protected`); `common` exports `AccessClass`; the generated `RegistryEntry` admits the `access-class` category with `AccessClassShape` (`token` or `prefix`, plus `maps` to CUI, FHIR security labels, DPV, and regulatory citations).
