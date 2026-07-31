/**
 * @filedesc `@formspec-org/surface` — the renderer-independent Surface shell.
 *
 * Reads a bundle export's Surface documents and plans a navigable app: routes,
 * matching, slot dispatch over the closed taxonomy, theme authority, the
 * module-widget runtime seam, and transitions. Renders nothing — a renderer
 * binding (`@formspec-org/surface-react`) turns the plans into elements.
 *
 * See the package README for the design calls this package makes on the
 * platform's behalf and why each is here rather than in every host.
 */

export {
  generationNeedAnchors,
  isCanonicalNeedAnchor,
  mergeNeedAnchors,
} from './need-trace.js';

export {
  SURFACE_DIAGNOSTIC_CODES,
  SURFACE_DIAGNOSTIC_SEVERITY,
  documentRootContaminationDiagnostic,
  surfaceDiagnostic,
  type SurfaceDiagnostic,
  type SurfaceDiagnosticCode,
  type SurfaceDiagnosticSeverity,
  type SurfaceDiagnosticSite,
} from './diagnostics.js';

export {
  DEFAULT_SURFACE_STRINGS,
  SURFACE_LOCALE_KEY_PREFIX,
  SURFACE_STRING_KEYS,
  resolveSurfaceLocaleStrings,
  resolveSurfaceStrings,
  type SurfaceLocaleInterpolator,
  type SurfaceLocaleLookup,
  type SurfaceLocaleStringsInput,
  type SurfaceStringKey,
  type SurfaceStringOverride,
  type SurfaceStringOverrides,
  type SurfaceStringTemplate,
  type SurfaceStringVars,
  type SurfaceStrings,
} from './strings.js';

export {
  compareRouteSpecificity,
  fillRoutePath,
  inspectRouteParams,
  matchRoutePath,
  matchRouteSegments,
  parseRoutePath,
  routeParamMarkers,
  routePathPatternKey,
  routePathSegments,
  type ParsedRoutePath,
  type RouteParamMarker,
  type RouteSegment,
  type SurfaceRoute,
  type UnpinnedGrammar,
  type UnpinnedSegment,
} from './route-path.js';

export {
  composeSurfaceApp,
  matchRoute,
  routeHref,
  routeInSurface,
  type SurfaceApp,
  type SurfaceCompositionOptions,
  type SurfaceRouteGroup,
  type SurfaceRouteHandle,
  type SurfaceRouteHrefRefusal,
  type SurfaceRouteMatch,
  type SurfaceRouteRefusal,
  type SurfaceRouteResolution,
} from './composition.js';

export {
  ROUTE_CLASS_THEME_REASON,
  UNCLASSIFIED_THEME_REASON,
  createThemeAuthority,
  type RouteClass,
  type ThemeAuthority,
  type ThemeAuthorityInput,
  type ThemeAuthorityPosture,
  type ThemeGrant,
  type ThemeTokens,
} from './theme-authority.js';

export {
  createWidgetRegistry,
  flattenRegistryEntries,
  widgetContributionFor,
  type FlattenedRegistryEntries,
  type WidgetKey,
  type WidgetModule,
  type WidgetRenderedConfigNodeContract,
  type WidgetRegistry,
  type WidgetRegistryInput,
  type WidgetResolution,
  type WidgetRuntimeContract,
} from './registry.js';

export {
  STATIC_CONTENT_KINDS,
  planStaticContent,
  resolveHeadingLevel,
  resolveRouteTitleLevel,
  type HeadingLevel,
  type StaticContentBinding,
  type StaticContentKind,
  type StaticContentPlan,
  type StaticContentPlanInput,
  type StaticContentPlanResult,
  type SurfaceStaticAssetRequest,
  type SurfaceStaticAssetResolution,
  type SurfaceStaticAssetResolver,
} from './static-content.js';

export {
  planExperienceUnit,
  type ExperienceDocumentHandle,
  type ExperienceNeedSummary,
  type ExperienceUnit,
  type ExperienceUnitPlan,
  type ExperienceUnitPlanInput,
} from './experience-unit.js';

export {
  planRoute,
  type RoutePlan,
  type SlotPlan,
  type SlotPlanBase,
  type SlotPlanContext,
  type SurfaceSlot,
  type WidgetActionLabelPlan,
  type WidgetActionMetadataPlan,
  type WidgetActionOutputPlan,
} from './slot-plan.js';

export {
  createDocumentResourceDataSourceLoader,
  dataSourceAvailableToWidget,
  loadWidgetDataInputs,
  resolveDataSourceDescriptor,
  type DataSourceActiveContext,
  type DataSourceAuthorizationResult,
  type DataSourceAuthorizer,
  type DataSourceCatalogHandle,
  type DataSourceDescriptor,
  type DataSourceLoadRequest,
  type DataSourceLoadResult,
  type DataSourceLoader,
  type DataSourcePayloadValidationResult,
  type DataSourcePayloadValidator,
  type DeclaredWidgetDataInput,
  type DocumentResourceReadRequest,
  type DocumentResourceReader,
  type LoadWidgetDataInputsRequest,
  type WidgetDataDelivery,
  type WidgetDataFailureReason,
  type WidgetDataInputFailure,
  type WidgetDataInputPlan,
} from './data-source-loader.js';

export {
  createPreviewDefinitionResponseStore,
  type DefinitionResponseRecordRefusalReason,
  type DefinitionResponseRecordResult,
  type DefinitionResponseSourceBinding,
  type PreviewDefinitionResponseStore,
  type RecordDefinitionResponseInput,
} from './definition-response-store.js';

export {
  createSurfaceSemanticOutputRegistry,
  type AmbiguousSurfaceSemanticOutput,
  type MissingSurfaceSemanticOutput,
  type QualifiedSurfaceSemanticOutputRef,
  type ResolvedSurfaceSemanticOutput,
  type SurfaceSemanticOutputArtifactIdentity,
  type SurfaceSemanticOutputDeclaration,
  type SurfaceSemanticOutputLookup,
  type SurfaceSemanticOutputMount,
  type SurfaceSemanticOutputMountScopeIdentity,
  type SurfaceSemanticOutputObservation,
  type SurfaceSemanticOutputPublisherScope,
  type SurfaceSemanticOutputRegistry,
  type SurfaceSemanticOutputScope,
  type SurfaceSemanticOutputScopeIdentity,
  type SurfaceSemanticOutputSnapshotEntry,
  type SurfaceSemanticOutputTarget,
  type SurfaceSemanticValue,
} from './semantic-output.js';

export {
  planTransitions,
  responseActionsDocumentForDefinition,
  slotSuppliedTriggers,
  type PlannedTransition,
  type ResponseActionsDocumentLike,
  type TransitionExecutor,
  type TransitionConditionEvaluator,
  type TransitionPlanInput,
  type TransitionPlanResult,
  type TransitionStatus,
  type TransitionUnfireableReason,
} from './transitions.js';

export {
  planMatchedRoute,
  type SurfaceRoutePlan,
  type SurfaceRoutePlanInput,
} from './route-plan.js';

export {
  bundleIsRenderable,
  dereferenceBundleExport,
  type BundleArtifactRef,
  type BundleExport,
  type BundleManifest,
  type ResolvedBundle,
} from './bundle.js';

export {
  SURFACE_SCENARIO_DIAGNOSTIC_CODES,
  createSurfacePreviewRuntime,
  validateSurfacePreviewScenario,
  type SurfacePreviewRuntime,
  type SurfaceScenarioDiagnostic,
  type SurfaceScenarioDiagnosticCode,
  type SurfaceScenarioPayloadValidationRequest,
  type SurfaceScenarioPayloadValidator,
  type SurfaceScenarioSchemaValidationResult,
  type SurfaceScenarioSchemaValidator,
  type SurfaceScenarioValidationResult,
  type ValidateSurfacePreviewScenarioInput,
} from './preview-scenario.js';
