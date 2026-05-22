/** @filedesc Cross-runtime fuzz runner: compares form processing/validation results between TS and Python. */
import fs from 'node:fs';
import { FormEngine, initFormspecEngine } from '../../../packages/formspec-engine/dist/index.js';

function normalizeNumber(value) {
  if (Number.isNaN(value) || !Number.isFinite(value)) return String(value);
  if (Object.is(value, -0)) return 0;
  if (Number.isInteger(value)) return value;
  return Number(value.toPrecision(12));
}

function resultSortKey(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return '';
  return [
    result.path ?? '',
    result.code ?? '',
    result.severity ?? '',
    result.constraintKind ?? '',
    result.shapeId ?? '',
    result.source ?? '',
    result.sourceId ?? '',
  ].join('|');
}

function normalizeJson(value, parentKey = null) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return normalizeNumber(value);
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalizeJson(item, parentKey));
    if (parentKey === 'results' || parentKey === 'validationResults') {
      normalized.sort((a, b) => resultSortKey(a).localeCompare(resultSortKey(b)));
    }
    return normalized;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'timestamp' || key === 'authored' || key === 'kind') continue;
      out[key] = normalizeJson(value[key], key);
    }
    return out;
  }
  if (value === undefined) return null;
  return value;
}

function runProcessingCase(caseDoc) {
  const engine = new FormEngine(caseDoc.definition);
  const payload = caseDoc.payload || {};
  for (const [path, value] of Object.entries(payload)) {
    engine.setValue(path, value);
  }
  const mode = caseDoc.mode || 'submit';
  const profile = mode === 'continuous' ? 'live' : mode === 'demand' ? 'on-demand' : 'on-submit';
  const report = engine.getValidationReport({ profile });
  return normalizeJson({
    valid: report.valid,
    counts: report.counts,
    results: report.results,
  });
}

async function main() {
  await initFormspecEngine();

  const raw = fs.readFileSync(0, 'utf8');
  const payload = raw.trim().length > 0 ? JSON.parse(raw) : {};
  const cases = Array.isArray(payload.cases) ? payload.cases : [];
  const results = [];

  for (const caseDoc of cases) {
    try {
      results.push({
        id: caseDoc.id,
        ok: true,
        report: runProcessingCase(caseDoc),
      });
    } catch (error) {
      results.push({
        id: caseDoc.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write(`${JSON.stringify({ results })}\n`);
}

main().catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
