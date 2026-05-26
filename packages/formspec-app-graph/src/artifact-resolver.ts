/** @filedesc Shared ArtifactResolver kernel for App Manifest sibling refs. */

import type {
  ArtifactResolutionDiagnostic,
  ArtifactResolutionHandle,
  ArtifactResolutionHandleStatus,
  ArtifactResolutionIdentity,
  ArtifactResolutionRef,
  ArtifactResolutionReport,
  ArtifactResolutionSourcePointer,
} from '@formspec-org/types';
import type {
  AppGraphArtifactIdentity,
  AppGraphArtifactRef,
  AppGraphDiagnostic,
  AppGraphDiagnosticReport,
  AppGraphSourcePointer,
  AppGraphValidationRequest,
  ResolvedArtifactHandle,
} from './types.js';

export interface ArtifactResolverSupportProfile {
  bundleVersions?: string[];
  artifactKinds?: string[];
  uriSchemes?: string[];
}

export interface ArtifactLoaderInput {
  slot: string;
  ref: ArtifactResolutionRef;
  artifactKind: string;
  support: ArtifactResolverSupportProfile;
}

export interface ArtifactLoaderDiagnosticInput {
  code: string;
  severity?: ArtifactResolutionDiagnostic['severity'];
  message: string;
  primarySource?: ArtifactResolutionDiagnostic['primarySource'];
  relatedSources?: ArtifactResolutionDiagnostic['relatedSources'];
  details?: Record<string, unknown>;
}

export interface ArtifactLoaderOutcome {
  status: ArtifactResolutionHandleStatus;
  document?: unknown;
  schemaId?: string;
  identity?: ArtifactResolutionIdentity;
  source?: string;
  digest?: string;
  diagnostics?: ArtifactLoaderDiagnosticInput[];
}

export type ArtifactLoader = (input: ArtifactLoaderInput) => ArtifactLoaderOutcome | Promise<ArtifactLoaderOutcome>;

export interface ArtifactResolverRequest {
  manifest: unknown;
  loader: ArtifactLoader;
  support?: ArtifactResolverSupportProfile;
  source?: string;
  digest?: string;
  schemaId?: string;
}

export interface ArtifactResolutionGraphInput {
  manifest: ResolvedArtifactHandle;
  handles: ResolvedArtifactHandle[];
  artifacts: NonNullable<AppGraphValidationRequest['artifacts']>;
  artifactResolution: AppGraphDiagnosticReport;
}

type ArtifactGroup = keyof ArtifactResolutionReport['artifacts'];

interface SlotSpec {
  group: ArtifactGroup;
  manifestKey: string;
  artifactKind: string;
  discriminator: string;
  cardinality: 'array' | 'single';
  minBundleVersion?: '2.1' | '2.2' | '2.3';
}

interface DeclaredRef {
  spec: SlotSpec;
  slot: string;
  pointer: string;
  value: unknown;
}

interface ParsedRef {
  ref?: ArtifactResolutionRef;
  malformed?: string;
}

const DEFAULT_SUPPORT: Required<ArtifactResolverSupportProfile> = {
  bundleVersions: ['2.0', '2.1', '2.2', '2.3'],
  artifactKinds: [
    'definition',
    'experience',
    'responseActions',
    'component',
    'theme',
    'references',
    'ontology',
    'registry',
    'surface',
    'screener',
    'dataSources',
    'locale',
    'mapping',
  ],
  uriSchemes: [],
};

const SLOT_SPECS: readonly SlotSpec[] = [
  { group: 'definitions', manifestKey: 'definitions', artifactKind: 'definition', discriminator: '$formspec', cardinality: 'array' },
  { group: 'experience', manifestKey: 'experience', artifactKind: 'experience', discriminator: '$formspecExperience', cardinality: 'single' },
  { group: 'responseActions', manifestKey: 'responseActions', artifactKind: 'responseActions', discriminator: '$formspecResponseActions', cardinality: 'single' },
  { group: 'component', manifestKey: 'component', artifactKind: 'component', discriminator: '$formspecComponent', cardinality: 'single' },
  { group: 'components', manifestKey: 'components', artifactKind: 'component', discriminator: '$formspecComponent', cardinality: 'array', minBundleVersion: '2.2' },
  { group: 'theme', manifestKey: 'theme', artifactKind: 'theme', discriminator: '$formspecTheme', cardinality: 'single' },
  { group: 'references', manifestKey: 'references', artifactKind: 'references', discriminator: '$formspecReferences', cardinality: 'single' },
  { group: 'ontology', manifestKey: 'ontology', artifactKind: 'ontology', discriminator: '$formspecOntology', cardinality: 'single' },
  { group: 'registries', manifestKey: 'registries', artifactKind: 'registry', discriminator: '$formspecRegistry', cardinality: 'array' },
  { group: 'surfaces', manifestKey: 'surfaces', artifactKind: 'surface', discriminator: '$formspecSurface', cardinality: 'array' },
  { group: 'screeners', manifestKey: 'screeners', artifactKind: 'screener', discriminator: '$formspecScreener', cardinality: 'array', minBundleVersion: '2.3' },
  { group: 'dataSources', manifestKey: 'dataSources', artifactKind: 'dataSources', discriminator: '$formspecDataSources', cardinality: 'array', minBundleVersion: '2.1' },
  { group: 'locales', manifestKey: 'locales', artifactKind: 'locale', discriminator: '$formspecLocale', cardinality: 'array' },
  { group: 'mappings', manifestKey: 'mappings', artifactKind: 'mapping', discriminator: '$formspecMapping', cardinality: 'array' },
];

const GROUP_ORDER = SLOT_SPECS.map((spec) => spec.group);
const EXACT_SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringProp(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'string' ? candidate : undefined;
}

function supportProfile(support: ArtifactResolverSupportProfile | undefined): Required<ArtifactResolverSupportProfile> {
  return {
    bundleVersions: support?.bundleVersions ?? DEFAULT_SUPPORT.bundleVersions,
    artifactKinds: support?.artifactKinds ?? DEFAULT_SUPPORT.artifactKinds,
    uriSchemes: support?.uriSchemes ?? DEFAULT_SUPPORT.uriSchemes,
  };
}

function versionAllowed(bundleVersion: string | undefined, minimum: SlotSpec['minBundleVersion']): boolean {
  if (!minimum) return true;
  if (minimum === '2.1') return bundleVersion === '2.1' || bundleVersion === '2.2' || bundleVersion === '2.3';
  if (minimum === '2.2') return bundleVersion === '2.2' || bundleVersion === '2.3';
  return bundleVersion === '2.3';
}

function versionGateCode(minimum: SlotSpec['minBundleVersion']): string {
  if (minimum === '2.3') return 'ARTIFACT-SCREENERS-VERSION-GATE';
  if (minimum === '2.2') return 'ARTIFACT-COMPONENTS-VERSION-GATE';
  return 'ARTIFACT-DATASOURCES-VERSION-GATE';
}

function declaredRefs(manifest: unknown): DeclaredRef[] {
  const manifestRecord = record(manifest);
  if (!manifestRecord) return [];
  const refs: DeclaredRef[] = [];
  for (const spec of SLOT_SPECS) {
    const value = manifestRecord[spec.manifestKey];
    if (value === undefined) continue;
    if (spec.cardinality === 'array') {
      if (!Array.isArray(value)) {
        refs.push({ spec, slot: spec.manifestKey, pointer: `/${spec.manifestKey}`, value });
        continue;
      }
      value.forEach((entry, index) => {
        refs.push({
          spec,
          slot: `${spec.manifestKey}[${index}]`,
          pointer: `/${spec.manifestKey}/${index}`,
          value: entry,
        });
      });
    } else {
      refs.push({ spec, slot: spec.manifestKey, pointer: `/${spec.manifestKey}`, value });
    }
  }
  return refs;
}

function parseRef(value: unknown): ParsedRef {
  const refRecord = record(value);
  if (!refRecord) return { malformed: 'ref is not an object' };
  const url = stringProp(refRecord, 'url');
  if (!url) return { malformed: 'ref.url is required' };
  const ref: ArtifactResolutionRef = { url };
  for (const key of ['version', 'handle', 'locale'] as const) {
    if (refRecord[key] === undefined) continue;
    const valueForKey = stringProp(refRecord, key);
    if (!valueForKey) return { malformed: `ref.${key} must be a non-empty string` };
    ref[key] = valueForKey;
  }
  for (const [key, extension] of Object.entries(refRecord)) {
    if (key.startsWith('x-')) {
      ref[key as `x-${string}`] = extension;
    }
  }
  return { ref };
}

function uriScheme(url: string): string | undefined {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  return match?.[1];
}

function supportsScheme(ref: ArtifactResolutionRef, support: Required<ArtifactResolverSupportProfile>): boolean {
  if (support.uriSchemes.length === 0) return true;
  const scheme = ref.url ? uriScheme(ref.url) : undefined;
  return !!scheme && support.uriSchemes.includes(scheme);
}

function diagnostic(
  code: string,
  message: string,
  handle: Pick<ArtifactResolutionHandle, 'slot' | 'artifactKind' | 'source' | 'ref'>,
  jsonPointer = '',
  details?: Record<string, unknown>,
): ArtifactResolutionDiagnostic {
  return {
    code,
    severity: 'error',
    phase: 'artifact-resolution',
    origin: 'artifact-resolver',
    message,
    primarySource: {
      artifactSlot: handle.slot,
      artifactKind: handle.artifactKind,
      source: handle.source,
      jsonPointer,
      ref: handle.ref ? { ...handle.ref } : undefined,
    },
    details,
  };
}

function normalizeLoaderDiagnostic(
  input: ArtifactLoaderDiagnosticInput,
  handle: Pick<ArtifactResolutionHandle, 'slot' | 'artifactKind' | 'source' | 'ref'>,
): ArtifactResolutionDiagnostic {
  return {
    code: input.code,
    severity: input.severity ?? 'error',
    phase: 'artifact-resolution',
    origin: 'artifact-resolver',
    message: input.message,
    primarySource: input.primarySource ?? {
      artifactSlot: handle.slot,
      artifactKind: handle.artifactKind,
      source: handle.source,
      ref: handle.ref ? { ...handle.ref } : undefined,
    },
    relatedSources: input.relatedSources,
    details: input.details,
  };
}

function diagnosticSortKey(diagnostic: ArtifactResolutionDiagnostic): string {
  const source = diagnostic.primarySource;
  return [
    source?.artifactSlot ?? '',
    source?.artifactKind ?? '',
    source?.jsonPointer ?? '',
    source?.ref?.url ?? '',
    diagnostic.code,
    diagnostic.message,
  ].join('\u0000');
}

function normalizeDiagnostics(diagnostics: readonly ArtifactResolutionDiagnostic[]): ArtifactResolutionDiagnostic[] {
  return [...diagnostics].sort((left, right) => diagnosticSortKey(left).localeCompare(diagnosticSortKey(right)));
}

function graphArtifactRef(ref: ArtifactResolutionRef | undefined): AppGraphArtifactRef | undefined {
  if (!ref) return undefined;
  const cloned: AppGraphArtifactRef = {};
  for (const [key, value] of Object.entries(ref)) {
    cloned[key] = value;
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function graphArtifactIdentity(identity: ArtifactResolutionIdentity | undefined): AppGraphArtifactIdentity | undefined {
  return identity ? { ...identity } : undefined;
}

function graphSourcePointer(source: ArtifactResolutionSourcePointer | undefined): AppGraphSourcePointer | undefined {
  if (!source) return undefined;
  const pointer: AppGraphSourcePointer = {};
  if (source.artifactSlot !== undefined) pointer.artifactSlot = source.artifactSlot;
  if (source.artifactKind !== undefined) pointer.artifactKind = source.artifactKind;
  if (source.source !== undefined) pointer.source = source.source;
  if (source.jsonPointer !== undefined) pointer.jsonPointer = source.jsonPointer;
  const ref = graphArtifactRef(source.ref);
  if (ref) pointer.ref = ref;
  return pointer;
}

function graphDiagnostic(diagnostic: ArtifactResolutionDiagnostic): AppGraphDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    phase: diagnostic.phase,
    origin: diagnostic.origin,
    message: diagnostic.message,
    primarySource: graphSourcePointer(diagnostic.primarySource),
    relatedSources: diagnostic.relatedSources?.map(graphSourcePointer).filter((source): source is AppGraphSourcePointer => source !== undefined),
    details: diagnostic.details ? { ...diagnostic.details } : undefined,
  };
}

function graphHandle(handle: ArtifactResolutionHandle): ResolvedArtifactHandle {
  const converted: ResolvedArtifactHandle = {
    slot: handle.slot,
    artifactKind: handle.artifactKind,
    status: handle.status,
  };
  const ref = graphArtifactRef(handle.ref);
  if (ref) converted.ref = ref;
  if (handle.schemaId !== undefined) converted.schemaId = handle.schemaId;
  if (handle.document !== undefined) converted.document = handle.document;
  const identity = graphArtifactIdentity(handle.identity);
  if (identity) converted.identity = identity;
  if (handle.source !== undefined) converted.source = handle.source;
  if (handle.digest !== undefined) converted.digest = handle.digest;
  return converted;
}

export function artifactResolutionGraphInput(report: ArtifactResolutionReport): ArtifactResolutionGraphInput {
  const artifacts: NonNullable<AppGraphValidationRequest['artifacts']> = {};
  for (const [group, handles] of Object.entries(report.artifacts)) {
    if (!handles || handles.length === 0) continue;
    artifacts[group] = handles.map(graphHandle);
  }

  return {
    manifest: graphHandle(report.manifest),
    handles: Object.values(artifacts).flatMap((handles) => handles ?? []),
    artifacts,
    artifactResolution: {
      diagnostics: report.diagnostics.map(graphDiagnostic),
    },
  };
}

function artifactIdentity(document: unknown): ArtifactResolutionIdentity | undefined {
  const doc = record(document);
  if (!doc) return undefined;
  const identity: ArtifactResolutionIdentity = {};
  for (const key of ['url', 'version', 'id', 'name'] as const) {
    const value = stringProp(doc, key);
    if (value) identity[key] = value;
  }
  return Object.keys(identity).length > 0 ? identity : undefined;
}

function discriminatorMatches(document: unknown, discriminator: string): boolean {
  const doc = record(document);
  return doc?.[discriminator] !== undefined;
}

function isExactVersion(value: string | undefined): value is string {
  return typeof value === 'string' && EXACT_SEMVER.test(value);
}

function versionMismatch(ref: ArtifactResolutionRef, identity: ArtifactResolutionIdentity | undefined): boolean {
  const refVersion = ref.version;
  const documentVersion = typeof identity?.version === 'string' ? identity.version : undefined;
  return isExactVersion(refVersion) && isExactVersion(documentVersion) && refVersion !== documentVersion;
}

function identityMismatch(ref: ArtifactResolutionRef, identity: ArtifactResolutionIdentity | undefined): boolean {
  return !!ref.url && typeof identity?.url === 'string' && ref.url !== identity.url;
}

function statusDiagnostic(
  status: ArtifactResolutionHandleStatus,
  handle: ArtifactResolutionHandle,
  expectedDiscriminator?: string,
): ArtifactResolutionDiagnostic | undefined {
  if (status === 'missing') {
    return diagnostic('ARTIFACT-MISSING', `Artifact '${handle.slot}' is missing.`, handle);
  }
  if (status === 'unsupported') {
    return diagnostic('ARTIFACT-UNSUPPORTED-SCHEME', `Artifact '${handle.slot}' is unsupported by the loader.`, handle);
  }
  if (status === 'invalid-discriminator') {
    return diagnostic(
      'ARTIFACT-DISCRIMINATOR-MISMATCH',
      `Loaded artifact '${handle.slot}' does not carry expected discriminator '${expectedDiscriminator ?? '<unknown>'}'.`,
      handle,
      '',
      expectedDiscriminator ? { expectedDiscriminator } : undefined,
    );
  }
  return undefined;
}

function countDiagnostics(
  diagnostics: readonly ArtifactResolutionDiagnostic[],
  severity: ArtifactResolutionDiagnostic['severity'],
): number {
  return diagnostics.filter((entry) => entry.severity === severity).length;
}

function summaryFor(
  handles: readonly ArtifactResolutionHandle[],
  diagnostics: readonly ArtifactResolutionDiagnostic[],
): ArtifactResolutionReport['summary'] {
  return {
    declaredRefs: handles.length,
    loadedArtifacts: handles.filter((handle) => handle.status === 'loaded').length,
    missingArtifacts: handles.filter((handle) => handle.status === 'missing').length,
    unsupportedRefs: handles.filter((handle) => handle.status === 'unsupported').length,
    discriminatorMismatches: handles.filter((handle) => handle.status === 'invalid-discriminator').length,
    versionMismatches: diagnostics.filter((entry) => entry.code === 'ARTIFACT-VERSION-MISMATCH').length,
    identityMismatches: diagnostics.filter((entry) => entry.code === 'ARTIFACT-IDENTITY-MISMATCH').length,
    errors: countDiagnostics(diagnostics, 'error'),
    warnings: countDiagnostics(diagnostics, 'warning'),
    infos: countDiagnostics(diagnostics, 'info'),
  };
}

function artifactGroups(
  groups: Record<ArtifactGroup, ArtifactResolutionHandle[]>,
): ArtifactResolutionReport['artifacts'] {
  const artifacts: ArtifactResolutionReport['artifacts'] = {};
  for (const group of GROUP_ORDER) {
    if (groups[group].length > 0) {
      artifacts[group] = groups[group];
    }
  }
  return artifacts;
}

function emptyGroups(): Record<ArtifactGroup, ArtifactResolutionHandle[]> {
  return {
    definitions: [],
    experience: [],
    responseActions: [],
    component: [],
    components: [],
    theme: [],
    references: [],
    ontology: [],
    registries: [],
    surfaces: [],
    screeners: [],
    dataSources: [],
    locales: [],
    mappings: [],
  };
}

async function resolveDeclaredRef(
  declared: DeclaredRef,
  request: ArtifactResolverRequest,
  support: Required<ArtifactResolverSupportProfile>,
  bundleVersion: string | undefined,
): Promise<ArtifactResolutionHandle> {
  const baseHandle = {
    slot: declared.slot,
    artifactKind: declared.spec.artifactKind,
    source: request.source,
  };
  const parsed = parseRef(declared.value);
  if (!parsed.ref) {
    return {
      ...baseHandle,
      status: 'unsupported',
      diagnostics: [
        diagnostic(
          'ARTIFACT-REF-MALFORMED',
          `Manifest ref '${declared.slot}' is malformed: ${parsed.malformed ?? 'invalid ref shape'}.`,
          baseHandle,
          declared.pointer,
        ),
      ],
    };
  }

  const handleBase = { ...baseHandle, ref: parsed.ref };
  if (!versionAllowed(bundleVersion, declared.spec.minBundleVersion)) {
    return {
      ...handleBase,
      status: 'unsupported',
      diagnostics: [
        diagnostic(
          versionGateCode(declared.spec.minBundleVersion),
          `Manifest member '${declared.spec.manifestKey}' requires App Manifest ${declared.spec.minBundleVersion} or later.`,
          handleBase,
          declared.pointer,
          { bundleVersion, requiredVersion: declared.spec.minBundleVersion },
        ),
      ],
    };
  }

  if (!support.artifactKinds.includes(declared.spec.artifactKind)) {
    return {
      ...handleBase,
      status: 'unsupported',
      diagnostics: [
        diagnostic(
          'ARTIFACT-UNSUPPORTED-SLOT',
          `Artifact kind '${declared.spec.artifactKind}' is outside the resolver support profile.`,
          handleBase,
          declared.pointer,
        ),
      ],
    };
  }

  if (!supportsScheme(parsed.ref, support)) {
    return {
      ...handleBase,
      status: 'unsupported',
      diagnostics: [
        diagnostic(
          'ARTIFACT-UNSUPPORTED-SCHEME',
          `Ref URL '${parsed.ref.url}' uses a scheme outside the resolver support profile.`,
          handleBase,
          declared.pointer,
          { uriSchemes: support.uriSchemes },
        ),
      ],
    };
  }

  let outcome: ArtifactLoaderOutcome;
  try {
    outcome = await request.loader({
      slot: declared.slot,
      ref: parsed.ref,
      artifactKind: declared.spec.artifactKind,
      support,
    });
  } catch (error) {
    return {
      ...handleBase,
      status: 'x-load-failed',
      diagnostics: [
        diagnostic(
          'ARTIFACT-LOAD-FAILED',
          `Loader failed for '${declared.slot}'.`,
          handleBase,
          declared.pointer,
          error instanceof Error ? { errorName: error.name, errorMessage: error.message } : undefined,
        ),
      ],
    };
  }

  const loadedBase = {
    ...handleBase,
    schemaId: outcome.schemaId,
    source: outcome.source,
    digest: outcome.digest,
  };
  const diagnostics = (outcome.diagnostics ?? []).map((entry) => normalizeLoaderDiagnostic(entry, loadedBase));
  const handle: ArtifactResolutionHandle = {
    ...loadedBase,
    status: outcome.status,
  };

  if (outcome.status !== 'loaded') {
    const defaultDiagnostic = statusDiagnostic(outcome.status, handle, declared.spec.discriminator);
    return {
      ...handle,
      diagnostics: normalizeDiagnostics(defaultDiagnostic ? [...diagnostics, defaultDiagnostic] : diagnostics),
    };
  }

  if (outcome.document === undefined) {
    const failed = diagnostic('ARTIFACT-LOAD-FAILED', `Loader returned loaded status without a document for '${declared.slot}'.`, loadedBase, declared.pointer);
    return {
      ...loadedBase,
      status: 'x-load-failed',
      diagnostics: normalizeDiagnostics([...diagnostics, failed]),
    };
  }

  if (!discriminatorMatches(outcome.document, declared.spec.discriminator)) {
    const mismatch = diagnostic(
      'ARTIFACT-DISCRIMINATOR-MISMATCH',
      `Loaded artifact '${declared.slot}' does not carry expected discriminator '${declared.spec.discriminator}'.`,
      loadedBase,
      '',
      { expectedDiscriminator: declared.spec.discriminator },
    );
    return {
      ...loadedBase,
      status: 'invalid-discriminator',
      diagnostics: normalizeDiagnostics([...diagnostics, mismatch]),
    };
  }

  const identity = outcome.identity ?? artifactIdentity(outcome.document);
  if (versionMismatch(parsed.ref, identity)) {
    diagnostics.push(diagnostic(
      'ARTIFACT-VERSION-MISMATCH',
      `Manifest ref version '${parsed.ref.version}' does not match loaded artifact version '${identity?.version}'.`,
      loadedBase,
      '/version',
      { refVersion: parsed.ref.version, documentVersion: identity?.version },
    ));
  }
  if (identityMismatch(parsed.ref, identity)) {
    diagnostics.push(diagnostic(
      'ARTIFACT-IDENTITY-MISMATCH',
      `Manifest ref URL '${parsed.ref.url}' does not match loaded artifact URL '${identity?.url}'.`,
      loadedBase,
      '/url',
      { refUrl: parsed.ref.url, documentUrl: identity?.url },
    ));
  }

  return {
    ...loadedBase,
    status: 'loaded',
    document: outcome.document,
    identity,
    diagnostics: normalizeDiagnostics(diagnostics),
  };
}

export async function resolveArtifacts(request: ArtifactResolverRequest): Promise<ArtifactResolutionReport> {
  const support = supportProfile(request.support);
  const manifestRecord = record(request.manifest);
  const bundleVersion = stringProp(manifestRecord, '$formspecBundle');
  const manifestHandle: ArtifactResolutionHandle = {
    slot: 'app',
    artifactKind: 'appManifest',
    status: support.bundleVersions.includes(bundleVersion ?? '') ? 'loaded' : 'unsupported',
    schemaId: request.schemaId,
    document: request.manifest,
    identity: artifactIdentity(request.manifest),
    source: request.source,
    digest: request.digest,
  };
  const manifestDiagnostics: ArtifactResolutionDiagnostic[] = [];
  if (manifestHandle.status !== 'loaded') {
    manifestDiagnostics.push(diagnostic(
      'ARTIFACT-UNSUPPORTED-SLOT',
      `App Manifest version '${bundleVersion ?? '<missing>'}' is outside the resolver support profile.`,
      manifestHandle,
      '/$formspecBundle',
      { bundleVersion, supportedVersions: support.bundleVersions },
    ));
    manifestHandle.diagnostics = manifestDiagnostics;
  }

  const groups = emptyGroups();
  const handles: ArtifactResolutionHandle[] = [];
  if (manifestHandle.status === 'loaded') {
    for (const declared of declaredRefs(request.manifest)) {
      const handle = await resolveDeclaredRef(declared, request, support, bundleVersion);
      groups[declared.spec.group].push(handle);
      handles.push(handle);
    }
  }

  const diagnostics = normalizeDiagnostics([
    ...manifestDiagnostics,
    ...handles.flatMap((handle) => handle.diagnostics ?? []),
  ]);
  const summary = summaryFor(handles, diagnostics);

  return {
    ok: diagnostics.every((entry) => entry.severity !== 'error'),
    manifest: manifestHandle,
    artifacts: artifactGroups(groups),
    diagnostics,
    summary,
    phase: { phase: 'artifact-resolution', status: 'completed' },
  };
}
