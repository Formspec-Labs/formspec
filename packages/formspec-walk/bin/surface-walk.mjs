/** @filedesc Derive Definition Walk targets from the routes of an exported static Surface preview. */
import { composeSurfaceApp, createThemeAuthority, createWidgetRegistry, dereferenceBundleExport, flattenRegistryEntries, formHref, matchRoute, planMatchedRoute, routeHref } from '@formspec-org/surface';
import { LocaleStore, preactReactiveRuntime } from '@formspec-org/engine';
import { targetDefinitionMatches } from '@formspec-org/types';

const attribute = (key, value) => `[${key}=${JSON.stringify(value)}]`;

/** Resolve planned labels and navigation strings with the same store as the mounted form. */
function wordingFor(definition, documents, requested, title) {
    const target = { kind: 'definition', url: definition.url };
    const store = new LocaleStore(preactReactiveRuntime, undefined, target);
    const keys = new Set();
    for (const doc of documents) {
        if (doc.target.kind !== target.kind || !targetDefinitionMatches(doc.target, definition)) continue;
        store.loadLocale(doc);
        for (const key of Object.keys(doc.strings)) keys.add(key);
    }
    const codes = requested ? [requested] : store.getAvailableLocales();
    return codes.length ? codes.map(code => {
        store.setLocale(code);
        const doc = store.getActiveDocument();
        if (!doc) throw new Error(`${title}: no Definition Locale for ${code}`);
        const strings = Object.fromEntries([...keys].flatMap(key => {
            const value = store.lookupKey(key);
            return value === null ? [] : [[key, value]];
        }));
        return { ...doc, locale: store.activeLocale.value, strings };
    }) : [undefined];
}

export function surfaceWalkTargets(exported, { url, params = {}, locale }) {
    const preview = new URL(url);
    if (!['http:', 'https:'].includes(preview.protocol) || (preview.hash && !/^#(?:\/|\?)/.test(preview.hash))) {
        throw new Error('--url must be the HTTP(S) address of a hash-mode Surface preview');
    }
    // BrowserSurfaceApp selects a preview edition from the routed query, inside the fragment.
    const queryAt = preview.hash.indexOf('?');
    const query = new URLSearchParams(queryAt < 0 ? '' : preview.hash.slice(queryAt + 1));
    query.delete('slot');
    query.delete('section');
    if (!params || typeof params !== 'object' || Array.isArray(params) || Object.values(params).some(value => typeof value !== 'string')) {
        throw new Error('--params must be a JSON object of string route parameter values');
    }
    const bundle = dereferenceBundleExport(exported);
    const app = composeSurfaceApp(bundle.surfaces, { entrySurface: bundle.entrySurface });
    const registry = flattenRegistryEntries(bundle.registries);
    const errors = [...bundle.diagnostics, ...app.diagnostics, ...registry.diagnostics].filter(d => d.severity === 'error');
    if (errors.length) throw new Error(errors.map(d => d.message).join('\n'));
    const authority = createThemeAuthority({ tenantTheme: bundle.tenantTheme });
    const widgets = createWidgetRegistry({ registryEntries: registry.entries });
    const targets = [];
    for (const handle of app.routes) {
        const routeId = `${handle.surfaceId}/${handle.routeId}`;
        const route = routeHref(handle, params);
        const pathname = route.href;
        const match = route.refusal ? undefined : matchRoute(app, pathname).match;
        const plan = planMatchedRoute({
            ...bundle, handle, app, params: { ...params, ...match?.params }, registryEntries: registry.entries, widgets,
            surfaceRef: bundle.surfaceRefs?.get(handle.surface), themeAuthority: authority,
        });
        const visit = (slot, parent, scope, topLevel) => {
            const title = `${parent}/${slot.slotId}`;
            const selector = `${scope} > ${attribute('data-slot', slot.slotId)}`;
            if (slot.slotType === 'embed-route') {
                if (slot.status !== 'ready') throw new Error(`${title}: ${slot.status} embedded route`);
                for (const child of slot.slots) visit(child, title, `${selector} > [data-embed-route]`);
                return;
            }
            if (slot.slotType !== 'definition-form') return;
            const definition = slot.definition;
            if (!definition || slot.status !== 'ready') throw new Error(`${title}: unresolved form ${slot.definitionRef}`);
            if (slot.initialData && slot.initialData.status !== 'ready') throw new Error(`${title}: unresolved initial data (${slot.initialData.reason})`);
            if (route.refusal) throw new Error(`${title}: ${route.diagnostics.map(d => d.message).join('; ') || route.refusal}`);
            if (match?.handle !== handle) throw new Error(`${title}: ${route.href} resolves to another route or no route`);
            const address = new URL(preview);
            const targetPath = topLevel ? formHref(pathname, slot.slotId) : pathname;
            const [path, slotQuery] = targetPath.split('?');
            const targetQuery = new URLSearchParams(query);
            for (const [key, value] of new URLSearchParams(slotQuery)) targetQuery.set(key, value);
            address.hash = path + (targetQuery.size ? `?${targetQuery}` : '');
            const theme = plan.grant.themeDocument;
            for (const doc of wordingFor(definition, bundle.localeDocuments ?? [], locale, title)) {
                targets.push({ title: doc ? `${title} (${doc.locale})` : title, url: address.href,
                    root: `${selector} [data-formspec-render-root]`, definition, theme, locale: doc });
            }
        };
        const scope = attribute('data-surface', handle.surfaceId) + attribute('data-route', handle.routeId);
        for (const slot of plan.slots) visit(slot, routeId, `${scope} > .fs-surface-route__slots`, true);
    }
    if (!targets.length) throw new Error('No form routes to walk in this export');
    return targets;
}

export function emitSurfaceWalk(targets, from = '@formspec-org/walk') {
    return `/** @filedesc Generated Definition Walk for the form routes of a Surface export. */
import { test } from '@playwright/test';
import { checkSurfaceForm } from ${JSON.stringify(from)};

const targets: Parameters<typeof checkSurfaceForm>[1][] = ${JSON.stringify(targets, null, 2)};
for (const target of targets) {
    test(target.title, async ({ page }) => {
        const { report } = await checkSurfaceForm(page, target);
        for (const description of report.uncovered) {
            test.info().annotations.push({ type: 'uncovered', description });
        }
    });
}
`;
}
