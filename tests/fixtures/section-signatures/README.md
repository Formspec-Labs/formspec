# Section-signature shape fixtures

These fixtures pin the section profile, per-signature role and concrete Field
coverage, whole Response capture and existing attachment references. Digests
and COSE strings are illustrative schema values, not valid signed-byte vectors.
`initial-intake.handoff.json` references the complete `two-party.response.json`;
its illustrative whole-response hash differs from both section digests.

The two signatures cover separate sections, including a concrete repeated
Field and an attachment as a complete value. Changing role, scope or a covered
answer requires that owner to sign again; an unrelated answer change preserves
an unchanged section signature. Integrity-stack supplies canonical bytes and
vectors before the engine can enforce this behavior. These fixtures alone do
not prove cryptographic validity, field resolution, signer authorization or
current policy coverage. The tests exercise schema rejection by mutating this
retained fixture; existing whole-response fixtures remain the compatibility
oracle. Intake Handoff parties activation remains a separate coordinated step.
