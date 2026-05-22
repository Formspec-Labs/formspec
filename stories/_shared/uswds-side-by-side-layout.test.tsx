// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { RealUSWDSStory } from './RealUSWDSStory';
import { USWDSSideBySideStory } from './USWDSSideBySideStory';
import { contactFormDef } from './definitions';
import {
    accordionMultiComponentDoc,
    contactFormComponentDoc,
    groupedFormComponentDoc,
    groupedFormDef,
    popoverComponentDoc,
    tabsComponentDoc,
    wizardComponentDoc,
} from '../layout/definitions';
import { repeatGroupDef } from '../behavior/definitions';

beforeAll(async () => {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
    await initFormspecEngine();
});

async function renderStory(element: React.ReactElement): Promise<HTMLDivElement> {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(element);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
}

function findShadowHost(container: HTMLDivElement): HTMLDivElement | null {
    return Array.from(container.querySelectorAll('div')).find((el) => !!(el as HTMLDivElement).shadowRoot) as HTMLDivElement | null;
}

function findShadowHosts(container: HTMLDivElement): HTMLDivElement[] {
    return Array.from(container.querySelectorAll('div')).filter((el) => !!(el as HTMLDivElement).shadowRoot) as HTMLDivElement[];
}

function collectShadowStyleText(root: ShadowRoot | ParentNode | null | undefined): string {
    if (!root) return '';
    const chunks = Array.from(root.querySelectorAll('style')).map((styleEl) => styleEl.textContent ?? '');
    for (const el of Array.from(root.querySelectorAll('*'))) {
        if (el.shadowRoot) chunks.push(collectShadowStyleText(el.shadowRoot));
    }
    return chunks.join('\n');
}

function queryShadowTree(root: ShadowRoot | ParentNode | null | undefined, selector: string): Element | null {
    if (!root) return null;
    const found = root.querySelector(selector);
    if (found) return found;
    for (const el of Array.from(root.querySelectorAll('*'))) {
        const nested = queryShadowTree(el.shadowRoot, selector);
        if (nested) return nested;
    }
    return null;
}

describe('USWDS comparison story layout', () => {
    it('renders plain real-USWDS forms in a large service-form shell instead of a comparison width override', async () => {
        const container = await renderStory(
            <RealUSWDSStory definition={contactFormDef} showSubmit={false} />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;
        const form = shadowRoot?.querySelector('form.usa-form') as HTMLFormElement | null;
        const stackedFields = shadowRoot?.querySelectorAll(
            '.real-uswds-stack.grid-row.grid-gap > .grid-col-12 > .usa-form-group',
        ) ?? [];

        expect(shadowRoot).toBeTruthy();
        expect(form).not.toBeNull();
        expect(form?.className).toBe('usa-form usa-form--large');
        expect(form?.style.maxWidth).toBe('');
        expect(stackedFields).toHaveLength(5);
        expect(shadowRoot?.querySelector('form > .grid-container')).toBeNull();
        expect(form?.classList.contains('maxw-none')).toBe(false);
    });

    it('renders display-only stories with a visible outer title and full-width stack shell', async () => {
        const displayDef = {
            $formspec: '1.0',
            title: 'Display Components',
            items: [
                { key: 'heading', type: 'display', label: 'Section Heading', presentation: { widgetHint: 'heading' } },
                { key: 'intro', type: 'display', label: 'Paragraph text', presentation: { widgetHint: 'Text' } },
                { key: 'alert', type: 'display', label: 'Canonical alert text', presentation: { widgetHint: 'Alert' } },
                { key: 'divider', type: 'display', label: '', presentation: { widgetHint: 'divider' } },
            ],
        };

        const container = await renderStory(
            <RealUSWDSStory definition={displayDef} showSubmit={false} />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;
        const form = shadowRoot?.querySelector('form.usa-form') as HTMLFormElement | null;
        const visibleTitles = Array.from(shadowRoot?.querySelectorAll('form > h2:not(.usa-sr-only)') ?? []);

        expect(shadowRoot).toBeTruthy();
        expect(form?.className).toBe('usa-form usa-form--large maxw-none');
        expect(visibleTitles).toHaveLength(1);
        expect(visibleTitles[0]?.textContent).toContain('Display Components');
        expect(shadowRoot?.querySelector('.real-uswds-stack')).not.toBeNull();
        expect(shadowRoot?.querySelector('.real-uswds-stack > .grid-col-12 > hr.width-full')).not.toBeNull();
        expect(shadowRoot?.querySelector('.usa-alert__text')?.textContent).toContain('Canonical alert text');
        expect(shadowRoot?.querySelector('.usa-prose.width-full')).toBeNull();
    });

    it('keeps the adapter pane honest by avoiding comparison-only width overrides', async () => {
        const container = await renderStory(
            <USWDSSideBySideStory definition={contactFormDef} showSubmit={false} />,
        );

        const [adapterHost] = findShadowHosts(container);
        const shadowRoot = adapterHost?.shadowRoot;
        const form = shadowRoot?.querySelector('form.usa-form') as HTMLFormElement | null;
        const styleText = collectShadowStyleText(shadowRoot);

        expect(shadowRoot).toBeTruthy();
        expect(form).not.toBeNull();
        expect(form?.className).toBe('usa-form');
        expect(styleText).not.toContain('.formspec-uswds-comparison-form');
        expect(styleText).toContain('.isolated-story-root *');
        expect(styleText).toContain('box-sizing: border-box');
    });

    it('renders real-USWDS card demos with plain cards instead of usa-card-group sizing wrappers', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={contactFormComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(shadowRoot?.querySelector('.usa-card')).not.toBeNull();
        expect(shadowRoot?.querySelector('.usa-card-group')).toBeNull();
        expect(shadowRoot?.querySelector('.usa-card__body > .grid-container')).toBeNull();
    });

    it('renders the real contact-grid story as four tablet half-width cells instead of one stacked fragment', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={contactFormComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;
        const form = shadowRoot?.querySelector('form.usa-form') as HTMLFormElement | null;
        const cells = shadowRoot?.querySelectorAll('.usa-card__body .grid-row.grid-gap > .grid-col-12.tablet\\:grid-col-6') ?? [];
        const row = shadowRoot?.querySelector('.usa-card__body .grid-row.grid-gap') as HTMLDivElement | null;

        expect(shadowRoot).toBeTruthy();
        expect(form?.className).toBe('usa-form usa-form--large maxw-none');
        expect(cells).toHaveLength(4);
        expect(row?.style.rowGap).toBe('16px');
    });

    it('renders grouped-card bodies without extra grid-container gutters in the real comparison pane', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={groupedFormDef}
                componentDocument={groupedFormComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(shadowRoot?.querySelector('form > .grid-container')).toBeNull();
        expect(shadowRoot?.querySelector('.usa-card__body > .grid-container')).toBeNull();
        expect(shadowRoot?.querySelector('.usa-card__body > .grid-row')).not.toBeNull();
        expect(shadowRoot?.querySelector('.real-uswds-stack.grid-row.grid-gap > .grid-col-12 > .usa-card')).not.toBeNull();
    });

    it('renders the real-USWDS wizard with local helper classes instead of adapter comparison classes', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={wizardComponentDoc}
                showSubmit={true}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(shadowRoot?.querySelector('.real-uswds-wizard .real-uswds-wizard__panel')).not.toBeNull();
        expect(shadowRoot?.querySelector('.real-uswds-wizard .real-uswds-wizard__nav')).not.toBeNull();
        expect(shadowRoot?.querySelector('.real-uswds-wizard .usa-card-group')).toBeNull();
        expect(shadowRoot?.querySelector('form button[type="submit"]')).toBeNull();
        expect(shadowRoot?.querySelector('.real-uswds-wizard__panel > .grid-container')).toBeNull();
    });

    it('uses local real-pane helper CSS instead of adapter integration CSS', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={wizardComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;
        const styleText = collectShadowStyleText(shadowRoot);

        expect(shadowRoot).toBeTruthy();
        expect(styleText).toContain('.real-uswds-tabs__panels');
        expect(styleText).toContain('padding-top: 1.5rem');
        expect(styleText).toContain('.real-uswds-wizard__content');
        expect(styleText).toContain('.real-uswds-stack >');
        expect(styleText).not.toContain('.formspec-uswds-comparison-form');
        expect(styleText).not.toContain('.usa-form:has(.formspec-container)');
        expect(styleText).toContain('.story-root *');
        expect(styleText).toContain('box-sizing: border-box');
    });

    it('renders real-USWDS tabs without extra grid-container gutters inside the active panel', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={tabsComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(shadowRoot?.querySelector('.real-uswds-tabs__panels [role="tabpanel"] > .grid-container')).toBeNull();
        const stack = shadowRoot?.querySelector('.real-uswds-tabs__panels .real-uswds-stack') as HTMLDivElement | null;
        expect(stack?.style.getPropertyValue('--real-uswds-stack-gap')).toBe('12px');
    });

    it('uses the same tighter tabs panel-top spacing in the adapter pane', async () => {
        const container = await renderStory(
            <USWDSSideBySideStory
                definition={contactFormDef}
                componentDocument={tabsComponentDoc}
                showSubmit={false}
            />,
        );

        const [adapterHost] = findShadowHosts(container);
        const shadowRoot = adapterHost?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(queryShadowTree(shadowRoot, '.formspec-tabs')).not.toBeNull();
        expect(queryShadowTree(shadowRoot, '.formspec-tab-panels')).not.toBeNull();
        const css = readFileSync(resolve('packages/formspec-adapters/dist/uswds-integration.css'), 'utf8');
        expect(css).toContain('.formspec-tab-panels{padding-top:1.5rem}');
    });

    it('does not nest full Page layout sections inside adapter wizard panels', async () => {
        const container = await renderStory(
            <USWDSSideBySideStory
                definition={contactFormDef}
                componentDocument={wizardComponentDoc}
                showSubmit={true}
            />,
        );

        const [adapterHost] = findShadowHosts(container);
        const shadowRoot = adapterHost?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(shadowRoot?.querySelector('.formspec-wizard .formspec-wizard-panel')).not.toBeNull();
        expect(shadowRoot?.querySelector('.formspec-wizard .formspec-wizard-panel .formspec-page')).toBeNull();
    });

    it('keeps the real-USWDS multi-open accordion on the same default-open section as the adapter story', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={accordionMultiComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;
        const expandedButtons = Array.from(shadowRoot?.querySelectorAll('.usa-accordion__button[aria-expanded="true"]') ?? []);

        expect(shadowRoot).toBeTruthy();
        expect(expandedButtons).toHaveLength(1);
        expect(expandedButtons[0]?.textContent).toContain('Personal Details');
        expect(shadowRoot?.querySelector('.usa-accordion__content > .grid-container')).toBeNull();
        expect(shadowRoot?.querySelector('.usa-accordion__content > .real-uswds-stack.grid-row.grid-gap')).not.toBeNull();
    });

    it('keeps the real-USWDS popover story closed by default like the adapter pane', async () => {
        const container = await renderStory(
            <RealUSWDSStory
                definition={contactFormDef}
                componentDocument={popoverComponentDoc}
                showSubmit={false}
            />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;

        expect(shadowRoot).toBeTruthy();
        expect(shadowRoot?.querySelector('.usa-tooltip, .usa-button--outline')).not.toBeNull();
        expect(shadowRoot?.querySelector('.usa-alert--info')).toBeNull();
        expect(shadowRoot?.querySelector('.usa-summary-box')).toBeNull();
        expect(shadowRoot?.querySelector('form > .grid-container')).toBeNull();
    });

    it('renders repeat groups as a plain repeated section list instead of an accordion', async () => {
        const container = await renderStory(
            <RealUSWDSStory definition={repeatGroupDef} showSubmit={false} />,
        );

        const host = findShadowHost(container);
        const shadowRoot = host?.shadowRoot;
        const form = shadowRoot?.querySelector('form.usa-form') as HTMLFormElement | null;
        const instances = shadowRoot?.querySelectorAll('.real-uswds-repeat__instance') ?? [];
        const removeButtons = shadowRoot?.querySelectorAll('.real-uswds-repeat .usa-button--unstyled') ?? [];

        expect(shadowRoot).toBeTruthy();
        expect(form?.className).toBe('usa-form usa-form--large maxw-none');
        expect(shadowRoot?.querySelector('.usa-accordion')).toBeNull();
        expect(instances).toHaveLength(2);
        expect(removeButtons).toHaveLength(2);
        expect(shadowRoot?.querySelector('.real-uswds-repeat__add')?.textContent).toContain('Add Team Members');
    });
});
