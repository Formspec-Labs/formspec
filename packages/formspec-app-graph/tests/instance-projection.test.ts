/** @filedesc AppGraph pairs response projections with every loaded upstream version. */
import { beforeAll, expect, it, vi } from 'vitest';
import { initFormspecEngine, initFormspecEngineTools, lintDocument } from '@formspec-org/engine';
import { documentLintValidator, produceBundleExportAppGraphValidationReport, validateAppGraph, type AppGraphContext, type AppGraphDocumentLinter, type ResolvedArtifactHandle } from '../src/index.js';

const upstreamUrl = 'https://example.gov/definitions/upstream';
const subject = { type: 'urn:example:filing', keys: { year: { dataType: 'integer' } } };
const selection = {
  definition: { url: upstreamUrl, compatibleVersions: '^1.0.0' },
  subject: [{ key: 'year', op: 'eq', from: { subject: 'year' } }],
  status: 'completed', cardinality: 'latest', pin: 'none',
};

function handle(artifactKind: string, slot: string, document: unknown, url?: string): ResolvedArtifactHandle {
  const version = (document as { version?: string }).version;
  return { artifactKind, slot, status: 'loaded', document, ref: { url, version } };
}

function upstream(version: string, field = 'amount') {
  return handle('definition', `upstream-${version}`, {
    $formspec: '1.0', url: upstreamUrl, title: 'Upstream', status: 'active', version, subject,
    items: [{ key: field, label: 'Amount', type: 'field', dataType: 'integer' }],
  }, upstreamUrl);
}

function consumer(name = 'prior', consumerSubject: unknown = subject) {
  return handle('definition', 'consumer', {
    $formspec: '1.0', url: 'https://example.gov/definitions/consumer', version: '1.0.0', title: 'Consumer', status: 'draft',
    subject: consumerSubject, items: [{ key: 'note', type: 'field', dataType: 'string', label: 'Note' }],
    instances: { [name]: { response: selection, schema: { amount: 'integer' } } },
  }, 'https://example.gov/definitions/consumer');
}

function graph(...handles: ResolvedArtifactHandle[]): AppGraphContext {
  return {
    manifest: handle('appManifest', 'app', {}), handles, schemaResults: [], evidenceResults: [],
  };
}

beforeAll(async () => {
  await initFormspecEngine();
  await initFormspecEngineTools();
});

it('passes exact-URL versions and the named receiving form so Rust can check its options', () => {
  const first = upstream('1.0.0');
  const second = upstream('1.1.0', 'renamed');
  const outsideRange = upstream('2.0.0', 'renamed');
  const noSubject = consumer('noSubject', null);
  const lint = vi.fn<AppGraphDocumentLinter>(() => ({ instanceProjectionDiagnostics: [] }));
  documentLintValidator(lint)(graph(
    consumer(), noSubject, first, second, outsideRange,
    { ...first, status: 'missing' }, { ...first, ref: { url: 'urn:wrong:ref' } },
    { ...first, document: { ...(first.document as object), url: 'urn:wrong:document' } },
  ));
  expect(lint.mock.calls.filter(([, context]) => 'upstreamDefinitions' in context)).toEqual([
    [{ response: selection, schema: { amount: 'integer' } }, {
      upstreamDefinitions: [first.document, second.document, outsideRange.document],
      projectionConsumer: { kind: 'instance', definition: consumer().document, name: 'prior' },
    }],
    [{ response: selection, schema: { amount: 'integer' } }, {
      upstreamDefinitions: [first.document, second.document, outsideRange.document],
      projectionConsumer: { kind: 'instance', definition: noSubject.document, name: 'noSubject' },
    }],
  ]);
});

it('reports drift on an eligible version with the Rust code, escaped pointer and version', () => {
  const diagnostics = documentLintValidator(lintDocument)(graph(
    consumer('previous/~filing'), upstream('2.0.0', 'unrelated'), upstream('1.0.0'), upstream('1.1.0', 'renamed'),
  ));
  expect(diagnostics.filter((finding) => finding.code.startsWith('INSTANCE-PROJECTION-'))).toMatchObject([{
    code: 'INSTANCE-PROJECTION-PATH-MISSING', severity: 'error', phase: 'cross-artifact', origin: 'x-formspec-lint',
    primarySource: { artifactSlot: 'consumer', jsonPointer: '/instances/previous~1~0filing/schema/amount' },
    relatedSources: [{ artifactSlot: 'upstream-1.1.0' }],
    details: { upstreamVersion: '1.1.0' },
  }]);
});

it('reports no eligible version with an explicit null version', () => {
  const findings = documentLintValidator(lintDocument)(graph(consumer(), upstream('2.0.0')));
  expect(findings).toContainEqual(expect.objectContaining({
    code: 'INSTANCE-PROJECTION-NO-ELIGIBLE-VERSION',
    primarySource: expect.objectContaining({ jsonPointer: '/instances/prior/response/definition' }),
    details: { upstreamVersion: null },
  }));
});

it('refuses to report complete graph validation when a response projection has no injected checker', () => {
  const manifest = handle('appManifest', 'app', {});
  const report = validateAppGraph({
    manifest, artifacts: { definitions: [consumer(), upstream('1.0.0')] },
    schemaValidators: () => ({ ok: true }),
  });
  expect(report.ok).toBe(false);
  expect(report.diagnostics).toContainEqual(expect.objectContaining({
    code: 'APP-GRAPH-PROJECTION-CHECK-MISSING',
    primarySource: expect.objectContaining({ artifactSlot: 'consumer', jsonPointer: '/instances/prior' }),
  }));
});

it('checks a catalog list with a route parameter and preserves its original source index', () => {
  const source = {
    kind: 'definition-response', id: 'response:report', runtime: { delivery: 'snapshot' },
    responseSelection: {
      ...selection, cardinality: 'latest-per-subject',
      subject: [{ key: 'year', op: 'eq', from: { routeParam: 'filingYear' } }],
    },
    schema: { type: 'array', items: { type: 'object', properties: { amount: { type: 'integer' } } } },
  };
  const catalog = handle('dataSources', 'catalog', { sources: [null, source] });
  const lint = vi.fn(lintDocument);
  const first = upstream('1.0.0');
  const second = upstream('1.1.0', 'renamed');
  const findings = documentLintValidator(lint)(graph(catalog, first, second));
  expect(lint).toHaveBeenCalledWith(source, {
    projectionConsumer: null, upstreamDefinitions: [first.document, second.document],
  });
  expect(findings).toMatchObject([{
    code: 'INSTANCE-PROJECTION-PATH-MISSING',
    primarySource: { artifactSlot: 'catalog', jsonPointer: '/sources/1/schema/items/properties/amount' },
    details: { upstreamVersion: '1.1.0' },
  }]);
});

it('uses the consuming Definition subject for catalog form prefill', () => {
  const catalogUrl = 'https://example.gov/catalogs/report';
  const source = { kind: 'definition-response', id: 'response:report', responseSelection: selection };
  const catalog = handle('dataSources', 'catalog', { sources: [source] }, catalogUrl);
  const form = consumer();
  const surface = handle('surface', 'surface', { routes: [{ slots: [{
    slotType: 'definition-form', binding: {
      definitionRef: form.ref?.url, initialData: { catalogRef: catalogUrl, sourceRef: source.id },
    },
  }] }] });
  const first = upstream('1.0.0');
  const lint = vi.fn(lintDocument);
  const context = graph(catalog, form, surface, first);
  context.manifest.document = { definitions: [form.ref] };
  const findings = documentLintValidator(lint)(context);
  expect(lint).toHaveBeenCalledWith(source, { projectionConsumer: { kind: 'prefill', definition: form.document, mapped: false }, upstreamDefinitions: [first.document] });
  expect(findings.filter((finding) => finding.code.startsWith('INSTANCE-PROJECTION-'))).toEqual([]);
});

it('reports each missing catalog path once per version across two forms and a widget', () => {
  const catalogUrl = 'https://example.gov/catalogs/report';
  const source = {
    kind: 'definition-response', id: 'response:report', responseSelection: selection,
    schema: { type: 'object', properties: { missing: { type: 'string' } } },
  };
  const catalog = handle('dataSources', 'catalog', { sources: [source] }, catalogUrl);
  const formAUrl = 'https://example.gov/definitions/a';
  const formBUrl = 'https://example.gov/definitions/b';
  const formA = handle('definition', 'form-a', { url: formAUrl, subject }, formAUrl);
  const formB = handle('definition', 'form-b', { url: formBUrl, subject: structuredClone(subject) }, formBUrl);
  const dataBinding = { catalogRef: catalogUrl, sourceRef: source.id };
  const surface = handle('surface', 'surface', { routes: [{ slots: [
    ...[formAUrl, formBUrl].map((definitionRef) => ({
      slotType: 'definition-form', binding: { definitionRef, initialData: dataBinding },
    })),
    { slotType: 'module-widget', binding: { dataBindings: { report: dataBinding } } },
  ] }] });
  const validate = documentLintValidator(lintDocument);
  const findMissing = (...versions: ResolvedArtifactHandle[]) => {
    const context = graph(catalog, formA, formB, surface, ...versions);
    context.manifest.document = { definitions: [formA.ref, formB.ref] };
    return validate(context).filter((finding) => finding.code === 'INSTANCE-PROJECTION-PATH-MISSING');
  };
  expect(findMissing(upstream('1.0.0'))).toMatchObject([{
    primarySource: { artifactSlot: 'catalog', jsonPointer: '/sources/0/schema/properties/missing' },
    details: { upstreamVersion: '1.0.0' },
  }]);
  expect(findMissing(upstream('1.0.0'), upstream('1.1.0')).map((finding) =>
    finding.details?.upstreamVersion)).toEqual(['1.0.0', '1.1.0']);
});

it('reports changed stored values only for the upstream version feeding the carried field', () => {
  const form = consumer('previous/~filing');
  const field = (value: string) => ({
    key: 'stage', type: 'field', label: 'Stage', dataType: 'choice',
    options: [{ value, label: 'Current stage' }],
  });
  Object.assign(form.document as object, {
    instances: { 'previous/~filing': { response: selection, schema: { stage: 'choice' } } },
    items: [{
      ...field('open'), key: 'previousStage',
      prePopulate: { instance: 'previous/~filing', path: 'stage' },
    }],
  });
  const versions = ['1.0.0', '1.1.0', '2.0.0'].map((version, index) => {
    const definition = upstream(version);
    Object.assign(definition.document as object, { items: [field(index ? 'opened' : 'open')] });
    return definition;
  });
  const report = validateAppGraph({
    manifest: handle('appManifest', 'app', { definitions: [form.ref] }),
    artifacts: { definitions: [form, ...versions] },
    schemaValidators: () => ({ ok: true }),
    crossArtifactValidators: [documentLintValidator(lintDocument)],
  });
  expect(report.ok).toBe(false);
  expect(report.diagnostics.filter(finding => finding.code.startsWith('INSTANCE-PROJECTION-'))).toMatchObject([{
    code: 'INSTANCE-PROJECTION-OPTION-VALUES-MISMATCH', severity: 'error',
    primarySource: { artifactSlot: 'consumer', jsonPointer: '/instances/previous~1~0filing/schema/stage' },
    relatedSources: [{ artifactSlot: 'upstream-1.1.0' }],
    details: { upstreamVersion: '1.1.0' },
  }]);
});

it.each([
  [upstreamUrl, '1.1.0', 'new', true],
  [upstreamUrl, '1.1.0', 'old', false],
  ['urn:example:other', '1.1.0', 'new', false],
  [upstreamUrl, '2.0.0', 'new', false],
] as const)('checks direct catalog prefill for receiving form %s@%s and upstream value %s', (url, formVersion, upstreamValue, mismatch) => {
  const catalogUrl = 'urn:example:catalog';
  const source = {
    kind: 'definition-response', id: 'response:stage',
    responseSelection: { ...selection, subject: [] },
  };
  const catalog = handle('dataSources', 'catalog', { sources: [source] }, catalogUrl);
  const form = handle('definition', 'form', { url, version: formVersion, subject, items: [{
    key: 'stage', label: 'Stage', type: 'field', dataType: 'choice', options: [{ value: 'old', label: 'Old' }],
  }] }, url);
  const surface = handle('surface', 'surface', { routes: [{ slots: [{
    slotType: 'definition-form', binding: {
      definitionRef: form.ref?.url, initialData: { catalogRef: catalogUrl, sourceRef: source.id },
    },
  }] }] });
  const version = upstream('1.0.0');
  Object.assign(version.document as object, { items: [{
    key: 'stage', label: 'Stage', type: 'field', dataType: 'choice', options: [{ value: upstreamValue, label: 'New' }],
  }] });
  const context = graph(catalog, form, surface, version);
  context.manifest.document = { definitions: [form.ref] };
  const findings = documentLintValidator(lintDocument)(context).filter(
    (finding) => finding.code === 'INSTANCE-PROJECTION-OPTION-VALUES-MISMATCH',
  );
  expect(findings).toEqual(mismatch ? [expect.objectContaining({
    code: 'INSTANCE-PROJECTION-OPTION-VALUES-MISMATCH',
    primarySource: expect.objectContaining({ artifactSlot: 'catalog', jsonPointer: '/sources/0' }),
    details: { upstreamVersion: '1.0.0' },
  })] : []);
});

it('loads the host linter only for reads, admits a valid projection and returns the Rust refusal for drift', async () => {
  const loadProjectionLinter = vi.fn(async () => lintDocument);
  const validate = (...handles: ResolvedArtifactHandle[]) => produceBundleExportAppGraphValidationReport({
    manifest: {
      $formspecBundle: '2.2', id: 'https://example.gov/app', version: '1.0.0',
      definitions: handles.map(handle => ({ url: handle.ref!.url, version: '1.0.0' })),
    },
    documents: Object.fromEntries(handles.map(handle => [handle.ref!.url!, handle.document])),
    schemaValidators: () => ({ ok: true }),
    loadProjectionLinter,
  });
  await validate(upstream('1.0.0'));
  expect(loadProjectionLinter).not.toHaveBeenCalled();
  const valid = await validate(consumer(), upstream('1.0.0'));
  expect(loadProjectionLinter).toHaveBeenCalledOnce();
  expect(valid.report.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  const broken = await validate(consumer(), upstream('1.0.0', 'renamed'));
  expect(broken.report.diagnostics.filter(d => d.code === 'INSTANCE-PROJECTION-PATH-MISSING')).toHaveLength(1);
});

it.each(['schema-errors', 'unresolved-artifacts'])('preserves the %s refusal before loading the tools', async (reason) => {
  const form = consumer();
  const source = upstream('1.0.0');
  const loadProjectionLinter = vi.fn(async () => { throw new Error('tools unavailable'); });
  const documents = { [form.ref!.url!]: form.document };
  if (reason === 'schema-errors') documents[source.ref!.url!] = source.document;
  const { report } = await produceBundleExportAppGraphValidationReport({
    manifest: {
      $formspecBundle: '2.2', id: 'https://example.gov/app', version: '1.0.0',
      definitions: [form.ref, source.ref],
    },
    documents,
    schemaValidators: ({ handle }) => ({ ok: reason !== 'schema-errors' || handle.ref?.url !== form.ref?.url }),
    loadProjectionLinter,
  });
  expect(loadProjectionLinter).not.toHaveBeenCalled();
  expect(report.phases).toContainEqual(expect.objectContaining({ phase: 'cross-artifact', status: 'skipped', reason }));
});
