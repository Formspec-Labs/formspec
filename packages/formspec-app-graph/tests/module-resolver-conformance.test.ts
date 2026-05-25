import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type {
  ModuleResolutionRef,
  ModuleResolutionReport,
  ModuleResolutionSourcePointer,
} from '@formspec-org/types';
import {
  resolveModules,
  type ModulePayloadValidator,
  type ModuleResolverDocumentInput,
  type ModuleResolverInput,
} from '../src/index.js';

interface FixtureCase {
  id: string;
  description: string;
  inputs: ModuleResolverInput;
  expectedReport: ModuleResolutionReport;
}

const FIXTURE_DIR = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/module-resolver', import.meta.url)),
);

function fixtureCases(): FixtureCase[] {
  return readdirSync(FIXTURE_DIR)
    .filter((entry) => entry.endsWith('.case.json'))
    .sort()
    .map((entry) => JSON.parse(readFileSync(resolve(FIXTURE_DIR, entry), 'utf8')) as FixtureCase);
}

function moduleSource(ref: ModuleResolutionRef, jsonPointer: string): ModuleResolutionSourcePointer {
  return {
    artifactSlot: 'app',
    artifactKind: 'appManifest',
    source: 'memory://app',
    jsonPointer,
    module: { ...ref },
  };
}

function useSource(document: ModuleResolverDocumentInput, hasPayload: boolean): ModuleResolutionSourcePointer {
  return {
    artifactSlot: document.artifactSlot,
    artifactKind: document.artifactKind,
    source: `memory://${document.artifactKind}`,
    jsonPointer: hasPayload
      ? '/routes/0/slots/main/0/binding/config'
      : '/routes/0/slots/main/0/binding/widgetName',
  };
}

const widgetShapePropsValidator: ModulePayloadValidator = ({ payload, schema }) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false };
  }
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { ok: false };
  }
  const payloadRecord = payload as Record<string, unknown>;
  const schemaRecord = schema as {
    required?: unknown;
    properties?: Record<string, { type?: string }>;
  };
  for (const key of Array.isArray(schemaRecord.required) ? schemaRecord.required : []) {
    if (typeof key === 'string' && !(key in payloadRecord)) {
      return { ok: false, path: key };
    }
  }
  for (const [key, property] of Object.entries(schemaRecord.properties ?? {})) {
    if (key in payloadRecord && property.type === 'number' && typeof payloadRecord[key] !== 'number') {
      return { ok: false, path: key };
    }
  }
  return { ok: true };
};

function requestFor(testCase: FixtureCase): ModuleResolverInput {
  const inputs = testCase.inputs;
  const defaultModules = (inputs.support?.defaultModules ?? []).map((ref) => ({
    ...ref,
    defaulted: true,
    source: moduleSource(ref, `/modules/default/${ref.id}`),
  }));
  const support = {
    ...inputs.support,
    defaultModules,
    payloadValidators: inputs.support?.payloadSchemaValidators?.includes('widgetShape.props')
      ? { 'widgetShape.props': widgetShapePropsValidator }
      : undefined,
  };
  if (support.payloadValidators === undefined) {
    delete support.payloadValidators;
  }
  if (support.defaultModules.length === 0 && inputs.support?.defaultModules === undefined) {
    delete support.defaultModules;
  }

  return {
    ...inputs,
    source: 'memory://app',
    appModules: inputs.appModules.map((ref, index) => ({
      ...ref,
      source: moduleSource(ref, `/modules/${index}`),
    })),
    documents: (inputs.documents ?? []).map((document) => ({
      ...document,
      source: `memory://${document.artifactKind}`,
      uses: (document.uses ?? []).map((use) => ({
        ...use,
        source: useSource(document, use.payload !== undefined),
      })),
    })),
    registries: inputs.registries.map((registry, index) => ({
      ...registry,
      artifactSlot: `registries[${index}]`,
      artifactKind: 'registry',
      source: 'memory://registry',
    })),
    support: Object.keys(support).length > 0 ? support : undefined,
  };
}

describe('ModuleResolver source conformance fixtures', () => {
  for (const testCase of fixtureCases()) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      expect(resolveModules(requestFor(testCase))).toEqual(testCase.expectedReport);
    });
  }
});
