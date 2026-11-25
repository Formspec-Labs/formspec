/** @filedesc Execute a single conformance case across FormEngine and the WASM evaluator. */
import path from 'node:path';
import { canonicalJsonBytes } from '@formspec-org/integrity-canonical';
import { FormEngine, createResponse, evaluateDefinition, evaluateFiled } from '../dist/index.js';
import { isJsonRecord as isPlainObject } from '../dist/json-values.js';
import {
  againstExpected,
  betweenLegs,
  compareFelValues,
  dataDiff,
  inventions,
  isDefinitionRefusal,
  outcome,
  same,
  show,
} from './assert-observation.mjs';
import { clone, readJson } from './load-suite.mjs';

export const DEFAULT_NOW = '2026-11-17T12:00:00Z';
export const PROCESSING_KINDS = new Set(['ENGINE_PROCESSING', 'VALIDATION_REPORT', 'RESPONSE_VALIDATION']);

function resolveCasePath(root, relPath) {
  return path.resolve(root, relPath);
}

function loadDefinition(caseDoc, root, options) {
  if (options?.definitionOverride !== undefined) {
    return clone(options.definitionOverride);
  }
  return readJson(resolveCasePath(root, caseDoc.definitionPath));
}

export function loadInputPayload(caseDoc, root = '.') {
  let payload = Object.hasOwn(caseDoc, 'payloadPath')
    ? readJson(resolveCasePath(root, caseDoc.payloadPath))
    : clone(caseDoc.inputData);
  if (isPlainObject(payload) && Object.hasOwn(payload, 'data')
    && (Object.hasOwn(payload, 'definitionUrl') || Object.hasOwn(payload, 'validationResults') || Object.hasOwn(payload, 'status'))) {
    payload = payload.data;
  }
  return isPlainObject(payload) ? payload : {};
}

function registryDocuments(caseDoc, root) {
  return (caseDoc.registryPaths ?? []).map((relPath) => readJson(resolveCasePath(root, relPath)));
}

function statesFromEvaluation(raw) {
  const nonRelevant = new Set(raw.nonRelevant ?? []);
  const required = raw.required ?? {};
  const readonly = raw.readonly ?? {};
  const paths = new Set([...Object.keys(required), ...Object.keys(readonly), ...nonRelevant]);
  const states = Object.create(null);
  for (const itemPath of paths) {
    states[itemPath] = {
      relevant: !nonRelevant.has(itemPath),
      required: Boolean(required[itemPath]),
      readonly: Boolean(readonly[itemPath]),
    };
  }
  return states;
}

function statesFromEngine(engine) {
  const states = Object.create(null);
  for (const itemPath of Object.keys(engine.relevantSignals ?? {})) {
    states[itemPath] = {
      relevant: Boolean(engine.relevantSignals[itemPath]?.value),
      required: Boolean(engine.requiredSignals[itemPath]?.value),
      readonly: Boolean(engine.readonlySignals[itemPath]?.value),
    };
  }
  return states;
}

/**
 * Until FormEngine loads Response instances itself (fs-mgom), inline case-supplied instances that do
 * not declare an external `source` on a cloned Definition copy for FormEngine.
 */
function prepareEngineDefinition(definition, activeInstances) {
  if (!activeInstances || Object.keys(activeInstances).length === 0) {
    return clone(definition);
  }
  const copy = clone(definition);
  const declared = isPlainObject(copy.instances) ? copy.instances : (copy.instances = {});
  for (const [name, value] of Object.entries(activeInstances)) {
    const existing = declared[name];
    if (isPlainObject(existing) && typeof existing.source === 'string' && existing.source.length > 0) {
      // Source-backed instances are served through `instanceSourceResolver`.
      continue;
    }
    if (isPlainObject(existing)) {
      const inlined = { ...existing, data: clone(value) };
      // Inline case data for a Response instance without selection metadata so submit legs can evaluate.
      if (Object.hasOwn(inlined, 'response')) delete inlined.response;
      declared[name] = inlined;
    } else {
      declared[name] = { data: clone(value) };
    }
  }
  return copy;
}

function drainMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createDeferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function sourceDeclaredNames(definition) {
  const names = new Set();
  for (const [name, inst] of Object.entries(definition.instances ?? {})) {
    if (isPlainObject(inst) && typeof inst.source === 'string' && inst.source.length > 0) {
      names.add(name);
    }
  }
  return names;
}

/**
 * Open a FormEngine session, replaying `operations` (`setValue`, `addRow`, `removeRow`, `resume`,
 * `deliverInstance`) and tracking final delivered instances.
 */
async function openEngineSession(caseDoc, definition, payload, root, now) {
  const registryEntries = registryDocuments(caseDoc, root).flatMap((doc) => doc.entries ?? []);
  const sourceNames = sourceDeclaredNames(definition);
  const operations = caseDoc.operations ?? [];
  const activeInstances = isPlainObject(caseDoc.instances) ? clone(caseDoc.instances) : {};

  function createSession(initMode, initData, remainingOps, savedExplanations) {
    const futureDeliveries = new Set(
      remainingOps
        .filter((step) => step.op === 'deliverInstance' && sourceNames.has(step.name) && !Object.hasOwn(activeInstances, step.name))
        .map((step) => step.name),
    );
    const pendingDeliveries = new Map(
      [...futureDeliveries].map((name) => [name, createDeferred()]),
    );
    const instanceSourceResolver = (request) => {
      const { instanceName } = request;
      if (pendingDeliveries.has(instanceName)) {
        return pendingDeliveries.get(instanceName).promise;
      }
      if (Object.hasOwn(activeInstances, instanceName)) {
        return { status: 'loaded', value: clone(activeInstances[instanceName]) };
      }
      return { status: 'unavailable', reason: 'Suite fixture source unavailable' };
    };
    const engineDef = prepareEngineDefinition(definition, activeInstances);
    const baseOptions = {
      registryEntries,
      responseSubject: caseDoc.subject,
      runtimeContext: { now },
      instanceSourceResolver,
    };
    let engine;
    if (initMode === 'draftSnapshot') {
      engine = new FormEngine(engineDef, { ...baseOptions, draftSnapshot: initData, savedExplanations });
    } else if (initMode === 'new') {
      engine = new FormEngine(engineDef, { ...baseOptions, responseData: clone(initData) });
    } else {
      engine = new FormEngine(engineDef, { ...baseOptions, savedResponseData: clone(initData) });
    }
    return { engine, pendingDeliveries };
  }

  let { engine, pendingDeliveries } = createSession(caseDoc.origin, payload, operations, undefined);
  if (caseDoc.skipScreener && typeof engine.skipScreener === 'function') {
    engine.skipScreener();
  }
  if (pendingDeliveries.size === 0) {
    await engine.waitForInstanceSources();
  } else {
    await drainMicrotasks();
  }

  try {
    for (let i = 0; i < operations.length; i += 1) {
      const step = operations[i];
      if (step.op === 'setValue') {
        engine.setValue(step.path, clone(step.value));
      } else if (step.op === 'addRow') {
        engine.addRepeatInstance(step.path);
      } else if (step.op === 'removeRow') {
        engine.removeRepeatInstance(step.path, step.index);
      } else if (step.op === 'deliverInstance') {
        activeInstances[step.name] = clone(step.value);
        const deferred = pendingDeliveries.get(step.name);
        if (deferred) {
          pendingDeliveries.delete(step.name);
          deferred.resolve({ status: 'loaded', value: clone(step.value) });
          if (pendingDeliveries.size === 0) {
            await engine.waitForInstanceSources();
          } else {
            await drainMicrotasks();
          }
        } else {
          engine.setInstanceValue(step.name, undefined, clone(step.value));
        }
      } else if (step.op === 'resume') {
        const snapshot = engine.getDraftSnapshot();
        const explanations = engine.getExplanationEntries();
        engine.dispose();
        const resumed = createSession('draftSnapshot', snapshot, operations.slice(i + 1), explanations);
        engine = resumed.engine;
        pendingDeliveries = resumed.pendingDeliveries;
        if (pendingDeliveries.size === 0) {
          await engine.waitForInstanceSources();
        } else {
          await drainMicrotasks();
        }
      } else {
        throw new Error(`Unsupported operation: ${step.op}`);
      }
    }
  } catch (error) {
    for (const deferred of pendingDeliveries.values()) {
      deferred.resolve({ status: 'unavailable', reason: 'Session aborted' });
    }
    engine.dispose?.();
    throw error;
  }

  return { engine, activeInstances };
}

function engineOutcome(engine, profile) {
  const report = engine.getValidationReport({ profile });
  const response = engine.getResponse({ profile });
  return { ...outcome(report.results, response.data, undefined, statesFromEngine(engine)), response };
}

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

async function runProcessingCase(caseDoc, root, options, legs) {
  const now = caseDoc.now ?? DEFAULT_NOW;
  const definition = loadDefinition(caseDoc, root, options);
  const documents = registryDocuments(caseDoc, root);
  const payload = loadInputPayload(caseDoc, root);
  const expected = caseDoc.kind === 'RESPONSE_VALIDATION'
    ? { ...caseDoc.expected.report, ...(caseDoc.compareResponseData ? { data: caseDoc.expected.response.data } : {}) }
    : caseDoc.expected;
  const submit = caseDoc.mode === 'submit';
  const compareDraftData = !expected.results?.some(isDefinitionRefusal);
  const inventionProblems = [];
  const subjectContext = caseDoc.subject
    ? { subjectType: caseDoc.subject.type ?? null, subjectKeys: caseDoc.subject.keys }
    : {};

  const { engine, activeInstances } = await openEngineSession(caseDoc, definition, payload, root, now);
  const instanceContext = Object.keys(activeInstances).length > 0 ? { instances: clone(activeInstances) } : {};

  // The session loads registry and subject inputs. The server legs still omit those inputs
  // (fs-20e3 and fs-hrx7) so known parity discrepancies remain visible.
  const evalOptions = (server) => (server
    ? { nowIso: now, ...instanceContext }
    : { nowIso: now, registryDocuments: documents, ...subjectContext, ...instanceContext });

  const evaluate = (label, data, trigger, { server = false } = {}) => {
    const context = { ...evalOptions(server), trigger };
    const raw = evaluateDefinition(clone(definition), clone(data), context);
    for (const p of inventions(definition, data, raw)) inventionProblems.push(`${label}: ${p}`);
    return {
      ...outcome(raw.validations, raw.data, raw.undeclaredDataPaths, statesFromEvaluation(raw)),
      diagnostics: raw.diagnostics,
    };
  };

  const settle = (data, { server = true } = {}) => {
    const raw = evaluateFiled(clone(definition), clone(data), evalOptions(server));
    const verdict = {
      ...outcome(raw.validations, raw.data, raw.undeclaredDataPaths, statesFromEvaluation(raw)),
      diagnostics: raw.diagnostics,
    };
    const again = evaluate(server ? 'S(fixpoint)' : 'P(fixpoint)', verdict.data, 'submit', { server });
    return { verdict, problems: [...againstExpected(verdict, expected), ...betweenLegs('fixpoint', again, verdict)] };
  };

  const checkSubmitLegs = (data) => {
    const server = settle(data);
    legs.set('S', server.problems);
    if (!caseDoc.subject) return server.verdict;
    const session = settle(data, { server: false });
    legs.set('P', session.problems);
    return session.verdict;
  };

  const roundTrip = (data) => dataDiff(evaluate('P(round trip)', data, 'continuous').data, data)
    .map((d) => `round trip of expected.data ${d}`);

  const engineLive = () => {
    const live = engineOutcome(engine, 'live');
    if ('diagnostics' in expected) {
      live.diagnostics = engine.getDiagnosticsSnapshot().evaluationDiagnostics;
    }
    return live;
  };

  let filedData;
  try {
    // Refused subject: preserve the browser's on-demand refusal + getResponseSnapshot throw check (fs-ug1c/fs-aght)
    // while keeping server legs without subject inputs (fs-hrx7).
    const refusal = expected.results?.find(({ path: p }) => p.startsWith('#subject'));
    if (refusal && caseDoc.subject) {
      const refusalProblems = [];
      if (caseDoc.expectedCandidate !== undefined) {
        refusalProblems.push('a refused subject cannot produce a filing');
      }
      const expectedError = `Response subject refused: ${refusal.path}: ${refusal.message}`;
      let threwExpected = false;
      try {
        engine.getResponseSnapshot({ profile: 'on-demand' });
        refusalProblems.push(`expected getResponseSnapshot to throw "${expectedError}"`);
      } catch (error) {
        if (error?.message === expectedError) threwExpected = true;
        else refusalProblems.push(`getResponseSnapshot threw "${error?.message}", expected "${expectedError}"`);
      }
      if (threwExpected) {
        const demand = outcome(engine.getValidationReport({ profile: 'on-demand' }).results, {}, undefined, statesFromEngine(engine));
        refusalProblems.push(...againstExpected(demand, expected).map((p) => `on-demand FormEngine subject refusal: ${p}`));
      }
      if (refusalProblems.length > 0) {
        legs.set('F', refusalProblems);
      }
      checkSubmitLegs(payload);
      legs.set('noInvention', inventionProblems);
      return { filedData };
    }

    if (caseDoc.operations) {
      const liveSession = engineLive();
      const liveFromFiled = evaluate('P(FormEngine live data)', liveSession.data, 'continuous');
      const liveProblems = betweenLegs('FormEngine live vs P', liveSession, liveFromFiled);
      const filedOutcome = engineOutcome(engine, submit ? 'on-submit' : 'live');
      filedData = filedOutcome.data;
      const recheckTarget = 'data' in expected ? expected.data : filedData;
      if (submit) {
        checkSubmitLegs(recheckTarget);
        legs.set('F', liveProblems);
        legs.set('F_submit', againstExpected(filedOutcome, expected));
      } else {
        const pProblems = againstExpected(evaluate('P(expected.data)', recheckTarget, 'continuous'), expected);
        if ('data' in expected) pProblems.push(...roundTrip(expected.data));
        legs.set('P', pProblems);
        legs.set('F', [...againstExpected(liveSession, expected), ...liveProblems]);
      }
      legs.set('FR', againstExpected(evaluate('FR', filedData, submit ? 'submit' : 'continuous', { server: true }), expected));
    } else {
      const sessionInput = caseDoc.origin === 'new'
        ? createResponse(definition, payload, { nowIso: now, ...subjectContext, ...instanceContext }).data
        : payload;
      const live = evaluate('P(continuous)', sessionInput, 'continuous');
      if (!submit) {
        legs.set('P', [...againstExpected(live, expected), ...('data' in expected ? roundTrip(expected.data) : [])]);
      }
      const engineResult = engineLive();
      const liveProblems = betweenLegs('FormEngine live vs P', engineResult, live, { data: compareDraftData });
      if (!submit && 'diagnostics' in expected) {
        liveProblems.push(...againstExpected(engineResult, { diagnostics: expected.diagnostics }));
      }
      if (!compareDraftData) {
        liveProblems.push(...dataDiff(engine.getDraftSnapshot().data, payload).map((p) => `retained draft data ${p}`));
      }
      legs.set('F', liveProblems);
      if (submit) {
        const inSession = evaluate('P(submit)', sessionInput, 'submit');
        const reference = checkSubmitLegs(inSession.data);
        const session = engineOutcome(engine, 'on-submit');
        filedData = session.data;
        const fSubmit = betweenLegs(caseDoc.subject ? 'FormEngine submit vs P' : 'FormEngine submit vs S',
          session, reference, { data: compareDraftData });
        if (caseDoc.kind === 'RESPONSE_VALIDATION') {
          const filedResults = outcome(session.response.validationResults ?? [], session.data);
          fSubmit.push(...againstExpected(filedResults, { results: caseDoc.expected.response.validationResults ?? [] })
            .map((p) => `Response.validationResults ${p}`));
        }
        legs.set('F_submit', fSubmit);
        const filed = evaluate('FR', session.data, 'submit', { server: true });
        legs.set('FR', betweenLegs(`recheck of FormEngine submit data vs ${caseDoc.subject ? 'P' : 'S'}`, filed, reference));
      } else {
        filedData = engineResult.data;
      }
    }

    if (caseDoc.expectedCandidate) {
      const candidate = engine.getResponse({ profile: 'on-submit' });
      const sameCandidate = bytesEqual(
        canonicalJsonBytes(candidate),
        canonicalJsonBytes(caseDoc.expectedCandidate),
      );
      if (!sameCandidate) {
        const targetLeg = legs.get('F_submit') ?? [];
        targetLeg.push('complete filed Response differs from the fixture');
        legs.set('F_submit', targetLeg);
      }
    }
  } finally {
    engine.dispose?.();
  }
  legs.set('noInvention', inventionProblems);
  return { filedData };
}

async function runFelCase(caseDoc, root, options, legs) {
  const now = caseDoc.now ?? DEFAULT_NOW;
  let value;
  if (caseDoc.definitionPath || options?.definitionOverride !== undefined) {
    const definition = loadDefinition(caseDoc, root, options);
    const { engine } = await openEngineSession(caseDoc, definition, clone(caseDoc.inputData), root, now);
    try {
      value = engine.compileExpression(caseDoc.expression, caseDoc.site)();
    } finally {
      engine.dispose?.();
    }
  } else {
    const fields = Array.isArray(caseDoc.fields) ? caseDoc.fields : [];
    const fieldDefs = fields.length > 0 ? fields : [{ key: 'dummy', dataType: 'integer', value: 0 }];
    const definition = {
      $formspec: '1.0',
      url: `https://example.org/forms/shared-suite/${caseDoc.id}`,
      version: '1.0.0',
      status: 'active',
      title: 'Shared Suite FEL',
      items: fieldDefs.map((f) => ({ key: f.key, type: 'field', dataType: f.dataType || 'string', label: f.key })),
    };
    const engine = new FormEngine(definition, { runtimeContext: { now } });
    try {
      for (const f of fields) engine.setValue(f.key, f.value);
      value = engine.compileExpression(caseDoc.expression, '')();
    } finally {
      engine.dispose?.();
    }
  }
  legs.set('value', compareFelValues(caseDoc.comparator, value, caseDoc.expected.value)
    ? [] : [`value ${show(value)}, expected ${show(caseDoc.expected.value)} (${caseDoc.comparator})`]);
}

async function runItemTextCase(caseDoc, root, options, legs) {
  const now = caseDoc.now ?? DEFAULT_NOW;
  const definition = loadDefinition(caseDoc, root, options);
  const activeInstances = isPlainObject(caseDoc.instances) ? clone(caseDoc.instances) : {};
  const engineDef = prepareEngineDefinition(definition, activeInstances);
  const engine = new FormEngine(engineDef, {
    runtimeContext: { now },
    savedResponseData: loadInputPayload(caseDoc, root),
    responseSubject: caseDoc.subject,
    instanceSourceResolver: (req) => (Object.hasOwn(activeInstances, req.instanceName)
      ? { status: 'loaded', value: clone(activeInstances[req.instanceName]) }
      : { status: 'unavailable', reason: 'Suite fixture source unavailable' }),
  });
  try {
    await engine.waitForInstanceSources();
    if (caseDoc.localePath) {
      const locale = readJson(resolveCasePath(root, caseDoc.localePath));
      engine.loadLocale(locale);
      engine.setLocale(locale.locale);
    }
    const readers = {
      label: (p) => engine.getItemLabelSignal(p)?.value,
      hint: (p) => engine.getItemHintSignal(p)?.value,
      description: (p) => engine.getItemDescriptionSignal(p)?.value,
    };
    const contextKey = { label: 'labels', hint: 'hints', description: 'descriptions' };
    const actual = {};
    for (const [itemPath, wanted] of Object.entries(caseDoc.expected)) {
      const resolved = {};
      for (const [property, read] of Object.entries(readers)) {
        const value = read(itemPath);
        if (value !== null && value !== undefined) resolved[property] = value;
        const contexts = wanted[contextKey[property]];
        if (!contexts) continue;
        resolved[contextKey[property]] = {};
        for (const context of Object.keys(contexts)) {
          engine.setLabelContext(context);
          resolved[contextKey[property]][context] = read(itemPath);
        }
        engine.setLabelContext(null);
      }
      actual[itemPath] = resolved;
    }
    legs.set('text', same(actual, caseDoc.expected) ? [] : [`text ${show(actual)}, expected ${show(caseDoc.expected)}`]);
  } finally {
    engine.dispose?.();
  }
}

/**
 * Run one conformance case and return `{ legs: Map<string, string[]>, filedData }`.
 * Supply `options.definitionOverride` to evaluate an in-memory Definition without disk I/O.
 */
export async function runCaseDetailed(caseDoc, root = '.', options = {}) {
  const legs = new Map();
  let filedData;
  if (caseDoc.kind === 'FEL_EVALUATION') {
    await runFelCase(caseDoc, root, options, legs);
  } else if (caseDoc.kind === 'ITEM_TEXT') {
    await runItemTextCase(caseDoc, root, options, legs);
  } else if (PROCESSING_KINDS.has(caseDoc.kind)) {
    ({ filedData } = await runProcessingCase(caseDoc, root, options, legs));
  } else {
    throw new Error(`Unsupported case kind: ${caseDoc.kind}`);
  }
  return { legs, filedData };
}

/** Run one conformance case and return its `Map<leg, problems[]>`. */
export async function runCase(caseDoc, root = '.', options = {}) {
  const { legs } = await runCaseDetailed(caseDoc, root, options);
  return legs;
}
