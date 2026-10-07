/** @filedesc Public generation pairing through maintained route matching and explicit framing. */
import { it, expect } from "vitest";
import { composeSurfaceApp } from "@formspec-org/surface";
import type { SurfaceDocument } from "@formspec-org/types";
import { deriveSurfaceRuntimeGeneration as derive } from "../src/index.js";
function composition(surfaceId = "respondent", routeId = "review") {
  return composeSurfaceApp([
    {
      $formspecSurface: "0.2",
      id: surfaceId,
      entry: "intake",
      routes: [
        { id: "intake", path: "/intake", slots: [] },
        {
          id: routeId,
          path: "/forms/{formId}",
          params: [{ name: "formId", type: "string" }],
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument,
  ]);
}
const app = composition();
it("preserves the shell formatter, matching and default marker", () => {
  expect(derive({ app, location: "/intake" })).toBe(
    "7:default|7:/intake|10:respondent|6:intake|0:"
  );
  expect(
    derive({
      app,
      sessionGeneration: 7,
      location: "/forms/42",
      routeParams: { z: "x|y", a: "😀" },
    })
  ).toBe("1:7|9:/forms/42|10:respondent|6:review|16:1:a2:😀|1:z3:x|y");
  expect(derive({ app, location: "/missing" })).toBe(
    "7:default|8:/missing|0:|0:|0:"
  );
});
it("keeps explicit parameter order equivalent and distinct contexts unequal", () => {
  const input = {
    app,
    sessionGeneration: 7,
    location: "/forms/42",
    routeParams: { a: "1", b: "2" },
  };
  expect(derive(input)).toBe(
    derive({ ...input, routeParams: { b: "2", a: "1" } })
  );
  for (const changed of [
    { sessionGeneration: 8 },
    { location: "/forms/43" },
    { app: composition("other") },
    { app: composition("respondent", "other") },
    { routeParams: { a: "2", b: "2" } },
  ])
    expect(derive({ ...input, ...changed })).not.toBe(derive(input));
  // The path already identifies formId; the helper must not invent it in explicit props.
  expect(derive({ app, location: "/forms/42" })).not.toBe(
    derive({ app, location: "/forms/42", routeParams: { formId: "42" } })
  );
});
