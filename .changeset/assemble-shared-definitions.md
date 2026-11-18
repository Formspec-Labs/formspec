---
"@formspec-org/engine": patch
"@formspec-org/core": patch
---

<!-- tier: foundation -->

Assemble Group `$ref` inclusions with a host-supplied resolver before evaluating
or validating the Definition. An unassembled Group now produces an error at
its authored reference.
