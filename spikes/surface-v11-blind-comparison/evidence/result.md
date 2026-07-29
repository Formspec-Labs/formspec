# Surface v11 blind score

**Result: Level 4 — 9 of 9 acceptance checks passed.**

The anonymous final run produced a publishable export with a coherent Manifest and Surface. Validation completed with **0 schema failures, 0 AppGraph errors, and 0 errors**. It also reported **10 warnings**. Those warnings matter, but they are not validation failures under the frozen rubric.

Feature judgments below use only the final public summary, structured preview, validation report, and export returned by calls 31–34. The call log supplies only the authoring counts.

## Score summary

| Measure | Result |
|---|---:|
| Primary level | 4 |
| Acceptance checks | 9 / 9 |
| Export valid | Yes |
| Structured preview available | Yes |
| All routes reachable | Yes, in the declared route graph |
| Parameterized detail coherent | Yes |
| Public tool calls | 35 |
| Tool errors | 0 |
| Tool recoveries | 0 |
| Unsupported operations | 0 |
| Assumptions recorded | 0 |
| Repeated failure stages | 0 |
| Elapsed time | Not recorded |

All 35 calls have `isError: false`. With no failed call in the frozen run, there is no tool recovery to count. The validation report records zero unsupported features. The evidence contains no elapsed duration; `scorecard.json` uses `-1` only as an unavailable-value sentinel.

## Acceptance evidence

1. **Pass — identity and routes.** The export identifies **Northstar Observatory** and its Surface contains exactly `/night`, `/targets`, `/targets/{targetId}`, `/timeline`, `/systems`, and `/handoff`.

2. **Pass — shared context and structural reachability.** The preview enters at `night`. From there, declared transitions reach targets, timeline, systems, and handoff; targets reaches the parameterized detail route with `targetId=M42`; return edges lead through targets or night. Every route binding records persistent navigation, the `ACTIVE` night state, and a `LOCAL/UTC` toggle. This is a structural finding, not proof that a renderer can fire the transitions.

3. **Pass — night console.** `/night` contains local and UTC time, weather, dome and telescope states, current target and exposure progress, two next events, and a persistent critical-wind warning.

4. **Pass — target queue.** `/targets` specifies a desktop table and narrow stacked-card layout, search and filters, and the required rank, object, type, priority, visibility window, estimated duration, and status fields.

5. **Pass — target detail.** `/targets/{targetId}` declares the `targetId` string parameter and receives `M42` from the queue transition. Its content includes coordinates, a finder-preview placeholder, visibility facts, exposure sequence, notes, all three requested action labels, and both a breadcrumb and back path.

6. **Pass — timeline.** `/timeline` distinguishes completed, current, upcoming, and delayed work and names a guider-calibration delay.

7. **Pass — systems.** `/systems` covers telescope, dome, camera, guider, and weather station; shows healthy, warning, and offline states; and includes troubleshooting content.

8. **Pass — handoff.** `/handoff` contains completed observations, unresolved alerts, next-shift priorities, and the **Download handoff** action label.

9. **Pass — public structure, states, and layouts.** The preview exposes a `$formspecBundle` 2.4 Manifest and `$formspecSurface` 0.2 Surface with entry route, six routes, a parameterized detail route, slots, and transitions. The bindings represent populated, empty, loading, warning, and offline examples and record desktop and narrow-screen intent. Preview reports `publishable: true` with no diagnostics.

## Validation

The final validation call succeeded and returned `report.ok: true`.

| Validation measure | Count |
|---|---:|
| Artifacts / loaded artifacts | 4 / 4 |
| Schema failures | 0 |
| Unvalidated artifacts | 0 |
| AppGraph errors | 0 |
| Errors | 0 |
| Warnings | 10 |
| Informational diagnostics | 0 |
| Unsupported features | 0 |
| Skipped phases | 0 |

Artifact resolution, schema, module resolution, and cross-artifact validation completed. `surface-local`, `authorization-boundary`, and `unsupported` show `not-run`; the report still records zero skipped phases and zero unsupported features.

All ten diagnostics are `E611` **warnings** from cross-artifact validation. Each says a transition trigger resolves to its response action, but the route has no `definition-form`, Registry-declared `module-widget`, or embedded-route source recognized as able to produce that action. The warnings cover all ten transitions: four from night, two from targets, and one each from target detail, timeline, systems, and handoff.

## Remaining limitations

- The route graph is connected, but the public validation evidence does not prove that a rendered control can fire any transition.
- All six route regions use `static-content` text. **Queue next**, **Skip tonight**, **Mark observed**, and **Download handoff** are presented as labels, not structured executable actions.
- The navigation definition is empty. Shared navigation appears through repeated route content, declared response actions, and transition edges rather than a reusable rendered navigation region.
- Responsive layouts and populated, empty, loading, warning, and offline examples are declared in slot text. The v11 protocol does not run a browser, so it does not verify their visual or interactive behavior.
- The evidence does not record elapsed time.

## Conclusion

The result meets the frozen v11 definition of Level 4: the public-tool export validates and structurally represents all nine numbered mission checks without source access or hand repair. This is an honest structural pass, not a runtime-quality claim. The ten warnings and text-only controls leave navigation firing, command behavior, and rendered responsiveness unverified.
