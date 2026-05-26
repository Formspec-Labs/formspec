/**
 * AUTO-GENERATED — DO NOT EDIT
 *
 * Generated from schemas/*.schema.json by scripts/generate-types.mjs.
 * Re-run: npm run types:generate
 */

/* eslint-disable */

export type { ValueClass, BuiltInWidgetName, CustomWidgetName, WidgetName, ThemeWidgetName, KernelDocUrn, CommonSchema, TargetDefinition, Tokens, Breakpoints, ContactPoint, LangMap, Party, StyleMap, Extensions, AccessibilityBlock, VisualSurfaceProps, ModuleRef, AuthorActor, SessionRef, Generation, ComponentNodeIdentityRef, CrossComponentRef } from './common.js';
export type { IssuerDocument, LogoVariant } from './issuer.js';
export type { Item, PartyRoleRef, Shape, FELExpression, Instance, OptionSet, AssuranceLevel, PartyRoleClass, PartyVisibilityScope, MultiPartyTier, FormDefinition, DefinitionMetadata, PreparationMetadata, PreparationDocument, AcquisitionWindow, AssuranceRequirement, ConsequencesMetadata, ConsequenceDeadline, ExternalAction, PurposeMetadata, ItemPartyPolicy, Bind, Variable, OptionEntry, Migrations, MigrationDescriptor, Fees, FeeLineItem, PartyRole, PartyCardinality, PartyAssuranceFloor, MultiPartyPolicy, Presentation, FormspecIssuerDocument } from './definition.js';
export type { ComponentDocument, AnyComponent, Section, Stack, Grid, GridTrack, Card, Panel, ChildrenArray, SurfaceRouteTarget, SurfaceRef, CustomComponentDef, TextInput, NumberInput, DatePicker, Select, CheckboxGroup, Toggle, FileUpload, Heading, Text, Divider, Collapsible, ConditionalGroup, Tabs, ActionButton, Accordion, RadioGroup, MoneyInput, Slider, Rating, Signature, Alert, Badge, ProgressBar, Summary, ValidationSummary, DataTable, Modal, Popover, CustomComponentName, CustomComponentRef, LegacyFormBoundComponentDocumentIdentity, Component12DefinitionIdentity, Component12SurfaceRouteIdentity, Component12MixedIdentity, ResponsiveOverrides, ComponentBase, ComponentLayout } from './component.js';
export type { PresentationBlock, SelectorMatch, TokenType, ThemeDocument, Selector, PageLayout, Region, Category, TokenEntry } from './theme.js';
export type { TargetSchema, FieldRule, InnerRule, MappingDocument, Coerce, ValueMap, ReverseOverride, ArrayDescriptor, ProjectionHint, JsonAdapter, XmlAdapter, CsvAdapter } from './mapping.js';
export type { Publisher, RegistryEntry, TokenCategoryTokenType, RegistryDocument, WidgetTokenSlot, TokenCategoryShape, TokenCategoryTokenEntry, ConceptEquivalent, VocabularyFilter } from './registry.js';
export type { OntologyDocument, ConceptBinding, VocabularyBinding, Alignment } from './ontology.js';
export type { Reference, BoundReference, ReferenceOrRef, ReferencesDocument, ReferenceDefs } from './references.js';
export type { ActionIntent, ValidationProfile, BlockingPolicy, PersistencePolicy, ValidationTuplePredicate, ValidationTuple, MappingEntry, MasterTable, ValidationMappingDocument } from './validation-mapping.js';
export type { Action, ValidationOverride, EffectRequest, IdempotencyKey, ResponseActionsDocument, Precondition, MappingExecutionEffect, LedgerAppendEffect, HandoffAssemblyEffect, EvidenceRequestEffect, HostEventEffect } from './response-actions.js';
export type { UnitKind, ExperienceDocument, Applicability, Actor, Task, Unit, ItemRef, ConceptRef, ActionRef, Accessibility } from './experience.js';
export type { ChangelogDocument, Change } from './changelog.js';
export type { ValidationResult } from './validation-result.js';
export type { VerificationReceipt } from './verification-receipt.js';
export type { ResponseMetadataPathKey, FormResponse, ResponseMetadata, ResponseProvenanceEntry, ResponseDerivationEntry, ResponseDisclosureShownEntry, AuthoredSignature, AuthoredSignatureSignedPayload, AuthoredSignatureIdentityBinding } from './response.js';
export type { IntakeHandoff, Ref, HashString, DefinitionRef } from './intake-handoff.js';
export type { ValidationReport, FormspecValidationResult } from './validation-report.js';
export type { LocaleDocument } from './locale.js';
export type { FELType, FELFunctionCatalog, FunctionEntry, Parameter } from './fel-functions.js';
export type { ScreenerDocument, Availability, Phase, Route } from './screener.js';
export type { DeterminationRecord, RouteResult, PhaseResult, InputEntry } from './determination.js';
export type { Slot, SurfaceDocument, RouteParam, Transition, RouteParamMap } from './surface.js';
export type { DataSource, DataSourceKind, RuntimeBehavior, CacheRule, DataSourcesDocument, ProvenanceRule } from './data-sources.js';
export type { ArtifactResolutionHandleStatus, ArtifactResolutionSeverity, ArtifactResolutionPhase, ArtifactResolutionOrigin, ArtifactResolutionPhaseStatusValue, ArtifactResolutionReport, ArtifactResolutionHandle, ArtifactResolutionRef, ArtifactResolutionIdentity, ArtifactResolutionDiagnostic, ArtifactResolutionSourcePointer, ArtifactResolutionArtifacts, ArtifactResolutionSummary, ArtifactResolutionPhaseStatus } from './artifact-resolution-report.js';
export type { SchemaResultStatus, Severity, Origin, PhaseStatusValue, AppGraphValidationReport, SchemaResult, Diagnostic, SourcePointer, ArtifactRef, EvidenceSchemaResult, EvidenceDiagnostic, EvidenceSourcePointer, PhaseStatus, SupportProfile } from './app-graph-validation-report.js';
export type { ModuleResolutionModuleStatus, ModuleResolutionSeverity, ModuleResolutionPhase, ModuleResolutionOrigin, ModuleResolutionDocumentStatus, ModuleResolutionContributionStatus, ModuleResolutionPayloadStatus, ModuleResolutionRegistrySourcePointer, ModuleResolutionTokenCategoryStatus, ModuleResolutionPhaseStatusValue, ModuleResolutionReport, ModuleResolutionModule, ModuleResolutionRef, ModuleResolutionExtensions, ModuleResolutionSourcePointer, ModuleResolutionArtifactRef, ModuleResolutionDiagnostic, ModuleResolutionDocument, ModuleResolutionContribution, ModuleResolutionWidgetTokenSlot, ModuleResolutionTokenCategoryEvidence, ModuleResolutionSummary, ModuleResolutionPhaseStatus, ModuleResolutionSupportProfile } from './module-resolution-report.js';
export type { ModuleId, RouteA11YPolicy, UiGraphPolicyDocument, LocaleKeyOwner, RoutePolicy, ResponsiveRoutePolicy, DefinitionVisibilityPolicy, ThemePolicy, ThemeTokenAssignment, WidgetRef } from './ui-graph-policy.js';
export type { ComponentGraphProjectionContext, ComponentMembershipRef } from './component-graph-projection-context.js';
export { VALIDATION_MAPPING_MASTER_TABLE } from './validation-mapping-master-table.js';
