# Fixed v11 mission

v11 uses one fixed prompt. Do not generate alternatives or substitute
`formspec-server/SAAS-V1.md`; that document is reserved for v12.

## Builder prompt

> Build a responsive, multi-route wireframe for **Northstar Observatory**, a
> fictional single-site night-operations console used by an astronomy crew
> during an observing shift. This is an internal operational tool, not SaaS and
> not a form or intake workflow.
>
> Create these routes:
>
> - `/night`: local and UTC time, weather, dome and telescope state, current
>   target, the next two events, and a persistent critical-wind warning.
> - `/targets`: a ranked queue with object, type, priority, visibility window,
>   estimated duration, status, and search or filter controls.
> - `/targets/{targetId}`: coordinates, a finder-preview placeholder,
>   visibility facts, exposure sequence, notes, and **Queue next**, **Skip
>   tonight**, and **Mark observed** actions.
> - `/timeline`: the night plan grouped into completed, current, and upcoming
>   work, including one delayed item.
> - `/systems`: telescope, dome, camera, guider, and weather-station status,
>   using healthy, warning, and offline states plus a troubleshooting panel.
> - `/handoff`: completed observations, unresolved alerts, next-shift
>   priorities, and a **Download handoff** action.
>
> Give every route clear shared navigation. Give the target detail a breadcrumb
> or back path. Keep a UTC/local toggle and the current night state visible
> throughout. Represent populated, empty, loading, warning, and offline
> examples where they help explain the design. Use reusable or data-bound
> regions where they fit. Record desktop and narrow-screen layout intent when
> the public model supports it. Inspect the structured preview, validate, and
> export the finished app.

## Nine acceptance checks

1. The export identifies Northstar Observatory and contains exactly the six
   requested route paths, including `/targets/{targetId}`.
2. The shared navigation model reaches every route and keeps the current night
   state plus UTC/local control in context.
3. `/night` contains every requested status, current-target, next-event, and
   critical-wind element.
4. `/targets` presents the requested ranked queue fields and search or filter
   controls through a recognizable list or table.
5. `/targets/{targetId}` presents the requested detail content, three actions,
   and a visible route back to the queue.
6. `/timeline` distinguishes completed, current, upcoming, and delayed work.
7. `/systems` covers all five named systems, all three health states, and the
   troubleshooting panel.
8. `/handoff` contains the three requested summary groups and the download
   action.
9. The public structured preview exposes a coherent Manifest and Surface with
   the requested view states and layout intent represented where the model
   supports them.

All checks come from the public summary, structured preview, validation report,
and export. v11 does not run the wireframe in a browser.
