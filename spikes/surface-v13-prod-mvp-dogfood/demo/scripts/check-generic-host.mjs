/**
 * Static guard for the fixed v13 bundle host.
 *
 * The host may implement generic browser and runtime ports. Product routes,
 * copy, ids, data, layout, and decisions must remain in the direct bundle.
 */
import { readFile, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import {
  AUDITED_HOST_RUNTIME_FILES,
  BUNDLE_PATH,
  DEMO_ROOT,
  computeReviewedInputDigest,
} from './evidence-digest.mjs';

const failures = [];
const fail = (file, rule, match) => {
  failures.push(`${file}: ${rule}${match ? ` (${match})` : ''}`);
};

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const auditedRuntimeSet = new Set(AUDITED_HOST_RUNTIME_FILES);
const discoveredSourceFiles = (await sourceFiles(resolve(DEMO_ROOT, 'src')))
  .map((path) => relative(DEMO_ROOT, path).replaceAll('\\', '/'))
  .sort();
for (const file of discoveredSourceFiles) {
  if (!auditedRuntimeSet.has(file)) {
    fail(file, 'runtime source is outside the closed audited host allowlist');
  }
}
for (const file of AUDITED_HOST_RUNTIME_FILES.filter((path) =>
  path.startsWith('src/'),
)) {
  if (!discoveredSourceFiles.includes(file)) {
    fail(file, 'audited host source is missing');
  }
}

const runtimeSources = new Map(
  await Promise.all(
    AUDITED_HOST_RUNTIME_FILES.map(async (file) => [
      file,
      await readFile(resolve(DEMO_ROOT, file), 'utf8'),
    ]),
  ),
);
const sourceText = [...runtimeSources.entries()]
  .map(([file, source]) => `\n/* ${file} */\n${source}`)
  .join('');

const indexHtml = runtimeSources.get('index.html') ?? '';
const scriptSources = [
  ...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gu),
].map((match) => match[1]);
if (scriptSources.length !== 1 || scriptSources[0] !== '/src/main.tsx') {
  fail('index.html', 'must boot only the audited /src/main.tsx entry');
}
if (
  /<style\b/iu.test(indexHtml) ||
  /\son[a-z]+\s*=/iu.test(indexHtml) ||
  /<(?:audio|embed|iframe|img|object|picture|source|video)\b/iu.test(indexHtml)
) {
  fail('index.html', 'contains unaudited inline behavior or media');
}

const inputReferences = [
  ...sourceText.matchAll(/(?:\.\.\/)+(?:artifacts|evidence)\/[^'"\s)]+/gu),
].map((match) => match[0]);
if (
  inputReferences.length !== 1 ||
  inputReferences[0] !== '../../artifacts/prod-mvp.bundle.json?raw'
) {
  fail(
    'runtime sources',
    'must import prod-mvp.bundle.json as the only artifact or evidence input',
    inputReferences.join(', ') || 'none',
  );
}

const importSpecifierPattern =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/gu;
for (const [file, source] of runtimeSources) {
  if (!/\.[cm]?[jt]sx?$/u.test(file)) continue;
  for (const match of source.matchAll(importSpecifierPattern)) {
    const specifier = match[1];
    if (!specifier?.startsWith('.')) continue;
    if (specifier === '../../artifacts/prod-mvp.bundle.json?raw') continue;
    const target = relative(
      DEMO_ROOT,
      resolve(dirname(resolve(DEMO_ROOT, file)), specifier.split('?')[0]),
    ).replaceAll('\\', '/');
    if (!auditedRuntimeSet.has(target)) {
      fail(file, 'relative runtime import leaves the audited host', specifier);
    }
  }
  for (const match of source.matchAll(/\bimport\s*\(([^)]*)\)/gu)) {
    if (!/^\s*['"][^'"]+['"]\s*$/u.test(match[1] ?? '')) {
      fail(file, 'computed dynamic import is not allowed', match[0]);
    }
  }
}

const forbiddenSourceRules = [
  {
    label: 'preview/scenario runtime',
    pattern:
      /\b(?:createSurfacePreviewRuntime|validateSurfacePreviewScenario|SurfacePreviewScenario|SurfacePreviewRuntime|loadPreviewSelection)\b|preview-set\.json|query\.get\(['"](?:preview|profile)['"]\)/u,
  },
  {
    label: 'custom Surface chrome or copy override',
    pattern:
      /\b(?:header|footer|renderNotFound|navigationLabel|strings|surfaceLabel|tokenAliases)\s*=/u,
  },
  {
    label: 'host-authored Definition form renderer',
    pattern: /\bFormspecForm\b|<form\b/u,
  },
  {
    label: 'custom application header, footer, or navigation element',
    pattern: /<(?:header|footer|nav)\b/u,
  },
  {
    label: 'host route, product, field, or action map',
    pattern:
      /\b(?:ROUTE_MAP|ROUTE_ACTIONS|PRODUCT_MAP|ACTION_MAP|FIELD_MAP|FORM_PRESENTATION_FIELDS|FORM_ACTION_BY_PRESENTATION)\b/u,
  },
  {
    label: 'hard-coded runtime URL',
    pattern: /https?:\/\/(?!127\.0\.0\.1:(?:8080|18081)\b)/u,
  },
  {
    label: 'known v13 scope value in executable host code',
    pattern:
      /\b(?:tenant_test|workspace_test|environment_test|cell_test)\b/u,
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
  if (!file.endsWith('.css')) continue;
  const imported = /@import\b[^;]*;?/iu.exec(source);
  if (imported) fail(file, 'CSS import leaves the fixed host', imported[0]);
  for (const match of source.matchAll(/\burl\(\s*(['"]?)([^)'"]+)\1\s*\)/giu)) {
    fail(file, 'CSS resource leaves the fixed host', match[0]);
  }
  const override = /(?:^|[,{]\s*)\.(?:fs-|formspec-)[a-z0-9_-]*/imu.exec(source);
  if (override) fail(file, 'Surface or Formspec CSS override', override[0].trim());
}

const requiredRuntimeMarkers = [
  'prod-mvp.bundle.json?raw',
  'dereferenceBundleExport',
  'composeSurfaceApp',
  'routeHref',
  'routeParamExamples',
  'param.example',
  'entryRouteParams',
  'starterWidgetModule',
  '<SurfaceApp',
  'VITE_FORMSPEC_ROUTE_PARAMS_JSON',
  'VITE_FORMSPEC_SERVER_URL',
  'VITE_FORMSPEC_SERVER_HEADERS_JSON',
  "'x-formspec-runtime'",
  "adapter: 'http-json'",
  'pathTemplate',
  'request.context.params',
  'isHostLocalDraft',
  "source.kind === 'definition-response'",
  "source.runtime.delivery === 'draft'",
  'renderDefaultDefinitionForm',
  'renderBundleDefinitionForm',
  'createPreviewDefinitionResponseStore',
  'createSemanticControlRegistry',
  'createSurfaceSemanticControlScopeResolver',
  'semanticArtifactIdentities',
  'sha256Digest',
  'invokeResponseActionAsync',
  'resolveServiceRequest',
  'planServiceRequest',
  'extractServiceRequestOutputs',
  'definitionActionInvoker',
  'input.route.params',
  'from.params',
  'key={model.sessionGeneration}',
  'useState<HostActionSession>',
  'useState(() => crypto.randomUUID())',
  'const [semanticControlRegistry] = useState(',
  'resolveSemanticControlScope={resolveSemanticControlScope}',
  'request.descriptor.catalogRef',
  'request.descriptor.sourceRef',
];
for (const marker of requiredRuntimeMarkers) {
  if (!sourceText.includes(marker)) {
    fail('runtime sources', 'missing generic bundle/runtime integration', marker);
  }
}

const appSource = runtimeSources.get('src/App.tsx') ?? '';
const definitionRendererStart = appSource.indexOf(
  'function renderBundleDefinitionFormFor(',
);
const definitionRendererEnd = appSource.indexOf(
  '\nfunction transitionExecutorFor(',
  definitionRendererStart,
);
const definitionRendererSource =
  definitionRendererStart >= 0 && definitionRendererEnd > definitionRendererStart
    ? appSource.slice(definitionRendererStart, definitionRendererEnd)
    : '';
if (!definitionRendererSource.includes('input.route.params')) {
  fail(
    'src/App.tsx',
    'Definition action runtime must use the current matched route params',
  );
}
if (definitionRendererSource.includes('model.routeParams')) {
  fail(
    'src/App.tsx',
    'Definition action runtime must not use bundle example or query params',
  );
}
if (
  !appSource.includes(
    '<SessionBoundApp key={model.sessionGeneration} model={model} />',
  ) ||
  !appSource.includes('const [actionSession] = useState<HostActionSession>(')
) {
  fail(
    'src/App.tsx',
    'private action session must persist until the host-model generation changes',
  );
}
if (appSource.includes('actionSession = useMemo')) {
  fail(
    'src/App.tsx',
    'private action session must not be recreated by ordinary prop identity changes',
  );
}

const artifactPairingStart = appSource.indexOf('interface ArtifactEntry');
const artifactPairingEnd = appSource.indexOf(
  '\nconst sourceBundle',
  artifactPairingStart,
);
const artifactPairingSource =
  artifactPairingStart >= 0 && artifactPairingEnd > artifactPairingStart
    ? appSource.slice(artifactPairingStart, artifactPairingEnd)
    : '';
for (const required of [
  'sha256Digest(document)',
  'bundle.definitions.entries()',
  'source.documents[ref.url]',
  'responseActions.has(document as unknown as ResponseActionsDocument)',
  'definitionArtifacts.size !== definitionEntries.length',
  'responseActionsArtifacts.size !== responseActionEntries.length',
]) {
  if (!artifactPairingSource.includes(required)) {
    fail(
      'src/App.tsx',
      'semantic control artifacts must use exact loaded objects and canonical digests',
      required,
    );
  }
}

const semanticScopeStart = appSource.indexOf(
  'const [semanticSessionId] = useState(() => crypto.randomUUID());',
);
const semanticScopeEnd = appSource.indexOf(
  '\n  const definitionResponseStore',
  semanticScopeStart,
);
const semanticScopeSource =
  semanticScopeStart >= 0 && semanticScopeEnd > semanticScopeStart
    ? appSource.slice(semanticScopeStart, semanticScopeEnd)
    : '';
for (const required of [
  'const [semanticControlRegistry] = useState(',
  '() => createSemanticControlRegistry()',
  'definitionArtifacts: model.definitionArtifacts',
  'responseActionsArtifacts: model.responseActionsArtifacts',
  'hostRenderInstanceId(semanticSessionId, request)',
  'hostResponseId(semanticSessionId, request)',
  'responseRevision: 0',
]) {
  if (!semanticScopeSource.includes(required)) {
    fail(
      'src/App.tsx',
      'Definition render and Response identity must be paired for one host session',
      required,
    );
  }
}
if (
  semanticScopeSource.includes('model.routeParams') ||
  semanticScopeSource.includes('model.initialPath')
) {
  fail(
    'src/App.tsx',
    'semantic Response identity must not depend on product route values',
  );
}
const privateSessionValueUses = [...appSource.matchAll(/\bsession\.values\b/gu)];
if (privateSessionValueUses.length !== 2) {
  fail(
    'src/App.tsx',
    'private action session values may only enter service planning and accept admitted outputs',
    `${privateSessionValueUses.length} uses`,
  );
}

const routeParamReaderStart = appSource.indexOf('function readRouteParams(');
const routeParamReaderEnd = appSource.indexOf(
  '\nfunction readRuntimeConfig(',
  routeParamReaderStart,
);
const routeParamReaderSource =
  routeParamReaderStart >= 0 && routeParamReaderEnd > routeParamReaderStart
    ? appSource.slice(routeParamReaderStart, routeParamReaderEnd)
    : '';
if (
  routeParamReaderSource.includes('routeParamExamples') ||
  !routeParamReaderSource.includes('VITE_FORMSPEC_ROUTE_PARAMS_JSON') ||
  !routeParamReaderSource.includes("key.startsWith('routeParam.')")
) {
  fail(
    'src/App.tsx',
    'runtime route params must contain only explicit environment or query values',
  );
}
if (
  !appSource.includes('...routeParamExamples(bundle),\n    ...routeParams,') ||
  !appSource.includes('routeHref(app.entry, entryRouteParams)')
) {
  fail(
    'src/App.tsx',
    'bundle route examples may seed only the initial entry address',
  );
}

const transitionExecutorStart = appSource.indexOf(
  'function transitionExecutorFor(',
);
const transitionExecutorEnd = appSource.indexOf(
  '\nexport function App(',
  transitionExecutorStart,
);
const transitionExecutorSource =
  transitionExecutorStart >= 0 && transitionExecutorEnd > transitionExecutorStart
    ? appSource.slice(transitionExecutorStart, transitionExecutorEnd)
    : '';
if (
  !transitionExecutorSource.includes('params: from.params') ||
  !transitionExecutorSource.includes('\n      from.params,') ||
  transitionExecutorSource.includes('model.routeParams')
) {
  fail(
    'src/App.tsx',
    'transition actions must execute against the current matched route params',
  );
}

let bundle;
try {
  const raw = await readFile(BUNDLE_PATH, 'utf8');
  bundle = JSON.parse(raw);
  if (
    !bundle ||
    typeof bundle !== 'object' ||
    Array.isArray(bundle) ||
    !bundle.manifest ||
    typeof bundle.manifest !== 'object' ||
    Array.isArray(bundle.manifest) ||
    !bundle.documents ||
    typeof bundle.documents !== 'object' ||
    Array.isArray(bundle.documents)
  ) {
    fail(
      '../artifacts/prod-mvp.bundle.json',
      'must be a BundleExport with object-valued manifest and documents',
    );
  }
} catch (error) {
  fail(
    '../artifacts/prod-mvp.bundle.json',
    'direct MCP bundle input is missing or invalid JSON',
    error instanceof Error ? error.message : String(error),
  );
}

function quotedForms(value) {
  const single = value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  const template = value.replaceAll('\\', '\\\\').replaceAll('`', '\\`');
  return [JSON.stringify(value), `'${single}'`, `\`${template}\``];
}

const authoredValues = new Set();
const authoredKeys = new Set([
  'artifactRef',
  'body',
  'catalogRef',
  'content',
  'description',
  'eventName',
  'id',
  'label',
  'literal',
  'path',
  'sourceRef',
  'title',
  'url',
]);
function collectAuthoredValues(value, key = '') {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectAuthoredValues(entry, key));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [childKey, child] of Object.entries(value)) {
    if (
      typeof child === 'string' &&
      authoredKeys.has(childKey) &&
      child.length >= 8 &&
      child !== '../../artifacts/prod-mvp.bundle.json?raw'
    ) {
      authoredValues.add(child);
    }
    collectAuthoredValues(child, childKey);
  }
}
if (bundle) collectAuthoredValues(bundle);

if (bundle?.manifest && bundle?.documents) {
  const dataSourceRefs = bundle.manifest.dataSources ?? [];
  if (!Array.isArray(dataSourceRefs)) {
    fail(
      '../artifacts/prod-mvp.bundle.json',
      'manifest dataSources must be an array',
    );
  }
  for (const ref of Array.isArray(dataSourceRefs) ? dataSourceRefs : []) {
    const catalog = bundle.documents[ref?.url];
    if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
      fail(
        '../artifacts/prod-mvp.bundle.json',
        'manifested Data Sources catalog is absent or not an object',
        String(ref?.url ?? '<missing ref>'),
      );
      continue;
    }
    if (!Array.isArray(catalog.sources)) {
      fail(
        '../artifacts/prod-mvp.bundle.json',
        'Data Sources catalog sources must be an array',
        String(ref?.url ?? '<missing ref>'),
      );
      continue;
    }
    for (const source of catalog.sources) {
      const runtime = source?.['x-formspec-runtime'];
      const hostLocalDraft =
        source?.kind === 'definition-response' &&
        source?.runtime?.delivery === 'draft' &&
        runtime === undefined;
      const embedded =
        runtime?.adapter === 'embedded-json' &&
        Object.prototype.hasOwnProperty.call(runtime, 'value');
      const http =
        runtime?.adapter === 'http-json' &&
        runtime?.request?.method === 'GET' &&
        typeof runtime?.request?.pathTemplate === 'string' &&
        runtime.request.pathTemplate.startsWith('/') &&
        !runtime.request.pathTemplate.startsWith('//');
      if (!hostLocalDraft && !embedded && !http) {
        fail(
          '../artifacts/prod-mvp.bundle.json',
          'Data Source lacks a supported x-formspec-runtime adapter',
          `${String(ref?.url)}#${String(source?.id ?? '<missing source id>')}`,
        );
      }
    }
  }
}

for (const [file, source] of runtimeSources) {
  for (const value of authoredValues) {
    const quoted = quotedForms(value).find((candidate) => source.includes(candidate));
    const jsx = /\s/u.test(value) && source.includes(`>${value}<`);
    if (quoted || jsx) {
      fail(file, 'hard-coded authored bundle value', quoted ?? value);
    }
  }
}

const leakageSentinel = [...authoredValues][0];
if (
  bundle &&
  (!leakageSentinel ||
    !quotedForms(leakageSentinel).some((value) =>
      `const leaked = ${JSON.stringify(leakageSentinel)};`.includes(value),
    ))
) {
  fail('guard self-test', 'bundle-value leakage check did not reject its sentinel');
}

if (failures.length > 0) {
  console.error('Generic v13 bundle host guard failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  const reviewedInput = await computeReviewedInputDigest();
  console.log(
    `Generic v13 bundle host guard passed (${runtimeSources.size} audited runtime files; review input sha256:${reviewedInput.digest}).`,
  );
}
