---
name: Surface v11 generic Wireframes-MCP blind probe
date: 2026-07-29
status: completed-with-warnings
decision: can a cold agent build a coherent multi-route app with the public Wireframes-MCP surface
v12_reserved_input: formspec-server/SAAS-V1.md
---

# Surface v11 generic Wireframes-MCP blind probe

## Decision

v11 is a second generic wireframing probe, like v10, with a different prompt.
It asks:

> Can a cold builder turn a fresh, non-form brief into a valid, navigable,
> coherent multi-route wireframe using only public Wireframes-MCP tools?

This is not a respondent-service qualification or a production-readiness gate.
v12 will dogfood
[`formspec-server/SAAS-V1.md`](../../../formspec-server/SAAS-V1.md) through the
same generic tools and exercise runtime behavior separately. Keep that
document out of v11 prompts and scoring.

The final corrected-catalog run earned a blind **Level 4 structural score** and
passed all nine checks. It does not prove rendered or runtime behavior.

## Surface under test

The generic MCP server should let a builder:

- start a neutral app;
- add routes, transitions, and all five supported Surface slot types;
- add Experience units and actions;
- add a Definition only when a view needs one;
- declare modules, Registry entries, and Data Sources;
- read a summary, inspect the structured Manifest-and-Surface preview, validate
  the graph, and export it.

The start tool must not add an intake route, Definition, submit action, receipt
route, respondent module, or service-specific Data Source.

The frozen catalog, not this plan, is the authority for exact names and input
schemas.

## Mission

Use the fixed Northstar Observatory prompt and nine checks in
[`mission-selection.md`](../../spikes/surface-v11-blind-comparison/protocol/mission-selection.md).
It describes a fictional internal night-operations console with six routes:
overview, target queue, parameterized target detail, timeline, systems, and
handoff.

The prompt is intentionally non-SaaS and non-respondent-specific. It exercises
shared navigation, varied view shapes, data-bound regions, actions, operational
states, route parameters, and layout intent.

## Lightweight blind run

The corrected-catalog run used one cold builder after the generic server and
catalog passed focused tests.

1. Freeze the product refs, catalog, mission, builder instruction, and rubric.
2. Start a fresh context with no repository, source, or generated-file access.
3. Give it only the mission, builder instruction, public catalog, and results
   from its own calls.
4. Stop when it exports a validated result or reaches 90 minutes or 120 public
   calls.
5. Preserve the exact prompt, ordered calls and results, final statement,
   export, validation report, and structured preview.
6. Have one fresh scorer grade the anonymous run against the frozen rubric.
7. If a score may reveal a product gap, replay the exact failure once against
   the frozen snapshot before inspecting source.

The previous untracked respondent-specific comparison controller has been
removed. v11 uses only this lightweight protocol. Do not add a generated
holdout, reference-bundle stage, three-scorecard process, or external receipt
authority.

Local hashes can detect later file drift. They cannot prove agent isolation or
honest timing; record those limits in the result.

## Pass and score

The run passes at level 4 when:

1. the builder uses only public tools and its own results;
2. the export passes real schema and AppGraph validation without hand editing;
3. the export and preview contain all six routes and a connected navigation
   model;
4. the parameterized target detail and its back context are coherent;
5. all nine mission checks pass; and
6. the builder needs no internal API, raw loader, source file, or artifact
   repair.

| Level | Meaning |
|---|---|
| 0 | No export |
| 1 | Export fails schema or AppGraph validation |
| 2 | Export validates but lacks a coherent multi-route structure |
| 3 | Structure is coherent but misses one or more mission checks |
| 4 | Public-tool result validates and structurally satisfies all nine checks |

Tool errors are evidence, not automatic failure, when the builder recovers
through public diagnostics.

## Result

v11 did what the probe was meant to do: it found real framework problems, they
were fixed at the public boundary, and a blind rerun then produced a valid
generic wireframe.

Two independent pre-fix builders exposed empty public schemas for three tools
and an unclear transition-trigger rule. The corrected-catalog builder then
exposed two more discoverability problems: the Action catalog hid its allowed
intent/effect shapes, and its extension-intent path did not make the Registry
contribution requirement clear. The catalog and server tests now cover those
shapes and rules.

The final replay used 35 public calls:

| Measure | Result |
|---|---:|
| Tool errors | 0 |
| Schema failures | 0 |
| AppGraph errors | 0 |
| Validation errors | 0 |
| Validation warnings | 10 |
| Exported documents | 3 |
| Acceptance checks | 9 / 9 |
| Blind score | Level 4 |

All ten warnings are `E611`. The declared route graph is connected and every
trigger resolves, but the static-content slots do not give the validator a
visible control source that can fire those transitions. The frozen rubric
allows the structural pass. It does not turn that warning into a runtime claim.

The scorer also found that route-specific commands, responsive layout, and view
states are represented as wireframe text rather than executable or
browser-verified behavior. That is inside v11's structural scope and remains
explicitly unverified.

Evidence:

- [`result.md`](../../spikes/surface-v11-blind-comparison/evidence/result.md)
- [`scorecard.json`](../../spikes/surface-v11-blind-comparison/evidence/scorecard.json)
- [`run-manifest.json`](../../spikes/surface-v11-blind-comparison/evidence/run-manifest.json)
- [`pre-fix-finding.md`](../../spikes/surface-v11-blind-comparison/evidence/pre-fix-finding.md)

## Next action

The bounded generic v11 result is recorded. The immediate follow-up was
completed separately as the
[`SAAS-V1.md` v12 dogfood](2026-07-29-surface-v12-saas-v1-dogfood.md); the
Northstar prompt was not extended into the SaaS test.

v11 proves only what happened on this prompt. It does not establish general
product readiness, production safety, runtime behavior, or SaaS coverage.
