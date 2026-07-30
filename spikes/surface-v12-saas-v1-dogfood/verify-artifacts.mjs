#!/usr/bin/env node

/**
 * Deterministic integrity gate for the v12 SaaS dogfood artifacts.
 *
 * The script intentionally validates the inline exports through the public
 * app-graph pipeline: that exercises the real artifact and module resolvers
 * instead of duplicating their resolution rules in this spike.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  APP_GRAPH_PHASES,
  NEED_USABLE_OUTCOME_CODES,
  UX_TITLE_DUPLICATE_CODE,
  artifactResolutionGraphInput,
  collectRenderedNeedTraceNodes,
  produceBundleExportAppGraphValidationReport,
  validateNeedUsableOutcomes,
  validateRenderedNeedTrace,
} from '@formspec-org/app-graph';
import {
  createWidgetRegistry,
  flattenRegistryEntries,
} from '@formspec-org/surface';
import { starterWidgetModule } from '@formspec-org/surface-react/widgets';
import { computeReviewedInputDigest } from './demo/scripts/evidence-digest.mjs';
import {
  buildBundleReasoningReview,
  reasoningReviewDocument,
} from './reasoning-review.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(ROOT, '../..');
const ARTIFACTS = join(ROOT, 'artifacts');
const EVIDENCE = join(ROOT, 'evidence');
const SCHEMAS = join(REPO_ROOT, 'schemas');
const NEEDS_SCHEMA_ID = 'https://formspec.org/schemas/needs/1.0';
const MANIFEST_SCHEMA_ID = 'https://formspec.org/schemas/bundleManifest/2.4';

const FIXTURES = [
  { name: 'saas-v1', preview: 'main' },
  { name: 'control', preview: 'control' },
];

const DISCRIMINATOR_SCHEMAS = new Map([
  ['$formspec', 'https://formspec.org/schemas/definition/1.0'],
  ['$formspecExperience', 'https://formspec.org/schemas/experience/1.0'],
  ['$formspecResponseActions', 'https://formspec.org/schemas/responseActions/1.0'],
  ['$formspecRegistry', 'https://formspec.org/schemas/registry/v1.1/registry.json'],
  ['$formspecSurface', 'https://formspec.org/schemas/surface/0.2'],
  ['$formspecDataSources', 'https://formspec.org/schemas/dataSources/1.0'],
  ['$formspecComponent', 'https://formspec.org/schemas/component/1.2'],
  ['$formspecTheme', 'https://formspec.org/schemas/theme/1.0'],
  ['$formspecLocale', 'https://formspec.org/schemas/locale/1.0'],
  ['$formspecMapping', 'https://formspec.org/schemas/mapping/1.0'],
  ['$formspecScreener', 'https://formspec.org/schemas/screener/1.0'],
  ['$formspecReferences', 'https://formspec.org/schemas/references/1.0'],
  ['$formspecOntology', 'https://formspec.org/schemas/ontology/1.0'],
]);

const failures = [];
const expectedBundleReviews = [];
const writeReasoningReview = process.argv.includes('--write-review');

function fail(scope, message) {
  failures.push(`${scope}: ${message}`);
}

async function json(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    fail(relative(ROOT, path), `cannot parse JSON (${error instanceof Error ? error.message : String(error)})`);
    return undefined;
  }
}

function errorText(errors) {
  return [...(errors ?? [])]
    .map((error) => `${error.instancePath || '/'} ${error.keyword} ${error.message ?? ''}`.trim())
    .sort()
    .join('; ');
}

async function createAjv() {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  const paths = (await readdir(SCHEMAS))
    .filter((name) => name.endsWith('.schema.json'))
    .sort();
  for (const name of paths) {
    const schema = await json(join(SCHEMAS, name));
    if (schema && typeof schema === 'object' && typeof schema.$id === 'string') {
      ajv.addSchema(schema);
    }
  }
  return ajv;
}

function schemaIdForDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return undefined;
  for (const [key, schemaId] of DISCRIMINATOR_SCHEMAS) {
    if (typeof document[key] === 'string') return schemaId;
  }
  return undefined;
}

function validateSchema(ajv, schemaId, document, scope) {
  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    fail(scope, `repository schema '${schemaId}' is unavailable`);
    return false;
  }
  const valid = validate(document);
  if (!valid) fail(scope, `schema ${schemaId}: ${errorText(validate.errors)}`);
  return valid;
}

function appGraphSchemaValidator(ajv) {
  return ({ artifactKind, document }) => {
    const schemaId = artifactKind === 'appManifest'
      ? MANIFEST_SCHEMA_ID
      : schemaIdForDocument(document);
    const validate = schemaId ? ajv.getSchema(schemaId) : undefined;
    if (!validate) {
      return { ok: false, issues: [{ code: 'DOGFOOD-SCHEMA-UNKNOWN', message: `No repository schema for ${artifactKind}.` }] };
    }
    const ok = validate(document);
    return ok ? { ok: true } : {
      ok: false,
      issues: [...(validate.errors ?? [])]
        .map((error) => ({
          code: 'DOGFOOD-SCHEMA',
          path: error.instancePath || '/',
          keyword: error.keyword,
          message: error.message ?? 'schema validation failed',
        }))
        .sort((left, right) => `${left.path}|${left.keyword}|${left.message}`.localeCompare(`${right.path}|${right.keyword}|${right.message}`)),
    };
  };
}

function sourceCatalogs(bundle) {
  return new Map(
    Object.entries(bundle.documents)
      .filter(([, document]) => document && typeof document === 'object' && document.$formspecDataSources === '1.0'),
  );
}

function validateScenarioSources(ajv, fixture, bundle, scenario) {
  const catalogs = sourceCatalogs(bundle);
  const manifested = new Set((bundle.manifest.dataSources ?? []).map((ref) => ref.url));
  for (const [profileName, profile] of Object.entries(scenario.profiles ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    for (const [sourceIndex, outcome] of (profile.sources ?? []).entries()) {
      const scope = `${fixture.name}.scenario.profiles.${profileName}.sources[${sourceIndex}]`;
      const catalog = catalogs.get(outcome.catalogRef);
      if (!manifested.has(outcome.catalogRef) || !catalog) {
        fail(scope, `catalogRef '${outcome.catalogRef}' does not resolve to a manifested Data Sources document`);
        continue;
      }
      const source = (catalog.sources ?? []).find((candidate) => candidate.id === outcome.sourceRef);
      if (!source) {
        fail(scope, `sourceRef '${outcome.sourceRef}' does not resolve in '${outcome.catalogRef}'`);
        continue;
      }
      if (outcome.status === 'loaded' && source.schema) {
        let validate;
        try {
          validate = ajv.compile(source.schema);
        } catch (error) {
          fail(scope, `cannot compile source schema (${error instanceof Error ? error.message : String(error)})`);
          continue;
        }
        if (!validate(outcome.value)) fail(scope, `payload: ${errorText(validate.errors)}`);
      }
    }
  }
}

function validateDeliveredWidgets(fixture, bundle) {
  const registries = Object.values(bundle.documents ?? {}).filter(
    (document) =>
      document &&
      typeof document === 'object' &&
      document.$formspecRegistry === '1.1',
  );
  const flattened = flattenRegistryEntries(registries);
  for (const diagnostic of flattened.diagnostics) {
    fail(
      `${fixture.name}.widgetRegistry`,
      `${diagnostic.code}: ${diagnostic.message}`,
    );
  }

  const moduleIds = [
    ...new Set((bundle.manifest.modules ?? []).map((module) => module.id)),
  ];
  const registry = createWidgetRegistry({
    registryEntries: flattened.entries,
    modules: moduleIds.map((moduleId) => starterWidgetModule(moduleId)),
  });

  for (const [documentRef, document] of Object.entries(bundle.documents ?? {})) {
    if (
      !document ||
      typeof document !== 'object' ||
      document.$formspecSurface !== '0.2'
    ) {
      continue;
    }
    for (const route of document.routes ?? []) {
      for (const slot of route.slots ?? []) {
        if (slot.slotType !== 'module-widget') continue;
        const key = {
          moduleId: slot.binding?.moduleId,
          widgetName: slot.binding?.widgetName,
        };
        if (typeof key.moduleId !== 'string' || typeof key.widgetName !== 'string') {
          continue;
        }
        const resolution = registry.resolve(key);
        if (resolution.status !== 'resolved' || !resolution.declared) {
          const details =
            resolution.status === 'incompatible'
              ? ` (${resolution.reasons.join(', ')})`
              : '';
          fail(
            `${fixture.name}.deliveredWidget`,
            `${documentRef} route '${route.id}' slot '${slot.id}' cannot render `
              + `${key.moduleId}/${key.widgetName}: ${resolution.status}${details}`,
          );
        }
      }
    }
  }
}

function reviewDifference(actual, expected) {
  return isDeepStrictEqual(actual, expected)
    ? []
    : ['review document differs from the exact mechanical recomputation'];
}

async function verifyFixture(ajv, fixture, previewSet) {
  const bundle = await json(join(ARTIFACTS, `${fixture.name}.bundle.json`));
  const needs = await json(join(ARTIFACTS, `${fixture.name}.needs.json`));
  const scenario = await json(join(ARTIFACTS, `${fixture.name}.preview-scenario.json`));
  if (!bundle || !needs || !scenario) return;

  validateSchema(ajv, MANIFEST_SCHEMA_ID, bundle.manifest, `${fixture.name}.bundle.manifest`);
  for (const [url, document] of Object.entries(bundle.documents ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const schemaId = schemaIdForDocument(document);
    if (!schemaId) fail(`${fixture.name}.bundle.documents.${url}`, 'unrecognized Formspec document discriminator');
    else validateSchema(ajv, schemaId, document, `${fixture.name}.bundle.documents.${url}`);
  }
  validateSchema(ajv, NEEDS_SCHEMA_ID, needs, `${fixture.name}.needs`);
  validateSchema(ajv, 'https://formspec.org/schemas/surface-scenario/0.1', scenario, `${fixture.name}.scenario`);

  const embedded = previewSet.previews?.[fixture.preview];
  if (!embedded) fail(`${fixture.name}.previewSet`, `missing previews.${fixture.preview}`);
  else {
    if (!isDeepStrictEqual(embedded.bundle, bundle)) fail(`${fixture.name}.previewSet.bundle`, 'does not exactly equal the standalone bundle JSON');
    if (!isDeepStrictEqual(embedded.scenario, scenario)) fail(`${fixture.name}.previewSet.scenario`, 'does not exactly equal the standalone scenario JSON');
  }

  validateScenarioSources(ajv, fixture, bundle, scenario);
  validateDeliveredWidgets(fixture, bundle);
  const hostEvidence = {
    needsDocuments: [{ schemaId: NEEDS_SCHEMA_ID, source: `${fixture.name}.needs.json`, document: needs }],
  };
  const result = await produceBundleExportAppGraphValidationReport({
    manifest: bundle.manifest,
    documents: bundle.documents,
    source: `${fixture.name}.bundle.json`,
    schemaId: MANIFEST_SCHEMA_ID,
    hostEvidence,
    schemaValidators: appGraphSchemaValidator(ajv),
    evidenceSchemaValidators: ({ document }) => {
      const validate = ajv.getSchema(NEEDS_SCHEMA_ID);
      const ok = Boolean(validate?.(document));
      return ok ? { ok: true } : {
        ok: false,
        issues: (validate?.errors ?? []).map((error) => ({
          code: 'DOGFOOD-NEEDS-SCHEMA',
          path: error.instancePath || '/',
          keyword: error.keyword,
          message: error.message ?? 'schema validation failed',
        })),
      };
    },
    crossArtifactValidators: [
      validateRenderedNeedTrace,
      validateNeedUsableOutcomes,
    ],
    surfaceLocal: { diagnostics: [] },
    authorizationBoundary: { diagnostics: [] },
    unsupported: { diagnostics: [] },
  });
  const incomplete = result.report.phases.filter((phase) => phase.status !== 'completed');
  const errors = result.report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (incomplete.length || errors.length) {
    fail(`${fixture.name}.appGraph`, [
      ...(incomplete.length ? [`incomplete phases: ${incomplete.map((phase) => `${phase.phase}=${phase.status}`).join(', ')}`] : []),
      ...errors.map((diagnostic) => `${diagnostic.phase}/${diagnostic.code}: ${diagnostic.message}`),
    ].join('; '));
  }
  if (result.report.phases.length !== APP_GRAPH_PHASES.length) {
    fail(`${fixture.name}.appGraph`, `expected ${APP_GRAPH_PHASES.length} phases, found ${result.report.phases.length}`);
  }
  const usableOutcomeCodes = new Set(Object.values(NEED_USABLE_OUTCOME_CODES));
  for (const diagnostic of result.report.diagnostics.filter(({ code }) =>
    usableOutcomeCodes.has(code)
  )) {
    fail(
      `${fixture.name}.usableOutcome`,
      `${diagnostic.code} ${diagnostic.primarySource?.jsonPointer ?? '/'}: ${diagnostic.message} (${diagnostic.details?.reason ?? 'unclassified'})`,
    );
  }
  for (const diagnostic of result.report.diagnostics.filter(
    ({ code }) => code === UX_TITLE_DUPLICATE_CODE,
  )) {
    fail(
      `${fixture.name}.duplicateTitle`,
      `${diagnostic.primarySource?.jsonPointer ?? '/'}: ${diagnostic.message}`,
    );
  }

  const graphInput = artifactResolutionGraphInput(result.artifactResolutionReport);
  const graphContext = {
    ...graphInput,
    hostEvidence,
  };
  const scenarioFile = `${fixture.name}.preview-scenario.json`;
  const scenarioHandle = {
    slot: `previewScenario:${fixture.name}`,
    artifactKind: 'surfaceScenario',
    status: 'loaded',
    source: scenarioFile,
    ref: {
      url: scenarioFile,
      version: scenario.version,
    },
    document: scenario,
  };
  const strictTraceDiagnostics = validateRenderedNeedTrace(
    graphContext,
    [scenarioHandle],
  );
  for (const diagnostic of strictTraceDiagnostics) {
    fail(
      `${fixture.name}.renderedNeedTrace`,
      `${diagnostic.code} ${diagnostic.primarySource?.jsonPointer ?? '/'}: ${diagnostic.message}`,
    );
  }
  const nodes = collectRenderedNeedTraceNodes(graphContext, [scenarioHandle]);
  const expectedReview = buildBundleReasoningReview({
    name: fixture.name,
    bundle,
    needs,
    scenario,
    scenarioFile,
    graphInput,
    nodes,
  });
  expectedBundleReviews.push(expectedReview);
  if (expectedReview.status !== 'complete') {
    for (const gap of expectedReview.gaps.slice(0, 25)) {
      fail(
        `${fixture.name}.reasoningReview`,
        `${gap.code} ${gap.artifactRef ?? gap.needId ?? ''}${gap.pointer ?? ''}`.trim(),
      );
    }
  }
}

async function sha256(path) {
  return `sha256:${createHash('sha256').update(await readFile(path)).digest('hex')}`;
}

function checkClaim(scope, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(scope, `expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`);
  }
}

async function verifyEvidence(expectedReview) {
  const digest = await computeReviewedInputDigest();
  const reviewedInputDigest = `${digest.algorithm}:${digest.digest}`;
  const [runManifest, scorecard, playwrightReview, result] = await Promise.all([
    json(join(EVIDENCE, 'run-manifest.json')),
    json(join(EVIDENCE, 'scorecard.json')),
    readFile(join(EVIDENCE, 'playwright-review.md'), 'utf8'),
    readFile(join(EVIDENCE, 'result.md'), 'utf8'),
  ]);
  if (!runManifest || !scorecard) return;

  checkClaim(
    'evidence.runManifest.reviewedInputDigest',
    runManifest.currentResult?.verification?.reviewedInputDigest,
    reviewedInputDigest,
  );
  checkClaim(
    'evidence.scorecard.reviewedInputDigest',
    scorecard.validation?.reviewed_input_digest,
    reviewedInputDigest,
  );
  if (!playwrightReview.includes(`Reviewed input digest: \`${reviewedInputDigest}\``)) {
    fail('evidence.playwrightReview.reviewedInputDigest', `missing ${reviewedInputDigest}`);
  }
  if (!result.includes(`Reviewed input digest: \`${reviewedInputDigest}\``)) {
    fail('evidence.result.reviewedInputDigest', `missing ${reviewedInputDigest}`);
  }

  const evidenceClaims = [
    {
      name: 'saas-v1',
      run: runManifest.currentResult?.saasV1,
      score: scorecard.current_artifacts?.saas_v1,
    },
    {
      name: 'control',
      run: runManifest.currentResult?.control,
      score: scorecard.current_artifacts?.control,
    },
  ];
  for (const claim of evidenceClaims) {
    const bundle = expectedReview.bundles.find((entry) => entry.name === claim.name);
    if (!bundle) continue;
    checkClaim(
      `evidence.runManifest.${claim.name}.traceRecords`,
      claim.run?.traceRecords,
      bundle.summary.renderedPointerCount,
    );
    checkClaim(
      `evidence.runManifest.${claim.name}.resolvedTraceRecords`,
      claim.run?.resolvedTraceRecords,
      bundle.summary.tracedPointerCount,
    );
    checkClaim(
      `evidence.scorecard.${claim.name}.trace_records`,
      claim.score?.trace_records,
      bundle.summary.renderedPointerCount,
    );
    checkClaim(
      `evidence.scorecard.${claim.name}.resolved_trace_records`,
      claim.score?.resolved_trace_records,
      bundle.summary.tracedPointerCount,
    );
    checkClaim(
      `evidence.${claim.name}.renderedWithoutExperiencePath`,
      bundle.experienceReview.renderedWithoutExperiencePathCount,
      0,
    );
  }

  const saasReview = expectedReview.bundles.find(
    (entry) => entry.name === 'saas-v1',
  );
  const routeCount = saasReview?.summary.kinds.route ?? 0;
  const actionCount = saasReview?.summary.kinds['response-action'] ?? 0;
  const dataProfileCheckCount =
    saasReview?.summary.kinds['surface-preview-source-outcome'] ?? 0;
  const verificationClaims = [
    [
      'evidence.runManifest.fixedGenericHost',
      runManifest.currentResult?.fixedGenericHost,
      true,
    ],
    [
      'evidence.scorecard.fixedGenericHost',
      scorecard.host?.fixed_generic_host,
      true,
    ],
    [
      'evidence.runManifest.rootArtifactVerifier',
      runManifest.currentResult?.verification?.rootArtifactVerifier,
      'passed',
    ],
    [
      'evidence.scorecard.rootArtifactVerifier',
      scorecard.validation?.root_artifact_verifier,
      'passed',
    ],
    [
      'evidence.runManifest.appGraphPhasesPerBundle',
      runManifest.currentResult?.verification?.appGraphPhasesPerBundle,
      APP_GRAPH_PHASES.length,
    ],
    [
      'evidence.scorecard.appGraphPhasesPerBundle',
      scorecard.validation?.app_graph_phases_per_bundle,
      APP_GRAPH_PHASES.length,
    ],
    [
      'evidence.runManifest.playwrightRoutesPassed',
      runManifest.currentResult?.verification?.playwrightRoutesPassed,
      routeCount,
    ],
    [
      'evidence.scorecard.playwrightRoutesPassed',
      scorecard.validation?.playwright_routes_passed,
      routeCount,
    ],
    [
      'evidence.runManifest.playwrightActionsPassed',
      runManifest.currentResult?.verification?.playwrightActionsPassed,
      actionCount,
    ],
    [
      'evidence.scorecard.playwrightActionsPassed',
      scorecard.validation?.playwright_actions_passed,
      actionCount,
    ],
    [
      'evidence.runManifest.playwrightDataProfileChecksPassed',
      runManifest.currentResult?.verification?.playwrightDataProfileChecksPassed,
      dataProfileCheckCount,
    ],
    [
      'evidence.scorecard.playwrightDataProfileChecksPassed',
      scorecard.validation?.playwright_data_profile_checks_passed,
      dataProfileCheckCount,
    ],
    [
      'evidence.runManifest.playwrightConsoleWarningsOrErrors',
      runManifest.currentResult?.verification?.playwrightConsoleWarningsOrErrors,
      0,
    ],
    [
      'evidence.scorecard.playwrightConsoleWarningsOrErrors',
      scorecard.validation?.playwright_console_warnings_or_errors,
      0,
    ],
  ];
  for (const [scope, actual, expected] of verificationClaims) {
    checkClaim(scope, actual, expected);
  }
  const normalizedPlaywrightReview = playwrightReview.replace(/\s+/gu, ' ');
  for (const required of [
    `All ${routeCount} SaaS routes`,
    `All ${actionCount} rendered action controls`,
    `All ${actionCount} controls also exposed a non-empty direct Need identity`,
    'distinct loaded, empty, and unavailable profiles',
    'loading state',
    'no browser console warning or error',
  ]) {
    if (!normalizedPlaywrightReview.includes(required)) {
      fail('evidence.playwrightReview.claims', `missing '${required}'`);
    }
  }
  const normalizedResult = result.replace(/\s+/gu, ' ');
  for (const required of [
    `${saasReview?.summary.renderedPointerCount} rendered trace records`,
    `${saasReview?.summary.tracedPointerCount} resolved to current adopted Needs`,
    `records ${expectedReview.bundles.find((entry) => entry.name === 'control')?.summary.renderedPointerCount} of ${expectedReview.bundles.find((entry) => entry.name === 'control')?.summary.tracedPointerCount} rendered traces`,
    `rendered all ${routeCount} routes and followed all ${actionCount} authored action`,
  ]) {
    if (!normalizedResult.includes(required)) {
      fail('evidence.result.claims', `missing '${required}'`);
    }
  }

  const screenshotClaims = runManifest.currentResult?.verification?.screenshots;
  const screenshotFiles = [
    'screenshots/control.png',
    'screenshots/dashboard-loaded.png',
    'screenshots/public-response-mobile.png',
    'screenshots/responses-loaded.png',
  ];
  for (const screenshot of screenshotFiles) {
    checkClaim(
      `evidence.runManifest.${screenshot}`,
      screenshotClaims?.[screenshot],
      await sha256(join(EVIDENCE, screenshot)),
    );
  }
}

async function main() {
  const [ajv, previewSet, review] = await Promise.all([
    createAjv(),
    json(join(ARTIFACTS, 'preview-set.json')),
    writeReasoningReview
      ? Promise.resolve(undefined)
      : json(join(ARTIFACTS, 'reasoning-review.json')),
  ]);
  if (previewSet) {
    for (const fixture of FIXTURES) await verifyFixture(ajv, fixture, previewSet);
  }
  const expectedReview = reasoningReviewDocument(expectedBundleReviews);
  if (failures.length === 0 && writeReasoningReview) {
    await writeFile(
      join(ARTIFACTS, 'reasoning-review.json'),
      `${JSON.stringify(expectedReview, null, 2)}\n`,
    );
    console.log(
      `Wrote reasoning-review.json from ${expectedBundleReviews.reduce((count, bundle) => count + bundle.summary.renderedPointerCount, 0)} recomputed trace records.`,
    );
    return;
  }
  if (!writeReasoningReview) {
    for (const difference of reviewDifference(review, expectedReview)) {
      fail('reasoningReview', difference);
    }
    await verifyEvidence(expectedReview);
  }
  if (failures.length > 0) {
    for (const message of failures.sort()) console.error(`FAIL ${message}`);
    console.error(`Artifact verification failed: ${failures.length} issue${failures.length === 1 ? '' : 's'}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Artifact verification passed: ${FIXTURES.map((fixture) => fixture.name).join(', ')}; ${APP_GRAPH_PHASES.length} app-graph phases each.`);
}

await main();
