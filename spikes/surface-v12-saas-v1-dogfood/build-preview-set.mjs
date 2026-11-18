#!/usr/bin/env node

/** Rebuild the fixed demo input from the standalone data artifacts. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const artifacts = join(root, 'artifacts');
const fixtures = [
  { id: 'main', bundle: 'saas-v1.bundle.json', scenario: 'saas-v1.preview-scenario.json' },
  { id: 'control', bundle: 'control.bundle.json', scenario: 'control.preview-scenario.json' },
];

async function readJson(filename) {
  return JSON.parse(await readFile(join(artifacts, filename), 'utf8'));
}

async function writeJson(filename, data) {
  await writeFile(join(artifacts, filename), `${JSON.stringify(data, null, 2)}\n`);
}

function propertyEdit(json, path, key, value) {
  const object = path.reduce((node, part) => node.elements
    ? node.elements[Number(part)]
    : node.properties.find((property) => property.name.text === part).initializer,
  json.statements[0].expression);
  const index = object.properties.findIndex((property) => property.name.text === key);
  const property = object.properties[index];
  if (value !== undefined) {
    return [property.initializer.getStart(json), property.end, JSON.stringify(value)];
  }
  const next = object.properties[index + 1];
  if (next) return [property.getStart(json), next.getStart(json), ''];
  const previous = object.properties[index - 1];
  return [previous?.end ?? property.getStart(json), property.end, ''];
}

async function refreshNeedAnchors() {
  const {
    RENDERED_NEED_TRACE_CODES,
    artifactResolutionGraphInput,
    resolveBundleExportArtifacts,
    validateRenderedNeedTrace,
  } = await import('@formspec-org/app-graph');
  const { sha256Digest } = await import('@formspec-org/outcome-verification');
  const { default: ts } = await import('typescript');
  const digestChanges = new Map();

  for (const fixture of fixtures) {
    const source = await readFile(join(artifacts, fixture.bundle), 'utf8');
    const bundle = JSON.parse(source);
    const json = ts.parseJsonText(fixture.bundle, source);
    const needs = await readJson(fixture.bundle.replace('.bundle.json', '.needs.json'));
    const resolution = await resolveBundleExportArtifacts(bundle);
    if (!resolution.ok) throw new Error(`${fixture.bundle} has unresolved artifacts`);
    const graph = {
      ...artifactResolutionGraphInput(resolution),
      hostEvidence: { needsDocuments: [{ schemaId: 'https://formspec.org/schemas/needs/1.0', document: needs }] },
    };
    const redundant = validateRenderedNeedTrace(graph).filter(({ code }) => code === RENDERED_NEED_TRACE_CODES.redundant);
    const originalDigests = new Map();
    const edits = [];
    for (const { primarySource: { ref: { url }, jsonPointer } } of redundant) {
      const document = bundle.documents[url];
      if (!originalDigests.has(url)) originalDigests.set(url, await sha256Digest(document));
      const path = jsonPointer.slice(1).split('/').map((token) => token.replace(/~1/gu, '/').replace(/~0/gu, '~'));
      const node = path.reduce((value, token) => value[token], document);
      const generation = node['x-generation'];
      const anchors = generation.anchors.filter((anchor) => typeof anchor !== 'string' || !anchor.startsWith('need:'));
      if (anchors.length) generation.anchors = anchors;
      else delete generation.anchors;
      const nodePath = ['documents', url, ...path];
      if (Object.keys(generation).length === 0) {
        delete node['x-generation'];
        edits.push(propertyEdit(json, nodePath, 'x-generation'));
      } else {
        edits.push(propertyEdit(json, [...nodePath, 'x-generation'], 'anchors', generation.anchors));
      }
    }
    for (const [url, digest] of originalDigests) {
      digestChanges.set(digest, await sha256Digest(bundle.documents[url]));
    }
    if (edits.length) {
      const updated = edits.sort(([left], [right]) => right - left).reduce(
        (text, [start, end, replacement]) => text.slice(0, start) + replacement + text.slice(end), source);
      if (JSON.stringify(JSON.parse(updated)) !== JSON.stringify(bundle)) {
        throw new Error(`${fixture.bundle} edits changed unrelated data`);
      }
      await writeFile(join(artifacts, fixture.bundle), updated);
    }
    console.log(`${fixture.bundle}: removed ${redundant.length} repeated Need traces.`);
  }

  if (digestChanges.size === 0) return;
  let runSetSource = await readFile(join(artifacts, 'outcome-run-set.json'), 'utf8');
  const runSet = JSON.parse(runSetSource);
  for (const entry of runSet.cases) {
    const original = await readFile(join(artifacts, entry.path), 'utf8');
    let updated = original;
    for (const [oldDigest, newDigest] of digestChanges) {
      updated = updated.replaceAll(JSON.stringify(oldDigest), JSON.stringify(newDigest));
    }
    if (updated === original) continue;
    await writeFile(join(artifacts, entry.path), updated);
    const digest = await sha256Digest(JSON.parse(updated));
    runSetSource = runSetSource.replace(JSON.stringify(entry.digest), JSON.stringify(digest));
  }
  await writeFile(join(artifacts, 'outcome-run-set.json'), runSetSource);
}

if (process.argv.includes('--refresh-need-anchors')) await refreshNeedAnchors();

const previews = Object.fromEntries(
  await Promise.all(
    fixtures.map(async (fixture) => [
      fixture.id,
      {
        bundle: await readJson(fixture.bundle),
        scenario: await readJson(fixture.scenario),
      },
    ]),
  ),
);

await writeJson('preview-set.json', {
  $formspecSurfacePreviewSet: '0.1',
  defaultPreview: 'main',
  previews,
});

console.log(`Rebuilt preview-set.json from ${fixtures.length} data-only previews.`);
