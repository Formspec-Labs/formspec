/** @filedesc Compile-time checks for generated schema type contracts. */
import type {
  ArtifactResolutionReport,
  AppGraphValidationReport,
  CustomComponentRef,
  CustomWidgetName,
  ComponentDocument,
  Extensions,
  FormDefinition,
  ModuleResolutionExtensions,
  ThemeDocument,
  ThemeWidgetName,
  WidgetName,
} from './generated/index.js';

const customWidget: CustomWidgetName = 'x-camera';
const customWidgetAsDefinitionWidget: WidgetName = 'x-camera';
const customWidgetAsThemeWidget: ThemeWidgetName = 'x-camera';
const noThemeWidget: ThemeWidgetName = 'none';
const customComponent: CustomComponentRef = { component: 'AddressBlock' };
const generatedDefinition: FormDefinition = {
  $formspec: '1.0',
  url: 'urn:test:definition',
  version: '1.0.0',
  status: 'draft',
  title: 'Test',
  items: [],
  'x-acme': { owner: 'forms' },
};
const generatedComponent: ComponentDocument = {
  $formspecComponent: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:definition' },
  tree: { component: 'Text', text: 'Hello' },
  'x-acme': true,
};
const generatedComponentWithReferenceFields: ComponentDocument = {
  $formspecComponent: '1.1',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:definition' },
  tree: {
    component: 'TextInput',
    bind: 'name',
    unitRef: 'identity',
    taskRefs: ['identifyApplicant'],
    conceptRefs: [{ id: 'personName', source: 'registry' }],
    'x-generation': {
      source: 'unit:identity',
      strategy: 'unit-to-section',
      generatedBy: 'formspec-types-test',
      generatedAt: '2026-05-22T00:00:00Z',
      anchors: ['unit:identity', 'task:identifyApplicant'],
    },
  },
};
const generatedComponentRouteOnly: ComponentDocument = {
  $formspecComponent: '1.2',
  version: '1.0.0',
  targetSurfaceRoutes: [
    {
      surface: { url: 'urn:test:surface' },
      route: 'review',
      role: 'route',
    },
  ],
  tree: { component: 'Stack', children: [] },
};
const generatedComponentMixedIdentity: ComponentDocument = {
  ...generatedComponentRouteOnly,
  targetDefinition: { url: 'urn:test:definition' },
};
const generatedTheme: ThemeDocument = {
  $formspecTheme: '1.0',
  version: '1.0.0',
  targetDefinition: { url: 'urn:test:definition' },
  'x-acme': true,
};
const generatedThemeWithWidget: ThemeDocument = {
  ...generatedTheme,
  items: { name: { widget: 'TextInput' } },
};
const generatedDefinitionExtensions: FormDefinition = {
  ...generatedDefinition,
  extensions: { 'x-acme': true },
};
const generatedThemeExtensions: ThemeDocument = {
  ...generatedTheme,
  extensions: { 'x-acme': true },
};
const extensions: Extensions = { 'x-acme': true };
const moduleResolutionExtensions: ModuleResolutionExtensions = { 'x-acme': true };
const generatedAppGraphReport: AppGraphValidationReport = {
  ok: true,
  summary: {
    artifacts: 1,
    loadedArtifacts: 1,
    schemaFailures: 0,
    unvalidatedArtifacts: 0,
    graphErrors: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    importedDiagnostics: 0,
    unsupportedFeatures: 0,
    skippedPhases: 0,
  },
  schemaResults: [],
  diagnostics: [],
  phases: [{ phase: 'schema', status: 'completed' }],
};
const generatedArtifactResolutionReport: ArtifactResolutionReport = {
  ok: true,
  manifest: {
    slot: 'app',
    artifactKind: 'appManifest',
    status: 'loaded',
    document: 'opaque manifest payload',
  },
  artifacts: {
    components: [
      {
        slot: 'components[0]',
        artifactKind: 'component',
        status: 'x-loader-cached',
        ref: {
          url: 'urn:test:component',
          version: '1.0.0',
          handle: 'review-panel',
          'x-loader': 'memory',
        },
        document: [{ opaque: true }],
      },
    ],
  },
  diagnostics: [
    {
      code: 'ARTIFACT-LOAD-CACHED',
      severity: 'info',
      phase: 'artifact-resolution',
      origin: 'artifact-resolver',
      message: 'loaded from resolver cache',
    },
  ],
  summary: {
    declaredRefs: 1,
    loadedArtifacts: 1,
    missingArtifacts: 0,
    unsupportedRefs: 0,
    discriminatorMismatches: 0,
    versionMismatches: 0,
    identityMismatches: 0,
    errors: 0,
    warnings: 0,
    infos: 1,
  },
  phase: { phase: 'artifact-resolution', status: 'completed' },
};

// @ts-expect-error Custom widgets must use the x-* extension prefix.
const badCustomWidget: CustomWidgetName = 'camera';

// @ts-expect-error Lowercase widget aliases are not part of the greenfield contract.
const badDefinitionWidget: WidgetName = 'dropdown';

// @ts-expect-error Custom component references are PascalCase, not x-* extension names.
const badCustomComponent: CustomComponentRef = { component: 'x-address' };

// @ts-expect-error Theme widgets must use canonical PascalCase names or x-* custom widgets.
const badThemeItemWidget: ThemeDocument = { ...generatedTheme, items: { name: { widget: 'textInput' } } };

// @ts-expect-error Generated Definition roots are closed except for x-* extensions.
const badDefinitionRoot: FormDefinition = { ...generatedDefinition, acme: true };

// @ts-expect-error Generated Component roots are closed except for x-* extensions.
const badComponentRoot: ComponentDocument = { ...generatedComponent, acme: true };

// @ts-expect-error Component 1.0/1.1 documents remain form-bound.
const badLegacyComponentMissingTarget: ComponentDocument = {
  $formspecComponent: '1.1',
  version: '1.0.0',
  tree: { component: 'Text', text: 'Missing targetDefinition' },
};

// @ts-expect-error Component 1.0/1.1 documents cannot use route identity.
const badLegacyComponentRouteIdentity: ComponentDocument = {
  ...generatedComponentRouteOnly,
  $formspecComponent: '1.1',
};

// @ts-expect-error Component 1.2 documents require targetDefinition or targetSurfaceRoutes.
const badComponent12MissingIdentity: ComponentDocument = {
  $formspecComponent: '1.2',
  version: '1.0.0',
  tree: { component: 'Text', text: 'Missing identity' },
};

// @ts-expect-error Generated Theme roots are closed except for x-* extensions.
const badThemeRoot: ThemeDocument = { ...generatedTheme, acme: true };

// @ts-expect-error Definition document extension objects only accept x-* keys.
const badDefinitionExtensions: FormDefinition = { ...generatedDefinition, extensions: { acme: true } };

// @ts-expect-error Theme document extension objects only accept x-* keys.
const badThemeExtensions: ThemeDocument = { ...generatedTheme, extensions: { acme: true } };

// @ts-expect-error Extension objects only accept x-* keys.
const badExtensions: Extensions = { acme: true };

// @ts-expect-error ModuleResolution extension objects only accept x-* keys.
const badModuleResolutionExtensions: ModuleResolutionExtensions = { acme: true };

const badArtifactResolutionStatus: ArtifactResolutionReport = {
  ...generatedArtifactResolutionReport,
  // @ts-expect-error ArtifactResolver extension statuses must use x-*.
  manifest: { ...generatedArtifactResolutionReport.manifest, status: 'cached' },
};

const badArtifactResolutionRef: ArtifactResolutionReport = {
  ...generatedArtifactResolutionReport,
  artifacts: {
    components: [
      {
        slot: 'components[0]',
        artifactKind: 'component',
        status: 'loaded',
        // @ts-expect-error ArtifactResolver refs reject fixture/path-derived identity fields.
        ref: { url: 'urn:test:component', fixture: 'component.json' },
      },
    ],
  },
};

void customWidget;
void customWidgetAsDefinitionWidget;
void customWidgetAsThemeWidget;
void noThemeWidget;
void customComponent;
void generatedDefinition;
void generatedComponent;
void generatedComponentWithReferenceFields;
void generatedComponentRouteOnly;
void generatedComponentMixedIdentity;
void generatedTheme;
void generatedThemeWithWidget;
void generatedDefinitionExtensions;
void generatedThemeExtensions;
void extensions;
void moduleResolutionExtensions;
void generatedAppGraphReport;
void generatedArtifactResolutionReport;
void badCustomWidget;
void badDefinitionWidget;
void badCustomComponent;
void badThemeItemWidget;
void badDefinitionRoot;
void badLegacyComponentMissingTarget;
void badLegacyComponentRouteIdentity;
void badComponent12MissingIdentity;
void badComponentRoot;
void badThemeRoot;
void badDefinitionExtensions;
void badThemeExtensions;
void badExtensions;
void badModuleResolutionExtensions;
void badArtifactResolutionStatus;
void badArtifactResolutionRef;
