/** @filedesc Plan an explicit creation control and qualify its store-returned destination. */
import { parseRouteSubjectKey, resolveDraftStartTarget } from '@formspec-org/app-graph';
import type { FormDefinition } from '@formspec-org/types';
import { formHref, matchRoute, routeHref, type SurfaceApp, type SurfaceRouteHandle } from './composition.js';
import type { DataSourceSubject } from './data-source-loader.js';
import type { SurfaceRoute } from './route-path.js';

export function planDraftStart(app: SurfaceApp, handle: SurfaceRouteHandle, source: SurfaceRoute, binding: unknown,
  definitions: ReadonlyMap<string, FormDefinition>, params: Readonly<Record<string, string>>) {
  if (handle.surface.$formspecSurface !== '0.4') return;
  const target = resolveDraftStartTarget(handle.surface.routes, source, binding, ref => definitions.get(ref));
  if (!target) return;
  const destination = app.routes.find(candidate => candidate.surface === handle.surface && candidate.route === target.route);
  if (!destination || destination.pathCollides) return;
  const inherited: [string, string][] = [];
  for (const param of target.inherited) {
    if (!Object.hasOwn(params, param) || !params[param]) return;
    inherited.push([param, params[param]!]);
  }
  const parents: [string, string | number][] = [];
  for (const { key, parameter, dataType, minted } of target.keys) {
    if (minted) continue;
    const value = parseRouteSubjectKey(dataType, params[parameter]!);
    if (value === undefined) return;
    parents.push([key, value]);
  }
  return { app, destination, label: target.label, slotId: target.slotId, keys: target.keys, params: Object.fromEntries(inherited),
    definitionUrl: target.definition.url, definitionVersion: target.definition.version,
    subject: { type: target.type, keys: Object.fromEntries(parents) } };
}

export type DraftStartPlan = NonNullable<ReturnType<typeof planDraftStart>>;

export function draftStartHref(plan: DraftStartPlan, subject: DataSourceSubject): string | undefined {
  if (subject.type !== plan.subject.type || Object.keys(subject.keys).length !== plan.keys.length) return;
  const minted: [string, string][] = [];
  for (const { key, minted: assigned, parameter } of plan.keys) {
    if (!Object.hasOwn(subject.keys, key)) return;
    const value = subject.keys[key];
    if (assigned) {
      if (typeof value !== 'string' || !value) return;
      minted.push([parameter, value]);
    } else if (value !== plan.subject.keys[key]) return;
  }
  const link = routeHref(plan.destination, { ...plan.params, ...Object.fromEntries(minted) });
  if (link.refusal || matchRoute(plan.app, link.href).match?.handle !== plan.destination) return;
  return formHref(link.href, plan.slotId);
}
