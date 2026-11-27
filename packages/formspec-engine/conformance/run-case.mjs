/** @filedesc Execute a single conformance case across FormEngine and the WASM evaluator. */
import path from 'node:path';
import { canonicalJsonBytes } from '@formspec-org/integrity-canonical';
import {
  FormEngine,
  assembleCandidate,
  createResponse,
  evaluateDefinition,
  evaluateFiled,
  responseSubjectId,
} from '../dist/index.js';
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
 * not declare an external `source` or a `resolvedInstances` delivery on a cloned Definition copy.
 */
function prepareEngineDefinition(definition, activeInstances, resolvedInstances) {
  if (!activeInstances || Object.keys(activeInstances).length === 0) {
    return clone(definition);
  }
  const copy = clone(definition);
  const declared = isPlainObject(copy.instances) ? copy.instances : (copy.instances = {});
  for (const [name, value] of Object.entries(activeInstances)) {
    if (resolvedInstances && Object.hasOwn(resolvedInstances, name)) {
      // Response instances with full deliveries are passed via `responseInstanceResolutions`.
      continue;
    }
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
    const engineDef = prepareEngineDefinition(definition, activeInstances, caseDoc.resolvedInstances);
    const baseOptions = {
      registryEntries,
      responseSubject: caseDoc.subject,
      ...(caseDoc.resolvedInstances ? { responseInstanceResolutions: clone(caseDoc.resolvedInstances) } : {}),
      ...(caseDoc.resolvedOptions ? { resolvedOptions: clone(caseDoc.resolvedOptions) } : {}),
      ...(savedExplanations ? { savedExplanations: clone(savedExplanations) } : {}),
      runtimeContext: { now },
      instanceSourceResolver,
    };
    let engine;
    if (initMode === 'draftSnapshot') {
      engine = new FormEngine(engineDef, { ...baseOptions, draftSnapshot: initData });
    } else if (initMode === 'new') {
      engine = new FormEngine(engineDef, { ...baseOptions, responseData: clone(initData) });
    } else {
      engine = new FormEngine(engineDef, { ...baseOptions, savedResponseData: clone(initData) });
    }
    return { engine, pendingDeliveries };
  }

  let { engine, pendingDeliveries } = createSession(caseDoc.origin, payload, operations, caseDoc.explanations);
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

function candidateProblems(label, actual, expected) {
  if (bytesEqual(canonicalJsonBytes(actual), canonicalJsonBytes(expected))) {
    return [];
  }
  const keys = [];
  if (isPlainObject(actual) && isPlainObject(expected)) {
    const allKeys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort();
    for (const key of allKeys) {
      const hasA = Object.hasOwn(actual, key) && actual[key] !== undefined;
      const hasE = Object.hasOwn(expected, key) && expected[key] !== undefined;
      if (hasA !== hasE || (hasA && !bytesEqual(canonicalJsonBytes(actual[key]), canonicalJsonBytes(expected[key])))) {
        keys.push(key);
      }
    }
  }
  return [keys.length > 0 ? `${label} (fields: ${keys.join(', ')})` : label];
}

function isStampedExplanation(entry) {
  return entry?.author !== undefined && entry?.author !== null
    && entry?.recorded !== undefined && entry?.recorded !== null;
}

function assembleCandidateFromEvaluation(definition, evalRaw, now, {
  subject,
  resolvedInstances,
  explanations,
  server,
}) {
  try {
    const timestamp = new Date(now).toISOString();
    const validationResults = (evalRaw.validations ?? []).map((entry) => ({
      ...clone(entry),
      $formspecValidationResult: '1.0',
    }));
    const hasErrors = validationResults.some((entry) => entry.severity === 'error');
    const status = hasErrors ? 'in-progress' : 'completed';
    const response = {
      $formspecResponse: '1.0',
      definitionUrl: definition.url ?? 'http://example.org/form',
      definitionVersion: definition.version ?? '1.0.0',
      status,
      data: clone(evalRaw.data),
      authored: timestamp,
      validationResults,
    };
    if (!server && subject) {
      const subjectCopy = clone(subject);
      if (definition.subject && !evalRaw.refused) {
        subjectCopy.id = responseSubjectId(subjectCopy.type, subjectCopy.keys);
      }
      response.subject = subjectCopy;
    }

    const hasResponseInstances = Object.values(definition.instances ?? {}).some((inst) => Boolean(inst?.response));
    const draftExplanations = !server && Array.isArray(explanations) ? explanations : [];
    const resolutions = !server && isPlainObject(resolvedInstances) ? resolvedInstances : {};

    if (status === 'completed') {
      if (hasResponseInstances || draftExplanations.length > 0) {
        let evalForAssembly = null;
        if (draftExplanations.length > 0) {
          const entries = evalRaw.candidateExplanations;
          if (!Array.isArray(entries)) {
            return { ok: false, error: 'Submit evaluation did not assemble the warning explanations' };
          }
          const saved = entries.filter(isStampedExplanation);
          if (saved.length !== entries.length) {
            return {
              ok: false,
              error: 'Save pending warning answers and load their server stamps before emitting this Response',
            };
          }
          response.explanations = clone(draftExplanations);
          evalForAssembly = { candidateExplanations: saved };
        }
        return {
          ok: true,
          value: assembleCandidate(clone(definition), response, clone(resolutions), evalForAssembly),
        };
      }
    } else if (draftExplanations.length > 0) {
      const saved = draftExplanations.filter(isStampedExplanation);
      if (saved.length > 0) response.explanations = clone(saved);
    }
    return { ok: true, value: response };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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
  const explanationsContext = Array.isArray(caseDoc.explanations) && caseDoc.explanations.length > 0
    ? { explanations: clone(caseDoc.explanations) }
    : {};
  const resolvedOptionsContext = isPlainObject(caseDoc.resolvedOptions)
    ? { resolvedOptions: clone(caseDoc.resolvedOptions) }
    : {};
  const hasSessionOnlyInputs = Boolean(
    caseDoc.subject
    || (isPlainObject(caseDoc.resolvedInstances) && Object.keys(caseDoc.resolvedInstances).length > 0)
    || (Array.isArray(caseDoc.explanations) && caseDoc.explanations.length > 0)
    || isPlainObject(caseDoc.resolvedOptions)
    || caseDoc.expectedCandidate !== undefined,
  );

  const { engine, activeInstances } = await openEngineSession(caseDoc, definition, payload, root, now);
  const sessionInstances = clone(activeInstances);
  if (isPlainObject(caseDoc.resolvedInstances)) {
    for (const [name, delivery] of Object.entries(caseDoc.resolvedInstances)) {
      if (!Object.hasOwn(sessionInstances, name)) {
        sessionInstances[name] = clone(delivery.value);
      }
    }
  }
  const serverInstanceContext = Object.keys(activeInstances).length > 0 ? { instances: clone(activeInstances) } : {};
  const sessionInstanceContext = Object.keys(sessionInstances).length > 0 ? { instances: clone(sessionInstances) } : {};

  // The session loads registry, subject, resolvedInstances, explanations, and resolvedOptions.
  // The server legs omit those inputs until Wave 2-B wires deployed server call sites so known
  // parity discrepancies remain visible in parity-ledger.json.
  const evalOptions = (server) => (server
    ? {
      nowIso: now,
      ...(options?.serverRegistries ? { registryDocuments: documents } : {}),
      ...serverInstanceContext,
    }
    : {
      nowIso: now,
      registryDocuments: documents,
      ...subjectContext,
      ...sessionInstanceContext,
      ...explanationsContext,
      ...resolvedOptionsContext,
    });

  const evaluate = (label, data, trigger, { server = false } = {}) => {
    const context = { ...evalOptions(server), trigger };
    const raw = evaluateDefinition(clone(definition), clone(data), context);
    for (const p of inventions(definition, data, raw)) inventionProblems.push(`${label}: ${p}`);
    return {
      ...outcome(raw.validations, raw.data, raw.undeclaredDataPaths, statesFromEvaluation(raw)),
      diagnostics: raw.diagnostics,
      raw,
    };
  };

  const assembleForLeg = (evalRaw, server) => assembleCandidateFromEvaluation(definition, evalRaw, now, {
    subject: caseDoc.subject,
    resolvedInstances: caseDoc.resolvedInstances,
    explanations: caseDoc.explanations,
    server,
  });

  const settle = (data, { server = true } = {}) => {
    const raw = evaluateFiled(clone(definition), clone(data), evalOptions(server));
    const verdict = {
      ...outcome(raw.validations, raw.data, raw.undeclaredDataPaths, statesFromEvaluation(raw)),
      diagnostics: raw.diagnostics,
      raw,
    };
    const again = evaluate(server ? 'S(fixpoint)' : 'P(fixpoint)', verdict.data, 'submit', { server });
    const problems = [...againstExpected(verdict, expected), ...betweenLegs('fixpoint', again, verdict)];
    let candidate = null;
    if (caseDoc.expectedCandidate) {
      candidate = assembleForLeg(raw, server);
      if (candidate.ok) {
        problems.push(...candidateProblems(
          'complete filed Response differs from the fixture',
          candidate.value,
          caseDoc.expectedCandidate,
        ));
        const fixCandidate = assembleForLeg(again.raw, server);
        if (fixCandidate.ok) {
          problems.push(...candidateProblems(
            'fixpoint complete filed Response differs from settled candidate',
            fixCandidate.value,
            candidate.value,
          ));
        } else {
          problems.push(`fixpoint candidate assembly failed: ${fixCandidate.error}`);
        }
      } else {
        problems.push(`candidate assembly failed: ${candidate.error}`);
      }
    }
    return { verdict, candidate, problems };
  };

  const checkSubmitLegs = (data) => {
    const server = settle(data, { server: true });
    legs.set('S', server.problems);
    if (!hasSessionOnlyInputs) return server;
    const session = settle(data, { server: false });
    legs.set('P', session.problems);
    return session;
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
        const reference = checkSubmitLegs(recheckTarget);
        legs.set('F', liveProblems);
        const fSubmit = againstExpected(filedOutcome, expected);
        if (caseDoc.expectedCandidate) {
          fSubmit.push(...candidateProblems(
            'complete filed Response differs from the fixture',
            filedOutcome.response,
            caseDoc.expectedCandidate,
          ));
          if (reference.candidate?.ok) {
            fSubmit.push(...candidateProblems(
              `${hasSessionOnlyInputs ? 'FormEngine submit vs P' : 'FormEngine submit vs S'} complete filed Response differs`,
              filedOutcome.response,
              reference.candidate.value,
            ));
          }
        }
        legs.set('F_submit', fSubmit);
        const frEval = evaluate('FR', filedData, 'submit', { server: true });
        const frProblems = againstExpected(frEval, expected);
        if (caseDoc.expectedCandidate && reference.candidate?.ok) {
          const frCand = assembleForLeg(frEval.raw, true);
          if (frCand.ok) {
            frProblems.push(...candidateProblems(
              `recheck of FormEngine submit data vs ${hasSessionOnlyInputs ? 'P' : 'S'} complete filed Response differs`,
              frCand.value,
              reference.candidate.value,
            ));
          } else {
            frProblems.push(`recheck of FormEngine submit data vs ${hasSessionOnlyInputs ? 'P' : 'S'} candidate assembly failed: ${frCand.error}`);
          }
        }
        legs.set('FR', frProblems);
      } else {
        const pProblems = againstExpected(evaluate('P(expected.data)', recheckTarget, 'continuous'), expected);
        if ('data' in expected) pProblems.push(...roundTrip(expected.data));
        legs.set('P', pProblems);
        legs.set('F', [...againstExpected(liveSession, expected), ...liveProblems]);
        legs.set('FR', againstExpected(evaluate('FR', filedData, 'continuous', { server: true }), expected));
      }
    } else {
      const sessionInput = caseDoc.origin === 'new'
        ? createResponse(definition, payload, { nowIso: now, ...subjectContext, ...sessionInstanceContext }).data
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
        const refLabel = hasSessionOnlyInputs ? 'P' : 'S';
        const fSubmit = betweenLegs(`FormEngine submit vs ${refLabel}`,
          session, reference.verdict, { data: compareDraftData });
        if (caseDoc.kind === 'RESPONSE_VALIDATION') {
          const filedResults = outcome(session.response.validationResults ?? [], session.data);
          fSubmit.push(...againstExpected(filedResults, { results: caseDoc.expected.response.validationResults ?? [] })
            .map((p) => `Response.validationResults ${p}`));
        }
        if (caseDoc.expectedCandidate) {
          fSubmit.push(...candidateProblems(
            'complete filed Response differs from the fixture',
            session.response,
            caseDoc.expectedCandidate,
          ));
          if (reference.candidate?.ok) {
            fSubmit.push(...candidateProblems(
              `FormEngine submit vs ${refLabel} complete filed Response differs`,
              session.response,
              reference.candidate.value,
            ));
          }
        }
        legs.set('F_submit', fSubmit);
        const filed = evaluate('FR', session.data, 'submit', { server: true });
        const frProblems = betweenLegs(`recheck of FormEngine submit data vs ${refLabel}`, filed, reference.verdict);
        if (caseDoc.expectedCandidate && reference.candidate?.ok) {
          const frCand = assembleForLeg(filed.raw, true);
          if (frCand.ok) {
            frProblems.push(...candidateProblems(
              `recheck of FormEngine submit data vs ${refLabel} complete filed Response differs`,
              frCand.value,
              reference.candidate.value,
            ));
          } else {
            frProblems.push(`recheck of FormEngine submit data vs ${refLabel} candidate assembly failed: ${frCand.error}`);
          }
        }
        legs.set('FR', frProblems);
      } else {
        filedData = engineResult.data;
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
