/** @filedesc Spike-local Surface contract validator for route graph invariants. */

import type { CoherenceIssue, CoherenceSeverity } from "./coherence.js";
import type { JsonObject, Surface, SurfaceRoute, SurfaceSlotEntry } from "./types.js";

function issue(
  issues: CoherenceIssue[],
  severity: CoherenceSeverity,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ severity, code, path, message });
}

export function validateSurfaceContract(surface: Surface): CoherenceIssue[] {
  const issues: CoherenceIssue[] = [];
  const routes = new Map(surface.routes.map((route) => [route.id, route]));
  if (routes.size !== surface.routes.length) {
    issue(issues, "error", "SURFACE-ROUTE-ID-DUPLICATE", "$.surface.routes", "Surface route ids must be unique.");
  }

  const defaults = surface.routes.filter((route) => route.default);
  if (defaults.length !== 1) {
    issue(issues, "error", "SURFACE-DEFAULT-ROUTE", "$.surface.routes", `Surface must have exactly one default route; found ${defaults.length}.`);
  }

  for (const [navIndex, nav] of (surface.nav ?? []).entries()) {
    validateNavPath(issues, routes, nav.path, `$.surface.nav[${navIndex}].path`);
  }

  for (const [index, route] of surface.routes.entries()) {
    for (const [transitionIndex, transition] of (route.transitions ?? []).entries()) {
      const target = routes.get(transition.to);
      if (!target) {
        issue(issues, "error", "SURFACE-TRANSITION-TARGET", `$.surface.routes[${index}].transitions[${transitionIndex}]`, `Transition '${transition.on}' targets unknown route '${transition.to}'.`);
        continue;
      }
      for (const param of target.params ?? []) {
        if (!transition.params?.[param.name]) {
          issue(issues, "error", "SURFACE-TRANSITION-PARAM", `$.surface.routes[${index}].transitions[${transitionIndex}]`, `Transition '${transition.on}' to '${target.id}' does not supply param '${param.name}'.`);
        }
      }
    }
    forEachSlot(route, (slot, slotPath) => {
      if (slot.type === "embed-route" && slot.routeRef && !routes.has(slot.routeRef)) {
        issue(issues, "error", "SURFACE-EMBED-TARGET", slotPath, `Embedded route '${slot.routeRef}' does not exist.`);
      }
      validatePayloadNavTargets(issues, routes, slot.payload, `${slotPath}.payload`);
    });
  }

  const start = defaults[0]?.id ?? surface.routes[0]?.id;
  if (start) {
    const reachable = new Set<string>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      const route = routes.get(id);
      if (!route) continue;
      for (const transition of route.transitions ?? []) stack.push(transition.to);
      forEachSlot(route, (slot) => {
        if (slot.type === "embed-route" && slot.routeRef) stack.push(slot.routeRef);
      });
      for (const nav of surface.nav ?? []) {
        const navRoute = surface.routes.find((candidate) => concretePathMatches(nav.path, candidate));
        if (navRoute) stack.push(navRoute.id);
      }
    }
    for (const route of surface.routes) {
      if (!reachable.has(route.id)) {
        issue(issues, "error", "SURFACE-UNREACHABLE-ROUTE", "$.surface.routes", `Route '${route.id}' is not reachable from default route '${start}'.`);
      }
    }
  }

  return issues;
}

function validatePayloadNavTargets(
  issues: CoherenceIssue[],
  routes: Map<string, SurfaceRoute>,
  payload: JsonObject | undefined,
  path: string,
): void {
  const nav = payload?.nav;
  if (!Array.isArray(nav)) return;
  for (const [index, entry] of nav.entries()) {
    if (entry && typeof entry === "object" && typeof (entry as { path?: unknown }).path === "string") {
      validateNavPath(issues, routes, (entry as { path: string }).path, `${path}.nav[${index}].path`);
    }
  }
}

function validateNavPath(
  issues: CoherenceIssue[],
  routes: Map<string, SurfaceRoute>,
  path: string,
  issuePath: string,
): void {
  if (![...routes.values()].some((candidate) => concretePathMatches(path, candidate))) {
    issue(issues, "error", "SURFACE-NAV-TARGET", issuePath, `Navigation path '${path}' does not resolve to any Surface route.`);
  }
}

function concretePathMatches(path: string, route: SurfaceRoute): boolean {
  const routeParts = route.path.split("/");
  const pathParts = path.split("/");
  if (routeParts.length !== pathParts.length) return false;
  return routeParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function forEachSlot(route: SurfaceRoute, fn: (slot: SurfaceSlotEntry, path: string) => void): void {
  for (const [slotName, entries] of Object.entries(route.slots)) {
    entries.forEach((entry, index) => fn(entry, `$.surface.routes.${route.id}.slots.${slotName}[${index}]`));
  }
}
