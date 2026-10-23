# formspec-changeset

Changeset dependency analysis and connected-component grouping for Formspec authoring workflows.

## Overview

`formspec-changeset` analyzes recorded changeset commands (from MCP tool invocations or editor actions) to determine which entries are coupled by shared field keys:
- **Creates:** entries that introduce new fields or definitions (e.g. `definition.addItem`).
- **References:** entries that reference existing fields via binds, layout slots, or FEL expressions (e.g. `$field`).
- **Targets:** entries that mutate or modify an existing field.

It constructs a dependency graph over these relationships and computes connected components via union-find, grouping interdependent changes that must be accepted or rejected as a single atomic unit.

## Architecture & Repurposing

Under ADR 0151 (Multi-Actor Editing via Automerge), CRDT convergence is owned by `formspec-document-kernel`. `formspec-changeset` provides the semantic dependency lens over authoring operations, enabling smart grouping, repair suggestions, and authoring UX diagnostics.

## License

This package is licensed under the **Business Source License 1.1 (BSL-1.1)**.

- **Use Grant:** You may use this code for internal use within your organization, development, testing, evaluation, non-commercial and academic use, and for building internal tools (even commercially) as long as they are not offered to third parties as a form authoring product.
- **Restricted Use:** Offering a hosted, managed, on-premises, or packaged form authoring product to third parties using this code requires a commercial license.
- **Conversion:** On **April 7, 2030**, this code converts automatically to the **Apache License 2.0**.
- **Data Ownership:** Form definitions, schemas, responses, and artifacts authored using this software remain your data and are not subject to this license.

See the repository [LICENSING.md](../../LICENSING.md) and [LICENSE-BSL](../../LICENSE-BSL) for full legal terms.
