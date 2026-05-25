/** @filedesc Shared ModuleResolver kernel for module admission and contribution evidence. */

import type {
  ModuleResolutionContribution,
  ModuleResolutionDiagnostic,
  ModuleResolutionDocument,
  ModuleResolutionModule,
  ModuleResolutionPayloadStatus,
  ModuleResolutionRegistrySourcePointer,
  ModuleResolutionRef,
  ModuleResolutionReport,
  ModuleResolutionSourcePointer,
  ModuleResolutionSupportProfile,
  ModuleResolutionTokenCategoryEvidence,
} from '@formspec-org/types';

export interface ModuleResolverRegistryEntry {
  name: string;
  category: string;
  version?: string;
  contributes?: string[];
  dependencies?: ModuleResolutionRef[];
  widgetShape?: {
    props?: unknown;
    tokenSlots?: unknown;
  };
  categoryShape?: {
    prefix?: unknown;
    tokens?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ModuleResolverRegistryInput {
  entries: ModuleResolverRegistryEntry[];
  artifactSlot?: string;
  artifactKind?: 'registry';
  source?: string;
}

export interface ModuleResolverModuleInput extends ModuleResolutionRef {
  source?: ModuleResolutionSourcePointer;
  defaulted?: boolean;
}

export interface ModuleResolverContributionUse {
  site: string;
  name: string;
  expectedCategory: string;
  payload?: unknown;
  source: ModuleResolutionSourcePointer;
  payloadSource?: ModuleResolutionSourcePointer;
  payloadValidator?: string;
}

export interface ModuleResolverDocumentInput {
  artifactSlot: string;
  artifactKind: string;
  modules?: ModuleResolverModuleInput[];
  uses?: ModuleResolverContributionUse[];
  source?: string;
}

export interface ModuleResolverAdmissionInput {
  allowedModules?: ModuleResolutionRef[];
}

export interface ModulePayloadValidatorInput {
  payload: unknown;
  schema: unknown;
}

export interface ModulePayloadValidatorResult {
  ok: boolean;
  path?: string;
}

export type ModulePayloadValidator = (input: ModulePayloadValidatorInput) => ModulePayloadValidatorResult;

export interface ModuleResolverSupportInput extends ModuleResolutionSupportProfile {
  defaultModules?: ModuleResolverModuleInput[];
  payloadValidators?: Record<string, ModulePayloadValidator | undefined>;
}

export interface ModuleResolverInput {
  appModules: ModuleResolverModuleInput[];
  documents?: ModuleResolverDocumentInput[];
  registries: ModuleResolverRegistryInput[];
  admission?: ModuleResolverAdmissionInput;
  support?: ModuleResolverSupportInput;
  source?: string;
}

interface RegistryEntryRecord {
  entry: ModuleResolverRegistryEntry;
  registryIndex: number;
  entryIndex: number;
}

interface RegistryIndex {
  modulesById: Map<string, RegistryEntryRecord>;
  entriesByName: Map<string, RegistryEntryRecord>;
  entriesByNameAll: Map<string, RegistryEntryRecord[]>;
  contributedBy: Map<string, RegistryEntryRecord[]>;
}

interface AppModuleInput {
  ref: ModuleResolverModuleInput;
  defaulted: boolean;
  pointer: string;
}

interface ModuleState {
  report: ModuleResolutionModule;
  registry?: RegistryEntryRecord;
}

const MODULE_PHASE = 'module-resolution';
const MODULE_ORIGIN = 'module-resolver';
const CUSTOM_TOKEN_CATEGORY_PREFIX_PATTERN = /^x-[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/;

function sourceForKind(kind: string): string {
  return `memory://${kind}`;
}

function cloneRef(ref: ModuleResolutionRef): ModuleResolutionRef {
  const cloned: ModuleResolutionRef = {
    id: ref.id,
    version: ref.version,
  };
  if (ref.publisher !== undefined) cloned.publisher = ref.publisher;
  if (ref.lockHash !== undefined) cloned.lockHash = ref.lockHash;
  const extensions = (ref as ModuleResolutionRef & { extensions?: Record<`x-${string}`, unknown> }).extensions;
  if (extensions !== undefined) {
    (cloned as ModuleResolutionRef & { extensions?: Record<`x-${string}`, unknown> }).extensions = { ...extensions };
  }
  return cloned;
}

function moduleSource(
  ref: ModuleResolutionRef,
  jsonPointer: string,
  source = 'memory://app',
): ModuleResolutionSourcePointer {
  return {
    artifactSlot: 'app',
    artifactKind: 'appManifest',
    source,
    jsonPointer,
    module: cloneRef(ref),
  };
}

function registrySource(
  registry: RegistryEntryRecord,
  input: ModuleResolverInput,
  jsonPointer = `/entries/${registry.entryIndex}`,
): ModuleResolutionRegistrySourcePointer {
  const registryInput = input.registries[registry.registryIndex];
  return {
    artifactSlot: registryInput.artifactSlot ?? `registries[${registry.registryIndex}]`,
    artifactKind: 'registry',
    source: registryInput.source ?? 'memory://registry',
    jsonPointer,
  };
}

function documentSource(
  document: ModuleResolverDocumentInput,
  jsonPointer: string,
  module?: ModuleResolutionRef,
): ModuleResolutionSourcePointer {
  const source: ModuleResolutionSourcePointer = {
    artifactSlot: document.artifactSlot,
    artifactKind: document.artifactKind,
    source: document.source ?? sourceForKind(document.artifactKind),
    jsonPointer,
  };
  if (module) source.module = cloneRef(module);
  return source;
}

function diagnostic(
  code: string,
  message: string,
  primarySource: ModuleResolutionSourcePointer,
  extra: Partial<Pick<ModuleResolutionDiagnostic, 'relatedSources' | 'details'>> = {},
): ModuleResolutionDiagnostic {
  return {
    code,
    severity: 'error',
    phase: MODULE_PHASE,
    origin: MODULE_ORIGIN,
    message,
    primarySource,
    ...extra,
  };
}

function buildRegistryIndex(registries: readonly ModuleResolverRegistryInput[]): RegistryIndex {
  const modulesById = new Map<string, RegistryEntryRecord>();
  const entriesByName = new Map<string, RegistryEntryRecord>();
  const entriesByNameAll = new Map<string, RegistryEntryRecord[]>();
  const contributedBy = new Map<string, RegistryEntryRecord[]>();

  registries.forEach((registry, registryIndex) => {
    registry.entries.forEach((entry, entryIndex) => {
      const record: RegistryEntryRecord = { entry, registryIndex, entryIndex };
      entriesByName.set(entry.name, record);
      const allNamedEntries = entriesByNameAll.get(entry.name) ?? [];
      allNamedEntries.push(record);
      entriesByNameAll.set(entry.name, allNamedEntries);
      if (entry.category === 'module') {
        modulesById.set(entry.name, record);
        for (const contribution of entry.contributes ?? []) {
          const owners = contributedBy.get(contribution) ?? [];
          owners.push(record);
          contributedBy.set(contribution, owners);
        }
      }
    });
  });

  return { modulesById, entriesByName, entriesByNameAll, contributedBy };
}

function parseSemver(value: string): [number, number, number] | undefined {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function versionSatisfies(requested: string, actual: string | undefined): boolean {
  if (!actual) return false;
  if (requested === actual) return true;
  if (!requested.startsWith('^')) return false;
  const base = parseSemver(requested.slice(1));
  const candidate = parseSemver(actual);
  return !!base && !!candidate && candidate[0] === base[0] && (
    candidate[1] > base[1] || (candidate[1] === base[1] && candidate[2] >= base[2])
  );
}

function admissionMismatch(
  ref: ModuleResolutionRef,
  admission: ModuleResolverAdmissionInput | undefined,
): { allowed?: ModuleResolutionRef; field?: 'publisher' | 'lockHash' } | undefined {
  if (!admission?.allowedModules) return undefined;
  const allowed = admission.allowedModules.find((entry) => entry.id === ref.id);
  if (!allowed) return undefined;
  if (!versionSatisfies(allowed.version, ref.version)) return { allowed };
  if (allowed.publisher !== undefined && allowed.publisher !== ref.publisher) {
    return { allowed, field: 'publisher' };
  }
  if (allowed.lockHash !== undefined && allowed.lockHash !== ref.lockHash) {
    return { allowed, field: 'lockHash' };
  }
  return undefined;
}

function moduleInputs(input: ModuleResolverInput): AppModuleInput[] {
  const defaultModules = input.support?.defaultModules ?? [];
  return [
    ...defaultModules.map((ref) => ({
      ref,
      defaulted: true,
      pointer: `/modules/default/${ref.id}`,
    })),
    ...input.appModules.map((ref, index) => ({
      ref,
      defaulted: false,
      pointer: `/modules/${index}`,
    })),
  ];
}

function resolveAppModules(input: ModuleResolverInput, index: RegistryIndex): {
  modules: ModuleResolutionModule[];
  diagnostics: ModuleResolutionDiagnostic[];
  states: Map<string, ModuleState>;
} {
  const modules: ModuleResolutionModule[] = [];
  const diagnostics: ModuleResolutionDiagnostic[] = [];
  const states = new Map<string, ModuleState>();
  const inputs = moduleInputs(input);

  for (const appModule of inputs) {
    const ref = cloneRef(appModule.ref);
    const source = appModule.ref.source ?? moduleSource(ref, appModule.pointer, input.source ?? 'memory://app');
    const registry = index.modulesById.get(ref.id);
    const report: ModuleResolutionModule = {
      ref,
      status: 'admitted',
      source,
    };
    if (appModule.defaulted) report.defaulted = true;
    if (!appModule.defaulted && inputs.some((entry) => entry.defaulted && entry.ref.id === ref.id)) {
      report.defaulted = false;
    }

    if (!registry) {
      const unresolved = diagnostic(
        'MODULE-UNRESOLVED',
        `App module '${ref.id}' is absent from the Registry module index.`,
        source,
      );
      report.status = 'unresolved';
      report.diagnostics = [unresolved];
      diagnostics.push(unresolved);
    } else {
      report.registryVersion = registry.entry.version;
      if (!versionSatisfies(ref.version, registry.entry.version)) {
        report.status = 'unresolved';
        diagnostics.push(diagnostic(
          'MODULE-VERSION-UNRESOLVED',
          `Registry module '${ref.id}@${registry.entry.version}' does not satisfy requested range '${ref.version}'.`,
          source,
          { details: { registryVersion: registry.entry.version, requestedVersion: ref.version } },
        ));
      } else {
        const mismatch = admissionMismatch(ref, input.admission);
        if (mismatch) {
          report.status = 'denied';
          const details: Record<string, unknown> = {};
          if (mismatch.field === 'lockHash') {
            details.expectedLockHash = mismatch.allowed?.lockHash;
            details.actualLockHash = ref.lockHash;
          } else if (mismatch.field === 'publisher') {
            details.expectedPublisher = mismatch.allowed?.publisher;
            details.actualPublisher = ref.publisher;
          }
          diagnostics.push(diagnostic(
            'MODULE-ADMISSION-DENIED',
            `Host admission evidence denies module '${ref.id}@${ref.version}'.`,
            source,
            Object.keys(details).length > 0 ? { details } : undefined,
          ));
        }
      }
    }

    modules.push(report);
    states.set(ref.id, { report, registry });
  }

  for (const state of states.values()) {
    const dependencies = state.registry?.entry.dependencies ?? [];
    if (state.report.status !== 'admitted' || dependencies.length === 0) continue;
    const missing = dependencies.find((dependency) => {
      const dependencyState = states.get(dependency.id);
      return !dependencyState
        || dependencyState.report.status !== 'admitted'
        || !versionSatisfies(dependency.version, dependencyState.registry?.entry.version);
    });
    if (!missing || !state.registry) continue;
    state.report.status = 'dependency-unresolved';
    diagnostics.push(diagnostic(
      'MODULE-DEPENDENCY-UNRESOLVED',
      `Module '${state.report.ref.id}' depends on '${missing.id}@${missing.version}', but the app module set does not admit it.`,
      {
        ...registrySource(
          state.registry,
          input,
          `/entries/${state.registry.entryIndex}/dependencies/${dependencies.indexOf(missing)}`,
        ),
        module: cloneRef(missing),
      },
      { relatedSources: [state.report.source] },
    ));
  }

  return { modules, diagnostics, states };
}

function resolveDocuments(
  documents: readonly ModuleResolverDocumentInput[],
  moduleStates: ReadonlyMap<string, ModuleState>,
  input: ModuleResolverInput,
): { documents: ModuleResolutionDocument[]; diagnostics: ModuleResolutionDiagnostic[] } {
  const reports: ModuleResolutionDocument[] = [];
  const diagnostics: ModuleResolutionDiagnostic[] = [];

  for (const document of documents) {
    if (!document.modules || document.modules.length === 0) {
      if ((input.support?.defaultModules ?? []).length === 0) continue;
      reports.push({
        artifactSlot: document.artifactSlot,
        artifactKind: document.artifactKind,
        status: 'defaulted',
        modules: [],
        effectiveModules: (input.support?.defaultModules ?? []).map(cloneRef),
        source: documentSource(document, '/modules/default'),
      });
      continue;
    }
    const missingIndex = document.modules.findIndex((ref) => {
      const state = moduleStates.get(ref.id);
      return !state || state.report.status === 'unresolved' || state.report.status === 'dependency-unresolved';
    });
    const deniedIndex = missingIndex < 0
      ? document.modules.findIndex((ref) => moduleStates.get(ref.id)?.report.status === 'denied')
      : -1;
    const versionMismatchIndex = missingIndex < 0 && deniedIndex < 0
      ? document.modules.findIndex((ref) => {
        const state = moduleStates.get(ref.id);
        return !!state?.registry && !versionSatisfies(ref.version, state.registry.entry.version);
      })
      : -1;
    const problemIndex = [missingIndex, deniedIndex, versionMismatchIndex].find((index) => index >= 0) ?? -1;
    const sourceModule = document.modules[problemIndex >= 0 ? problemIndex : 0];
    const source = sourceModule.source ?? documentSource(
      document,
      problemIndex >= 0 ? `/modules/${problemIndex}` : '/modules/0',
      sourceModule,
    );
    const report: ModuleResolutionDocument = {
      artifactSlot: document.artifactSlot,
      artifactKind: document.artifactKind,
      status: problemIndex >= 0
        ? (deniedIndex >= 0 ? 'admission-denied' : (versionMismatchIndex >= 0 ? 'version-mismatch' : 'undeclared-module'))
        : 'coherent',
      modules: document.modules.map(cloneRef),
      source,
    };
    if (problemIndex < 0) {
      report.effectiveModules = document.modules.map(cloneRef);
    } else {
      const ref = document.modules[problemIndex];
      if (deniedIndex >= 0) {
        diagnostics.push(diagnostic(
          'MODULE-SIBLING-ADMISSION-DENIED',
          `Sibling document declares module '${ref.id}' denied by host admission evidence.`,
          source,
        ));
      } else if (versionMismatchIndex >= 0) {
        diagnostics.push(diagnostic(
          'MODULE-SIBLING-VERSION-MISMATCH',
          `Sibling document declares module '${ref.id}@${ref.version}' outside the admitted app module version.`,
          source,
        ));
      } else {
        diagnostics.push(diagnostic(
          'MODULE-SIBLING-UNDECLARED',
          `Sibling document declares module '${ref.id}' outside the app module set.`,
          source,
        ));
      }
    }
    reports.push(report);
  }

  return { documents: reports, diagnostics };
}

function useSource(
  use: ModuleResolverContributionUse,
): ModuleResolutionSourcePointer {
  return use.source;
}

function registryRef(record: RegistryEntryRecord): ModuleResolutionRef {
  return {
    id: record.entry.name,
    version: record.entry.version ?? '',
  };
}

function ownerRef(record: RegistryEntryRecord): ModuleResolutionRef {
  return registryRef(record);
}

function payloadSchemaFor(entry: ModuleResolverRegistryEntry, validator: string): unknown {
  if (validator === 'widgetShape.props') {
    return entry.widgetShape?.props;
  }
  return entry[validator];
}

function tokenSlotEvidenceFor(
  record: RegistryEntryRecord,
  input: ModuleResolverInput,
): ModuleResolutionContribution['widgetTokenSlots'] | undefined {
  const tokenSlots = record.entry.widgetShape?.tokenSlots;
  if (!Array.isArray(tokenSlots)) return undefined;

  const evidence = tokenSlots.flatMap((slot, index): NonNullable<ModuleResolutionContribution['widgetTokenSlots']> => {
    if (!slot || typeof slot !== 'object') return [];
    const candidate = slot as { name?: unknown; acceptedTokenCategories?: unknown };
    if (typeof candidate.name !== 'string') return [];
    if (!Array.isArray(candidate.acceptedTokenCategories)) return [];
    if (!candidate.acceptedTokenCategories.every((category) => typeof category === 'string')) return [];
    if (candidate.acceptedTokenCategories.length === 0) return [];
    const acceptedTokenCategories = candidate.acceptedTokenCategories as [string, ...string[]];
    return [{
      name: candidate.name,
      acceptedTokenCategories: [acceptedTokenCategories[0], ...acceptedTokenCategories.slice(1)],
      source: registrySource(record, input, `/entries/${record.entryIndex}/widgetShape/tokenSlots/${index}`),
    }];
  });

  return evidence.length > 0 ? evidence : undefined;
}

interface TokenCategoryCandidate {
  prefix: string;
  record: RegistryEntryRecord;
  owner: RegistryEntryRecord;
}

function tokenCategoryEvidenceFor(
  candidate: TokenCategoryCandidate,
  input: ModuleResolverInput,
  status: ModuleResolutionTokenCategoryEvidence['status'],
): ModuleResolutionTokenCategoryEvidence {
  return {
    prefix: candidate.prefix,
    status,
    entryName: candidate.record.entry.name,
    ...(candidate.record.entry.version ? { entryVersion: candidate.record.entry.version } : {}),
    owningModules: [ownerRef(candidate.owner)],
    source: registrySource(candidate.record, input, `/entries/${candidate.record.entryIndex}/categoryShape`),
  };
}

function tokenCategoryDiagnostic(
  record: RegistryEntryRecord,
  input: ModuleResolverInput,
  reason: string,
  pointer = `/entries/${record.entryIndex}/categoryShape`,
  extraDetails: Record<string, unknown> = {},
): ModuleResolutionDiagnostic {
  return diagnostic(
    'MODULE-TOKEN-CATEGORY-SHAPE',
    `Token category contribution '${record.entry.name}' has invalid categoryShape evidence.`,
    registrySource(record, input, pointer),
    {
      details: {
        entryName: record.entry.name,
        reason,
        ...extraDetails,
      },
    },
  );
}

function tokenCategoryShapeMismatch(
  record: RegistryEntryRecord,
  owner: RegistryEntryRecord,
  input: ModuleResolverInput,
  prefix: string,
): ModuleResolutionTokenCategoryEvidence {
  return {
    prefix,
    status: 'shape-mismatch',
    entryName: record.entry.name,
    ...(record.entry.version ? { entryVersion: record.entry.version } : {}),
    owningModules: [ownerRef(owner)],
    source: registrySource(record, input, `/entries/${record.entryIndex}/categoryShape`),
  };
}

function tokenKeysForShape(shape: ModuleResolverRegistryEntry['categoryShape']): string[] | undefined {
  const tokens = shape?.tokens;
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return undefined;
  return Object.keys(tokens);
}

function tokenCategoryRecordsForContribution(
  index: RegistryIndex,
  contributionName: string,
): RegistryEntryRecord[] {
  return (index.entriesByNameAll.get(contributionName) ?? [])
    .filter((record) => record.entry.category === 'token-category');
}

function normalizeTokenCategories(
  input: ModuleResolverInput,
  index: RegistryIndex,
  moduleStates: ReadonlyMap<string, ModuleState>,
): {
  tokenCategories: ModuleResolutionTokenCategoryEvidence[];
  diagnostics: ModuleResolutionDiagnostic[];
} {
  const tokenCategories: ModuleResolutionTokenCategoryEvidence[] = [];
  const diagnostics: ModuleResolutionDiagnostic[] = [];
  const validCandidatesByPrefix = new Map<string, TokenCategoryCandidate[]>();

  for (const state of moduleStates.values()) {
    if (state.report.status !== 'admitted' || !state.registry) continue;
    const owner = state.registry;
    for (const contributionName of owner.entry.contributes ?? []) {
      for (const record of tokenCategoryRecordsForContribution(index, contributionName)) {
        const shape = record.entry.categoryShape;
        const rawPrefix = shape?.prefix;
        const prefix = typeof rawPrefix === 'string' ? rawPrefix : '<missing>';
        if (typeof rawPrefix !== 'string') {
          tokenCategories.push(tokenCategoryShapeMismatch(record, owner, input, prefix));
          diagnostics.push(tokenCategoryDiagnostic(
            record,
            input,
            'missing-prefix',
            `/entries/${record.entryIndex}/categoryShape/prefix`,
          ));
          continue;
        }
        if (!CUSTOM_TOKEN_CATEGORY_PREFIX_PATTERN.test(rawPrefix)) {
          tokenCategories.push(tokenCategoryShapeMismatch(record, owner, input, rawPrefix));
          diagnostics.push(tokenCategoryDiagnostic(
            record,
            input,
            'invalid-prefix',
            `/entries/${record.entryIndex}/categoryShape/prefix`,
            { prefix: rawPrefix },
          ));
          continue;
        }
        const tokenKeys = tokenKeysForShape(shape);
        const invalidTokenKey = tokenKeys?.find((key) => !key.startsWith(`${rawPrefix}.`));
        if (!tokenKeys || tokenKeys.length === 0 || invalidTokenKey !== undefined) {
          tokenCategories.push(tokenCategoryShapeMismatch(record, owner, input, rawPrefix));
          diagnostics.push(tokenCategoryDiagnostic(
            record,
            input,
            invalidTokenKey !== undefined ? 'token-key-prefix-mismatch' : 'missing-tokens',
            `/entries/${record.entryIndex}/categoryShape/tokens`,
            { prefix: rawPrefix, ...(invalidTokenKey !== undefined ? { tokenKey: invalidTokenKey } : {}) },
          ));
          continue;
        }
        const candidates = validCandidatesByPrefix.get(rawPrefix) ?? [];
        candidates.push({ prefix: rawPrefix, record, owner });
        validCandidatesByPrefix.set(rawPrefix, candidates);
      }
    }
  }

  for (const [prefix, candidates] of validCandidatesByPrefix) {
    if (candidates.length === 1) {
      tokenCategories.push(tokenCategoryEvidenceFor(candidates[0], input, 'admitted'));
      continue;
    }
    const [primary, ...related] = candidates;
    tokenCategories.push({
      prefix,
      status: 'conflict',
      entryName: primary.record.entry.name,
      ...(primary.record.entry.version ? { entryVersion: primary.record.entry.version } : {}),
      owningModules: candidates.map((candidate) => ownerRef(candidate.owner)),
      source: registrySource(primary.record, input, `/entries/${primary.record.entryIndex}/categoryShape`),
    });
    diagnostics.push(diagnostic(
      'MODULE-TOKEN-CATEGORY-CONFLICT',
      `More than one admitted token-category contribution claims prefix '${prefix}'.`,
      registrySource(primary.record, input, `/entries/${primary.record.entryIndex}/categoryShape/prefix`),
      {
        relatedSources: related.map((candidate) =>
          registrySource(candidate.record, input, `/entries/${candidate.record.entryIndex}/categoryShape/prefix`)
        ),
        details: {
          prefix,
          entries: candidates.map((candidate) => candidate.record.entry.name),
          owners: candidates.map((candidate) => candidate.owner.entry.name),
        },
      },
    ));
  }

  tokenCategories.sort((left, right) =>
    left.prefix.localeCompare(right.prefix)
    || (left.entryName ?? '').localeCompare(right.entryName ?? '')
    || left.status.localeCompare(right.status)
  );

  return { tokenCategories, diagnostics };
}

function payloadValidatorName(
  use: ModuleResolverContributionUse,
  entry: RegistryEntryRecord,
  input: ModuleResolverInput,
): string | undefined {
  if (use.payload === undefined) return undefined;
  if (use.payloadValidator) return use.payloadValidator;
  return input.support?.payloadSchemaValidators?.find((validator) => payloadSchemaFor(entry.entry, validator) !== undefined);
}

function payloadDiagnosticSource(
  use: ModuleResolverContributionUse,
  fallback: ModuleResolutionSourcePointer,
  path: string | undefined,
): ModuleResolutionSourcePointer {
  const source = use.payloadSource ?? fallback;
  if (!path) return source;
  return {
    ...source,
    jsonPointer: `${source.jsonPointer}/${path}`,
  };
}

function resolvePayload(
  use: ModuleResolverContributionUse,
  entry: RegistryEntryRecord,
  source: ModuleResolutionSourcePointer,
  input: ModuleResolverInput,
): { status: ModuleResolutionPayloadStatus; diagnostic?: ModuleResolutionDiagnostic } {
  const validatorName = payloadValidatorName(use, entry, input);
  if (!validatorName) return { status: 'not-run' };
  const validate = input.support?.payloadValidators?.[validatorName];
  if (!validate) return { status: 'missing-validator' };
  const result = validate({
    payload: use.payload,
    schema: payloadSchemaFor(entry.entry, validatorName),
  });
  if (result.ok) return { status: 'passed' };
  return {
    status: 'failed',
    diagnostic: diagnostic(
      'MODULE-PAYLOAD-SCHEMA-MISMATCH',
      `Payload for contribution '${use.name}' does not match ${validatorName}.`,
      payloadDiagnosticSource(use, source, result.path),
      {
        relatedSources: [registrySource(entry, input, `/entries/${entry.entryIndex}/widgetShape/props`)],
        details: { contribution: use.name, validator: validatorName },
      },
    ),
  };
}

function resolveContributions(
  input: ModuleResolverInput,
  index: RegistryIndex,
  moduleStates: ReadonlyMap<string, ModuleState>,
): { contributions: ModuleResolutionContribution[]; diagnostics: ModuleResolutionDiagnostic[] } {
  const contributions: ModuleResolutionContribution[] = [];
  const diagnostics: ModuleResolutionDiagnostic[] = [];

  for (const document of input.documents ?? []) {
    for (const use of document.uses ?? []) {
      const entry = index.entriesByName.get(use.name);
      const owners = index.contributedBy.get(use.name) ?? [];
      const admittedOwners = owners.filter((owner) => moduleStates.get(owner.entry.name)?.report.status === 'admitted');
      const source = useSource(use);
      const contribution: ModuleResolutionContribution = {
        site: use.site,
        name: use.name,
        expectedCategory: use.expectedCategory,
        status: 'resolved',
        payloadStatus: 'not-run',
        source,
      };

      if (!entry) {
        contribution.status = 'missing';
        diagnostics.push(diagnostic(
          'MODULE-CONTRIBUTION-MISSING',
          `Contribution '${use.name}' is absent from the Registry entry index.`,
          source,
          { details: { contribution: use.name, expectedCategory: use.expectedCategory } },
        ));
        contributions.push(contribution);
        continue;
      }

      contribution.registryCategory = entry.entry.category;
      contribution.entryVersion = entry.entry.version;

      if (entry.entry.category !== use.expectedCategory) {
        contribution.owningModules = owners.map(ownerRef);
        contribution.status = 'category-mismatch';
        diagnostics.push(diagnostic(
          'MODULE-CONTRIBUTION-CATEGORY',
          `Contribution '${use.name}' is category '${entry.entry.category}', expected '${use.expectedCategory}'.`,
          source,
          {
            relatedSources: [registrySource(entry, input)],
            details: { registryCategory: entry.entry.category, expectedCategory: use.expectedCategory },
          },
        ));
      } else if (owners.length === 0) {
        contribution.owningModules = [];
        contribution.status = 'unowned';
        diagnostics.push(diagnostic(
          'MODULE-CONTRIBUTION-UNOWNED',
          `Contribution '${use.name}' is not contributed by any Registry module entry.`,
          registrySource(entry, input),
          { details: { contribution: use.name } },
        ));
      } else if (admittedOwners.length > 1) {
        contribution.owningModules = admittedOwners.map(ownerRef);
        contribution.status = 'conflict';
        diagnostics.push(diagnostic(
          'MODULE-CONTRIBUTION-CONFLICT',
          `Contribution '${use.name}' is claimed by more than one admitted module.`,
          registrySource(entry, input),
          { details: { contribution: use.name, owners: admittedOwners.map((owner) => owner.entry.name) } },
        ));
      } else {
        const owner = admittedOwners[0] ?? owners[0];
        const ownerState = moduleStates.get(owner.entry.name);
        if (ownerState?.report.status !== 'admitted') {
          contribution.owningModules = owners.map(ownerRef);
          contribution.status = 'unadmitted';
          diagnostics.push(diagnostic(
            'MODULE-CONTRIBUTION-UNADMITTED',
            `Contribution '${use.name}' is owned by module '${owner.entry.name}', which is not in the admitted app module set.`,
            source,
            {
              relatedSources: [{
                ...registrySource(owner, input),
                module: ownerRef(owner),
              }],
            },
          ));
        } else {
          contribution.owningModules = [ownerRef(owner)];
          const payload = resolvePayload(use, entry, source, input);
          contribution.payloadStatus = payload.status;
          if (payload.status === 'failed' && payload.diagnostic) {
            contribution.status = 'payload-schema-mismatch';
            diagnostics.push(payload.diagnostic);
          } else if (entry.entry.category === 'widget') {
            const tokenSlotEvidence = tokenSlotEvidenceFor(entry, input);
            if (tokenSlotEvidence) {
              contribution.widgetTokenSlots = tokenSlotEvidence;
            }
          }
        }
      }

      contributions.push(contribution);
    }
  }

  return { contributions, diagnostics };
}

function countDiagnostics(
  diagnostics: readonly ModuleResolutionDiagnostic[],
  severity: ModuleResolutionDiagnostic['severity'],
): number {
  return diagnostics.filter((entry) => entry.severity === severity).length;
}

function supportForReport(support: ModuleResolverSupportInput | undefined): ModuleResolutionSupportProfile | undefined {
  if (!support) return undefined;
  const report: ModuleResolutionSupportProfile = {};
  if (support.defaultModules !== undefined) report.defaultModules = support.defaultModules.map(cloneRef);
  if (support.moduleCategories !== undefined) report.moduleCategories = [...support.moduleCategories];
  if (support.contributionCategories !== undefined) report.contributionCategories = [...support.contributionCategories];
  if (support.versionRangeGrammar !== undefined) report.versionRangeGrammar = support.versionRangeGrammar;
  if (support.payloadSchemaValidators !== undefined) report.payloadSchemaValidators = [...support.payloadSchemaValidators];
  return Object.keys(report).length > 0 ? report : undefined;
}

function summaryFor(
  modules: readonly ModuleResolutionModule[],
  documents: readonly ModuleResolutionDocument[],
  contributions: readonly ModuleResolutionContribution[],
  diagnostics: readonly ModuleResolutionDiagnostic[],
): ModuleResolutionReport['summary'] {
  return {
    modules: modules.length,
    admittedModules: modules.filter((entry) => entry.status === 'admitted').length,
    deniedModules: modules.filter((entry) => entry.status === 'denied').length,
    documents: documents.length,
    contributions: contributions.length,
    unresolvedDependencies: diagnostics.filter((entry) => entry.code === 'MODULE-DEPENDENCY-UNRESOLVED').length,
    unresolvedContributions: contributions.filter((entry) => [
      'missing',
      'category-mismatch',
      'unowned',
      'conflict',
      'unadmitted',
    ].includes(entry.status)).length,
    payloadFailures: contributions.filter((entry) => entry.status === 'payload-schema-mismatch').length,
    errors: countDiagnostics(diagnostics, 'error'),
    warnings: countDiagnostics(diagnostics, 'warning'),
    infos: countDiagnostics(diagnostics, 'info'),
  };
}

export function resolveModules(input: ModuleResolverInput): ModuleResolutionReport {
  const index = buildRegistryIndex(input.registries);
  const appModules = resolveAppModules(input, index);
  const documentResults = resolveDocuments(input.documents ?? [], appModules.states, input);
  const contributionResults = resolveContributions(input, index, appModules.states);
  const tokenCategoryResults = normalizeTokenCategories(input, index, appModules.states);
  const diagnostics = [
    ...appModules.diagnostics,
    ...documentResults.diagnostics,
    ...contributionResults.diagnostics,
    ...tokenCategoryResults.diagnostics,
  ];
  const support = supportForReport(input.support);

  return {
    ok: diagnostics.every((entry) => entry.severity !== 'error'),
    modules: appModules.modules,
    documents: documentResults.documents,
    contributions: contributionResults.contributions,
    ...(tokenCategoryResults.tokenCategories.length > 0 ? { tokenCategories: tokenCategoryResults.tokenCategories } : {}),
    diagnostics,
    summary: summaryFor(
      appModules.modules,
      documentResults.documents,
      contributionResults.contributions,
      diagnostics,
    ),
    phase: { phase: MODULE_PHASE, status: 'completed' },
    ...(support ? { support } : {}),
  };
}
