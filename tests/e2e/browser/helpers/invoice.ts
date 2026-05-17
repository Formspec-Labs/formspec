/** @filedesc E2E helpers for loading and mounting the invoice example form. */
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  engineSetValue,
  engineValue,
  getResponse,
  getValidationReport,
  waitForFormEngine,
} from './engine-harness';
import { waitForWasm } from './harness';

export { engineSetValue, engineValue, getResponse, getValidationReport };

const ROOT = path.resolve(__dirname, '../../../../');
const INVOICE_DIR = path.join(ROOT, 'examples/invoice');

export function loadInvoiceArtifacts() {
  return {
    definition: JSON.parse(fs.readFileSync(path.join(INVOICE_DIR, 'invoice.definition.json'), 'utf8')),
    component:  JSON.parse(fs.readFileSync(path.join(INVOICE_DIR, 'invoice.component.json'),  'utf8')),
    theme:      JSON.parse(fs.readFileSync(path.join(INVOICE_DIR, 'invoice.theme.json'),       'utf8')),
    registry:   [JSON.parse(fs.readFileSync(path.join(ROOT, 'registries/formspec-common.registry.json'), 'utf8'))],
  };
}

export async function mountInvoice(page: Page): Promise<void> {
  const { definition, component, theme, registry } = loadInvoiceArtifacts();
  await page.goto('/');
  await page.waitForSelector('formspec-render', { state: 'attached' });
  await waitForWasm(page);
  await page.evaluate(({ def, comp, thm, reg }) => {
    const el: any = document.querySelector('formspec-render');
    el.registryDocuments = reg;
    el.definition        = def;
    el.componentDocument = comp;
    el.themeDocument     = thm;
  }, { def: definition, comp: component, thm: theme, reg: registry });
  await waitForFormEngine(page);
}

/** Programmatically add a repeat instance via engine. Returns new count. */
export async function addRepeatInstance(page: Page, itemName: string): Promise<number> {
  return page.evaluate((name) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().addRepeatInstance(name);
  }, itemName);
}

/** Get the current repeat count for a group. */
export async function getRepeatCount(page: Page, itemName: string): Promise<number> {
  return page.evaluate((name) => {
    const el: any = document.querySelector('formspec-render');
    return el.getEngine().repeats[name]?.value ?? 0;
  }, itemName);
}
