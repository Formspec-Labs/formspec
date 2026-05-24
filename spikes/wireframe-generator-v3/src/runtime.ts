/** @filedesc Spike-local runtime/session executor for the ADR-0150 v3 app graph. */

import type { Definition, GeneratorInputs, JsonObject, RaAction, ResponseActions, SurfaceRoute } from "./types.js";

export type RuntimeIssue = {
  severity: "error" | "warning" | "info";
  code: string;
  path: string;
  message: string;
};

export type RuntimeCommand =
  | { type: "navigate"; route: string; params?: Record<string, string> }
  | { type: "screenerHop"; target: string; params?: Record<string, string> }
  | { type: "draft"; definitionRef: string; response: JsonObject }
  | { type: "invokeAction"; definitionRef: string; actionId: string; actor: string; idempotencyKey: string }
  | { type: "transition"; route?: string; event: string; params?: Record<string, string> };

export type RuntimePlan = {
  $wireframeRuntimePlan: "0.1-spike-v3";
  url?: string;
  version?: string;
  sessionId: string;
  actor: string;
  commands: RuntimeCommand[];
};

export type RuntimeReport = {
  ok: boolean;
  sessionId: string;
  finalRoute?: { id: string; params: Record<string, string> };
  responses: Record<string, { state: "draft" | "submitted"; requiredMissing: string[] }>;
  hostEvents: Array<{ eventName: string; actionId: string; definitionUrl: string; idempotencyKey: string }>;
  aiEvents: Array<{ eventType: string; actionId: string; actor: string; definitionUrl: string }>;
  routeEvents: Array<{ from?: string; to: string; event: string; params: Record<string, string> }>;
  issues: RuntimeIssue[];
};

type RuntimeState = {
  currentRoute?: SurfaceRoute;
  routeParams: Record<string, string>;
  sessionActors: Set<string>;
  seenIdempotencyKeys: Set<string>;
  responses: Map<string, { state: "draft" | "submitted"; data: JsonObject; requiredMissing: string[] }>;
  hostEvents: RuntimeReport["hostEvents"];
  aiEvents: RuntimeReport["aiEvents"];
  routeEvents: RuntimeReport["routeEvents"];
  issues: RuntimeIssue[];
};

export function executeRuntimePlan(inputs: GeneratorInputs, plan: RuntimePlan): RuntimeReport {
  const session = inputs.appManifest.sessions?.find((candidate) => candidate.id === plan.sessionId);
  const state: RuntimeState = {
    routeParams: {},
    sessionActors: new Set(session?.actors ?? []),
    seenIdempotencyKeys: new Set(),
    responses: new Map(),
    hostEvents: [],
    aiEvents: [],
    routeEvents: [],
    issues: [],
  };

  if (!session) {
    push(state, "error", "RUNTIME-SESSION-UNRESOLVED", "$.sessionId", `Session '${plan.sessionId}' is absent from App Manifest sessions[].`);
  } else if (!session.actors.includes(plan.actor)) {
    push(state, "error", "RUNTIME-SESSION-ACTOR", "$.actor", `Actor '${plan.actor}' is not a member of session '${plan.sessionId}'.`);
  }
  if (inputs.posture?.allowedActors?.length && !inputs.posture.allowedActors.includes(plan.actor)) {
    push(state, "error", "RUNTIME-ACTOR-DENIED", "$.actor", `Actor '${plan.actor}' is not admitted by posture.allowedActors[].`);
  }

  plan.commands.forEach((command, index) => executeCommand(inputs, state, command, `$.commands[${index}]`));

  const responses: RuntimeReport["responses"] = {};
  for (const [url, response] of state.responses) {
    responses[url] = { state: response.state, requiredMissing: response.requiredMissing };
  }

  return {
    ok: !state.issues.some((issue) => issue.severity === "error"),
    sessionId: plan.sessionId,
    finalRoute: state.currentRoute ? { id: state.currentRoute.id, params: state.routeParams } : undefined,
    responses,
    hostEvents: state.hostEvents,
    aiEvents: state.aiEvents,
    routeEvents: state.routeEvents,
    issues: state.issues,
  };
}

function executeCommand(inputs: GeneratorInputs, state: RuntimeState, command: RuntimeCommand, path: string): void {
  switch (command.type) {
    case "navigate":
      navigate(inputs, state, command.route, command.params ?? {}, path, "navigate");
      return;
    case "screenerHop":
      if (!command.target.startsWith("surface:")) {
        push(state, "error", "RUNTIME-SCREENER-TARGET", path, `Screener target '${command.target}' is not a surface route.`);
        return;
      }
      if (!screenerDeclaresTarget(inputs, command.target)) {
        push(state, "error", "RUNTIME-SCREENER-HOP-UNDECLARED", path, `Screener target '${command.target}' is not declared by the loaded Screener.`);
        return;
      }
      navigate(inputs, state, command.target.slice("surface:".length), command.params ?? {}, path, "screener-hop");
      return;
    case "draft":
      draft(inputs, state, command.definitionRef, command.response, path);
      return;
    case "invokeAction":
      invokeAction(inputs, state, command, path);
      return;
    case "transition":
      transition(inputs, state, command, path);
      return;
  }
}

function navigate(
  inputs: GeneratorInputs,
  state: RuntimeState,
  routeId: string,
  params: Record<string, string>,
  path: string,
  event: string,
): void {
  const route = inputs.surface.routes.find((candidate) => candidate.id === routeId);
  if (!route) {
    push(state, "error", "RUNTIME-ROUTE-UNRESOLVED", path, `Route '${routeId}' does not exist.`);
    return;
  }
  const missing = missingRouteParams(route, params);
  if (missing.length) {
    push(state, "error", "RUNTIME-ROUTE-PARAMS", path, `Route '${routeId}' is missing params: ${missing.join(", ")}.`);
    return;
  }
  const from = state.currentRoute?.id;
  state.currentRoute = route;
  state.routeParams = params;
  state.routeEvents.push({ from, to: route.id, event, params });
}

function draft(inputs: GeneratorInputs, state: RuntimeState, definitionRef: string, response: JsonObject, path: string): void {
  const def = findDefinition(inputs, definitionRef);
  if (!def) {
    push(state, "error", "RUNTIME-DEFINITION-UNRESOLVED", path, `Definition '${definitionRef}' does not exist.`);
    return;
  }
  state.responses.set(def.url, { state: "draft", data: response, requiredMissing: requiredMissing(def, response) });
}

function invokeAction(
  inputs: GeneratorInputs,
  state: RuntimeState,
  command: Extract<RuntimeCommand, { type: "invokeAction" }>,
  path: string,
): void {
  if (inputs.posture?.allowedActors?.length && !inputs.posture.allowedActors.includes(command.actor)) {
    push(state, "error", "RUNTIME-ACTION-ACTOR-DENIED", path, `Actor '${command.actor}' is not admitted by posture.allowedActors[].`);
    return;
  }
  if (state.sessionActors.size > 0 && !state.sessionActors.has(command.actor)) {
    push(state, "error", "RUNTIME-ACTION-ACTOR-NOT-IN-SESSION", path, `Actor '${command.actor}' is not a member of the active session.`);
    return;
  }
  const def = findDefinition(inputs, command.definitionRef);
  if (!def) {
    push(state, "error", "RUNTIME-DEFINITION-UNRESOLVED", path, `Definition '${command.definitionRef}' does not exist.`);
    return;
  }
  const sidecar = findResponseActions(inputs, def.url);
  const action = sidecar?.actions.find((candidate) => candidate.id === command.actionId);
  if (!action) {
    push(state, "error", "RUNTIME-ACTION-UNRESOLVED", path, `Action '${command.actionId}' does not exist for '${def.url}'.`);
    return;
  }
  const response = state.responses.get(def.url);
  if (!response) {
    push(state, "error", "RUNTIME-RESPONSE-MISSING", path, `Action '${command.actionId}' invoked before a draft exists for '${def.url}'.`);
    return;
  }
  response.requiredMissing = requiredMissing(def, response.data);
  if (response.requiredMissing.length && blocksOnRequired(action)) {
    push(state, "error", "RUNTIME-VALIDATION-BLOCKED", path, `Action '${command.actionId}' is blocked by missing required fields: ${response.requiredMissing.join(", ")}.`);
    return;
  }
  if (state.seenIdempotencyKeys.has(command.idempotencyKey)) {
    push(state, "error", "RUNTIME-IDEMPOTENCY-DUPLICATE", path, `Idempotency key '${command.idempotencyKey}' was already used in this runtime plan.`);
    return;
  }
  state.seenIdempotencyKeys.add(command.idempotencyKey);
  response.state = action.intent === "save-draft" ? "draft" : "submitted";

  for (const effect of action.effects) {
    if (effect.type === "hostEvent" && typeof effect.eventName === "string") {
      state.hostEvents.push({
        eventName: effect.eventName,
        actionId: action.id,
        definitionUrl: def.url,
        idempotencyKey: command.idempotencyKey,
      });
    }
  }
  if (action.intent.startsWith("x-formspec-ai-")) {
    state.aiEvents.push({ eventType: "ai.command-issued", actionId: action.id, actor: command.actor, definitionUrl: def.url });
    state.aiEvents.push({ eventType: "ai.command-completed", actionId: action.id, actor: command.actor, definitionUrl: def.url });
  }
}

function transition(
  inputs: GeneratorInputs,
  state: RuntimeState,
  command: Extract<RuntimeCommand, { type: "transition" }>,
  path: string,
): void {
  const route = command.route
    ? inputs.surface.routes.find((candidate) => candidate.id === command.route)
    : state.currentRoute;
  if (!route) {
    push(state, "error", "RUNTIME-TRANSITION-ROUTE", path, `Transition '${command.event}' has no current or explicit route.`);
    return;
  }
  const transition = (route.transitions ?? []).find((candidate) => candidate.on === command.event);
  if (!transition) {
    push(state, "error", "RUNTIME-TRANSITION-UNRESOLVED", path, `Route '${route.id}' has no transition for '${command.event}'.`);
    return;
  }
  const target = inputs.surface.routes.find((candidate) => candidate.id === transition.to);
  if (!target) {
    push(state, "error", "RUNTIME-TRANSITION-TARGET", path, `Transition '${command.event}' targets missing route '${transition.to}'.`);
    return;
  }
  const params: Record<string, string> = {};
  for (const param of target.params ?? []) {
    const binding = transition.params?.[param.name] ?? param.name;
    const value = command.params?.[binding] ?? state.routeParams[binding] ?? responseValue(state, binding);
    if (value != null) params[param.name] = String(value);
  }
  navigate(inputs, state, target.id, params, path, command.event);
}

function responseValue(state: RuntimeState, key: string): unknown {
  for (const response of state.responses.values()) {
    if (Object.prototype.hasOwnProperty.call(response.data, key)) return response.data[key];
  }
  return undefined;
}

function blocksOnRequired(action: RaAction): boolean {
  if (!action.validation) return true;
  return action.validation.blocking !== "non-blocking";
}

function requiredMissing(def: Definition, response: JsonObject): string[] {
  const required = (def.binds ?? [])
    .filter((bind) => bind.required === true || bind.required === "true")
    .map((bind) => bind.path);
  return required.filter((path) => response[path] == null || response[path] === "");
}

function missingRouteParams(route: SurfaceRoute, params: Record<string, string>): string[] {
  return (route.params ?? []).map((param) => param.name).filter((name) => !params[name]);
}

function screenerDeclaresTarget(inputs: GeneratorInputs, target: string): boolean {
  const phases = inputs.screener?.evaluation as Array<{ routes?: Array<{ target?: string }> }> | undefined;
  return (phases ?? []).some((phase) => (phase.routes ?? []).some((route) => route.target === target));
}

function findDefinition(inputs: GeneratorInputs, ref: string): Definition | undefined {
  return inputs.definitions.find((def) => def.url === ref || def.name === ref);
}

function findResponseActions(inputs: GeneratorInputs, definitionUrl: string): ResponseActions | undefined {
  return inputs.responseActions.find((sidecar) => sidecar.targetDefinition.url === definitionUrl);
}

function push(state: RuntimeState, severity: RuntimeIssue["severity"], code: string, path: string, message: string): void {
  state.issues.push({ severity, code, path, message });
}
