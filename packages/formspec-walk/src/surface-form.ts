/** @filedesc Check one exported Definition on the exact form slot rendered by a Surface route. */
import type { Page } from '@playwright/test';
import type { FormDefinition, LocaleDocument, ThemeDocument } from '@formspec-org/types';
import { derivePlan } from './plan.js';
import { expectClean, walkDefinition } from './walk.js';
import { expectedPages, runAxePass } from './axe.js';

export interface SurfaceFormTarget {
    title: string;
    url: string;
    root: string;
    definition: FormDefinition;
    theme: ThemeDocument;
    locale?: LocaleDocument;
}

export async function checkSurfaceForm(page: Page, target: SurfaceFormTarget) {
    const { root, definition, theme, locale } = target;
    const report = await walkDefinition(page, derivePlan(definition, { theme, locale }), {
        url: target.url, root, expectedDefinition: { url: definition.url, version: definition.version },
        locale: locale?.locale, chrome: locale?.strings as Record<string, string> | undefined,
    });
    expectClean(report);
    const axe = await runAxePass(page, { root, documents: { definition, theme } });
    const { visited, drawn } = axe.pages;
    const walkStepsCovered = axe.pages.kind === 'workspace' ? visited >= report.steps : visited === report.steps;
    if (!walkStepsCovered || visited !== drawn || visited < expectedPages(definition, theme) ||
        axe.needsReview.some(f => f.rule === 'formspec-workspace-fallback')) {
        throw new Error(`${target.title}: the walk visited ${report.steps} steps; axe recorded ${JSON.stringify(axe.pages)}`);
    }
    if (axe.violations.length) throw new Error(`${target.title}: ${JSON.stringify(axe.violations, null, 2)}`);
    return { report, axe };
}
