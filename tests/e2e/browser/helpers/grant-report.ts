/** @filedesc E2E helpers for loading and mounting grant-report (tribal short/long) form variants. */
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  engineSetValue,
  engineValue,
  getResponse,
  getValidationReport,
  goToPage,
  waitForFormEngine,
} from './engine-harness';
import { waitForWasm } from './harness';

export { engineSetValue, engineValue, getResponse, getValidationReport, goToPage };

const ROOT = path.resolve(__dirname, '../../../../');
const REPORT_DIR = path.join(ROOT, 'examples/grant-report');

export function loadTribalShortArtifacts() {
  return {
    definition: JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'tribal-short.definition.json'), 'utf8')),
    component:  JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'tribal-short.component.json'),  'utf8')),
    theme:      JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'tribal.theme.json'),             'utf8')),
  };
}

export function loadTribalLongArtifacts() {
  return {
    definition: JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'tribal-long.definition.json'), 'utf8')),
    component:  JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'tribal-long.component.json'),  'utf8')),
    theme:      JSON.parse(fs.readFileSync(path.join(REPORT_DIR, 'tribal.theme.json'),            'utf8')),
  };
}

export async function mountTribalShort(page: Page): Promise<void> {
  const { definition, component, theme } = loadTribalShortArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, comp, thm }) => {
    const el: any = document.querySelector('formspec-render');
    el.definition        = def;
    el.componentDocument = comp;
    el.themeDocument     = thm;
  }, { def: definition, comp: component, thm: theme });
  await waitForFormEngine(page);
}

export async function mountTribalLong(page: Page): Promise<void> {
  const { definition, component, theme } = loadTribalLongArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, comp, thm }) => {
    const el: any = document.querySelector('formspec-render');
    el.definition        = def;
    el.componentDocument = comp;
    el.themeDocument     = thm;
  }, { def: definition, comp: component, thm: theme });
  await waitForFormEngine(page);
}

/** Check if a field is relevant. */
export async function isRelevant(page: Page, fieldPath: string): Promise<boolean> {
  return page.evaluate((p) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().relevantSignals[p]?.value ?? true;
  }, fieldPath);
}
