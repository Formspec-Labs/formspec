/**
 * Static guard for the fixed Surface preview host.
 *
 * Product identifiers are derived from the preview artifact rather than copied
 * into this script. The guard scans only executable host sources; artifacts
 * and documentation are expected to contain authored product data.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import {
  AUDITED_HOST_RUNTIME_FILES,
  DEMO_ROOT as demoDirectory,
  computeReviewedInputDigest,
} from "./evidence-digest.mjs";

const artifactPath = resolve(demoDirectory, "../artifacts/preview-set.json");
const previewSet = JSON.parse(await readFile(artifactPath, "utf8"));
const runnerPath = resolve(demoDirectory, "../run-outcome-cases.mjs");
const outcomeRunSetPath = resolve(
  demoDirectory,
  "../artifacts/outcome-run-set.json"
);
const outcomeRunSet = JSON.parse(await readFile(outcomeRunSetPath, "utf8"));
const productionSourceDirectories = [
  "packages/formspec-app-graph/src",
  "packages/formspec-engine/src",
  "packages/formspec-layout/src",
  "packages/formspec-outcome-verification/src",
  "packages/formspec-react/src",
  "packages/formspec-surface/src",
  "packages/formspec-surface-react/src",
];
const failures = [];
const fail = (file, rule, match) => {
  failures.push(`${file}: ${rule}${match ? ` (${match})` : ""}`);
};

if (
  "custodyDirectory" in outcomeRunSet ||
  "supportedStepKinds" in outcomeRunSet ||
  "supportedObservationKinds" in outcomeRunSet
) {
  fail(
    "../artifacts/outcome-run-set.json",
    "caller run data must not choose custody or claim executable capability"
  );
}
if (
  !Array.isArray(outcomeRunSet.admittedStepKinds) ||
  outcomeRunSet.admittedStepKinds.length === 0
) {
  fail(
    "../artifacts/outcome-run-set.json",
    "must declare a non-empty caller admission subset"
  );
}
const outcomeCases = Array.isArray(outcomeRunSet.cases)
  ? outcomeRunSet.cases
  : [];
if (
  outcomeCases.length === 0 ||
  outcomeCases.some((entry) => entry?.required !== true) ||
  !outcomeCases.some((entry) => entry?.claimRequired === true) ||
  !outcomeCases.some((entry) => entry?.claimRequired === false)
) {
  fail(
    "../artifacts/outcome-run-set.json",
    "must retain every case as a technical requirement and separate claim membership"
  );
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    })
  );
  return nested.flat();
}

const auditedRuntimeSet = new Set(AUDITED_HOST_RUNTIME_FILES);
const discoveredSourceFiles = (await sourceFiles(resolve(demoDirectory, "src")))
  .map((path) => relative(demoDirectory, path).replaceAll("\\", "/"))
  .sort();
for (const file of discoveredSourceFiles) {
  if (!auditedRuntimeSet.has(file)) {
    fail(file, "runtime source is outside the closed audited host allowlist");
  }
}
for (const file of AUDITED_HOST_RUNTIME_FILES.filter((path) =>
  path.startsWith("src/")
)) {
  if (!discoveredSourceFiles.includes(file)) {
    fail(file, "audited host source is missing");
  }
}

const runtimeSources = new Map(
  await Promise.all(
    AUDITED_HOST_RUNTIME_FILES.map(async (file) => [
      file,
      await readFile(resolve(demoDirectory, file), "utf8"),
    ])
  )
);

const productionSourcePaths = (
  await Promise.all(
    productionSourceDirectories.map((directory) =>
      sourceFiles(resolve(demoDirectory, "../../..", directory))
    )
  )
)
  .flat()
  .filter((path) => /\.[cm]?[jt]sx?$/u.test(path));
const runnerSourceEntry = [
  relative(demoDirectory, runnerPath).replaceAll("\\", "/"),
  await readFile(runnerPath, "utf8"),
];
const productionSources = new Map(
  await Promise.all(
    productionSourcePaths.map(async (path) => [
      relative(resolve(demoDirectory, "../../.."), path).replaceAll("\\", "/"),
      await readFile(path, "utf8"),
    ])
  )
);
const hostAndRunnerSources = new Map([...runtimeSources, runnerSourceEntry]);

const sourceText = [...runtimeSources.entries()]
  .map(([file, source]) => `\n/* ${file} */\n${source}`)
  .join("");

const indexHtml = runtimeSources.get("index.html");
const htmlScriptTags = [
  ...indexHtml.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gu),
].map((match) => match[0]);
const htmlScriptSources = [
  ...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gu),
].map((match) => match[1]);
if (
  htmlScriptTags.length !== 1 ||
  htmlScriptSources.length !== 1 ||
  htmlScriptSources[0] !== "/src/main.tsx"
) {
  fail(
    "index.html",
    "must boot only the audited /src/main.tsx entry",
    htmlScriptSources.join(", ") || "none"
  );
}
if (
  /<style\b/iu.test(indexHtml) ||
  /\son[a-z]+\s*=/iu.test(indexHtml) ||
  /<(?:audio|embed|iframe|img|object|picture|source|video)\b/iu.test(indexHtml)
) {
  fail(
    "index.html",
    "inline style or event-handler runtime code is outside the audited module graph"
  );
}
for (const match of indexHtml.matchAll(/<link\b[^>]*>/gu)) {
  const tag = match[0];
  const rel = /\brel=["']([^"']+)["']/iu.exec(tag)?.[1];
  const href = /\bhref=["']([^"']+)["']/iu.exec(tag)?.[1];
  if (rel === "icon" && href === "data:,") continue;
  fail(
    "index.html",
    "linked runtime resource is outside the closed audited host allowlist",
    tag
  );
}

const inputReferences = [
  ...sourceText.matchAll(/(?:\.\.\/)+(?:artifacts|evidence)\/[^'"\s)]+/gu),
].map((match) => match[0]);
if (
  inputReferences.length !== 1 ||
  !/^(?:\.\.\/)+artifacts\/preview-set\.json\?raw$/u.test(
    inputReferences[0] ?? ""
  )
) {
  fail(
    "runtime sources",
    "must load preview-set.json as the only artifact or evidence input",
    inputReferences.join(", ") || "none"
  );
}

const importSpecifierPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/gu;
for (const [file, source] of runtimeSources) {
  if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
  for (const match of source.matchAll(importSpecifierPattern)) {
    const specifier = match[1];
    if (!specifier?.startsWith(".")) continue;
    if (specifier === "../../artifacts/preview-set.json?raw") continue;
    const target = relative(
      demoDirectory,
      resolve(dirname(resolve(demoDirectory, file)), specifier.split("?")[0])
    ).replaceAll("\\", "/");
    if (!auditedRuntimeSet.has(target)) {
      fail(
        file,
        "relative runtime import leaves the closed audited host allowlist",
        specifier
      );
    }
  }
  for (const match of source.matchAll(/\bimport\s*\(([^)]*)\)/gu)) {
    if (!/^\s*['"][^'"]+['"]\s*$/u.test(match[1] ?? "")) {
      fail(
        file,
        "computed dynamic import is not allowed in the fixed host",
        match[0]
      );
    }
  }
}

const forbiddenSourceRules = [
  {
    label: "custom Surface chrome or copy override",
    pattern:
      /\b(?:header|footer|renderNotFound|navigationLabel|strings|surfaceLabel|tokenAliases|renderDefinitionForm)\s*=/u,
  },
  {
    label: "custom application header, footer, or navigation element",
    pattern: /<(?:header|footer|nav)\b/u,
  },
  {
    label: "Definition field filtering",
    pattern: /(?:definition|items|binds)[^\n;]{0,120}\.(?:filter|splice)\s*\(/u,
  },
  {
    label: "host route/action map naming",
    pattern:
      /\b(?:ROUTE_ACTIONS|ROUTE_MAP|ACTION_MAP|FORM_PRESENTATION_FIELDS|FORM_ACTION_BY_PRESENTATION)\b/u,
  },
];

for (const [file, source] of runtimeSources) {
  if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
  for (const rule of forbiddenSourceRules) {
    const match = rule.pattern.exec(source);
    if (match) fail(file, rule.label, match[0]);
  }
}

for (const [file, source] of runtimeSources) {
  if (!file.endsWith(".css")) continue;
  const imported = /@import\b[^;]*;?/iu.exec(source);
  if (imported) {
    fail(
      file,
      "CSS imports leave the closed audited host allowlist",
      imported[0]
    );
  }
  for (const match of source.matchAll(/\burl\(\s*(['"]?)([^)'"]+)\1\s*\)/giu)) {
    fail(
      file,
      "CSS resource leaves the closed audited host allowlist",
      match[0]
    );
  }
  const match = /(?:^|[,{]\s*)\.(?:fs-|formspec-)[a-z0-9_-]*/imu.exec(source);
  if (match) fail(file, "Surface or Formspec CSS override", match[0].trim());
}

const identifierValues = new Set();
const copyValues = new Set();
const sampleValues = new Set();
// These authored values also name stable generic Formspec concepts. Their
// spelling alone cannot distinguish product leakage from framework behavior,
// so the guard admits them and continues to reject the more specific IDs,
// references, copy, and samples around them.
const genericIdentifierCollisions = new Set([
  "/app",
  "/receipt",
  "StructuredPanel",
  "availability",
  "control",
  "document",
  "id",
  "label",
  "name",
  "organization",
  "role",
  "status",
  "submittedAt",
  "summary",
  "version",
]);

function addIdentifier(value) {
  if (
    typeof value === "string" &&
    value.length > 1 &&
    value !== "/" &&
    !genericIdentifierCollisions.has(value)
  ) {
    identifierValues.add(value);
  }
}

function addCopy(value) {
  if (typeof value === "string" && value.length >= 8) {
    copyValues.add(value);
  }
}

function addSampleValues(value) {
  if (Array.isArray(value)) {
    value.forEach(addSampleValues);
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(addSampleValues);
    return;
  }
  if (typeof value === "string" && value.length > 1) {
    sampleValues.add(value);
  }
}

function authoredCopy(value) {
  if (Array.isArray(value)) {
    value.forEach(authoredCopy);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, candidate] of Object.entries(value)) {
    if (
      ["title", "description", "label", "content", "body", "eyebrow"].includes(
        key
      )
    ) {
      addCopy(candidate);
    }
    authoredCopy(candidate);
  }
}

function definitionItemIdentifiers(items) {
  for (const item of items ?? []) {
    if (!item || typeof item !== "object") continue;
    addIdentifier(item.key);
    definitionItemIdentifiers(item.children);
  }
}

function configIdentifiers(value) {
  if (Array.isArray(value)) {
    value.forEach(configIdentifiers);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, candidate] of Object.entries(value)) {
    if (key === "id" || key === "outputName") addIdentifier(candidate);
    configIdentifiers(candidate);
  }
}

function surfaceSlotIdentifiers(slots) {
  for (const slot of slots ?? []) {
    if (!slot || typeof slot !== "object") continue;
    addIdentifier(slot.id);
    const binding = slot.binding;
    if (binding && typeof binding === "object") {
      [
        binding.definitionRef,
        binding.moduleId,
        binding.widgetName,
        binding.catalogRef,
        binding.sourceRef,
      ].forEach(addIdentifier);
      for (const dataBinding of Object.values(binding.dataBindings ?? {})) {
        if (!dataBinding || typeof dataBinding !== "object") continue;
        addIdentifier(dataBinding.catalogRef);
        addIdentifier(dataBinding.sourceRef);
      }
      configIdentifiers(binding.config);
      surfaceSlotIdentifiers(binding.slots);
    }
    surfaceSlotIdentifiers(slot.slots);
  }
}

function artifactReferences(value) {
  if (Array.isArray(value)) {
    value.forEach(artifactReferences);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, candidate] of Object.entries(value)) {
    if (
      (key === "url" ||
        key.endsWith("Ref") ||
        key === "artifactRef" ||
        key === "documentRef") &&
      typeof candidate === "string" &&
      (candidate.includes(":") || candidate.includes("/"))
    ) {
      addIdentifier(candidate);
    }
    artifactReferences(candidate);
  }
}

for (const entry of Object.values(previewSet.previews ?? {})) {
  const bundle = entry?.bundle;
  const manifest = bundle?.manifest ?? {};
  [
    manifest.id,
    manifest.name,
    ...(manifest.modules ?? []).map((module) => module.id),
  ].forEach(addIdentifier);
  [manifest.title, manifest.description].forEach(addCopy);
  Object.keys(bundle?.documents ?? {}).forEach(addIdentifier);
  artifactReferences(manifest);

  for (const document of Object.values(bundle?.documents ?? {})) {
    if (!document || typeof document !== "object") continue;
    authoredCopy(document);
    artifactReferences(document);

    if (document.$formspecSurface) {
      addIdentifier(document.id);
      for (const route of document.routes ?? []) {
        addIdentifier(route.id);
        addIdentifier(route.path);
        surfaceSlotIdentifiers(route.slots);
        for (const transition of route.transitions ?? []) {
          addIdentifier(transition.when);
        }
      }
    }
    if (document.$formspecResponseActions) {
      for (const action of document.actions ?? []) {
        addIdentifier(action.id);
        addCopy(action.label?.literal);
        for (const effect of action.effects ?? []) {
          addIdentifier(effect.eventName);
        }
      }
    }
    if (document.$formspecDataSources) {
      addIdentifier(document.id);
      for (const source of document.sources ?? []) addIdentifier(source.id);
    }
    if (document.$formspec) {
      [document.url, document.name].forEach(addIdentifier);
      definitionItemIdentifiers(document.items);
      for (const bind of document.binds ?? []) addIdentifier(bind.path);
    }
    if (document.$formspecExperience) {
      addIdentifier(document.name);
      for (const actor of document.actors ?? []) addIdentifier(actor.id);
      for (const task of document.tasks ?? []) addIdentifier(task.id);
      for (const unit of document.units ?? []) addIdentifier(unit.id);
    }
  }

  for (const profile of Object.values(entry?.scenario?.profiles ?? {})) {
    for (const source of profile?.sources ?? []) {
      if (source?.status === "loaded") addSampleValues(source.value);
    }
  }
}

function quotedForms(value) {
  const escapedSingle = value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const escapedTemplate = value.replaceAll("\\", "\\\\").replaceAll("`", "\\`");
  return [
    JSON.stringify(value),
    `'${escapedSingle}'`,
    `\`${escapedTemplate}\``,
  ];
}

function dataLeakageFindings(source, identifiers = identifierValues) {
  const findings = [];
  for (const identifier of identifiers) {
    const match = quotedForms(identifier).find((literal) =>
      source.includes(literal)
    );
    if (match) {
      findings.push(["hard-coded artifact identifier", match]);
    }
  }
  for (const copy of copyValues) {
    const quoted = quotedForms(copy).find((literal) =>
      source.includes(literal)
    );
    const jsxText =
      /\s/u.test(copy) && copy.length >= 12 && source.includes(`>${copy}<`);
    if (quoted || jsxText) {
      findings.push(["hard-coded authored product copy", quoted ?? copy]);
    }
  }
  for (const sample of sampleValues) {
    const match = quotedForms(sample).find((literal) =>
      source.includes(literal)
    );
    if (match) {
      findings.push(["hard-coded preview sample value", match]);
    }
  }
  return findings;
}

for (const [file, source] of hostAndRunnerSources) {
  for (const [rule, match] of dataLeakageFindings(source)) {
    fail(file, rule, match);
  }
}

const strongProductIdentifiers = new Set(
  [...identifierValues].filter(
    (value) =>
      /^https?:\/\/(?!formspec\.org\/)/u.test(value) ||
      /^urn:(?!formspec:(?:schema|spec))/u.test(value) ||
      /[A-Z]/u.test(value.slice(1)) ||
      (value.includes(":") && !value.startsWith("formspec:")) ||
      (value.includes("-") && value.length >= 8)
  )
);
for (const [file, source] of productionSources) {
  for (const [rule, match] of dataLeakageFindings(
    source,
    strongProductIdentifiers
  )) {
    fail(file, rule, match);
  }
}

const runnerSource = await readFile(runnerPath, "utf8");
const runnerForbiddenRules = [
  {
    label: "runner-side semantic-control registration",
    pattern:
      /\b(?:registry|[a-zA-Z0-9_$]*semantic[a-zA-Z0-9_$]*control[a-zA-Z0-9_$]*)\s*\.\s*register\s*\(/iu,
  },
  {
    label: "runner-side FormEngine construction",
    pattern: /\bnew\s+FormEngine\s*\(/u,
  },
  {
    label: "runner-side DOM content lookup",
    pattern: /\.(?:querySelector|getElementById|getByText)\s*\(/u,
  },
  {
    label:
      "rendered-output branch or skip outside the renderer observation adapter",
    pattern: /\bexpectation\s*\.\s*kind\s*===?\s*['"]rendered-output['"]/u,
  },
  {
    label: "legacy headless rendered-output refusal",
    pattern: /headless adapter cannot produce renderer-owned output evidence/iu,
  },
  {
    label: "case-authored evidence-class self-upgrade",
    pattern: /\bevidenceClass\s*:\s*expectation\s*\.\s*requiredEvidence\b/u,
  },
  {
    label: "case-derived Data Source record identity",
    pattern:
      /\brecordId\s*:[^,\n]*(?:expectation\s*\.\s*recordStepRef|findActionRuntime)/u,
  },
  {
    label: "claim-bearing use of the pure comparator",
    pattern: /\bawait\s+compareOutcomeVerification\s*\(/u,
  },
  {
    label: "case-digest-derived run or report identity",
    pattern: /(?:outcome-run|outcome-report)[^;\n]{0,160}currentCaseDigest/u,
  },
  {
    label: "caller-controlled custody authority",
    pattern: /\bconfig\s*\.\s*custodyDirectory\b/u,
  },
];

function runnerStructureFindings(source) {
  return runnerForbiddenRules.flatMap((rule) => {
    const match = rule.pattern.exec(source);
    return match ? [[rule.label, match[0]]] : [];
  });
}

for (const [rule, match] of runnerStructureFindings(runnerSource)) {
  fail("../run-outcome-cases.mjs", rule, match);
}

const runnerRequiredMarkers = [
  "SurfaceApp",
  "createSurfaceSemanticOutputRegistry",
  "createSurfaceSemanticOutputScopeResolver",
  "semanticOutputRegistry.lookup",
  "issueOutcomeLintClearance",
  "generateOutcomeVerificationReport",
  "RUNNER_SUPPORTED_STEP_KINDS",
  "RUNNER_SUPPORTED_OBSERVATION_KINDS",
  "targetIdentities",
  "runBindings",
  "createFilesystemRunBindings",
  "auditPersistedReceiptChain",
  "$formspecOutcomeCustodyPhase",
  "NORMAL_CUSTODY_DIRECTORY",
  "mkdtemp(",
  "hostRuntime",
  "process.versions.v8",
  "claimContext",
  'flag: "wx"',
];
for (const marker of runnerRequiredMarkers) {
  if (!runnerSource.includes(marker)) {
    fail(
      "../run-outcome-cases.mjs",
      "missing committed renderer evidence path",
      marker
    );
  }
}

const derivedSentinel = [...identifierValues][0];
if (
  !derivedSentinel ||
  dataLeakageFindings(
    `const productSentinel = ${JSON.stringify(derivedSentinel)};`
  ).length === 0
) {
  fail(
    "guard self-test",
    "data-only leakage scanner did not reject a derived product sentinel"
  );
}
if (
  runnerStructureFindings("semanticControlRegistry.register({});").length === 0
) {
  fail(
    "guard self-test",
    "runner structure scanner did not reject semantic registry registration"
  );
}
if (
  runnerStructureFindings(
    "const observation = { evidenceClass: expectation.requiredEvidence };"
  ).length === 0
) {
  fail(
    "guard self-test",
    "runner structure scanner did not reject case-authored evidence-class upgrade"
  );
}
if (
  runnerStructureFindings(
    "const payload = { recordId: findActionRuntime(expectation.recordStepRef) };"
  ).length === 0
) {
  fail(
    "guard self-test",
    "runner structure scanner did not reject case-derived record identity"
  );
}

const requiredRuntimeMarkers = [
  "dereferenceBundleExport",
  "validateSurfacePreviewScenario",
  "createSurfacePreviewRuntime",
  "starterWidgetModule",
  "<SurfaceApp",
  "query.get('preview')",
  "query.get('profile')",
];
for (const marker of requiredRuntimeMarkers) {
  if (!sourceText.includes(marker)) {
    fail("runtime sources", "missing generic runtime integration", marker);
  }
}

if (failures.length > 0) {
  console.error("Generic Surface host guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  const reviewedInput = await computeReviewedInputDigest();
  console.log(
    `Generic Surface host guard passed (${runtimeSources.size} audited runtime files; review input sha256:${reviewedInput.digest}).`
  );
}
