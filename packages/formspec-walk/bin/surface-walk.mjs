/** @filedesc Derive Definition Walk targets from the routes of an exported static Surface preview. */
import { composeSurfaceApp, createThemeAuthority, createWidgetRegistry, dereferenceBundleExport, matchRoute, planRoute, routeHref } from '@formspec-org/surface';
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
    const errors = [...bundle.diagnostics, ...app.diagnostics].filter(d => d.severity === 'error');
    if (errors.length) throw new Error(errors.map(d => d.message).join('\n'));
    const authority = createThemeAuthority({ tenantTheme: bundle.tenantTheme });
    const widgets = createWidgetRegistry();
    const targets = [];
    const mounted = new Set();
    for (const handle of app.routes) {
        const routeId = `${handle.surfaceId}/${handle.routeId}`;
        const plan = planRoute({ ...bundle, handle, params, registryEntries: [], widgets, surfaceRef: bundle.surfaceRefs?.get(handle.surface) });
        const visit = (slot, parent, scope) => {
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
            mounted.add(slot.definitionRef);
            const route = routeHref(handle, params);
            if (route.refusal) throw new Error(`${title}: ${route.diagnostics.map(d => d.message).join('; ') || route.refusal}`);
            const address = new URL(preview);
            address.hash = route.href + (query.size ? `?${query}` : '');
            if (matchRoute(app, address.hash.slice(1).split('?')[0]).match?.handle !== handle) {
                throw new Error(`${title}: ${address.href} resolves to another route or no route`);
            }
            const theme = authority.grantFor(handle.route).themeDocument;
            for (const doc of wordingFor(definition, bundle.localeDocuments ?? [], locale, title)) {
                targets.push({ title: doc ? `${title} (${doc.locale})` : title, url: address.href,
                    root: `${selector} [data-formspec-render-root]`, definition, theme, locale: doc });
            }
        };
        const scope = attribute('data-surface', handle.surfaceId) + attribute('data-route', handle.routeId);
        for (const slot of plan.slots) visit(slot, routeId, `${scope} > .fs-surface-route__slots`);
    }
    if (!targets.length) throw new Error('No form routes to walk in this export');
    for (const url of bundle.definitions.keys()) {
        if (!mounted.has(url)) throw new Error(`${url}: exported Definition has no form route to walk`);
    }
    return targets;
}

export function emitSurfaceWalk(targets, from = '@formspec-org/walk') {
    return `/** @filedesc Generated Definition Walk for the form routes of a Surface export. */
import { test } from '@playwright/test';
import { checkSurfaceForm } from ${JSON.stringify(from)};

const targets: Parameters<typeof checkSurfaceForm>[1][] = ${JSON.stringify(targets, null, 2)};
for (const target of targets) {
    test(target.title, async ({ page }) => {
        await checkSurfaceForm(page, target);
    });
}
`;
}
