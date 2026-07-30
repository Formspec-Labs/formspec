/**
 * @filedesc Bundle export → typed artifacts a renderer can hold.
 *
 * A bundle export is `{manifest, documents}`: the manifest indirects every
 * artifact through a URL, and `documents` holds each one keyed by that URL. A
 * shell cannot match its first route until something resolves those URLs into a
 * `SurfaceDocument`, a `ThemeDocument`, a `FormDefinition` (gap ledger
 * `bundle-manifest-dereference`).
 *
 * ## Why not `resolveArtifacts`
 *
 * `resolveArtifacts` (`@formspec-org/app-graph`) is genuinely on the public
 * export surface, knows every manifest slot and its `$formspec*` discriminator,
 * version-gates by `$formspecBundle`, and reports diagnostics instead of
 * throwing. It models a **different shape**, twice over:
 *
 * - it resolves sibling refs through a caller-supplied `ArtifactLoader`, i.e. a
 *   manifest whose artifacts live somewhere else — but a bundle export has
 *   already inlined them, so the loader a caller would pass is
 *   `({ref}) => export.documents[ref.url]`: the lookup itself, wrapped; and
 * - `ArtifactResolutionHandle.document` is `unknown` by design ("preserved only
 *   as data evidence"), so a renderer must narrow every artifact by hand.
 *
 * It is built to produce a validation report, not to hand a renderer typed
 * artifacts. This hands the renderer typed artifacts and resolves the App
 * Manifest entry Surface that runtime composition needs. It does not validate
 * discriminators, schemas, sibling versions, or unsupported manifest versions.
 * A host that wants that report runs `resolveArtifacts` alongside. The
 * validating bundle-export arm still belongs beside `resolveArtifacts`, and the
 * ledger entry stays open for it.
 *
 * ## Missing documents are diagnostics, not exceptions
 *
 * The spike threw on a missing document, reasoning that a shell rendering half a
 * bundle is worse than one that refuses. That is right about the *outcome* and
 * wrong about the *mechanism*: throwing means the host learns about one missing
 * artifact at a time and cannot show a person what is wrong. This collects every
 * absence and lets the host decide — refuse, or render what resolved with the
 * gaps named. {@link bundleIsRenderable} reports structural readiness only;
 * authenticity and deployment admission remain separate host decisions.
 */
import type {
  DataSourcesDocument,
  ExperienceDocument,
  FormDefinition,
  OntologyDocument,
  ReferencesDocument,
  RegistryDocument,
  ResponseActionsDocument,
  SurfaceDocument,
  ThemeDocument,
} from '@formspec-org/types';
import type { DataSourceCatalogHandle } from './data-source-loader.js';
import { surfaceDiagnostic, type SurfaceDiagnostic } from './diagnostics.js';
import type { ExperienceDocumentHandle } from './experience-unit.js';

export interface BundleArtifactRef {
  url: string;
  version?: string;
}

export interface BundleManifest {
  $formspecBundle?: string;
  version?: string;
  id?: string;
  title?: string;
  'x-generation'?: { anchors?: readonly string[] };
  definitions?: readonly BundleArtifactRef[];
  experience?: BundleArtifactRef;
  experiences?: readonly BundleArtifactRef[];
  theme?: BundleArtifactRef;
  /** Legacy single References association. App Manifest 2.4 adds referenceDocuments[]. */
  references?: BundleArtifactRef;
  /** Ordered, target-aware References associations. Legacy references loads first when both exist. */
  referenceDocuments?: readonly BundleArtifactRef[];
  /** Legacy single Ontology association. App Manifest 2.4 adds ontologies[]. */
  ontology?: BundleArtifactRef;
  /** Ordered, target-aware Ontology associations. Legacy ontology loads first when both exist. */
  ontologies?: readonly BundleArtifactRef[];
  registries?: readonly BundleArtifactRef[];
  /** Legacy single Response Actions association. App Manifest 2.4 adds responseActionDocuments[]. */
  responseActions?: BundleArtifactRef;
  /** Ordered Response Actions associations. Legacy responseActions loads first when both exist. */
  responseActionDocuments?: readonly BundleArtifactRef[];
  dataSources?: readonly BundleArtifactRef[];
  surfaces?: readonly BundleArtifactRef[];
  entrySurface?: string;
  modules?: readonly { id: string; version: string }[];
  sessions?: readonly unknown[];
}

export interface BundleExport {
  manifest: BundleManifest;
  documents: Readonly<Record<string, unknown>>;
}

export interface ResolvedBundle {
  manifest: BundleManifest;
  title: string | undefined;
  surfaces: readonly SurfaceDocument[];
  /**
   * The exact loaded Surface selected by App Manifest 2.4.
   *
   * `null` means 2.4 selected no Surface (valid zero-Surface app, ambiguous
   * omission, or unresolved explicit selector). Older 2.x bundles omit this
   * property so composition retains their historical manifest-order rule.
   */
  entrySurface?: SurfaceDocument | null;
  /**
   * Manifest URL for each resolved Surface object. Object identity preserves
   * the exact ref even when malformed documents repeat a local `id`.
   */
  surfaceRefs?: ReadonlyMap<SurfaceDocument, string> | undefined;
  experiences: readonly ExperienceDocument[];
  /**
   * Loaded Experiences paired with their exact App Manifest URLs.
   *
   * Optional so callers that construct legacy `ResolvedBundle` values by hand
   * keep unqualified unit resolution. Qualified bindings fail closed without
   * these handles.
   */
  experienceHandles?: readonly ExperienceDocumentHandle[] | undefined;
  /** The TENANT theme. Which routes may see it is `theme-authority.ts`'s call. */
  tenantTheme: ThemeDocument | undefined;
  /**
   * Loaded References documents in manifest order.
   *
   * Each document keeps its own targetDefinition; renderers select only the
   * documents targeting the active Definition.
   */
  references?: readonly ReferencesDocument[] | undefined;
  /**
   * Loaded Ontology documents in manifest order.
   *
   * Order is significant because Ontology/Assist resolution gives a later
   * binding precedence for the same target path.
   */
  ontologies?: readonly OntologyDocument[] | undefined;
  registries: readonly RegistryDocument[];
  /** Loaded legacy then plural Response Actions documents in manifest order. */
  responseActions: readonly ResponseActionsDocument[];
  /** Exact manifested catalog handles; source ids are never resolved globally. */
  dataSources?: readonly DataSourceCatalogHandle[] | undefined;
  /** Definitions keyed by the URL a `definition-form` binding names. */
  definitions: ReadonlyMap<string, FormDefinition>;
  diagnostics: readonly SurfaceDiagnostic[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function dereferenceBundleExport(bundle: BundleExport): ResolvedBundle {
  const diagnostics: SurfaceDiagnostic[] = [];
  const documents = bundle.documents ?? {};

  function lookup<T>(ref: BundleArtifactRef | undefined, slot: string): T | undefined {
    if (!ref) return undefined;
    const found = documents[ref.url];
    if (found === undefined) {
      diagnostics.push(
        surfaceDiagnostic(
          'BUNDLE-DOCUMENT-MISSING',
          `The release lists a ${slot} at "${ref.url}" and does not contain it.`,
          { source: ref.url },
          { slot },
        ),
      );
      return undefined;
    }
    if (!isRecord(found)) {
      diagnostics.push(
        surfaceDiagnostic(
          'BUNDLE-DOCUMENT-SHAPE',
          `The ${slot} at "${ref.url}" is not a document.`,
          { source: ref.url },
          { slot },
        ),
      );
      return undefined;
    }
    return found as T;
  }

  function lookupAll<T>(refs: readonly BundleArtifactRef[] | undefined, slot: string): T[] {
    return (refs ?? []).flatMap((ref) => {
      const found = lookup<T>(ref, slot);
      return found === undefined ? [] : [found];
    });
  }

  const surfaceRefs = new Map<SurfaceDocument, string>();
  const resolvedSurfaces = (bundle.manifest.surfaces ?? []).flatMap((ref) => {
    const found = lookup<SurfaceDocument>(ref, 'Surface');
    if (found === undefined) return [];
    surfaceRefs.set(found, ref.url);
    return [{ ref, document: found }];
  });
  const surfaces = resolvedSurfaces.map(({ document }) => document);

  let entrySurface: SurfaceDocument | null | undefined;
  if (bundle.manifest.$formspecBundle === '2.4') {
    const refs = bundle.manifest.surfaces ?? [];
    const selector = bundle.manifest.entrySurface;

    if (selector !== undefined) {
      const manifestMatches = refs.filter((ref) => ref.url === selector).length;
      const loadedMatches = resolvedSurfaces.filter(({ ref }) => ref.url === selector);
      if (manifestMatches === 1 && loadedMatches.length === 1) {
        entrySurface = loadedMatches[0]?.document ?? null;
      } else {
        entrySurface = null;
        diagnostics.push(
          surfaceDiagnostic(
            'APP-ENTRY-SURFACE-UNRESOLVED',
            `App Manifest entrySurface "${selector}" does not resolve to exactly one manifested and loaded Surface.`,
            { source: selector },
            {
              reason: 'entry-surface-unresolved',
              entrySurface: selector,
              manifestMatches,
              loadedMatches: loadedMatches.length,
            },
          ),
        );
      }
    } else if (refs.length > 1) {
      entrySurface = null;
      diagnostics.push(
        surfaceDiagnostic(
          'APP-ENTRY-AMBIGUOUS',
          'App Manifest 2.4 declares more than one Surface without selecting entrySurface.',
          {},
          {
            reason: 'entry-surface-required',
            surfaceCount: refs.length,
          },
        ),
      );
    } else if (refs.length === 1) {
      const soleUrl = refs[0]?.url;
      const loadedMatches = soleUrl === undefined
        ? []
        : resolvedSurfaces.filter(({ ref }) => ref.url === soleUrl);
      if (soleUrl !== undefined && loadedMatches.length === 1) {
        entrySurface = loadedMatches[0]?.document ?? null;
      } else {
        entrySurface = null;
        diagnostics.push(
          surfaceDiagnostic(
            'APP-ENTRY-SURFACE-UNRESOLVED',
            `App Manifest entry Surface "${soleUrl ?? '<missing>'}" does not resolve to exactly one loaded Surface.`,
            soleUrl === undefined ? {} : { source: soleUrl },
            {
              reason: 'entry-surface-unresolved',
              entrySurface: soleUrl,
              manifestMatches: 1,
              loadedMatches: loadedMatches.length,
            },
          ),
        );
      }
    } else {
      entrySurface = null;
    }
  }
  const experienceRefs = bundle.manifest.experiences ??
    (bundle.manifest.experience ? [bundle.manifest.experience] : []);
  const experienceHandles = experienceRefs.flatMap((ref): ExperienceDocumentHandle[] => {
    const document = lookup<ExperienceDocument>(ref, 'Experience');
    return document === undefined
      ? []
      : [{ experienceRef: ref.url, document }];
  });
  const experiences = experienceHandles.map(({ document }) => document);
  const referenceRefs = [
    ...(bundle.manifest.references ? [bundle.manifest.references] : []),
    ...(bundle.manifest.referenceDocuments ?? []),
  ];
  const references = lookupAll<ReferencesDocument>(
    referenceRefs,
    'References document',
  );
  const ontologyRefs = [
    ...(bundle.manifest.ontology ? [bundle.manifest.ontology] : []),
    ...(bundle.manifest.ontologies ?? []),
  ];
  const ontologies = lookupAll<OntologyDocument>(
    ontologyRefs,
    'Ontology document',
  );
  const registries = lookupAll<RegistryDocument>(bundle.manifest.registries, 'Registry');
  const tenantTheme = lookup<ThemeDocument>(bundle.manifest.theme, 'Theme');
  const responseActionRefs = [
    ...(bundle.manifest.responseActions ? [bundle.manifest.responseActions] : []),
    ...(bundle.manifest.responseActionDocuments ?? []),
  ];
  const responseActions = lookupAll<ResponseActionsDocument>(
    responseActionRefs,
    'Response Actions document',
  );
  const dataSources = (bundle.manifest.dataSources ?? []).flatMap((ref) => {
    const document = lookup<DataSourcesDocument>(ref, 'Data Sources catalog');
    return document === undefined ? [] : [{ catalogRef: ref.url, document }];
  });

  const definitions = new Map<string, FormDefinition>();
  for (const ref of bundle.manifest.definitions ?? []) {
    const found = lookup<FormDefinition>(ref, 'Definition');
    if (found !== undefined) definitions.set(ref.url, found);
  }

  return {
    manifest: bundle.manifest,
    title: typeof bundle.manifest.title === 'string' ? bundle.manifest.title : undefined,
    surfaces,
    ...(entrySurface === undefined ? {} : { entrySurface }),
    surfaceRefs,
    experiences,
    experienceHandles,
    tenantTheme,
    references,
    ontologies,
    registries,
    responseActions,
    dataSources,
    definitions,
    diagnostics,
  };
}

/**
 * A bundle is renderable when nothing it *lists* is absent. Structural absence
 * only — this makes no claim about validity or authenticity, returns no
 * verification verdict, and supplies no default. `resolveArtifacts`, the
 * app-graph validator, and the host's verification gate remain separate.
 */
export function bundleIsRenderable(bundle: ResolvedBundle): boolean {
  return !bundle.diagnostics.some(
    (diagnostic) =>
      diagnostic.code === 'BUNDLE-DOCUMENT-MISSING' || diagnostic.code === 'BUNDLE-DOCUMENT-SHAPE',
  );
}
