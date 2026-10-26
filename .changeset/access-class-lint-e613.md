---
"@formspec-org/engine": minor
---

<!-- tier: foundation -->

Definition validation and lint now understand `accessControl.class` (Core §4.2.1). The embedded schemas accept `accessControl` on Field and Group items with a core class (`unclassified`, `protected`) or a `cui.*` / `hipaa.*` token, and refuse any other value. The new lint rule E613 reports a class that is not a core token and that no loaded registry declares through an `access-class` entry. The registry client parses the `access-class` category.
