/** @filedesc E2E helpers for mounting and interacting with the clinical-intake example form. */
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  engineSetValue,
  engineValue,
  engineVariable,
  getResponse,
  getValidationReport,
  goToPage,
  waitForFormEngine,
} from './engine-harness';
import { waitForWasm } from './harness';

export {
  engineSetValue,
  engineValue,
  engineVariable,
  getResponse,
  getValidationReport,
  goToPage,
};

const ROOT = path.resolve(__dirname, '../../../../');
const INTAKE_DIR = path.join(ROOT, 'examples/clinical-intake');
const REGISTRIES_DIR = path.join(ROOT, 'registries');

export function loadClinicalIntakeArtifacts() {
  return {
    definition: JSON.parse(fs.readFileSync(path.join(INTAKE_DIR, 'intake.definition.json'), 'utf8')),
    screener: JSON.parse(fs.readFileSync(path.join(INTAKE_DIR, 'screener.json'), 'utf8')),
    component: JSON.parse(fs.readFileSync(path.join(INTAKE_DIR, 'intake.component.json'), 'utf8')),
    theme: JSON.parse(fs.readFileSync(path.join(INTAKE_DIR, 'intake.theme.json'), 'utf8')),
    registry: JSON.parse(fs.readFileSync(path.join(REGISTRIES_DIR, 'formspec-common.registry.json'), 'utf8')),
  };
}

/**
 * Mount the clinical intake form WITHOUT skipping the screener.
 * The screener must be completed before the main wizard appears.
 */
export async function mountClinicalIntakeWithScreener(page: Page): Promise<void> {
  const { definition, screener, component, theme, registry } = loadClinicalIntakeArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, scr, comp, thm, reg }) => {
    const el: any = document.querySelector('formspec-render');
    el.registryDocuments = reg;
    el.screenerDocument = scr;
    el.definition = def;
    el.componentDocument = comp;
    el.themeDocument = thm;
  }, { def: definition, scr: screener, comp: component, thm: theme, reg: registry });
  await waitForFormEngine(page);
}

/**
 * Mount the clinical intake form and skip the screener so tests go directly
 * to the main wizard.
 */
export async function mountClinicalIntake(page: Page): Promise<void> {
  const { definition, component, theme, registry } = loadClinicalIntakeArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, comp, thm, reg }) => {
    const el: any = document.querySelector('formspec-render');
    el.registryDocuments = reg;
    el.definition        = def;
    el.skipScreener();
    el.componentDocument = comp;
    el.themeDocument     = thm;
  }, { def: definition, comp: component, thm: theme, reg: registry });
  await waitForFormEngine(page);
}

/**
 * Complete the screener with the given chief complaint and pain level, then
 * click Continue. The standard intake route (catch-all) is triggered when
 * complaint is not 'emergency' and pain < 8.
 */
export async function completeScreener(
  page: Page,
  chiefComplaint: string,
  painLevel: number
): Promise<void> {
  await page.locator('[data-name="sChiefComplaint"] select').selectOption(chiefComplaint);
  await page.locator('[data-name="sPainLevel"] input[type="number"]').fill(String(painLevel));
  await page.locator('.formspec-screener-continue').click();
  await page.waitForTimeout(300);
}

/** Programmatically add a repeat instance via engine. Returns new count. */
export async function addRepeatInstance(page: Page, itemName: string): Promise<number> {
  return page.evaluate((name) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().addRepeatInstance(name);
  }, itemName);
}
