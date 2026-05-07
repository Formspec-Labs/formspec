/** @filedesc Test helper: creates a FormEngine from the grant-app-definition fixture with stubbed fetch */
import { readFileSync } from 'node:fs';
import { FormEngine } from '../../dist/index.js';

const definition = JSON.parse(
  readFileSync(new URL('../fixtures/grant-app-definition.json', import.meta.url), 'utf8')
);

// Stub fetch so instance source URLs (api.example.gov) don't hit the network,
// and suppress the expected console.error from the engine's catch handler.
const _originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (typeof url === 'string' && url.includes('example.gov')) {
    return { ok: false, status: 503, json: async () => ({}) };
  }
  return _originalFetch(url);
};
const _consoleError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].startsWith('Failed to load instance source')) return;
  _consoleError.apply(console, args);
};

export function createGrantEngine() {
  const engine = new FormEngine(JSON.parse(JSON.stringify(definition)));
  if (typeof engine.skipScreener === 'function') {
    engine.skipScreener();
  }
  return engine;
}

export function engineValue(engine, path) {
  return engine.signals[path]?.value;
}

export function engineVariable(engine, name) {
  return engine.variableSignals[`#:${name}`]?.value;
}

export function getValidationReport(engine, mode) {
  return engine.getValidationReport({ mode });
}

export function getResponse(engine) {
  return engine.getResponse();
}

export function addRepeatInstance(engine, name) {
  return engine.addRepeatInstance(name);
}

export function removeRepeatInstance(engine, name, index) {
  return engine.removeRepeatInstance(name, index);
}
