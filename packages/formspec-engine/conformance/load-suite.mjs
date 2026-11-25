/** @filedesc Schema-validated loader for conformance case files, suite documents, and directories. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseJsonExact } from '@formspec-org/integrity-canonical';
import { isJsonRecord as isPlainObject } from '../dist/json-values.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_NAME = 'real-examples.manifest.json';

/** Canonical Response schema graph required to compile `expectedCandidate` in `conformance-suite.schema.json`. */
const CANONICAL_SCHEMAS = [
  'common.schema.json',
  'issuer.schema.json',
  'validation-result.schema.json',
  'verification-receipt.schema.json',
  'definition.schema.json',
  'response.schema.json',
];

let cachedValidators = null;

function resolveSchemaDir() {
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'schemas'),
    path.resolve(__dirname, '..', 'schemas'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'conformance-suite.schema.json'))) {
      return dir;
    }
  }
  throw new Error('Could not locate conformance-suite.schema.json in canonical schema directories');
}

function getValidators() {
  if (cachedValidators) return cachedValidators;
  const schemaDir = resolveSchemaDir();
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  for (const name of CANONICAL_SCHEMAS) {
    ajv.addSchema(JSON.parse(fs.readFileSync(path.join(schemaDir, name), 'utf8')));
  }
  const suiteSchema = JSON.parse(fs.readFileSync(path.join(schemaDir, 'conformance-suite.schema.json'), 'utf8'));
  const validateDoc = ajv.compile(suiteSchema);
  const validateCase = ajv.compile({
    $schema: suiteSchema.$schema,
    $ref: `${suiteSchema.$id}#/$defs/case`,
  });
  cachedValidators = { validateDoc, validateCase };
  return cachedValidators;
}

/** Read a JSON file preserving exact decimal numbers (`JSON.rawJSON`). */
export function readJson(filePath) {
  return parseJsonExact(fs.readFileSync(filePath, 'utf8'));
}

/** Deep-clone a JSON value preserving exact decimal tokens (`JSON.rawJSON`). */
export function clone(value) {
  return value === undefined ? undefined : parseJsonExact(JSON.stringify(value));
}

/** Convert a `parseJsonExact` tree into standard JSON values so Ajv inspects numeric leaves as numbers. */
function toValidationJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatAjvErrors(errors) {
  return (errors ?? [])
    .map((err) => `${err.instancePath || '/'} ${err.message}${err.params ? ` (${JSON.stringify(err.params)})` : ''}`)
    .join('; ');
}

function mergeCaseWithDefaults(defaults, rawCase) {
  if (!defaults) return clone(rawCase);
  const merged = { ...clone(defaults), ...clone(rawCase) };
  if (isPlainObject(defaults.instances) && isPlainObject(rawCase.instances)) {
    merged.instances = { ...clone(defaults.instances), ...clone(rawCase.instances) };
  }
  if (Object.hasOwn(rawCase, 'inputData') && !Object.hasOwn(rawCase, 'payloadPath')) {
    delete merged.payloadPath;
  }
  if (Object.hasOwn(rawCase, 'payloadPath') && !Object.hasOwn(rawCase, 'inputData')) {
    delete merged.inputData;
  }
  return merged;
}

export function expandSuiteDocument(doc, sourceLabel = '<inline>') {
  const { validateDoc, validateCase } = getValidators();
  const plainDoc = toValidationJson(doc);
  if (!validateDoc(plainDoc)) {
    throw new Error(`Invalid conformance document ${sourceLabel}: ${formatAjvErrors(validateDoc.errors)}`);
  }
  if (isPlainObject(doc) && Array.isArray(doc.cases)) {
    return doc.cases.map((rawCase, index) => {
      const expanded = mergeCaseWithDefaults(doc.defaults, rawCase);
      const label = `${sourceLabel}#${expanded.id ?? index}`;
      if (!validateCase(toValidationJson(expanded))) {
        throw new Error(`Invalid expanded conformance case ${label}: ${formatAjvErrors(validateCase.errors)}`);
      }
      return { file: label, doc: expanded };
    });
  }
  return [{ file: sourceLabel, doc: clone(doc) }];
}

/**
 * Load and validate a conformance suite from a directory, a single case or suite file,
 * an in-memory case/suite object, or an array of case objects.
 */
export function loadSuite(suiteInput, root = '.') {
  const entries = [];
  if (typeof suiteInput === 'string') {
    const resolved = path.resolve(root, suiteInput);
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      const files = fs
        .readdirSync(resolved)
        .filter((name) => name.endsWith('.json') && name !== MANIFEST_NAME)
        .sort();
      for (const name of files) {
        const doc = readJson(path.join(resolved, name));
        entries.push(...expandSuiteDocument(doc, name));
      }
    } else {
      const doc = readJson(resolved);
      entries.push(...expandSuiteDocument(doc, path.basename(resolved)));
    }
  } else if (Array.isArray(suiteInput)) {
    for (const [index, doc] of suiteInput.entries()) {
      entries.push(...expandSuiteDocument(doc, `<inline[${index}]>`));
    }
  } else if (isPlainObject(suiteInput)) {
    entries.push(...expandSuiteDocument(suiteInput, '<inline>'));
  } else {
    throw new Error('Suite must be a file path, directory path, suite/case object, or array of cases');
  }

  const seen = new Set();
  for (const { file, doc } of entries) {
    if (seen.has(doc.id)) {
      throw new Error(`Duplicate conformance case id: ${doc.id} (${file})`);
    }
    seen.add(doc.id);
  }
  return entries;
}
