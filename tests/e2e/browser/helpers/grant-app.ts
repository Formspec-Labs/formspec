/** @filedesc E2E helpers for loading and mounting the grant-application example form. */
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
const GRANT_DIR = path.join(ROOT, 'examples/grant-application');
const REGISTRIES_DIR = path.join(ROOT, 'registries');

export function loadGrantArtifacts() {
  return {
    definition: JSON.parse(fs.readFileSync(path.join(GRANT_DIR, 'definition.json'), 'utf8')),
    screener: JSON.parse(fs.readFileSync(path.join(GRANT_DIR, 'screener.json'), 'utf8')),
    component: JSON.parse(fs.readFileSync(path.join(GRANT_DIR, 'component.json'), 'utf8')),
    theme: JSON.parse(fs.readFileSync(path.join(GRANT_DIR, 'theme.json'), 'utf8')),
    registry: JSON.parse(fs.readFileSync(path.join(REGISTRIES_DIR, 'formspec-common.registry.json'), 'utf8')),
  };
}

export async function mountGrantApplication(page: Page): Promise<void> {
  const { definition, component, theme, registry } = loadGrantArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, comp, thm, reg }) => {
    const el: any = document.querySelector('formspec-render');
    el.registryDocuments = reg;
    el.definition        = def;
    el.skipScreener();   // Skip screener so tests go directly to the main form
    el.componentDocument = comp;
    el.themeDocument     = thm;
  }, { def: definition, comp: component, thm: theme, reg: registry });
  await page.waitForTimeout(200);
}

/** Read the engine's structureVersion signal value. */
export async function structureVersion(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().structureVersion.value;
  });
}

/** Programmatically add a repeat instance via engine. Returns new count. */
export async function addRepeatInstance(page: Page, itemName: string): Promise<number> {
  return page.evaluate((name) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().addRepeatInstance(name);
  }, itemName);
}

/** Get the engine's raw instance data for a named instance. */
export async function getInstanceData(page: Page, instanceName: string): Promise<any> {
  return page.evaluate((name) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().instanceData?.[name];
  }, instanceName);
}

/** Set a value on a writable instance via engine. */
export async function setInstanceValue(page: Page, name: string, path: string | undefined, value: any): Promise<void> {
  await page.evaluate(({ n, p, v }) => {
    const el: any = document.querySelector('formspec-render');
    el.getEngine().setInstanceValue(n, p, v);
  }, { n: name, p: path, v: value });
}

/** Get the engine's instanceVersion signal value. */
export async function instanceVersion(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().instanceVersion.value;
  });
}
