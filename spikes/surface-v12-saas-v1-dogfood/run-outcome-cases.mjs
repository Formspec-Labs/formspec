#!/usr/bin/env node

/**
 * Generic, admitted runner for data-only Outcome Verification Cases.
 *
 * The executable contains no product route, field, action, copy, or expected
 * value. It resolves every operation and observation from the run set, case,
 * bundle, scenario, and owner documents.
 */

import {
  readFile,
  readdir,
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { Window } from "happy-dom";
import { act, createElement, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  artifactResolutionGraphInput,
  produceBundleExportAppGraphValidationReport,
  validateRenderedNeedTrace,
} from "@formspec-org/app-graph";
import {
  initFormspecEngine,
  planResponseActionInvocation,
} from "@formspec-org/engine/render";
import { createSemanticControlRegistry } from "@formspec-org/react/semantic-controls";
import {
  createPreviewDefinitionResponseStore,
  createSurfaceSemanticOutputRegistry,
  createSurfacePreviewRuntime,
  dereferenceBundleExport,
  composeSurfaceApp,
  routeHref,
} from "@formspec-org/surface";
import {
  createSurfaceSemanticControlScopeResolver,
  createSurfaceSemanticOutputScopeResolver,
  starterWidgetModule,
  SurfaceApp,
} from "@formspec-org/surface-react";
import {
  canonicalJsonEqual,
  digestDemoClaimContext,
  digestOutcomeImplementationSet,
  digestOutcomeSpecificationRuleIndex,
  digestResolvedTargetIdentity,
  digestRunnerAdmissionContext,
  evaluateOutcomeClaimGate,
  generateOutcomeVerificationReport,
  issueOutcomeLintClearance,
  lintOutcomeVerificationReport,
  runOutcomeVerificationCase,
  sha256Digest,
} from "@formspec-org/outcome-verification";

const RUNNER_FILE = fileURLToPath(import.meta.url);
const HERE = dirname(RUNNER_FILE);
const REPO_ROOT = resolve(HERE, "../..");
const SCHEMAS = join(REPO_ROOT, "schemas");
const DEFAULT_RUN_SET = join(HERE, "artifacts/outcome-run-set.json");
const NORMAL_CUSTODY_DIRECTORY = join(
  REPO_ROOT,
  "output",
  "outcome-verification-custody"
);
const CASE_SCHEMA = "https://formspec.org/schemas/outcomeVerificationCase/0.1";
const REPORT_SCHEMA =
  "https://formspec.org/schemas/outcomeVerificationReport/0.1";
const NEEDS_SCHEMA = "https://formspec.org/schemas/needs/1.0";
const MANIFEST_SCHEMA = "https://formspec.org/schemas/bundleManifest/2.4";
const RUNNER_SUPPORTED_STEP_KINDS = Object.freeze([
  "open-route",
  "set-item",
  "activate-control",
  "checkpoint",
]);
const RUNNER_SUPPORTED_OBSERVATION_KINDS = Object.freeze([
  "app-graph",
  "validation-report",
  "response",
  "action-invocation",
  "data-source-result",
  "route-state",
  "rendered-output",
]);
const DOCUMENT_SCHEMAS = new Map([
  ["$formspecBundle", MANIFEST_SCHEMA],
  ["$formspecNeeds", NEEDS_SCHEMA],
  ["$formspec", "https://formspec.org/schemas/definition/1.0"],
  ["$formspecExperience", "https://formspec.org/schemas/experience/1.0"],
  [
    "$formspecResponseActions",
    "https://formspec.org/schemas/responseActions/1.0",
  ],
  [
    "$formspecRegistry",
    "https://formspec.org/schemas/registry/v1.1/registry.json",
  ],
  ["$formspecSurface", "https://formspec.org/schemas/surface/0.2"],
  ["$formspecDataSources", "https://formspec.org/schemas/dataSources/1.0"],
  ["$formspecComponent", "https://formspec.org/schemas/component/1.2"],
  ["$formspecTheme", "https://formspec.org/schemas/theme/1.0"],
  ["$formspecLocale", "https://formspec.org/schemas/locale/1.0"],
  ["$formspecMapping", "https://formspec.org/schemas/mapping/1.0"],
  ["$formspecScreener", "https://formspec.org/schemas/screener/1.0"],
  ["$formspecReferences", "https://formspec.org/schemas/references/1.0"],
  ["$formspecOntology", "https://formspec.org/schemas/ontology/1.0"],
]);

function installCommittedDomRuntime() {
  const domWindow = new Window({
    url: "https://formspec.test/",
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  const globals = {
    window: domWindow,
    document: domWindow.document,
    navigator: domWindow.navigator,
    Node: domWindow.Node,
    Element: domWindow.Element,
    HTMLElement: domWindow.HTMLElement,
    HTMLInputElement: domWindow.HTMLInputElement,
    HTMLButtonElement: domWindow.HTMLButtonElement,
    Event: domWindow.Event,
    CustomEvent: domWindow.CustomEvent,
    MouseEvent: domWindow.MouseEvent,
    KeyboardEvent: domWindow.KeyboardEvent,
    MutationObserver: domWindow.MutationObserver,
    getComputedStyle: domWindow.getComputedStyle.bind(domWindow),
    requestAnimationFrame: domWindow.requestAnimationFrame.bind(domWindow),
    cancelAnimationFrame: domWindow.cancelAnimationFrame.bind(domWindow),
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  return domWindow;
}

function CommittedSurfaceTestHost({
  initialLocation,
  onLocationChange,
  surfaceProps,
}) {
  const [location, setLocation] = useState(initialLocation);
  const navigate = useCallback(
    (href) => {
      onLocationChange(href);
      setLocation(href);
    },
    [onLocationChange]
  );
  return createElement(SurfaceApp, {
    ...surfaceProps,
    location,
    onNavigate: navigate,
  });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function addAuthoredLiteral(literals, value) {
  if (typeof value === "string" && value.length > 0) literals.add(value);
}

function caseAuthoredLiterals(caseDocument) {
  const literals = new Set();
  addAuthoredLiteral(literals, caseDocument.id);
  addAuthoredLiteral(literals, caseDocument.need?.documentRef);
  addAuthoredLiteral(literals, caseDocument.need?.id);
  addAuthoredLiteral(literals, caseDocument.app?.id);
  for (const step of caseDocument.procedure ?? []) {
    for (const key of [
      "id",
      "surfaceRef",
      "routeId",
      "renderStepRef",
      "definitionRef",
      "path",
      "actionsRef",
      "actionId",
      "responseStepRef",
    ]) {
      addAuthoredLiteral(literals, step?.[key]);
    }
    addAuthoredLiteral(literals, step?.control?.artifactRef);
    addAuthoredLiteral(literals, step?.control?.subjectRef);
    addAuthoredLiteral(literals, step?.value);
  }
  for (const expectation of caseDocument.expectedObservations ?? []) {
    for (const key of [
      "id",
      "checkpointRef",
      "stepRef",
      "definitionRef",
      "actionsRef",
      "actionId",
      "catalogRef",
      "sourceId",
      "recordId",
      "semanticValue",
    ]) {
      addAuthoredLiteral(literals, expectation?.[key]);
    }
    addAuthoredLiteral(literals, expectation?.subject?.artifactRef);
    addAuthoredLiteral(literals, expectation?.subject?.subjectRef);
    addAuthoredLiteral(literals, expectation?.node?.artifactRef);
    addAuthoredLiteral(literals, expectation?.node?.subjectRef);
    addAuthoredLiteral(literals, expectation?.item?.path);
    addAuthoredLiteral(literals, expectation?.item?.value);
  }
  return literals;
}

function quotedSpellings(value) {
  return [
    JSON.stringify(value),
    `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`,
    `\`${value.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``,
  ];
}

function assertRunnerIsCaseGeneric(runnerSource, caseDocument) {
  const leaked = [...caseAuthoredLiterals(caseDocument)].filter((value) =>
    quotedSpellings(value).some((spelling) => runnerSource.includes(spelling))
  );
  if (leaked.length > 0) {
    throw new Error(
      `runner contains case-authored string literals: ${leaked
        .map((value) => JSON.stringify(value))
        .join(", ")}`
    );
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function digestFiles(paths) {
  const entries = await Promise.all(
    [...paths].sort().map(async (path) => ({
      path: relative(REPO_ROOT, path).replaceAll("\\", "/"),
      content: await readFile(path, "utf8"),
    }))
  );
  return sha256Digest(entries);
}

async function packageImplementation(id, packageDirectory) {
  const workspacePackages = new Map();
  for (const entry of await readdir(join(REPO_ROOT, "packages"), {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const directory = join(REPO_ROOT, "packages", entry.name);
    try {
      const manifest = await readJson(join(directory, "package.json"));
      if (typeof manifest.name === "string") {
        workspacePackages.set(manifest.name, directory);
      }
    } catch {
      // A workspace directory without a package manifest is not executable.
    }
  }
  const rootManifest = await readJson(join(packageDirectory, "package.json"));
  const pending = [packageDirectory];
  const visited = new Set();
  const paths = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (visited.has(directory)) continue;
    visited.add(directory);
    const packagePath = join(directory, "package.json");
    const manifest = await readJson(packagePath);
    paths.push(packagePath);
    for (const publishedPath of manifest.files ?? ["dist"]) {
      const path = join(directory, publishedPath);
      const details = await stat(path);
      paths.push(...(details.isDirectory() ? await filesBelow(path) : [path]));
    }
    const dependencies = {
      ...(manifest.dependencies ?? {}),
      ...(manifest.optionalDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    };
    for (const dependencyName of Object.keys(dependencies)) {
      const dependencyDirectory = workspacePackages.get(dependencyName);
      if (dependencyDirectory) pending.push(dependencyDirectory);
    }
  }
  return {
    id,
    version: requireString(rootManifest.version, `${id} version`),
    digest: await digestFiles(paths),
  };
}

async function resolveTestTargetIdentity({
  request,
  previewSet,
  runnerSource,
}) {
  if (request.class !== "test") {
    throw new Error(
      "the committed ReactDOM harness resolves only test targets"
    );
  }
  const runnerDigest = await sha256Digest(runnerSource);
  const hostEnvironmentDigest = await digestFiles([
    join(REPO_ROOT, "package.json"),
    join(REPO_ROOT, "package-lock.json"),
  ]);
  const hostRuntime = {
    node: process.version,
    v8: process.versions.v8,
    modules: process.versions.modules,
    napi: process.versions.napi,
    platform: process.platform,
    arch: process.arch,
  };
  const runnerCapabilitiesDigest = await sha256Digest({
    stepKinds: RUNNER_SUPPORTED_STEP_KINDS,
    observationKinds: RUNNER_SUPPORTED_OBSERVATION_KINDS,
  });
  const [renderer, runtime, outcomeImplementation] = await Promise.all([
    packageImplementation(
      "@formspec-org/surface-react",
      join(REPO_ROOT, "packages/formspec-surface-react")
    ),
    packageImplementation(
      "@formspec-org/engine",
      join(REPO_ROOT, "packages/formspec-engine")
    ),
    packageImplementation(
      "@formspec-org/outcome-verification",
      join(REPO_ROOT, "packages/formspec-outcome-verification")
    ),
  ]);
  const implementations = {
    host: {
      id: "formspec-committed-reactdom-test-host",
      version: "0.1.0",
      digest: await sha256Digest({
        runnerDigest,
        hostEnvironmentDigest,
        hostRuntime,
        runnerCapabilitiesDigest,
      }),
    },
    renderer,
    runner: outcomeImplementation,
    runtime,
    verifier: outcomeImplementation,
    adapter: {
      id: "formspec-surface-react-outcome-adapter",
      version: "0.1.0",
      digest: runnerDigest,
    },
  };
  const implementationSetDigest = await digestOutcomeImplementationSet(
    implementations
  );
  const buildDigest = await sha256Digest({
    previewSet,
    runnerDigest,
    runnerCapabilitiesDigest,
    implementationSetDigest,
  });
  const buildRef = `urn:formspec:test-build:${buildDigest.slice(
    "sha256:".length
  )}`;
  const targetIdentityDigest = await digestResolvedTargetIdentity({
    class: request.class,
    ref: request.ref,
    buildRef,
    buildDigest,
    implementationSetDigest,
  });
  return {
    ...request,
    buildRef,
    buildDigest,
    implementations,
    implementationSetDigest,
    targetIdentityDigest,
  };
}

function createFilesystemRunBindings(custodyDirectory) {
  const phaseDocument = (phase, receiptRef, content) => ({
    $formspecOutcomeCustodyPhase: "0.1",
    phase,
    receiptRef,
    ...structuredClone(content),
  });

  async function readPhase(directory, phase) {
    try {
      const document = await readJson(join(directory, `${phase}.json`));
      return document?.phase === phase ? document : undefined;
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async function writePhase(directory, phase, receiptRef, content) {
    try {
      await writeFile(
        join(directory, `${phase}.json`),
        `${JSON.stringify(
          phaseDocument(phase, receiptRef, content),
          null,
          2
        )}\n`,
        { flag: "wx" }
      );
      return true;
    } catch (error) {
      if (error?.code === "EEXIST") return false;
      throw error;
    }
  }

  function directoryForReceipt(receiptRef) {
    const match = /^urn:formspec:outcome-receipt:([0-9a-f]{64})$/.exec(
      receiptRef
    );
    return match ? join(custodyDirectory, match[1]) : undefined;
  }

  return {
    async beginRun(input) {
      await mkdir(custodyDirectory, { recursive: true });
      const reservationDigest = await sha256Digest({
        targetIdentityDigest: input.targetIdentityDigest,
        runId: input.runId,
      });
      const reservationToken = reservationDigest.slice("sha256:".length);
      const directory = join(custodyDirectory, reservationToken);
      try {
        await mkdir(directory);
      } catch (error) {
        if (error?.code === "EEXIST") return { status: "conflict" };
        throw error;
      }
      const receiptRef = `urn:formspec:outcome-receipt:${reservationToken}`;
      if (
        !(await writePhase(directory, "begin", receiptRef, {
          ...input,
          reservationDigest,
        }))
      ) {
        return { status: "conflict" };
      }
      return { status: "bound", receiptRef };
    },
    async completeRun(input) {
      const directory = directoryForReceipt(input.receiptRef);
      if (!directory) return "conflict";
      const begin = await readPhase(directory, "begin");
      if (
        !begin ||
        begin.receiptRef !== input.receiptRef ||
        input.runnerEvidenceDigest !== (await sha256Digest(input.evidence))
      ) {
        return "conflict";
      }
      return (await writePhase(directory, "complete", input.receiptRef, input))
        ? "completed"
        : "conflict";
    },
    async finalizeEvidence(input) {
      const directory = directoryForReceipt(input.receiptRef);
      if (!directory) return "conflict";
      const [begin, complete] = await Promise.all([
        readPhase(directory, "begin"),
        readPhase(directory, "complete"),
      ]);
      const runnerEvidence = {
        bindings: input.evidence.bindings,
        observations: input.evidence.observations,
        boundary: input.evidence.boundary,
      };
      if (
        !begin ||
        !complete ||
        begin.receiptRef !== input.receiptRef ||
        begin.caseDigest !== input.evidence.caseDigest ||
        begin.runId !== input.evidence.run.runId ||
        begin.admissionContextDigest !==
          input.evidence.run.admissionContextDigest ||
        begin.targetIdentityDigest !==
          input.evidence.run.target.targetIdentityDigest ||
        begin.lintClearanceDigest !== input.evidence.lintClearanceDigest ||
        begin.actionPlanSetDigest !== input.evidence.actionPlanSetDigest ||
        complete.runnerEvidenceDigest !==
          (await sha256Digest(runnerEvidence)) ||
        input.evidenceDigest !== (await sha256Digest(input.evidence))
      ) {
        return "conflict";
      }
      return (await writePhase(directory, "evidence", input.receiptRef, input))
        ? "finalized"
        : "conflict";
    },
    async recordReport(input) {
      const directory = directoryForReceipt(input.receiptRef);
      if (!directory) return "conflict";
      const evidence = await readPhase(directory, "evidence");
      if (
        !evidence ||
        evidence.evidenceDigest !== input.evidenceDigest ||
        evidence.reportId !== input.reportId
      ) {
        return "conflict";
      }
      return (await writePhase(directory, "report", input.receiptRef, input))
        ? "recorded"
        : "conflict";
    },
    async readReceipt(receiptRef) {
      const directory = directoryForReceipt(receiptRef);
      if (!directory) return undefined;
      const [begin, complete, evidence, report] = await Promise.all([
        readPhase(directory, "begin"),
        readPhase(directory, "complete"),
        readPhase(directory, "evidence"),
        readPhase(directory, "report"),
      ]);
      if (!begin || !complete || !evidence || !report) return undefined;
      const runnerEvidence = {
        bindings: evidence.evidence?.bindings,
        observations: evidence.evidence?.observations,
        boundary: evidence.evidence?.boundary,
      };
      const reservationDigest = await sha256Digest({
        targetIdentityDigest: begin.targetIdentityDigest,
        runId: begin.runId,
      });
      if (
        [begin, complete, evidence, report].some(
          (phase) => phase.receiptRef !== receiptRef
        ) ||
        receiptRef !==
          `urn:formspec:outcome-receipt:${reservationDigest.slice(
            "sha256:".length
          )}` ||
        begin.reservationDigest !== reservationDigest ||
        begin.caseDigest !== evidence.evidence?.caseDigest ||
        begin.runId !== evidence.evidence?.run?.runId ||
        begin.admissionContextDigest !==
          evidence.evidence?.run?.admissionContextDigest ||
        begin.targetIdentityDigest !==
          evidence.evidence?.run?.target?.targetIdentityDigest ||
        begin.lintClearanceDigest !== evidence.evidence?.lintClearanceDigest ||
        begin.actionPlanSetDigest !== evidence.evidence?.actionPlanSetDigest ||
        complete.runnerEvidenceDigest !==
          (await sha256Digest(complete.evidence)) ||
        !canonicalJsonEqual(complete.evidence, runnerEvidence) ||
        evidence.evidenceDigest !== (await sha256Digest(evidence.evidence)) ||
        report.evidenceDigest !== evidence.evidenceDigest ||
        report.reportId !== evidence.reportId ||
        typeof report.reportDigest !== "string" ||
        report.reportDigest.length === 0
      ) {
        return undefined;
      }
      return {
        receiptRef,
        evidenceDigest: evidence.evidenceDigest,
        reportId: evidence.reportId,
        evidence: structuredClone(evidence.evidence),
        ...(report?.reportDigest ? { reportDigest: report.reportDigest } : {}),
      };
    },
  };
}

async function auditPersistedReceiptChain({
  runBindings,
  results,
  custodyDirectory,
  tamperRoot,
}) {
  for (const result of results) {
    const receipt = await runBindings.readReceipt(
      result.report.executionReceipt.ref
    );
    if (!receipt) {
      throw new Error(
        `persisted receipt chain is invalid for ${result.report.id}`
      );
    }
  }
  if (!tamperRoot || results.length === 0) return;

  const receiptRef = results[0].report.executionReceipt.ref;
  const receiptToken = receiptRef.split(":").at(-1);
  const sourceDirectory = join(custodyDirectory, receiptToken);
  const tamperedDirectory = join(tamperRoot, receiptToken);
  await mkdir(tamperedDirectory, { recursive: true });
  for (const phase of ["begin", "complete", "evidence", "report"]) {
    const document = await readJson(join(sourceDirectory, `${phase}.json`));
    if (phase === "report") {
      document.reportId = `${document.reportId}:tampered`;
    }
    await writeFile(
      join(tamperedDirectory, `${phase}.json`),
      `${JSON.stringify(document, null, 2)}\n`,
      { flag: "wx" }
    );
  }
  const restartedBindings = createFilesystemRunBindings(tamperRoot);
  if ((await restartedBindings.readReceipt(receiptRef)) !== undefined) {
    throw new Error("persisted receipt reader accepted a swapped report phase");
  }
}

function errorText(errors) {
  return [...(errors ?? [])]
    .map((error) =>
      `${error.instancePath || "/"} ${error.keyword} ${
        error.message ?? ""
      }`.trim()
    )
    .sort()
    .join("; ");
}

async function createAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  for (const name of (await readdir(SCHEMAS))
    .filter((candidate) => candidate.endsWith(".schema.json"))
    .sort()) {
    const schema = await readJson(join(SCHEMAS, name));
    if (isRecord(schema) && typeof schema.$id === "string") {
      ajv.addSchema(schema);
    }
  }
  return ajv;
}

function schemaIdForDocument(document) {
  if (!isRecord(document)) return undefined;
  for (const [key, schemaId] of DOCUMENT_SCHEMAS) {
    if (typeof document[key] === "string") return schemaId;
  }
  return undefined;
}

function appGraphSchemaValidator(ajv) {
  return ({ artifactKind, document }) => {
    const schemaId =
      artifactKind === "appManifest"
        ? MANIFEST_SCHEMA
        : schemaIdForDocument(document);
    const validate = schemaId ? ajv.getSchema(schemaId) : undefined;
    if (!validate) {
      return {
        ok: false,
        issues: [
          {
            code: "OUTCOME-APP-GRAPH-SCHEMA-UNKNOWN",
            message: `No repository schema for ${artifactKind}.`,
          },
        ],
      };
    }
    const ok = validate(document);
    return ok
      ? { ok: true }
      : {
          ok: false,
          issues: [...(validate.errors ?? [])].map((error) => ({
            code: "OUTCOME-APP-GRAPH-SCHEMA",
            path: error.instancePath || "/",
            keyword: error.keyword,
            message: error.message ?? "schema validation failed",
          })),
        };
  };
}

async function createAppGraphRuntime(ajv, preview, caseDocument, sources) {
  const needSource = exactSource(
    sources,
    caseDocument.need.documentRef,
    caseDocument.need.documentDigest
  );
  const result = await produceBundleExportAppGraphValidationReport({
    manifest: preview.bundle.manifest,
    documents: preview.bundle.documents,
    source: "outcome-preview-bundle",
    schemaId: MANIFEST_SCHEMA,
    hostEvidence: {
      needsDocuments: [
        {
          schemaId: NEEDS_SCHEMA,
          source: needSource.artifactRef,
          document: needSource.document,
        },
      ],
    },
    schemaValidators: appGraphSchemaValidator(ajv),
    evidenceSchemaValidators: ({ document }) => {
      const validate = ajv.getSchema(NEEDS_SCHEMA);
      const ok = Boolean(validate?.(document));
      return ok
        ? { ok: true }
        : {
            ok: false,
            issues: [...(validate?.errors ?? [])].map((error) => ({
              code: "OUTCOME-NEEDS-SCHEMA",
              path: error.instancePath || "/",
              keyword: error.keyword,
              message: error.message ?? "schema validation failed",
            })),
          };
    },
    crossArtifactValidators: [validateRenderedNeedTrace],
    surfaceLocal: { diagnostics: [] },
    authorizationBoundary: { diagnostics: [] },
    unsupported: { diagnostics: [] },
  });
  const incomplete = result.report.phases.filter(
    (phase) => phase.status !== "completed"
  );
  const errors = result.report.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error"
  );
  if (incomplete.length > 0 || errors.length > 0) {
    throw new Error(
      `AppGraph validation did not establish a current graph: ${[
        ...incomplete.map((phase) => `${phase.phase}=${phase.status}`),
        ...errors.map((diagnostic) => diagnostic.code),
      ].join(", ")}`
    );
  }
  const graph = artifactResolutionGraphInput(result.artifactResolutionReport);
  return {
    report: result.report,
    manifest: graph.manifest,
    handles: graph.handles,
  };
}

function loadedGraphHandle(appGraphRuntime, source) {
  const matches = appGraphRuntime.handles.filter(
    (handle) =>
      handle.status === "loaded" &&
      handle.ref?.url === source.artifactRef &&
      canonicalJsonEqual(handle.document, source.document)
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function loadedSurfaceDocuments(appGraphRuntime) {
  return appGraphRuntime.handles.flatMap((handle) =>
    handle.status === "loaded" &&
    isRecord(handle.document) &&
    handle.document.$formspecSurface === "0.2"
      ? [handle.document]
      : []
  );
}

function surfaceSlots(appGraphRuntime) {
  return loadedSurfaceDocuments(appGraphRuntime).flatMap((surface) =>
    (Array.isArray(surface.routes) ? surface.routes : []).flatMap((route) =>
      isRecord(route) && Array.isArray(route.slots) ? route.slots : []
    )
  );
}

function surfaceMountsDefinition(appGraphRuntime, artifactRef) {
  return surfaceSlots(appGraphRuntime).some(
    (slot) =>
      isRecord(slot) &&
      slot.slotType === "definition-form" &&
      isRecord(slot.binding) &&
      slot.binding.definitionRef === artifactRef
  );
}

function surfaceMountsExperienceUnit(appGraphRuntime, artifactRef, subjectRef) {
  return surfaceSlots(appGraphRuntime).some(
    (slot) =>
      isRecord(slot) &&
      slot.slotType === "experience-unit" &&
      isRecord(slot.binding) &&
      slot.binding.experienceRef === artifactRef &&
      slot.binding.unitRef === subjectRef
  );
}

function surfaceMountsDataSource(appGraphRuntime, artifactRef, subjectRef) {
  return surfaceSlots(appGraphRuntime).some((slot) => {
    if (
      !isRecord(slot) ||
      slot.slotType !== "module-widget" ||
      !isRecord(slot.binding) ||
      !isRecord(slot.binding.dataBindings)
    ) {
      return false;
    }
    return Object.values(slot.binding.dataBindings).some(
      (binding) =>
        isRecord(binding) &&
        binding.catalogRef === artifactRef &&
        binding.sourceRef === subjectRef
    );
  });
}

function appManifestResolved(appGraphRuntime, source, subject) {
  return (
    subject.subjectKind === "app-manifest" &&
    appGraphRuntime.manifest.status === "loaded" &&
    canonicalJsonEqual(appGraphRuntime.manifest.document, source.document) &&
    appGraphRuntime.manifest.identity?.id === subject.subjectRef
  );
}

function subjectIsMounted(appGraphRuntime, source, subject) {
  const loaded =
    appManifestResolved(appGraphRuntime, source, subject) ||
    loadedGraphHandle(appGraphRuntime, source) !== undefined;
  if (!loaded) return false;

  switch (subject.subjectKind) {
    case "app-manifest":
      return appManifestResolved(appGraphRuntime, source, subject);
    case "surface-route":
    case "surface-slot":
    case "surface-node":
      return true;
    case "experience-unit":
      return surfaceMountsExperienceUnit(
        appGraphRuntime,
        source.artifactRef,
        subject.subjectRef
      );
    case "definition-item":
    case "definition-bind":
    case "definition-shape":
      return surfaceMountsDefinition(appGraphRuntime, source.artifactRef);
    case "response-action":
    case "response-action-effect": {
      const targetDefinition = source.document?.targetDefinition?.url;
      return (
        typeof targetDefinition === "string" &&
        surfaceMountsDefinition(appGraphRuntime, targetDefinition)
      );
    }
    case "data-source":
      return surfaceMountsDataSource(
        appGraphRuntime,
        source.artifactRef,
        subject.subjectRef
      );
    default:
      return false;
  }
}

function appGraphRelationState({
  appGraphRuntime,
  caseDocument,
  source,
  subject,
  relation,
}) {
  const resolvedObject = resolveSubjectObject(source.document, subject);
  const resolved =
    resolvedObject !== undefined &&
    (appManifestResolved(appGraphRuntime, source, subject) ||
      loadedGraphHandle(appGraphRuntime, source) !== undefined);
  if (relation === "resolves") return resolved ? "present" : "absent";

  const mounted =
    resolved && subjectIsMounted(appGraphRuntime, source, subject);
  if (relation === "mounted") return mounted ? "present" : "absent";

  const anchor = `need:${caseDocument.need.id}@${caseDocument.need.revision}`;
  return mounted &&
    resolvedObject?.["x-generation"]?.anchors?.includes?.(anchor)
    ? "present"
    : "absent";
}

function validateDocument(ajv, schemaId, document, label) {
  const validate = ajv.getSchema(schemaId);
  if (!validate) throw new Error(`schema ${schemaId} is unavailable`);
  if (!validate(document)) {
    throw new Error(
      `${label} fails ${schemaId}: ${errorText(validate.errors)}`
    );
  }
}

function createSchemaValidationPort(ajv, identity) {
  return {
    identity,
    async validate({ kind, document }) {
      const schemaId =
        kind === "case" ? CASE_SCHEMA : schemaIdForDocument(document);
      if (!schemaId) {
        return {
          valid: false,
          schemaId: "",
          diagnostics: ["no exact schema marker resolved"],
        };
      }
      const validate = ajv.getSchema(schemaId);
      if (!validate) {
        return {
          valid: false,
          schemaId,
          diagnostics: [`schema ${schemaId} is unavailable`],
        };
      }
      const valid = validate(document);
      return {
        valid,
        schemaId,
        ...(valid ? {} : { diagnostics: [errorText(validate.errors)] }),
      };
    },
  };
}

function addSubject(subjects, kind, ref) {
  if (
    typeof kind === "string" &&
    kind.length > 0 &&
    typeof ref === "string" &&
    ref.length > 0 &&
    !subjects.some((item) => item.kind === kind && item.ref === ref)
  ) {
    subjects.push({ kind, ref });
  }
}

function collectDefinitionItems(items, prefix, subjects) {
  for (const item of Array.isArray(items) ? items : []) {
    if (!isRecord(item) || typeof item.key !== "string") continue;
    const path = prefix ? `${prefix}.${item.key}` : item.key;
    addSubject(subjects, "definition-item", path);
    collectDefinitionItems(item.children, path, subjects);
  }
}

function collectSurfaceConfigNodes(value, prefix, subjects) {
  if (Array.isArray(value)) {
    value.forEach((entry) =>
      collectSurfaceConfigNodes(entry, prefix, subjects)
    );
    return;
  }
  if (!isRecord(value)) return;
  const nextPrefix =
    typeof value.id === "string" && value.id.length > 0
      ? `${prefix}/${value.id}`
      : prefix;
  if (nextPrefix !== prefix) addSubject(subjects, "surface-node", nextPrefix);
  for (const [key, entry] of Object.entries(value)) {
    if (key === "x-generation" || key === "id") continue;
    collectSurfaceConfigNodes(entry, nextPrefix, subjects);
  }
}

function inventorySubjects(document) {
  const subjects = [];
  if (!isRecord(document)) return subjects;
  if (document.$formspecNeeds === "1.0") {
    for (const need of Array.isArray(document.needs) ? document.needs : []) {
      if (isRecord(need)) addSubject(subjects, "need", need.id);
    }
  }
  if (document.$formspecExperience === "1.0") {
    for (const unit of Array.isArray(document.units) ? document.units : []) {
      if (isRecord(unit)) addSubject(subjects, "experience-unit", unit.id);
    }
  }
  if (typeof document.$formspec === "string") {
    collectDefinitionItems(document.items, "", subjects);
    for (const bind of Array.isArray(document.binds) ? document.binds : []) {
      if (isRecord(bind)) addSubject(subjects, "definition-bind", bind.path);
    }
    for (const shape of Array.isArray(document.shapes) ? document.shapes : []) {
      if (isRecord(shape)) addSubject(subjects, "definition-shape", shape.id);
    }
  }
  if (document.$formspecResponseActions === "1.0") {
    for (const action of Array.isArray(document.actions)
      ? document.actions
      : []) {
      if (!isRecord(action) || typeof action.id !== "string") continue;
      addSubject(subjects, "response-action", action.id);
      for (const [index] of (Array.isArray(action.effects)
        ? action.effects
        : []
      ).entries()) {
        addSubject(subjects, "response-action-effect", `${action.id}/${index}`);
      }
    }
  }
  if (document.$formspecSurface === "0.2") {
    for (const route of Array.isArray(document.routes) ? document.routes : []) {
      if (!isRecord(route) || typeof route.id !== "string") continue;
      addSubject(subjects, "surface-route", route.id);
      for (const slot of Array.isArray(route.slots) ? route.slots : []) {
        if (!isRecord(slot) || typeof slot.id !== "string") continue;
        const slotRef = `${route.id}/${slot.id}`;
        addSubject(subjects, "surface-slot", slotRef);
        addSubject(subjects, "surface-node", slotRef);
        const config = isRecord(slot.binding) ? slot.binding.config : undefined;
        collectSurfaceConfigNodes(config, slotRef, subjects);
      }
    }
  }
  if (document.$formspecDataSources === "1.0") {
    for (const source of Array.isArray(document.sources)
      ? document.sources
      : []) {
      if (isRecord(source)) addSubject(subjects, "data-source", source.id);
    }
  }
  if (document.$formspecBundle === "2.4") {
    addSubject(subjects, "app-manifest", document.id);
  }
  return subjects;
}

function definitionItem(document, path) {
  let candidates = Array.isArray(document.items) ? document.items : [];
  let current;
  for (const segment of path.split(".")) {
    current = candidates.find((item) => isRecord(item) && item.key === segment);
    if (!isRecord(current)) return undefined;
    candidates = Array.isArray(current.children) ? current.children : [];
  }
  return current;
}

function findConfigNode(value, ids, index = 0) {
  if (index >= ids.length) return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findConfigNode(entry, ids, index);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (value.id === ids[index]) {
    if (index === ids.length - 1) return value;
    for (const entry of Object.values(value)) {
      const found = findConfigNode(entry, ids, index + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const entry of Object.values(value)) {
    const found = findConfigNode(entry, ids, index);
    if (found !== undefined) return found;
  }
  return undefined;
}

function resolveSubjectObject(document, subject) {
  if (!isRecord(document)) return undefined;
  switch (subject.subjectKind) {
    case "app-manifest":
      return document.id === subject.subjectRef ? document : undefined;
    case "need":
      return (document.needs ?? []).find?.(
        (item) => item?.id === subject.subjectRef
      );
    case "experience-unit":
      return (document.units ?? []).find?.(
        (item) => item?.id === subject.subjectRef
      );
    case "definition-item":
      return definitionItem(document, subject.subjectRef);
    case "definition-bind":
      return (document.binds ?? []).find?.(
        (item) => item?.path === subject.subjectRef
      );
    case "definition-shape":
      return (document.shapes ?? []).find?.(
        (item) => item?.id === subject.subjectRef
      );
    case "response-action":
      return (document.actions ?? []).find?.(
        (item) => item?.id === subject.subjectRef
      );
    case "response-action-effect": {
      const [actionId, rawIndex] = subject.subjectRef.split("/");
      return (document.actions ?? []).find?.((item) => item?.id === actionId)
        ?.effects?.[Number(rawIndex)];
    }
    case "data-source":
      return (document.sources ?? []).find?.(
        (item) => item?.id === subject.subjectRef
      );
    case "surface-route":
      return (document.routes ?? []).find?.(
        (item) => item?.id === subject.subjectRef
      );
    case "surface-slot":
    case "surface-node": {
      const [routeId, slotId, ...configIds] = subject.subjectRef.split("/");
      const route = (document.routes ?? []).find?.(
        (item) => item?.id === routeId
      );
      const slot = route?.slots?.find?.((item) => item?.id === slotId);
      if (!slot) return undefined;
      if (configIds.length === 0) return slot;
      return findConfigNode(slot.binding?.config, configIds);
    }
    default:
      return undefined;
  }
}

async function pairedSource(artifactRef, document) {
  return {
    artifactRef,
    artifactDigest: await sha256Digest(document),
    document,
    subjects: inventorySubjects(document),
  };
}

async function sourcesFor(preview, externalDocuments, caseDocument) {
  const bundleSources = [
    await pairedSource(preview.bundle.manifest.id, preview.bundle.manifest),
  ];
  for (const [artifactRef, document] of Object.entries(
    preview.bundle.documents
  )) {
    bundleSources.push(await pairedSource(artifactRef, document));
  }
  const externalSources = [];
  for (const document of externalDocuments) {
    if (typeof document.url === "string") {
      externalSources.push(await pairedSource(document.url, document));
    }
  }
  const requiredExternalSources = [];
  const requiredPins = [
    {
      artifactRef: caseDocument.need.documentRef,
      artifactDigest: caseDocument.need.documentDigest,
    },
    ...(caseDocument.experience
      ? [
          {
            artifactRef: caseDocument.experience.documentRef,
            artifactDigest: caseDocument.experience.documentDigest,
          },
        ]
      : []),
  ];
  for (const pin of requiredPins) {
    const candidates = [...bundleSources, ...externalSources].filter(
      (source) => source.artifactRef === pin.artifactRef
    );
    if (candidates.length !== 1) {
      throw new Error(
        `required source ${pin.artifactRef} resolves ${candidates.length} times`
      );
    }
    const source = candidates[0];
    if (source.artifactDigest !== pin.artifactDigest) {
      throw new Error(
        `required source ${pin.artifactRef} is stale: ${pin.artifactDigest} != ${source.artifactDigest}`
      );
    }
    if (
      externalSources.includes(source) &&
      !requiredExternalSources.includes(source)
    ) {
      requiredExternalSources.push(source);
    }
  }
  return [...bundleSources, ...requiredExternalSources];
}

function exactSource(sources, artifactRef, artifactDigest) {
  const matches = sources.filter(
    (source) =>
      source.artifactRef === artifactRef &&
      source.artifactDigest === artifactDigest
  );
  if (matches.length !== 1) {
    throw new Error(
      `expected one source ${artifactRef}@${artifactDigest}; found ${matches.length}`
    );
  }
  return matches[0];
}

function semanticControlBindings(caseDocument, preview, sources) {
  const bindings = [];
  for (const step of caseDocument.procedure) {
    if (step.kind !== "open-route") continue;
    const surfaceSource = exactSource(
      sources,
      step.surfaceRef,
      step.surfaceDigest
    );
    const route = routeById(surfaceSource.document, step.routeId);
    for (const slot of route.slots ?? []) {
      if (slot?.slotType !== "definition-form") continue;
      const definitionRef = slot.binding?.definitionRef;
      const definitionSources = sources.filter(
        (source) => source.artifactRef === definitionRef
      );
      if (definitionSources.length !== 1) continue;
      const definitionSource = definitionSources[0];
      for (const subject of definitionSource.subjects ?? []) {
        if (subject.kind !== "definition-item") continue;
        bindings.push({
          renderStepRef: step.id,
          control: {
            artifactRef: definitionSource.artifactRef,
            artifactDigest: definitionSource.artifactDigest,
            subjectKind: "definition-item",
            subjectRef: subject.ref,
          },
          definition: {
            ref: definitionSource.artifactRef,
            digest: definitionSource.artifactDigest,
            path: subject.ref,
          },
        });
      }
      for (const actionDocument of responseActionsForDefinition(
        preview,
        definitionRef
      )) {
        const actionSources = sources.filter(
          (source) => source.artifactRef === actionDocument.artifactRef
        );
        if (actionSources.length !== 1) continue;
        const actionSource = actionSources[0];
        for (const action of actionDocument.document.actions ?? []) {
          if (!isRecord(action) || typeof action.id !== "string") continue;
          bindings.push({
            renderStepRef: step.id,
            control: {
              artifactRef: actionSource.artifactRef,
              artifactDigest: actionSource.artifactDigest,
              subjectKind: "response-action",
              subjectRef: action.id,
            },
            action: {
              ref: actionSource.artifactRef,
              digest: actionSource.artifactDigest,
              id: action.id,
            },
          });
        }
      }
    }
  }
  return bindings;
}

function qualifiedSubject(source, subject) {
  return {
    artifactRef: source.artifactRef,
    artifactDigest: source.artifactDigest,
    subjectKind: subject.kind,
    subjectRef: subject.ref,
  };
}

function surfaceRouteSubjects(surfaceSource, route, preview, sources) {
  const localSubjects = [];
  addSubject(localSubjects, "surface-route", route.id);
  for (const slot of Array.isArray(route.slots) ? route.slots : []) {
    if (!isRecord(slot) || typeof slot.id !== "string") continue;
    const slotRef = `${route.id}/${slot.id}`;
    addSubject(localSubjects, "surface-slot", slotRef);
    addSubject(localSubjects, "surface-node", slotRef);
    collectSurfaceConfigNodes(
      isRecord(slot.binding) ? slot.binding.config : undefined,
      slotRef,
      localSubjects
    );
  }
  const subjects = localSubjects.map((subject) =>
    qualifiedSubject(surfaceSource, subject)
  );

  for (const slot of Array.isArray(route.slots) ? route.slots : []) {
    if (!isRecord(slot) || !isRecord(slot.binding)) continue;
    if (slot.slotType === "definition-form") {
      const definitionSource = sources.find(
        (source) => source.artifactRef === slot.binding.definitionRef
      );
      if (definitionSource) {
        subjects.push(
          ...(definitionSource.subjects ?? []).map((subject) =>
            qualifiedSubject(definitionSource, subject)
          )
        );
        for (const actionDocument of responseActionsForDefinition(
          preview,
          definitionSource.artifactRef
        )) {
          const actionSource = sources.find(
            (source) => source.artifactRef === actionDocument.artifactRef
          );
          if (actionSource) {
            subjects.push(
              ...(actionSource.subjects ?? []).map((subject) =>
                qualifiedSubject(actionSource, subject)
              )
            );
          }
        }
      }
    }
    if (
      slot.slotType === "module-widget" &&
      isRecord(slot.binding.dataBindings)
    ) {
      for (const dataBinding of Object.values(slot.binding.dataBindings)) {
        if (!isRecord(dataBinding)) continue;
        const catalog = sources.find(
          (source) => source.artifactRef === dataBinding.catalogRef
        );
        if (catalog && typeof dataBinding.sourceRef === "string") {
          subjects.push({
            artifactRef: catalog.artifactRef,
            artifactDigest: catalog.artifactDigest,
            subjectKind: "data-source",
            subjectRef: dataBinding.sourceRef,
          });
        }
      }
    }
  }
  const unique = new Map();
  for (const subject of subjects) {
    unique.set(JSON.stringify(subject), subject);
  }
  return [...unique.values()];
}

function experienceUnitBindings(preview, sources) {
  const bindings = [];
  for (const surfaceRef of preview.bundle.manifest.surfaces ?? []) {
    const surfaceSource = sources.find(
      (source) => source.artifactRef === surfaceRef.url
    );
    if (!surfaceSource) continue;
    for (const route of surfaceSource.document.routes ?? []) {
      if (!isRecord(route) || typeof route.id !== "string") continue;
      const subjects = surfaceRouteSubjects(
        surfaceSource,
        route,
        preview,
        sources
      );
      for (const slot of route.slots ?? []) {
        if (
          !isRecord(slot) ||
          slot.slotType !== "experience-unit" ||
          !isRecord(slot.binding) ||
          typeof slot.binding.experienceRef !== "string" ||
          typeof slot.binding.unitRef !== "string"
        ) {
          continue;
        }
        const experienceSource = sources.find(
          (source) => source.artifactRef === slot.binding.experienceRef
        );
        if (!experienceSource) continue;
        bindings.push({
          surfaceRef: surfaceSource.artifactRef,
          surfaceDigest: surfaceSource.artifactDigest,
          routeId: route.id,
          experienceRef: experienceSource.artifactRef,
          experienceDigest: experienceSource.artifactDigest,
          unitId: slot.binding.unitRef,
          subjects,
        });
      }
    }
  }
  return bindings;
}

function subjectNeedBindings(sources) {
  const bindings = [];
  for (const source of sources) {
    for (const subject of source.subjects ?? []) {
      const qualified = qualifiedSubject(source, subject);
      const resolved = resolveSubjectObject(source.document, qualified);
      for (const anchor of resolved?.["x-generation"]?.anchors ?? []) {
        if (typeof anchor !== "string") continue;
        const match = /^need:(.+)@([1-9][0-9]*)$/.exec(anchor);
        if (!match) continue;
        bindings.push({
          subject: qualified,
          needId: match[1],
          needRevision: Number(match[2]),
        });
      }
    }
  }
  return bindings;
}

function actionPlansFor(caseDocument, sources) {
  const plans = [];
  for (const step of caseDocument.procedure) {
    if (step.kind !== "activate-control") continue;
    const source = exactSource(sources, step.actionsRef, step.actionsDigest);
    const plan = planResponseActionInvocation(
      source.document,
      step.actionId,
      step.id
    );
    if (!plan.resolution.resolved) {
      throw new Error(
        `Action ${step.actionsRef}#${step.actionId} does not resolve`
      );
    }
    plans.push({
      stepId: step.id,
      actionsRef: step.actionsRef,
      actionsDigest: step.actionsDigest,
      actionId: step.actionId,
      effects: plan.effects.map((effect) => ({
        index: effect.effectIndex,
        type: effect.effect.type,
        durable: effect.durable,
      })),
    });
  }
  return plans;
}

function lintActionPlans(actionPlans) {
  const unique = new Map();
  for (const plan of actionPlans) {
    const key = `${plan.actionsRef}\u0000${plan.actionsDigest}\u0000${plan.actionId}`;
    unique.set(key, {
      actionsRef: plan.actionsRef,
      actionsDigest: plan.actionsDigest,
      actionId: plan.actionId,
      effects: plan.effects.map(({ index, type, durable }) => ({
        index,
        type,
        durable,
      })),
    });
  }
  return [...unique.values()];
}

function appArtifactBindings(preview, sources, caseDocument) {
  const manifest = preview.bundle.manifest;
  const declarations = [
    ...(manifest.surfaces ?? []).map((ref) => ["surface", ref.url]),
    ...(manifest.definitions ?? []).map((ref) => ["definition", ref.url]),
    ...(manifest.responseActionDocuments ?? []).map((ref) => [
      "response-actions",
      ref.url,
    ]),
    ...(manifest.dataSources ?? []).map((ref) => ["data-sources", ref.url]),
    ...(manifest.experience ? [["experience", manifest.experience.url]] : []),
    ...(manifest.needs ? [["needs", manifest.needs.url]] : []),
  ];
  return declarations.flatMap(([kind, artifactRef]) => {
    const matches = sources.filter(
      (source) => source.artifactRef === artifactRef
    );
    return matches.length === 1
      ? [
          {
            appRef: caseDocument.app.id,
            appDigest: caseDocument.app.digest,
            artifactRef,
            artifactDigest: matches[0].artifactDigest,
            kind,
          },
        ]
      : [];
  });
}

function createOwnerFactsPort({ previewSet, identity }) {
  return {
    identity,
    async deriveFacts({ caseDocument, sources }) {
      const previews = Object.values(previewSet.previews ?? {}).filter(
        (candidate) =>
          candidate?.bundle?.manifest?.id === caseDocument.app.id &&
          candidate?.bundle?.manifest?.version === caseDocument.app.version
      );
      if (previews.length !== 1) {
        throw new Error(
          `owner facts resolve ${previews.length} previews for ${caseDocument.app.id}@${caseDocument.app.version}`
        );
      }
      const preview = previews[0];
      return {
        sources: structuredClone(sources),
        semanticControlBindings: semanticControlBindings(
          caseDocument,
          preview,
          sources
        ),
        experienceUnitBindings: experienceUnitBindings(preview, sources),
        subjectNeedBindings: subjectNeedBindings(sources),
        appArtifactBindings: appArtifactBindings(
          preview,
          sources,
          caseDocument
        ),
        actionPlans: lintActionPlans(actionPlansFor(caseDocument, sources)),
      };
    },
  };
}

function responseActionsForDefinition(preview, definitionRef) {
  return Object.entries(preview.bundle.documents).flatMap(
    ([artifactRef, document]) =>
      document?.$formspecResponseActions === "1.0" &&
      document?.targetDefinition?.url === definitionRef
        ? [{ artifactRef, document }]
        : []
  );
}

function responseSourceBindings(catalogHandles, response) {
  return catalogHandles.flatMap(({ catalogRef, document }) =>
    (Array.isArray(document.sources) ? document.sources : []).flatMap(
      (source) =>
        source?.kind === "definition-response" &&
        source?.definitionRef === response.definitionUrl &&
        source?.definitionVersion === response.definitionVersion
          ? [{ catalogRef, sourceRef: source.id }]
          : []
    )
  );
}

function getPath(value, path) {
  let current = value;
  for (const segment of String(path).split(".")) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function responseItem(response, expectedItem) {
  const value = getPath(response.data, expectedItem.path);
  return value === undefined
    ? { path: expectedItem.path, presence: "absent" }
    : { path: expectedItem.path, presence: "present", value };
}

function validationIssues(report) {
  const issues = (report?.results ?? []).flatMap((result) =>
    typeof result?.path === "string" && typeof result?.code === "string"
      ? [{ path: result.path, code: result.code }]
      : []
  );
  return [
    ...new Map(
      issues.map((issue) => [JSON.stringify([issue.path, issue.code]), issue])
    ).values(),
  ].sort(
    (left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
  );
}

function effectTrace(result) {
  return result.effectTrace.map((effect, index) => ({
    index,
    type: effect.type,
    status: effect.status,
    ...(typeof effect.outcomeRef === "string"
      ? { outcomeRef: effect.outcomeRef }
      : {}),
  }));
}

function routeById(surface, routeId) {
  const routes = Array.isArray(surface.routes) ? surface.routes : [];
  const matches = routes.filter((route) => route?.id === routeId);
  if (matches.length !== 1) {
    throw new Error(`route ${routeId} resolves ${matches.length} times`);
  }
  return matches[0];
}

function bindingId(runId, stepId) {
  return `${runId}:binding:${encodeURIComponent(stepId)}`;
}

function renderInstanceId(runId, stepId) {
  return `${runId}:render:${encodeURIComponent(stepId)}`;
}

function responseId(runId, definitionRef) {
  return `${runId}:response:${encodeURIComponent(definitionRef)}`;
}

function requestId(runId, stepId, slotId, inputName) {
  return `${runId}:data-source:${encodeURIComponent(
    `${stepId}/${slotId}/${inputName}`
  )}`;
}

function observationId(runId, expectationId) {
  return `${runId}:observation:${encodeURIComponent(expectationId)}`;
}

function findRouteRuntime(caseState, stepRef) {
  const runtime = caseState.routeRuntimes.get(stepRef);
  if (!runtime) throw new Error(`route runtime ${stepRef} is unavailable`);
  return runtime;
}

function findActionRuntime(caseState, stepRef) {
  const runtime = caseState.actionRuntimes.get(stepRef);
  if (!runtime) throw new Error(`Action runtime ${stepRef} is unavailable`);
  return runtime;
}

function ownerEvidenceClass(kind) {
  return kind === "app-graph" ? "structural" : "runtime";
}

function routeRuntimeForExpectation(caseState, stepRef) {
  const direct = caseState.routeRuntimes.get(stepRef);
  if (direct) return direct;
  const action = caseState.actionRuntimes.get(stepRef);
  if (action) {
    return findRouteRuntime(caseState, action.step.renderStepRef);
  }
  throw new Error(`rendered route for step ${stepRef} is unavailable`);
}

async function observeExpectation({
  expectation,
  checkpointBinding,
  checkpointBoundary,
  bindings,
  caseDocument,
  caseState,
  sources,
  appGraphRuntime,
  implementations,
  runId,
}) {
  const stepBinding =
    expectation.stepRef === undefined
      ? undefined
      : bindings.find((binding) => binding.stepId === expectation.stepRef);
  const common = {
    id: observationId(runId, expectation.id),
    expectationId: expectation.id,
    kind: expectation.kind,
    evidenceClass: ownerEvidenceClass(expectation.kind),
    boundary: checkpointBoundary,
    checkpointBindingRef: checkpointBinding.id,
    ...(stepBinding ? { stepBindingRef: stepBinding.id } : {}),
    adapter: implementations.adapter,
  };

  switch (expectation.kind) {
    case "app-graph": {
      if (appGraphRuntime === undefined) {
        throw new Error("AppGraph runtime is unavailable");
      }
      const source = exactSource(
        sources,
        expectation.subject.artifactRef,
        expectation.subject.artifactDigest
      );
      return {
        ...common,
        source: {
          artifactRef: source.artifactRef,
          artifactDigest: source.artifactDigest,
        },
        payload: {
          subject: expectation.subject,
          relation: expectation.relation,
          state: appGraphRelationState({
            appGraphRuntime,
            caseDocument,
            source,
            subject: expectation.subject,
            relation: expectation.relation,
          }),
        },
      };
    }
    case "validation-report": {
      const runtime = findActionRuntime(caseState, expectation.stepRef);
      const report = runtime.invocation.detail?.validationReport;
      if (
        !isRecord(report) ||
        typeof report.valid !== "boolean" ||
        runtime.definitionSource === undefined
      ) {
        return undefined;
      }
      return {
        ...common,
        source: {
          artifactRef: runtime.definitionSource.artifactRef,
          artifactDigest: runtime.definitionSource.artifactDigest,
        },
        payload: {
          definitionRef: runtime.definitionSource.artifactRef,
          definitionDigest: runtime.definitionSource.artifactDigest,
          responseId: runtime.binding.responseId,
          responseRevision: runtime.binding.responseRevision,
          valid: report?.valid === true,
          issues: validationIssues(report),
        },
      };
    }
    case "response": {
      const runtime = findActionRuntime(caseState, expectation.stepRef);
      const response = runtime.invocation.detail?.response;
      if (!isRecord(response) || runtime.definitionSource === undefined) {
        return undefined;
      }
      return {
        ...common,
        source: {
          artifactRef: runtime.definitionSource.artifactRef,
          artifactDigest: runtime.definitionSource.artifactDigest,
        },
        payload: {
          definitionRef: runtime.definitionSource.artifactRef,
          definitionDigest: runtime.definitionSource.artifactDigest,
          responseId: runtime.binding.responseId,
          responseRevision: runtime.binding.responseRevision,
          responseDigest: await sha256Digest(response),
          status: response.status,
          ...(expectation.item
            ? { item: responseItem(response, expectation.item) }
            : {}),
        },
      };
    }
    case "action-invocation": {
      const runtime = findActionRuntime(caseState, expectation.stepRef);
      return {
        ...common,
        source: {
          artifactRef: runtime.binding.actionsRef,
          artifactDigest: runtime.binding.actionsDigest,
        },
        payload: {
          actionsRef: runtime.binding.actionsRef,
          actionsDigest: runtime.binding.actionsDigest,
          actionId: runtime.binding.actionId,
          terminal: runtime.invocation.status,
          effects: runtime.binding.effects,
          invocationId: runtime.binding.invocationId,
          responseId: runtime.binding.responseId,
        },
      };
    }
    case "data-source-result": {
      const runtime = routeRuntimeForExpectation(
        caseState,
        expectation.stepRef
      );
      const matches = [...runtime.loads.values()].filter(
        (load) =>
          load.catalogRef === expectation.catalogRef &&
          load.sourceId === expectation.sourceId
      );
      if (matches.length !== 1) return undefined;
      const load = matches[0];
      return {
        ...common,
        source: {
          artifactRef: load.catalogRef,
          artifactDigest: load.catalogDigest,
        },
        payload: {
          catalogRef: load.catalogRef,
          catalogDigest: load.catalogDigest,
          sourceId: load.sourceId,
          state: load.result.status,
          ...(load.result.status === "loaded"
            ? {
                freshness: load.result.freshness,
                valueDigest: await sha256Digest(load.result.value),
                ...(typeof load.result.recordId === "string"
                  ? { recordId: load.result.recordId }
                  : {}),
              }
            : {}),
          requestId: load.requestId,
        },
      };
    }
    case "route-state": {
      const runtime = routeRuntimeForExpectation(
        caseState,
        expectation.stepRef
      );
      const routeState = runtime.currentRouteState;
      if (!routeState) return undefined;
      const surfaceSource = exactSource(
        sources,
        expectation.surfaceRef,
        expectation.surfaceDigest
      );
      return {
        ...common,
        source: {
          artifactRef: surfaceSource.artifactRef,
          artifactDigest: surfaceSource.artifactDigest,
        },
        payload: {
          surfaceRef: surfaceSource.artifactRef,
          surfaceDigest: surfaceSource.artifactDigest,
          routeId: routeState.routeId,
          routeInstanceId: routeState.routeInstanceId,
        },
      };
    }
    case "rendered-output": {
      const runtime = routeRuntimeForExpectation(
        caseState,
        expectation.stepRef
      );
      const lookup = caseState.semanticOutputRegistry.lookup({
        renderInstanceId: runtime.binding.renderInstanceId,
        node: expectation.node,
      });
      if (lookup.status === "missing") return undefined;
      if (lookup.status === "ambiguous") return undefined;
      return {
        ...common,
        source: {
          artifactRef: lookup.output.node.artifactRef,
          artifactDigest: lookup.output.node.artifactDigest,
        },
        payload: {
          node: lookup.output.node,
          rendered: true,
          ...(lookup.output.operable === undefined
            ? {}
            : { operable: lookup.output.operable }),
          ...(lookup.output.semanticValue === undefined
            ? {}
            : { semanticValue: lookup.output.semanticValue }),
          renderInstanceId: lookup.output.renderInstanceId,
        },
      };
    }
    default:
      throw new Error(`unsupported observation kind ${expectation.kind}`);
  }
}

async function makeCaseRuntime({
  ajv,
  caseDocument,
  preview,
  sources,
  config,
  implementations,
  runId,
  actionPlans,
  appGraphRuntime,
}) {
  const semanticControlRegistry = createSemanticControlRegistry();
  const semanticOutputRegistry = createSurfaceSemanticOutputRegistry();
  const scenarioRuntime = createSurfacePreviewRuntime(
    preview.scenario,
    config.profile ?? preview.scenario.defaultProfile
  );
  const bundle = dereferenceBundleExport(preview.bundle);
  const composedApp = composeSurfaceApp(bundle.surfaces, {
    entrySurface: bundle.entrySurface,
  });
  const catalogHandles = (preview.bundle.manifest.dataSources ?? []).flatMap(
    (ref) => {
      const document = preview.bundle.documents[ref.url];
      return document ? [{ catalogRef: ref.url, document }] : [];
    }
  );
  const responseStore = createPreviewDefinitionResponseStore(catalogHandles);
  const routeRuntimes = new Map();
  const actionRuntimes = new Map();
  const pendingLoads = new Set();
  const payloadValidators = new WeakMap();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let activeRouteRuntime;

  const definitionArtifacts = new Map(
    [...bundle.definitions.entries()].flatMap(([artifactRef, document]) => {
      const matches = sources.filter(
        (source) =>
          source.artifactRef === artifactRef &&
          canonicalJsonEqual(source.document, document)
      );
      return matches.length === 1
        ? [
            [
              document,
              {
                artifactRef,
                artifactDigest: matches[0].artifactDigest,
              },
            ],
          ]
        : [];
    })
  );
  const responseActionsArtifacts = new Map(
    bundle.responseActions.flatMap((document) => {
      const matches = sources.filter((source) =>
        canonicalJsonEqual(source.document, document)
      );
      return matches.length === 1
        ? [
            [
              document,
              {
                artifactRef: matches[0].artifactRef,
                artifactDigest: matches[0].artifactDigest,
              },
            ],
          ]
        : [];
    })
  );

  const resolveSemanticControlScope = createSurfaceSemanticControlScopeResolver(
    {
      registry: semanticControlRegistry,
      definitionArtifacts,
      responseActionsArtifacts,
      renderInstanceIdFor: (request) =>
        activeRouteRuntime?.routeId === request.route.routeId
          ? activeRouteRuntime.renderInstanceId
          : undefined,
      responseBindingFor: (request) =>
        activeRouteRuntime?.routeId === request.route.routeId
          ? {
              responseId: responseId(runId, request.plan.definitionRef),
              responseRevision: 0,
            }
          : undefined,
    }
  );
  const resolveSemanticOutputScope = createSurfaceSemanticOutputScopeResolver({
    registry: semanticOutputRegistry,
    surfaceArtifactFor: (request) => {
      const artifactRef = request.route.surfaceRef;
      if (!artifactRef) return undefined;
      const matches = sources.filter(
        (source) =>
          source.artifactRef === artifactRef &&
          canonicalJsonEqual(source.document, request.plan.handle.surface)
      );
      return matches.length === 1
        ? {
            artifactRef,
            artifactDigest: matches[0].artifactDigest,
          }
        : undefined;
    },
    renderInstanceIdFor: (request) =>
      activeRouteRuntime?.routeId === request.route.routeId
        ? activeRouteRuntime.renderInstanceId
        : undefined,
  });

  function rememberCompletedResponse(result) {
    const response = result.detail?.response;
    if (
      result.status !== "completed" ||
      response?.status !== "completed" ||
      typeof result.invocationId !== "string"
    ) {
      return;
    }
    for (const binding of responseSourceBindings(catalogHandles, response)) {
      const recorded = responseStore.record({
        binding,
        invocationId: result.invocationId,
        response,
      });
      if (recorded.status === "refused") {
        throw new Error(
          `Definition Response delivery was refused: ${recorded.reason}`
        );
      }
    }
  }

  const baseDataSourceLoader = responseStore.wrapLoader(scenarioRuntime.loader);
  function trackedDataSourceLoader(request) {
    const routeRuntime = activeRouteRuntime;
    if (!routeRuntime) {
      throw new Error("a Data Source load occurred without a committed route");
    }
    const descriptor = request.descriptor;
    const id = requestId(
      runId,
      routeRuntime.step.id,
      request.context.slotId,
      `${descriptor.catalogRef}#${descriptor.sourceRef}`
    );
    const task = Promise.resolve(baseDataSourceLoader(request)).then(
      (result) => {
        const catalogSource = exactSource(
          sources,
          descriptor.catalogRef,
          routeRuntime.catalogDigests.get(descriptor.catalogRef)
        );
        routeRuntime.loads.set(id, {
          requestId: id,
          catalogRef: descriptor.catalogRef,
          catalogDigest: catalogSource.artifactDigest,
          sourceId: descriptor.sourceRef,
          result,
        });
        return result;
      }
    );
    pendingLoads.add(task);
    task.then(
      () => pendingLoads.delete(task),
      () => pendingLoads.delete(task)
    );
    return task;
  }

  function validateDataSourcePayload({ schema, value }) {
    let validate = payloadValidators.get(schema);
    if (!validate) {
      try {
        validate = ajv.compile(schema);
        payloadValidators.set(schema, validate);
      } catch (error) {
        return {
          valid: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return validate(value)
      ? { valid: true }
      : { valid: false, reason: errorText(validate.errors) };
  }

  async function settleCommittedRenderer() {
    for (let turn = 0; turn < 20; turn += 1) {
      await act(async () => {
        await Promise.all([...pendingLoads]);
        await Promise.resolve();
      });
      if (pendingLoads.size === 0) {
        await act(async () => {
          await Promise.resolve();
        });
        if (pendingLoads.size === 0) return;
      }
    }
    throw new Error("the committed Surface renderer did not settle");
  }

  async function openRoute(step) {
    const surfaceSource = exactSource(
      sources,
      step.surfaceRef,
      step.surfaceDigest
    );
    const handles = composedApp.routes.filter(
      (handle) =>
        handle.surface === surfaceSource.document &&
        handle.routeId === step.routeId
    );
    if (handles.length !== 1) {
      throw new Error(
        `route ${step.surfaceRef}#${step.routeId} resolves ${handles.length} times`
      );
    }
    const destination = routeHref(
      handles[0],
      preview.scenario.routeParams ?? {}
    );
    if (destination.refusal) {
      throw new Error(
        `route ${step.surfaceRef}#${step.routeId} is refused: ${destination.refusal}`
      );
    }
    const routeRuntime = {
      step,
      surface: surfaceSource.document,
      routeId: step.routeId,
      binding: undefined,
      renderInstanceId: renderInstanceId(runId, step.id),
      currentRouteState: undefined,
      loads: new Map(),
      navigationHrefs: [],
      catalogDigests: new Map(
        catalogHandles.map(({ catalogRef }) => [
          catalogRef,
          sources.find((source) => source.artifactRef === catalogRef)
            ?.artifactDigest,
        ])
      ),
      diagnostics: [],
    };
    routeRuntimes.set(step.id, routeRuntime);
    activeRouteRuntime = routeRuntime;
    const moduleIds = [
      ...new Set((bundle.manifest.modules ?? []).map((module) => module.id)),
    ];
    await act(async () => {
      root.render(
        createElement(CommittedSurfaceTestHost, {
          key: step.id,
          initialLocation: destination.href,
          onLocationChange: (href) => {
            routeRuntime.navigationHrefs.push(href);
          },
          surfaceProps: {
            bundle,
            routeParams: preview.scenario.routeParams,
            widgetModules: moduleIds.map((moduleId) =>
              starterWidgetModule(moduleId)
            ),
            dataSourceLoader: trackedDataSourceLoader,
            authorizeDataSource: scenarioRuntime.authorize,
            validateDataSourcePayload,
            onDefinitionActionResult: rememberCompletedResponse,
            resolveSemanticControlScope,
            resolveSemanticOutputScope,
            sessionGeneration: step.id,
            setDocumentTitle: false,
            onDiagnostics: (diagnostics) => {
              routeRuntime.diagnostics = [...diagnostics];
            },
            onCurrentRouteStateChange: (state) => {
              routeRuntime.currentRouteState = state;
            },
          },
        })
      );
    });
    await settleCommittedRenderer();

    const currentRouteState = routeRuntime.currentRouteState;
    if (
      !currentRouteState ||
      currentRouteState.surface !== surfaceSource.document ||
      currentRouteState.surfaceRef !== step.surfaceRef ||
      currentRouteState.routeId !== step.routeId
    ) {
      throw new Error(
        `SurfaceApp did not commit ${step.surfaceRef}#${step.routeId}`
      );
    }

    const dataSourceRequestIds = [...routeRuntime.loads.keys()];
    const binding = {
      id: bindingId(runId, step.id),
      stepId: step.id,
      kind: "open-route",
      surfaceRef: step.surfaceRef,
      surfaceDigest: step.surfaceDigest,
      routeId: step.routeId,
      routeInstanceId: currentRouteState.routeInstanceId,
      renderInstanceId: routeRuntime.renderInstanceId,
      ...(dataSourceRequestIds.length > 0 ? { dataSourceRequestIds } : {}),
    };
    routeRuntime.binding = binding;
    return binding;
  }

  async function setItem(step, renderBinding) {
    const routeRuntime = findRouteRuntime(
      { routeRuntimes },
      step.renderStepRef
    );
    let result;
    await act(async () => {
      result = semanticControlRegistry.setItem(
        {
          renderInstanceId: renderBinding.renderInstanceId,
          control: step.control,
        },
        step.value
      );
    });
    await settleCommittedRenderer();
    if (result.status !== "set") {
      throw new Error(
        `semantic set-item ${step.id} was refused: ${result.reason}`
      );
    }
    if (
      result.responseBinding.responseId !==
      responseId(runId, step.definitionRef)
    ) {
      throw new Error(`semantic set-item ${step.id} changed Response identity`);
    }
    return {
      id: bindingId(runId, step.id),
      stepId: step.id,
      kind: "set-item",
      routeInstanceId: routeRuntime.binding.routeInstanceId,
      renderInstanceId: renderBinding.renderInstanceId,
      control: step.control,
      definitionRef: step.definitionRef,
      definitionDigest: step.definitionDigest,
      path: step.path,
      ...result.responseBinding,
    };
  }

  async function activateControl(
    step,
    renderBinding,
    responseBinding,
    invocationId
  ) {
    const routeRuntime = findRouteRuntime(
      { routeRuntimes },
      step.renderStepRef
    );
    let result;
    await act(async () => {
      result = await semanticControlRegistry.activateControl(
        {
          renderInstanceId: renderBinding.renderInstanceId,
          control: step.control,
        },
        {
          invocationId,
          responseBinding: {
            responseId: responseBinding.responseId,
            responseRevision: responseBinding.responseRevision,
          },
        }
      );
    });
    await settleCommittedRenderer();
    if (result.status !== "activated") {
      throw new Error(
        `semantic activate-control ${step.id} was refused: ${result.reason}`
      );
    }
    const binding = {
      id: bindingId(runId, step.id),
      stepId: step.id,
      kind: "activate-control",
      routeInstanceId: routeRuntime.binding.routeInstanceId,
      renderInstanceId: renderBinding.renderInstanceId,
      control: step.control,
      actionsRef: step.actionsRef,
      actionsDigest: step.actionsDigest,
      actionId: step.actionId,
      invocationId,
      ...result.responseBinding,
      effects: effectTrace(result.invocation),
    };
    actionRuntimes.set(step.id, {
      step,
      binding,
      invocation: result.invocation,
      definitionSource: (() => {
        const response = result.invocation.detail?.response;
        if (!isRecord(response) || typeof response.definitionUrl !== "string") {
          return undefined;
        }
        const matches = sources.filter(
          (source) => source.artifactRef === response.definitionUrl
        );
        return matches.length === 1 ? matches[0] : undefined;
      })(),
    });
    return binding;
  }

  async function checkpoint(step, priorBindings) {
    const startedAt = new Date().toISOString();
    const binding = {
      id: bindingId(runId, step.id),
      stepId: step.id,
      kind: "checkpoint",
      boundary: {
        startedAt,
        endedAt: startedAt,
      },
      includedBindingRefs: priorBindings.map((bindingItem) => bindingItem.id),
    };
    const expectations = caseDocument.expectedObservations.filter(
      (expectation) => expectation.checkpointRef === step.id
    );
    const observations = [];
    for (const expectation of expectations) {
      const observation = await observeExpectation({
        expectation,
        checkpointBinding: binding,
        checkpointBoundary: binding.boundary,
        bindings: priorBindings,
        caseDocument,
        caseState: {
          routeRuntimes,
          actionRuntimes,
          semanticOutputRegistry,
        },
        sources,
        appGraphRuntime,
        implementations,
        runId,
      });
      if (observation !== undefined) observations.push(observation);
    }
    const boundary = {
      startedAt,
      endedAt: new Date().toISOString(),
    };
    binding.boundary = boundary;
    for (const observation of observations) {
      observation.boundary = boundary;
    }
    return { binding, observations };
  }

  return {
    ports: {
      openRoute,
      setItem,
      activateControl,
      checkpoint,
    },
    dispose() {
      act(() => root.unmount());
      container.remove();
    },
    actionPlans,
  };
}

async function runCase({
  ajv,
  caseEntry,
  caseDocument,
  preview,
  needsDocuments,
  config,
  outputDirectory,
  targetIdentity,
  targetIdentities,
  runBindings,
  schemaValidation,
  ownerFacts,
  clock,
  verifyOnly,
}) {
  validateDocument(ajv, CASE_SCHEMA, caseDocument, caseEntry.path);
  const currentCaseDigest = await sha256Digest(caseDocument);
  if (currentCaseDigest !== caseEntry.digest) {
    throw new Error(
      `${caseEntry.path} digest is stale: declared ${caseEntry.digest}, current ${currentCaseDigest}`
    );
  }
  const sources = await sourcesFor(preview, needsDocuments, caseDocument);
  const actionPlans = actionPlansFor(caseDocument, sources);
  const lintContext = {
    sources,
    supportedStepKinds: [...RUNNER_SUPPORTED_STEP_KINDS],
    supportedObservationKinds: [...RUNNER_SUPPORTED_OBSERVATION_KINDS],
    semanticControlBindings: [],
    experienceUnitBindings: [],
    subjectNeedBindings: [],
    appArtifactBindings: [],
    actionPlans: [],
    caseDigest: caseEntry.digest,
    currentCaseDigest,
  };
  const lintClearance = await issueOutcomeLintClearance(
    { caseDocument, context: lintContext },
    {
      schemaValidation,
      verifier: targetIdentity.implementations.verifier,
      ownerFacts,
    }
  );
  const appGraphRuntime = await createAppGraphRuntime(
    ajv,
    preview,
    caseDocument,
    sources
  );

  const runId = `urn:formspec:outcome-run:${randomUUID()}`;
  const admissionFacts = {
    target: config.target,
    mode: "new",
    runId,
    caseDigest: currentCaseDigest,
    admittedStepKinds: config.admittedStepKinds,
    principal: config.principal,
  };
  const admission = {
    ...admissionFacts,
    admissionDigest: await digestRunnerAdmissionContext(admissionFacts),
  };
  const runtime = await makeCaseRuntime({
    ajv,
    caseDocument,
    preview,
    sources,
    config,
    implementations: targetIdentity.implementations,
    runId,
    actionPlans,
    appGraphRuntime,
  });
  let run;
  try {
    run = await runOutcomeVerificationCase(
      { caseDocument, admission, lintClearance },
      {
        targetIdentities,
        runBindings,
        ports: runtime.ports,
        supportedStepKinds: RUNNER_SUPPORTED_STEP_KINDS,
        clock,
      }
    );
  } finally {
    runtime.dispose();
  }
  const comparisonRequest = {
    case: caseDocument,
    caseDigest: run.caseDigest,
    lintClearance,
    pairedSources: sources.map(({ artifactRef, artifactDigest }) => ({
      artifactRef,
      artifactDigest,
    })),
    run: {
      runId: run.runId,
      admissionContextDigest: admission.admissionDigest,
      target: run.target,
    },
    custody: run.custody,
    bindings: run.bindings,
    boundary: run.boundary,
    observations: run.observations,
  };
  const report = await generateOutcomeVerificationReport(comparisonRequest, {
    clock,
    runBindings,
  });
  validateDocument(ajv, REPORT_SCHEMA, report, `${caseDocument.id}.report`);
  const reportLint = lintOutcomeVerificationReport(report);
  if (reportLint.length > 0) {
    throw new Error(
      `${caseDocument.id} report lint failed:\n${reportLint
        .map(
          (finding) => `- ${finding.code} ${finding.path}: ${finding.message}`
        )
        .join("\n")}`
    );
  }
  const reportDigest = await sha256Digest(report);
  const targetToken = targetIdentity.targetIdentityDigest.slice(
    "sha256:".length
  );
  const runToken = runId.split(":").at(-1);
  const reportToken = report.id.split(":").at(-1);
  const runDirectory = join(outputDirectory, targetToken, runToken);
  const reportPath = join(runDirectory, `${reportToken}.report.json`);
  if (!verifyOnly) {
    await mkdir(runDirectory, { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
      flag: "wx",
    });
  }
  const {
    case: _case,
    caseDigest: _caseDigest,
    pairedSources: _pairedSources,
    lintClearance: _lintClearance,
    custody: _custody,
    ...comparison
  } = comparisonRequest;
  return {
    caseEntry,
    caseDocument,
    report,
    reportDigest,
    reportPath,
    claimEvidence: {
      caseDocument,
      lintContext,
      admission,
      comparison: {
        ...comparison,
        generatedAt: report.generatedAt,
      },
      report,
      reportDigest,
    },
  };
}

async function main() {
  let temporaryCustodyDirectory;
  const domWindow = installCommittedDomRuntime();
  try {
    const verifyOnly = process.argv.slice(2).includes("--verify-only");
    const runSetArgument = process.argv
      .slice(2)
      .find((argument) => argument !== "--verify-only");
    const runSetPath = resolve(runSetArgument ?? DEFAULT_RUN_SET);
    const runSetDirectory = dirname(runSetPath);
    const config = requireRecord(await readJson(runSetPath), "run set");
    const runnerSource = await readFile(RUNNER_FILE, "utf8");
    if (config.$formspecOutcomeVerificationRunSet !== "0.1") {
      throw new Error("run set version must be 0.1");
    }
    const previewSetPath = resolve(
      runSetDirectory,
      requireString(config.previewSet, "previewSet")
    );
    const previewSet = requireRecord(
      await readJson(previewSetPath),
      "preview set"
    );
    const needsDocuments = await Promise.all(
      (config.needsDocuments ?? []).map((path) =>
        readJson(resolve(runSetDirectory, path))
      )
    );
    const outputDirectory = resolve(
      runSetDirectory,
      requireString(config.outputDirectory, "outputDirectory")
    );
    if (!verifyOnly) {
      await mkdir(outputDirectory, { recursive: true });
    }
    await initFormspecEngine();
    const ajv = await createAjv();
    const targetIdentity = await resolveTestTargetIdentity({
      request: config.target,
      previewSet,
      runnerSource,
    });
    const targetIdentities = {
      async resolveTarget(request) {
        return canonicalJsonEqual(request, config.target)
          ? structuredClone(targetIdentity)
          : undefined;
      },
    };
    temporaryCustodyDirectory = verifyOnly
      ? await mkdtemp(join(tmpdir(), "formspec-outcome-custody-"))
      : undefined;
    const custodyDirectory =
      temporaryCustodyDirectory ?? NORMAL_CUSTODY_DIRECTORY;
    const runBindings = createFilesystemRunBindings(custodyDirectory);
    const runnerDigest = await sha256Digest(runnerSource);
    const schemaSetDigest = await digestFiles(await filesBelow(SCHEMAS));
    const dependencyLockDigest = await sha256Digest(
      await readFile(join(REPO_ROOT, "package-lock.json"), "utf8")
    );
    const schemaValidationIdentity = {
      id: "formspec-repository-ajv-schema-validator",
      version: "0.1.0",
      digest: await sha256Digest({
        schemaSetDigest,
        validationAdapterDigest: runnerDigest,
        dependencyLockDigest,
      }),
    };
    const schemaValidation = createSchemaValidationPort(
      ajv,
      schemaValidationIdentity
    );
    const ownerFactsIdentity = {
      id: "formspec-appgraph-owner-facts-adapter",
      version: "0.1.0",
      digest: await sha256Digest({
        runnerDigest,
        rendererClosureDigest: targetIdentity.implementations.renderer.digest,
        planningRuntimeClosureDigest:
          targetIdentity.implementations.runtime.digest,
      }),
    };
    const ownerFacts = createOwnerFactsPort({
      previewSet,
      identity: ownerFactsIdentity,
    });
    const clock = { now: () => new Date().toISOString() };
    const results = [];

    for (const caseEntry of config.cases ?? []) {
      const casePath = resolve(
        runSetDirectory,
        requireString(caseEntry.path, "case.path")
      );
      const caseDocument = await readJson(casePath);
      assertRunnerIsCaseGeneric(runnerSource, caseDocument);
      const previewMatches = Object.values(previewSet.previews ?? {}).filter(
        (candidate) =>
          candidate?.bundle?.manifest?.id === caseDocument.app.id &&
          candidate?.bundle?.manifest?.version === caseDocument.app.version
      );
      if (previewMatches.length !== 1) {
        throw new Error(
          `${caseEntry.path} resolves ${previewMatches.length} previews for ${caseDocument.app.id}@${caseDocument.app.version}`
        );
      }
      const preview = previewMatches[0];
      const manifestDigest = await sha256Digest(preview.bundle.manifest);
      if (manifestDigest !== caseDocument.app.digest) {
        throw new Error(
          `${caseEntry.path} App pin is stale: ${caseDocument.app.digest} != ${manifestDigest}`
        );
      }
      results.push(
        await runCase({
          ajv,
          caseEntry,
          caseDocument,
          preview,
          needsDocuments,
          config,
          outputDirectory,
          targetIdentity,
          targetIdentities,
          runBindings,
          schemaValidation,
          ownerFacts,
          clock,
          verifyOnly,
        })
      );
    }

    const technicallyRequiredResults = results.filter(
      (result) => result.caseEntry.required
    );
    if (technicallyRequiredResults.length === 0) {
      throw new Error("the run set requires at least one conformance case");
    }
    const claimRequiredResults = results.filter(
      (result) => result.caseEntry.claimRequired
    );
    if (claimRequiredResults.length === 0) {
      throw new Error("the demo claim requires at least one required case");
    }
    const claimApp = claimRequiredResults[0].caseDocument.app;
    if (
      claimRequiredResults.some(
        (result) => !canonicalJsonEqual(result.caseDocument.app, claimApp)
      )
    ) {
      throw new Error("one demo claim cannot combine cases for different Apps");
    }
    const claimContext = {
      evidenceProfile: "runtime-demo",
      app: structuredClone(claimApp),
      target: structuredClone(targetIdentity),
      verificationDependencies: {
        schemaValidator: schemaValidationIdentity,
        ownerFacts: ownerFactsIdentity,
        specificationRuleIndexDigest:
          await digestOutcomeSpecificationRuleIndex(),
      },
      requiredCaseDigests: claimRequiredResults.map(
        (result) => result.caseEntry.digest
      ),
    };
    const gate = await evaluateOutcomeClaimGate(
      {
        claimContext,
        evidence: results.map((result) => result.claimEvidence),
      },
      {
        schemaValidation,
        targetIdentities,
        ownerFacts,
        runBindings,
      }
    );
    await auditPersistedReceiptChain({
      runBindings,
      results,
      custodyDirectory,
      ...(temporaryCustodyDirectory
        ? { tamperRoot: join(temporaryCustodyDirectory, "tamper-audit") }
        : {}),
    });
    const summary = {
      $formspecOutcomeVerificationRunSummary: "0.1",
      generatedAt: clock.now(),
      runSetRef: relative(HERE, runSetPath),
      runSetDigest: await sha256Digest(config),
      claimContext,
      claimContextDigest: await digestDemoClaimContext(claimContext),
      reports: results.map((result) => ({
        caseRef: result.caseDocument.id,
        caseDigest: result.caseEntry.digest,
        required: result.caseEntry.required,
        claimRequired: result.caseEntry.claimRequired,
        reportRef: relative(runSetDirectory, result.reportPath),
        reportDigest: result.reportDigest,
        conclusion: result.report.conclusion,
        summary: result.report.summary,
      })),
      claimGate: gate,
    };
    let summaryPath;
    if (!verifyOnly) {
      const targetToken = targetIdentity.targetIdentityDigest.slice(
        "sha256:".length
      );
      const summaryDirectory = join(
        outputDirectory,
        targetToken,
        `batch-${randomUUID()}`
      );
      await mkdir(summaryDirectory, { recursive: true });
      summaryPath = join(summaryDirectory, "outcome-run-summary.json");
      await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, {
        flag: "wx",
      });
    }

    for (const result of results) {
      console.log(
        `${result.caseDocument.id}: ${result.report.conclusion} (${result.report.summary.passed}/${result.report.summary.total})`
      );
    }
    console.log(
      `demo claim: ${
        gate.supported ? "supported" : `held (${gate.reasons.join(", ")})`
      }`
    );
    console.log(
      verifyOnly
        ? "report persistence: disabled; append-only custody verified in an isolated temporary store"
        : `summary: ${relative(REPO_ROOT, summaryPath)}`
    );
    const technicalReasons = gate.reasons.filter(
      (reason) => reason !== "HUMAN_ADEQUACY_NOT_APPROVED"
    );
    const nonPassingRequiredReports = technicallyRequiredResults.filter(
      (result) => result.report.conclusion !== "passed"
    );
    if (technicalReasons.length > 0 || nonPassingRequiredReports.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    try {
      if (temporaryCustodyDirectory) {
        await rm(temporaryCustodyDirectory, {
          recursive: true,
          force: false,
        });
      }
    } finally {
      domWindow.close();
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack ?? error.message : String(error)
  );
  process.exitCode = 1;
});
