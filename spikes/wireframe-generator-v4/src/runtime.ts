/** @filedesc Spike-local runtime/session executor for the ADR-0150 v4 app graph. */

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
  | { type: "invokeAction"; definitionRef: string; actionId: string; actor: string; invocationId: string }
  | { type: "transition"; route?: string; event: string; params?: Record<string, string> };

export type RuntimePlan = {
  $wireframeRuntimePlan: "0.1-spike-v4";
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
  responses: Record<string, { state: "in-progress" | "completed"; requiredMissing: string[] }>;
  hostEvents: Array<{ eventName: string; actionId: string; definitionUrl: string; invocationId: string }>;
  durableEffects: Array<{ type: string; actionId: string; definitionUrl: string; idempotencyKey: string }>;
  aiEvents: Array<{ eventType: string; actionId: string; actor: string; definitionUrl: string }>;
  routeEvents: Array<{ from?: string; to: string; event: string; params: Record<string, string> }>;
  issues: RuntimeIssue[];
};

type ValidationTuple = {
  profile: string;
  blocking: "non-blocking" | "block-on-error";
  persistence: "none" | "draft-checkpoint" | "complete-response";
};

type RuntimeState = {
  currentRoute?: SurfaceRoute;
  routeParams: Record<string, string>;
  sessionActors: Set<string>;
  seenIdempotencyKeys: Set<string>;
  responses: Map<string, { state: "in-progress" | "completed"; data: JsonObject; requiredMissing: string[] }>;
  hostEvents: RuntimeReport["hostEvents"];
  durableEffects: RuntimeReport["durableEffects"];
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
    durableEffects: [],
    aiEvents: [],
    routeEvents: [],
    issues: [],
  };

  if (plan.$wireframeRuntimePlan !== "0.1-spike-v4") {
    push(state, "error", "RUNTIME-PLAN-VERSION", "$.$wireframeRuntimePlan", "Runtime Plan must declare '$wireframeRuntimePlan': '0.1-spike-v4'.");
  }
  if (!session) {
    push(state, "error", "RUNTIME-SESSION-UNRESOLVED", "$.sessionId", `Session '${plan.sessionId}' is absent from App Manifest sessions[].`);
  } else if (!session.actors.includes(plan.actor)) {
    push(state, "error", "RUNTIME-SESSION-ACTOR", "$.actor", `Actor '${plan.actor}' is not a member of session '${plan.sessionId}'.`);
  }
  if (inputs.posture?.allowedActors?.length && !inputs.posture.allowedActors.includes(plan.actor)) {
    push(state, "error", "RUNTIME-ACTOR-DENIED", "$.actor", `Actor '${plan.actor}' is not admitted by posture.allowedActors[].`);
  }

  if (!Array.isArray(plan.commands)) {
    push(state, "error", "RUNTIME-PLAN-COMMANDS", "$.commands", "Runtime Plan commands must be an array.");
  } else {
    plan.commands.forEach((command, index) => executeCommand(inputs, state, command, `$.commands[${index}]`));
  }

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
    durableEffects: state.durableEffects,
    aiEvents: state.aiEvents,
    routeEvents: state.routeEvents,
    issues: state.issues,
  };
}

function executeCommand(inputs: GeneratorInputs, state: RuntimeState, command: unknown, path: string): void {
  switch ((command as { type?: string }).type) {
    case "navigate": {
      const c = command as Extract<RuntimeCommand, { type: "navigate" }>;
      navigate(inputs, state, c.route, c.params ?? {}, path, "navigate");
      return;
    }
    case "screenerHop": {
      const c = command as Extract<RuntimeCommand, { type: "screenerHop" }>;
      if (!c.target.startsWith("surface:")) {
        push(state, "error", "RUNTIME-SCREENER-TARGET", path, `Screener target '${c.target}' is not a surface route.`);
        return;
      }
      if (!screenerDeclaresTarget(inputs, c.target)) {
        push(state, "error", "RUNTIME-SCREENER-HOP-UNDECLARED", path, `Screener target '${c.target}' is not declared by the loaded Screener.`);
        return;
      }
      navigate(inputs, state, c.target.slice("surface:".length), c.params ?? {}, path, "screener-hop");
      return;
    }
    case "draft": {
      const c = command as Extract<RuntimeCommand, { type: "draft" }>;
      draft(inputs, state, c.definitionRef, c.response, path);
      return;
    }
    case "invokeAction": {
      invokeAction(inputs, state, command as Extract<RuntimeCommand, { type: "invokeAction" }>, path);
      return;
    }
    case "transition": {
      transition(inputs, state, command as Extract<RuntimeCommand, { type: "transition" }>, path);
      return;
    }
    default:
      push(state, "error", "RUNTIME-COMMAND-UNKNOWN", path, `Runtime command type '${String((command as { type?: unknown }).type)}' is not supported.`);
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
  if (!currentRouteOwnsDefinition(inputs, state, def)) {
    push(state, "error", "RUNTIME-DEFINITION-NOT-IN-ROUTE", path, `Definition '${definitionRef}' is not present in the active route '${state.currentRoute?.id ?? "(none)"}'.`);
    return;
  }
  state.responses.set(def.url, { state: "in-progress", data: response, requiredMissing: requiredMissing(def, response) });
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
  if (!currentRouteOwnsDefinition(inputs, state, def)) {
    push(state, "error", "RUNTIME-DEFINITION-NOT-IN-ROUTE", path, `Definition '${command.definitionRef}' is not present in the active route '${state.currentRoute?.id ?? "(none)"}'.`);
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
  const tuple = resolveTuple(action);
  if (!tuple) {
    push(state, "error", "RUNTIME-ACTION-TUPLE", path, `Action '${command.actionId}' has no resolvable validation tuple.`);
    return;
  }
  response.requiredMissing = requiredMissing(def, response.data);
  if (response.requiredMissing.length && tuple.blocking === "block-on-error") {
    push(state, "error", "RUNTIME-VALIDATION-BLOCKED", path, `Action '${command.actionId}' is blocked by missing required fields: ${response.requiredMissing.join(", ")}.`);
    return;
  }
  if (tuple.persistence === "complete-response") response.state = "completed";
  if (tuple.persistence === "draft-checkpoint") response.state = "in-progress";

  for (const [effectIndex, effect] of action.effects.entries()) {
    if (effect.type === "hostEvent" && typeof effect.eventName === "string") {
      if (typeof effect.idempotencyKey === "string") {
        push(state, "error", "RUNTIME-HOST-EVENT-IDEMPOTENCY", `${path}.effects[${effectIndex}]`, `hostEvent '${effect.eventName}' must not carry an idempotency key.`);
      }
      state.hostEvents.push({
        eventName: effect.eventName,
        actionId: action.id,
        definitionUrl: def.url,
        invocationId: command.invocationId,
      });
    } else if (effect.type !== "hostEvent") {
      const idempotencyKey = effect.idempotencyKey;
      if (typeof idempotencyKey !== "string") {
        push(state, "error", "RUNTIME-DURABLE-EFFECT-IDEMPOTENCY", `${path}.effects[${effectIndex}]`, `Durable effect '${effect.type}' must carry an idempotency key.`);
        continue;
      }
      if (state.seenIdempotencyKeys.has(idempotencyKey)) {
        push(state, "error", "RUNTIME-IDEMPOTENCY-DUPLICATE", `${path}.effects[${effectIndex}]`, `Idempotency key '${idempotencyKey}' was already used in this runtime plan.`);
        continue;
      }
      state.seenIdempotencyKeys.add(idempotencyKey);
      state.durableEffects.push({ type: effect.type, actionId: action.id, definitionUrl: def.url, idempotencyKey });
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

function resolveTuple(action: RaAction): ValidationTuple | undefined {
  if (action.validation) return action.validation as ValidationTuple;
  switch (action.intent) {
    case "save-draft":
    case "autosave":
      return { profile: "off", blocking: "non-blocking", persistence: "draft-checkpoint" };
    case "review":
      return { profile: "on-submit", blocking: "non-blocking", persistence: "none" };
    case "submit":
      return { profile: "on-submit", blocking: "block-on-error", persistence: "complete-response" };
    case "request-evidence":
      return { profile: "on-demand", blocking: "non-blocking", persistence: "draft-checkpoint" };
    default:
      return undefined;
  }
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

function currentRouteOwnsDefinition(inputs: GeneratorInputs, state: RuntimeState, def: Definition): boolean {
  const route = state.currentRoute;
  if (!route) return false;
  return Object.values(route.slots).some((entries) =>
    entries.some((slot) => {
      if (slot.type !== "definition-form" || !slot.definitionRef) return false;
      const slotDefinition = definitionByRef(inputs, slot.definitionRef);
      return slotDefinition?.url === def.url;
    }),
  );
}

function findDefinition(inputs: GeneratorInputs, ref: string): Definition | undefined {
  return definitionByRef(inputs, ref);
}

function definitionByRef(inputs: GeneratorInputs, ref: string): Definition | undefined {
  return inputs.definitions.find((def) => def.url === ref || def.name === ref);
}

function findResponseActions(inputs: GeneratorInputs, definitionUrl: string): ResponseActions | undefined {
  return inputs.responseActions.find((sidecar) => sidecar.targetDefinition.url === definitionUrl);
}

function push(state: RuntimeState, severity: RuntimeIssue["severity"], code: string, path: string, message: string): void {
  state.issues.push({ severity, code, path, message });
}
