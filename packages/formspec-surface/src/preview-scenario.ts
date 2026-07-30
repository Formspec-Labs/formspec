/**
 * @filedesc Generic, preview-only runtime state for a resolved Surface bundle.
 *
 * A scenario is data, not application code. It names one initial URL, one or
 * more runtime profiles, exact `(catalogRef, sourceRef)` outcomes, and action
 * outcomes. This module validates those names against a resolved bundle and
 * adapts a selected profile to the existing Surface runtime ports.
 */
import type {
  SurfaceScenarioActionOutcome,
  SurfaceScenarioProfile,
  SurfaceScenarioSourceOutcome,
  SurfacePreviewScenario,
} from '@formspec-org/types';
import { composeSurfaceApp, matchRoute } from './composition.js';
import type { ResolvedBundle } from './bundle.js';
import type {
  DataSourceAuthorizer,
  DataSourceDescriptor,
  DataSourceLoader,
  DataSourcePayloadValidationResult,
} from './data-source-loader.js';
import type { TransitionExecutor } from './transitions.js';

export const SURFACE_SCENARIO_DIAGNOSTIC_CODES = [
  'SURFACE-SCENARIO-SCHEMA',
  'SURFACE-SCENARIO-PROFILE-UNRESOLVED',
  'SURFACE-SCENARIO-INITIAL-ROUTE-UNRESOLVED',
  'SURFACE-SCENARIO-SOURCE-UNRESOLVED',
  'SURFACE-SCENARIO-SOURCE-AMBIGUOUS',
  'SURFACE-SCENARIO-ACTION-UNRESOLVED',
  'SURFACE-SCENARIO-ACTION-AMBIGUOUS',
  'SURFACE-SCENARIO-PAYLOAD-SCHEMA',
] as const;

export type SurfaceScenarioDiagnosticCode =
  (typeof SURFACE_SCENARIO_DIAGNOSTIC_CODES)[number];

export interface SurfaceScenarioDiagnostic {
  code: SurfaceScenarioDiagnosticCode;
  message: string;
  path?: string | undefined;
  profileId?: string | undefined;
  catalogRef?: string | undefined;
  sourceRef?: string | undefined;
  actionId?: string | undefined;
}

export interface SurfaceScenarioSchemaValidationResult {
  valid: boolean;
  errors?: readonly string[] | undefined;
}

/**
 * Optional host JSON-Schema validation. The package also performs a closed
 * structural check so omitting this callback never turns malformed input into
 * an admitted scenario.
 */
export type SurfaceScenarioSchemaValidator = (
  value: unknown,
) =>
  | SurfaceScenarioSchemaValidationResult
  | Promise<SurfaceScenarioSchemaValidationResult>;

export interface SurfaceScenarioPayloadValidationRequest {
  profileId: string;
  descriptor: DataSourceDescriptor;
  schema: object;
  value: unknown;
}

/** Host JSON-Schema validator for loaded values whose Data Source declares a schema. */
export type SurfaceScenarioPayloadValidator = (
  request: SurfaceScenarioPayloadValidationRequest,
) =>
  | DataSourcePayloadValidationResult
  | Promise<DataSourcePayloadValidationResult>;

export interface ValidateSurfacePreviewScenarioInput {
  scenario: unknown;
  bundle: ResolvedBundle;
  validateSchema?: SurfaceScenarioSchemaValidator | undefined;
  validatePayload?: SurfaceScenarioPayloadValidator | undefined;
}

export type SurfaceScenarioValidationResult =
  | {
      valid: true;
      scenario: SurfacePreviewScenario;
      diagnostics: readonly [];
    }
  | {
      valid: false;
      diagnostics: readonly SurfaceScenarioDiagnostic[];
    };

export interface SurfacePreviewRuntime {
  profileId: string;
  loader: DataSourceLoader;
  authorize: DataSourceAuthorizer;
  actionOutcome(actionId: string): SurfaceScenarioActionOutcome;
  executeTransition: TransitionExecutor;
}

const PROFILE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const ACTION_ID = /^[A-Za-z][A-Za-z0-9-]*$/u;
const SOURCE_ID =
  /^(host|response|resource|query|conversation|route):[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/u;
const URI = /^[A-Za-z][A-Za-z0-9+.-]*:.+/u;
const GENERATION_ANCHOR = /^(item|unit|task|action|concept|need):.+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function own(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function hasOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const names = new Set(allowed);
  return Object.keys(value).every((key) => names.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSourceIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value.catalogRef === 'string' &&
    URI.test(value.catalogRef) &&
    typeof value.sourceRef === 'string' &&
    SOURCE_ID.test(value.sourceRef)
  );
}

function validGeneration(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    !own(value, 'anchors') ||
    (
      Array.isArray(value.anchors) &&
      value.anchors.every(
        (anchor) => typeof anchor === 'string' && GENERATION_ANCHOR.test(anchor),
      )
    )
  );
}

function structureProblems(value: unknown): string[] {
  const problems: string[] = [];
  const problem = (path: string, message: string): void => {
    problems.push(`${path}: ${message}`);
  };
  if (!isRecord(value)) return ['$: expected an object'];

  if (
    !hasOnly(value, [
      '$formspecSurfaceScenario',
      'version',
      'initialPath',
      'routeParams',
      'routeParamsGeneration',
      'defaultProfile',
      'profiles',
      'actions',
      'x-generation',
    ])
  ) {
    problem('$', 'contains an unknown property');
  }
  if (value.$formspecSurfaceScenario !== '0.1') {
    problem('$.$formspecSurfaceScenario', 'expected "0.1"');
  }
  if (!isNonEmptyString(value.version)) {
    problem('$.version', 'expected a non-empty string');
  }
  if (typeof value.initialPath !== 'string' || !value.initialPath.startsWith('/')) {
    problem('$.initialPath', 'expected an absolute app path');
  }
  if (typeof value.defaultProfile !== 'string' || !PROFILE_ID.test(value.defaultProfile)) {
    problem('$.defaultProfile', 'expected a valid profile id');
  }
  if (own(value, 'routeParams')) {
    if (
      !isRecord(value.routeParams) ||
      !Object.values(value.routeParams).every((entry) => typeof entry === 'string')
    ) {
      problem('$.routeParams', 'expected an object of string values');
    }
  }
  if (own(value, 'routeParamsGeneration')) {
    if (!own(value, 'routeParams')) {
      problem(
        '$.routeParamsGeneration',
        'requires routeParams on the same scenario',
      );
    }
    if (!validGeneration(value.routeParamsGeneration)) {
      problem('$.routeParamsGeneration', 'expected generation provenance');
    }
  }
  if (own(value, 'x-generation') && !validGeneration(value['x-generation'])) {
    problem('$["x-generation"]', 'expected generation provenance');
  }

  if (!isRecord(value.profiles) || Object.keys(value.profiles).length === 0) {
    problem('$.profiles', 'expected at least one profile');
  } else {
    for (const [profileId, profileValue] of Object.entries(value.profiles)) {
      const profilePath = `$.profiles.${profileId}`;
      if (!PROFILE_ID.test(profileId)) {
        problem(profilePath, 'profile id does not match the profile-id syntax');
      }
      if (
        !isRecord(profileValue) ||
        !hasOnly(profileValue, ['authorization', 'sources'])
      ) {
        problem(profilePath, 'expected a closed profile object');
        continue;
      }

      const authorization = profileValue.authorization;
      if (
        !isRecord(authorization) ||
        !hasOnly(authorization, ['default', 'overrides']) ||
        (authorization.default !== 'authorized' &&
          authorization.default !== 'refused')
      ) {
        problem(`${profilePath}.authorization`, 'expected a closed authorization object');
      } else if (own(authorization, 'overrides')) {
        if (!Array.isArray(authorization.overrides)) {
          problem(`${profilePath}.authorization.overrides`, 'expected an array');
        } else {
          authorization.overrides.forEach((entry, index) => {
            const path = `${profilePath}.authorization.overrides[${index}]`;
            if (
              !isRecord(entry) ||
              !hasOnly(entry, ['catalogRef', 'sourceRef', 'decision']) ||
              !isSourceIdentity(entry) ||
              (entry.decision !== 'authorized' && entry.decision !== 'refused')
            ) {
              problem(path, 'expected one qualified authorization override');
            }
          });
        }
      }

      if (!Array.isArray(profileValue.sources)) {
        problem(`${profilePath}.sources`, 'expected an array');
      } else {
        profileValue.sources.forEach((entry, index) => {
          const path = `${profilePath}.sources[${index}]`;
          if (!isRecord(entry) || !isSourceIdentity(entry)) {
            problem(path, 'expected one qualified source outcome');
            return;
          }
          if (entry.status === 'loaded') {
            if (
              !hasOnly(entry, [
                'catalogRef',
                'sourceRef',
                'status',
                'freshness',
                'value',
                'x-generation',
              ]) ||
              (entry.freshness !== 'fresh' && entry.freshness !== 'stale') ||
              !own(entry, 'value') ||
              (
                own(entry, 'x-generation') &&
                !validGeneration(entry['x-generation'])
              )
            ) {
              problem(path, 'expected one closed loaded source outcome');
            }
          } else if (entry.status === 'unavailable') {
            if (
              !hasOnly(entry, [
                'catalogRef',
                'sourceRef',
                'status',
                'reason',
                'x-generation',
              ]) ||
              !isNonEmptyString(entry.reason) ||
              (
                own(entry, 'x-generation') &&
                !validGeneration(entry['x-generation'])
              )
            ) {
              problem(path, 'expected one closed unavailable source outcome');
            }
          } else {
            problem(`${path}.status`, 'expected "loaded" or "unavailable"');
          }
        });
      }
    }
  }

  const actions = value.actions;
  if (
    !isRecord(actions) ||
    !hasOnly(actions, ['default', 'byAction']) ||
    !validActionOutcome(actions.default)
  ) {
    problem('$.actions', 'expected a closed action-outcomes object');
  } else if (own(actions, 'byAction')) {
    if (!isRecord(actions.byAction)) {
      problem('$.actions.byAction', 'expected an object');
    } else {
      for (const [actionId, outcome] of Object.entries(actions.byAction)) {
        if (!ACTION_ID.test(actionId) || !validActionOutcome(outcome)) {
          problem(
            `$.actions.byAction.${actionId}`,
            'expected a valid action id and closed action outcome',
          );
        }
      }
    }
  }
  return problems;
}

function validActionOutcome(
  value: unknown,
): value is SurfaceScenarioActionOutcome {
  return (
    isRecord(value) &&
    hasOnly(value, ['status', 'message', 'x-generation']) &&
    (value.status === 'complete' ||
      value.status === 'fail' ||
      value.status === 'defer') &&
    (!own(value, 'message') || typeof value.message === 'string') &&
    (
      !own(value, 'x-generation') ||
      validGeneration(value['x-generation'])
    )
  );
}

interface ExactSourceResolution {
  descriptor?: DataSourceDescriptor | undefined;
  matches: number;
}

function exactSource(
  bundle: ResolvedBundle,
  catalogRef: string,
  sourceRef: string,
): ExactSourceResolution {
  const matches = (bundle.dataSources ?? []).flatMap((catalog) =>
    catalog.catalogRef === catalogRef
      ? catalog.document.sources
          .filter((source) => source.id === sourceRef)
          .map((source) => ({
            catalogRef,
            sourceRef,
            catalog: catalog.document,
            source,
          }))
      : [],
  );
  return {
    matches: matches.length,
    ...(matches.length === 1 ? { descriptor: matches[0] } : {}),
  };
}

function sourceDiagnostic(
  code:
    | 'SURFACE-SCENARIO-SOURCE-UNRESOLVED'
    | 'SURFACE-SCENARIO-SOURCE-AMBIGUOUS',
  profileId: string,
  catalogRef: string,
  sourceRef: string,
  path: string,
): SurfaceScenarioDiagnostic {
  return {
    code,
    message:
      code === 'SURFACE-SCENARIO-SOURCE-UNRESOLVED'
        ? `Profile "${profileId}" names source (${catalogRef}, ${sourceRef}), which is not in the resolved bundle.`
        : `Profile "${profileId}" names source (${catalogRef}, ${sourceRef}) more than once or the resolved bundle contains more than one exact match.`,
    path,
    profileId,
    catalogRef,
    sourceRef,
  };
}

/**
 * Validate one scenario against the artifacts it will preview.
 *
 * Structure, names, and exact identities fail closed. Payload schemas run only
 * when the caller supplies a validator; the Surface package deliberately does
 * not carry a second JSON-Schema implementation.
 */
export async function validateSurfacePreviewScenario(
  input: ValidateSurfacePreviewScenarioInput,
): Promise<SurfaceScenarioValidationResult> {
  const structural = structureProblems(input.scenario);
  if (input.validateSchema) {
    try {
      const schemaResult = await input.validateSchema(input.scenario);
      if (!schemaResult.valid) {
        structural.push(
          ...(schemaResult.errors?.length
            ? schemaResult.errors
            : ['host JSON-Schema validation failed']),
        );
      }
    } catch (error) {
      structural.push(
        `host JSON-Schema validator failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  if (structural.length > 0) {
    return {
      valid: false,
      diagnostics: structural.map((message) => ({
        code: 'SURFACE-SCENARIO-SCHEMA',
        message,
      })),
    };
  }

  const scenario = input.scenario as SurfacePreviewScenario;
  const diagnostics: SurfaceScenarioDiagnostic[] = [];
  if (!own(scenario.profiles, scenario.defaultProfile)) {
    diagnostics.push({
      code: 'SURFACE-SCENARIO-PROFILE-UNRESOLVED',
      message: `defaultProfile "${scenario.defaultProfile}" does not name a scenario profile.`,
      path: '$.defaultProfile',
      profileId: scenario.defaultProfile,
    });
  }

  const app = composeSurfaceApp(input.bundle.surfaces, {
    ...(input.bundle.entrySurface === undefined
      ? {}
      : { entrySurface: input.bundle.entrySurface }),
  });
  if (matchRoute(app, scenario.initialPath).match === undefined) {
    diagnostics.push({
      code: 'SURFACE-SCENARIO-INITIAL-ROUTE-UNRESOLVED',
      message: `initialPath "${scenario.initialPath}" does not resolve to exactly one route in the bundle.`,
      path: '$.initialPath',
    });
  }

  for (const [profileId, profile] of Object.entries(scenario.profiles)) {
    const seenSources = new Map<string, number>();
    const sourceEntries: {
      value: SurfaceScenarioSourceOutcome;
      path: string;
    }[] = profile.sources.map((value, index) => ({
      value,
      path: `$.profiles.${profileId}.sources[${index}]`,
    }));
    const overrides = profile.authorization.overrides ?? [];
    overrides.forEach((value, index) => {
      sourceEntries.push({
        value: {
          catalogRef: value.catalogRef,
          sourceRef: value.sourceRef,
          status: 'unavailable',
          reason: 'authorization-only identity',
        },
        path: `$.profiles.${profileId}.authorization.overrides[${index}]`,
      });
    });

    for (const { value, path } of sourceEntries) {
      const key = `${value.catalogRef}\u0000${value.sourceRef}`;
      const count = (seenSources.get(key) ?? 0) + 1;
      seenSources.set(key, count);
      const resolved = exactSource(
        input.bundle,
        value.catalogRef,
        value.sourceRef,
      );
      if (resolved.matches === 0) {
        diagnostics.push(
          sourceDiagnostic(
            'SURFACE-SCENARIO-SOURCE-UNRESOLVED',
            profileId,
            value.catalogRef,
            value.sourceRef,
            path,
          ),
        );
      } else if (resolved.matches > 1 || count > 2) {
        // One outcome and one authorization override may name the same source.
        // Repetition within either list is ambiguous; the list-specific check
        // below detects it without rejecting that valid cross-list pair.
        diagnostics.push(
          sourceDiagnostic(
            'SURFACE-SCENARIO-SOURCE-AMBIGUOUS',
            profileId,
            value.catalogRef,
            value.sourceRef,
            path,
          ),
        );
      }
    }

    for (const [collection, entries] of [
      ['sources', profile.sources],
      ['authorization.overrides', overrides],
    ] as const) {
      const counts = new Map<string, number>();
      entries.forEach((entry, index) => {
        const key = `${entry.catalogRef}\u0000${entry.sourceRef}`;
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        if (count > 1) {
          diagnostics.push(
            sourceDiagnostic(
              'SURFACE-SCENARIO-SOURCE-AMBIGUOUS',
              profileId,
              entry.catalogRef,
              entry.sourceRef,
              `$.profiles.${profileId}.${collection}[${index}]`,
            ),
          );
        }
      });
    }

    if (input.validatePayload) {
      for (let index = 0; index < profile.sources.length; index += 1) {
        const outcome = profile.sources[index];
        if (!outcome || outcome.status !== 'loaded') continue;
        const resolved = exactSource(
          input.bundle,
          outcome.catalogRef,
          outcome.sourceRef,
        );
        const descriptor = resolved.descriptor;
        const schema = descriptor?.source.schema;
        if (!descriptor || schema === undefined) continue;
        let result: DataSourcePayloadValidationResult;
        try {
          result = await input.validatePayload({
            profileId,
            descriptor,
            schema,
            value: outcome.value,
          });
        } catch (error) {
          result = {
            valid: false,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
        if (!result.valid) {
          diagnostics.push({
            code: 'SURFACE-SCENARIO-PAYLOAD-SCHEMA',
            message:
              result.reason ??
              `Loaded value for (${outcome.catalogRef}, ${outcome.sourceRef}) does not match its Data Source schema.`,
            path: `$.profiles.${profileId}.sources[${index}].value`,
            profileId,
            catalogRef: outcome.catalogRef,
            sourceRef: outcome.sourceRef,
          });
        }
      }
    }
  }

  const actionCounts = new Map<string, number>();
  for (const document of input.bundle.responseActions) {
    for (const action of document.actions) {
      actionCounts.set(action.id, (actionCounts.get(action.id) ?? 0) + 1);
    }
  }
  for (const actionId of Object.keys(scenario.actions.byAction ?? {})) {
    const count = actionCounts.get(actionId) ?? 0;
    if (count === 0) {
      diagnostics.push({
        code: 'SURFACE-SCENARIO-ACTION-UNRESOLVED',
        message: `Action outcome "${actionId}" names no action in the resolved bundle.`,
        path: `$.actions.byAction.${actionId}`,
        actionId,
      });
    } else if (count > 1) {
      diagnostics.push({
        code: 'SURFACE-SCENARIO-ACTION-AMBIGUOUS',
        message: `Action outcome "${actionId}" names more than one action in the resolved bundle.`,
        path: `$.actions.byAction.${actionId}`,
        actionId,
      });
    }
  }

  return diagnostics.length === 0
    ? { valid: true, scenario, diagnostics: [] }
    : { valid: false, diagnostics };
}

function selectedProfile(
  scenario: SurfacePreviewScenario,
  profileId: string,
): SurfaceScenarioProfile | undefined {
  return own(scenario.profiles, profileId)
    ? scenario.profiles[profileId]
    : undefined;
}

function matchingOutcomes(
  profile: SurfaceScenarioProfile,
  descriptor: DataSourceDescriptor,
): SurfaceScenarioSourceOutcome[] {
  return profile.sources.filter(
    (outcome) =>
      outcome.catalogRef === descriptor.catalogRef &&
      outcome.sourceRef === descriptor.sourceRef,
  );
}

/**
 * Adapt a selected scenario profile to the existing loader, authorizer, and
 * transition-executor ports. Missing profiles, missing exact source outcomes,
 * and duplicate overrides all refuse rather than falling back by source id.
 */
export function createSurfacePreviewRuntime(
  scenario: SurfacePreviewScenario,
  profileId = scenario.defaultProfile,
): SurfacePreviewRuntime {
  const profile = selectedProfile(scenario, profileId);

  const loader: DataSourceLoader = ({ descriptor }) => {
    if (!profile) {
      return {
        status: 'unavailable',
        reason: `scenario profile "${profileId}" is unavailable`,
      };
    }
    const outcomes = matchingOutcomes(profile, descriptor);
    if (outcomes.length !== 1) {
      return {
        status: 'unavailable',
        reason:
          outcomes.length === 0
            ? `scenario profile "${profileId}" has no outcome for (${descriptor.catalogRef}, ${descriptor.sourceRef})`
            : `scenario profile "${profileId}" has ambiguous outcomes for (${descriptor.catalogRef}, ${descriptor.sourceRef})`,
      };
    }
    const outcome = outcomes[0];
    if (!outcome) {
      return { status: 'unavailable', reason: 'scenario outcome is unavailable' };
    }
    return outcome.status === 'loaded'
      ? {
          status: 'loaded',
          freshness: outcome.freshness,
          value: outcome.value,
        }
      : { status: 'unavailable', reason: outcome.reason };
  };

  const authorize: DataSourceAuthorizer = ({ descriptor }) => {
    if (!profile) {
      return {
        status: 'refused',
        reason: `scenario profile "${profileId}" is unavailable`,
      };
    }
    const overrides = (profile.authorization.overrides ?? []).filter(
      (entry) =>
        entry.catalogRef === descriptor.catalogRef &&
        entry.sourceRef === descriptor.sourceRef,
    );
    if (overrides.length > 1) {
      return {
        status: 'refused',
        reason: `scenario profile "${profileId}" has ambiguous authorization for (${descriptor.catalogRef}, ${descriptor.sourceRef})`,
      };
    }
    const decision = overrides[0]?.decision ?? profile.authorization.default;
    return decision === 'authorized'
      ? { status: 'authorized' }
      : {
          status: 'refused',
          reason: `scenario profile "${profileId}" refuses (${descriptor.catalogRef}, ${descriptor.sourceRef})`,
        };
  };

  const actionOutcome = (
    actionId: string,
  ): SurfaceScenarioActionOutcome =>
    scenario.actions.byAction?.[actionId] ?? scenario.actions.default;

  const executeTransition: TransitionExecutor = async ({ transition }) => {
    if (!transition.actionId) {
      return {
        advanced: false,
        reason: 'the transition did not resolve to one action id',
      };
    }
    const outcome = actionOutcome(transition.actionId);
    return outcome.status === 'complete'
      ? { advanced: true }
      : {
          advanced: false,
          reason:
            outcome.message ??
            (outcome.status === 'defer'
              ? `preview action "${transition.actionId}" deferred`
              : `preview action "${transition.actionId}" failed`),
        };
  };

  return {
    profileId,
    loader,
    authorize,
    actionOutcome,
    executeTransition,
  };
}
