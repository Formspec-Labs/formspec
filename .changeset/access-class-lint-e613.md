---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

Definition validation and lint now understand `accessControl.class` (Core §4.2.1). The embedded schemas accept `accessControl` on Field and Group items with a core class (`unclassified`, `protected`) or a `cui.*` / `hipaa.*` token, and refuse any other value. `subjectKind` is allowed only with `class: "protected"`. The new lint rule E613 reports a well-formed `cui.*` / `hipaa.*` token that no loaded registry declares through a draft or stable `access-class` entry; values the schema refuses stay E101 only. The registry client parses the `access-class` category.
