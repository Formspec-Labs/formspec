/**
 * @filedesc Regression: tenant theme tokens never reach the document root and never outlive their tree.
 *
 * **This is the runtime half of the ADR 0161 theme-authority promise.**
 *
 * ADR 0161 gives every Surface route a `routeClass`, and
 * `ROUTE_CLASS_THEME_AUTHORITY` says which classes admit tenant theming and
 * which refuse it. Until this test existed, that promise was authoring-time
 * only. `FormspecProvider` called `emitThemeTokens(themeDocument.tokens)` with
 * no target — defaulting to `document.documentElement` — and never cleaned up.
 * The surface-render-v10 spike measured the consequence in a running app:
 * 0 `--formspec-*` properties on `<html>` on a fresh load, 46 after an intake
 * route rendered once, still 46 after navigating to a `proof` route that
 * refuses tenant theming, the tenant's brand colour among them.
 *
 * A host cannot close that hole from outside. Its route boundary can be
 * structurally correct — nothing tenant-shaped crossing into a refusing route's
 * props or subtree — and be defeated anyway by a global side effect inside the
 * renderer it composes with. The host can only scrub `<html>` after the fact.
 *
 * So the guarantee has to be the renderer's, and these are its terms:
 *
 *   1. Tenant tokens land on the provider's own scope element, never `<html>`.
 *   2. They are removed when the theme they came from stops applying — on
 *      unmount, and on a theme swap — so navigation cannot carry a previous
 *      route's tenant brand into the next one.
 *
 * Two independent falsifications, one per term:
 *
 * - Restore the untargeted `emitThemeTokens(themeDocument.tokens)` call and
 *   `never writes tenant tokens to the document root` fails.
 * - Delete the cleanup return from `FormspecProvider`'s theme effect and
 *   `swapping the theme document removes the previous theme's tokens` fails.
 *
 * The unmount case cannot falsify the cleanup on its own — React removes the
 * scope element with the tree, so the properties go with it either way. That is
 * the point: scoping is what makes unmount safe, and the cleanup is what makes
 * a live theme swap safe. Both are asserted.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine } from '@formspec-org/engine';
import { FormspecProvider } from '../src/context';
import { FormspecForm } from '../src/renderer';

beforeAll(async () => {
    await initFormspecEngine();
});

const TENANT_BRAND = '#7A1F3D';
const PLATFORM_BRAND = '#27594f';

const definition = {
    $formspec: '1.0',
    url: 'urn:test:theme-scope',
    version: '1.0.0',
    title: 'Rent assistance',
    items: [
        { key: 'householdSize', type: 'field', label: 'Household size', dataType: 'integer' },
        { key: 'monthlyRent', type: 'field', label: 'Monthly rent', dataType: 'decimal' },
    ],
};

const tenantTheme = {
    $formspecTheme: '1.0',
    version: '1.0.0',
    tokens: {
        'color.primary': TENANT_BRAND,
        'color.dark.primary': '#E3A0B4',
        'spacing.md': '1.25rem',
    },
};

const platformTheme = {
    $formspecTheme: '1.0',
    version: '1.0.0',
    tokens: { 'color.primary': PLATFORM_BRAND },
};

/** Every `--formspec-*` inline custom property currently set on `<html>`. */
function documentRootFormspecProperties(): string[] {
    const style = document.documentElement.style;
    const properties: string[] = [];
    for (let i = 0; i < style.length; i++) {
        const property = style[i];
        if (property.startsWith('--formspec-')) properties.push(property);
    }
    return properties;
}

/** Every `--formspec-*` value reachable anywhere in the document, root included. */
function reachableFormspecValues(): string[] {
    const values: string[] = [];
    const collect = (element: HTMLElement) => {
        for (let i = 0; i < element.style.length; i++) {
            const property = element.style[i];
            if (property.startsWith('--formspec-')) {
                values.push(element.style.getPropertyValue(property).trim());
            }
        }
    };
    collect(document.documentElement);
    collect(document.body);
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        collect(element);
    }
    return values;
}

function mount(node: React.ReactNode): { root: ReturnType<typeof createRoot>; container: HTMLElement } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    flushSync(() => root.render(node));
    return { root, container };
}

describe('theme token scope — ADR 0161 runtime half', () => {
    it('never writes tenant tokens to the document root', () => {
        expect(documentRootFormspecProperties()).toEqual([]);

        const { root, container } = mount(
            <FormspecProvider definition={definition} themeDocument={tenantTheme}>
                <div />
            </FormspecProvider>,
        );

        expect(documentRootFormspecProperties()).toEqual([]);

        flushSync(() => root.unmount());
        container.remove();
    });

    it('scopes tenant tokens to the provider subtree', () => {
        const { root, container } = mount(
            <FormspecProvider definition={definition} themeDocument={tenantTheme}>
                <div id="inside" />
            </FormspecProvider>,
        );

        const scope = container.querySelector<HTMLElement>('.formspec-theme-scope');
        expect(scope).not.toBeNull();
        expect(scope!.style.getPropertyValue('--formspec-color-primary')).toBe(TENANT_BRAND);
        expect(container.querySelector('#inside')).not.toBeNull();

        flushSync(() => root.unmount());
        container.remove();
    });

    // The measurement the spike took, as a permanent test: render a themed
    // tree, navigate away, assert nothing tenant-shaped is still reachable.
    it('no tenant token value survives unmount', () => {
        const { root, container } = mount(
            <FormspecForm definition={definition} themeDocument={tenantTheme} />,
        );

        expect(reachableFormspecValues()).toContain(TENANT_BRAND);

        // "Navigate": tear the intake tree down the way a router would. The
        // container stays in the document so the assertion is about what the
        // renderer left behind, not about what the test removed.
        flushSync(() => root.unmount());

        expect(reachableFormspecValues().filter((value) => value === TENANT_BRAND)).toEqual([]);
        expect(documentRootFormspecProperties()).toEqual([]);

        container.remove();
    });

    // The cleanup itself, isolated: same provider instance, new theme. Without
    // the effect's cleanup the previous theme's tokens stay set on the scope
    // element and a partial theme inherits the old tenant's values.
    it('swapping the theme document removes the previous theme tokens', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);

        flushSync(() => root.render(
            <FormspecProvider definition={definition} themeDocument={tenantTheme}>
                <div />
            </FormspecProvider>,
        ));

        const scope = container.querySelector<HTMLElement>('.formspec-theme-scope')!;
        expect(scope.style.getPropertyValue('--formspec-color-primary')).toBe(TENANT_BRAND);
        expect(scope.style.getPropertyValue('--formspec-spacing-md')).toBe('1.25rem');

        flushSync(() => root.render(
            <FormspecProvider definition={definition} themeDocument={platformTheme}>
                <div />
            </FormspecProvider>,
        ));

        expect(scope.style.getPropertyValue('--formspec-color-primary')).toBe(PLATFORM_BRAND);
        expect(scope.style.getPropertyValue('--formspec-spacing-md')).toBe('');
        expect(scope.style.getPropertyValue('--formspec-color-dark-primary')).toBe('');

        flushSync(() => root.unmount());
        container.remove();
    });

    it('a proof route mounted after an intake route resolves the platform brand only', () => {
        const intake = mount(
            <FormspecForm definition={definition} themeDocument={tenantTheme} />,
        );
        expect(reachableFormspecValues()).toContain(TENANT_BRAND);

        flushSync(() => intake.root.unmount());
        intake.container.remove();

        const proof = mount(
            <FormspecForm definition={definition} themeDocument={platformTheme} />,
        );

        const values = reachableFormspecValues();
        expect(values).toContain(PLATFORM_BRAND);
        expect(values.filter((value) => value === TENANT_BRAND)).toEqual([]);

        flushSync(() => proof.root.unmount());
        proof.container.remove();
    });
});
