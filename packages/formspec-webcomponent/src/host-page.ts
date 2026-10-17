/** @filedesc Node-side host page builder: one self-contained HTML string (renderer, stylesheets, wasm, documents inline) for the pinned documents. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { HOST_CONFIG_ID, HOST_WASM_ID, type HostDocuments } from './host-contract.js';

export type { HostDocuments };

/** The files a page is made of, read once. */
interface HostAssets {
    bundle: string;
    layoutCss: string;
    skinCss: string;
    wasmBase64: string;
}

let cached: HostAssets | undefined;

/** Read the built bundle, the two stylesheets and the engine's `.wasm` (once per process). */
function assets(): HostAssets {
    if (cached) return cached;
    const here = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
    const wasmPath = createRequire(import.meta.url).resolve('@formspec-org/engine/wasm-runtime');
    cached = {
        bundle: here('./host/formspec-host.js'),
        layoutCss: here('./formspec-layout.css'),
        skinCss: here('./formspec-default.css'),
        wasmBase64: readFileSync(wasmPath).toString('base64'),
    };
    return cached;
}

/**
 * The page's content security policy: nothing loads from anywhere. Scripts and styles are the inline ones above;
 * `wasm-unsafe-eval` lets the engine's inline wasm start; `data:` images are the form's own (a drawn signature).
 * A Theme stylesheet URL, a Definition's remote data source or remote options are refused by the browser itself.
 */
export const HOST_CSP = "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

/** JSON safe inside a `<script>` block: `<` can never open a tag or a comment. */
function inlineJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Source safe inside a `<script>` or `<style>` block: no closing tag can appear in it. */
function inlineSource(source: string, closing: 'script' | 'style'): string {
    return source.replace(new RegExp(`</(${closing})`, 'gi'), '<\\/$1');
}

/**
 * The host page for `documents`: a complete HTML document that draws `<formspec-render>` from the pinned
 * Definition, Theme and Locales, and makes no request. The same page serves `walk serve` and the PDF
 * renderer. `<html data-formspec-host>` becomes `ready` once the form is drawn, or `error` with the
 * reason in `window.__formspecHost.error`.
 */
export function renderHostPage(documents: HostDocuments): string {
    const a = assets();
    // The page itself needs a language (WCAG 3.1.1); a form with no Locale is taken to be English.
    const lang = (documents.locale ?? 'en').replace(/[^A-Za-z0-9-]/g, '') || 'en';
    return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${HOST_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(documents.definition.title ?? 'Form').replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)}</title>
<style data-formspec-layer="layout">${inlineSource(a.layoutCss, 'style')}</style>
<style data-formspec-layer="default-skin">${inlineSource(a.skinCss, 'style')}</style>
</head>
<body>
<main id="formspec-host-root"></main>
<script type="application/json" id="${HOST_CONFIG_ID}">${inlineJson(documents)}</script>
<script type="application/octet-stream" id="${HOST_WASM_ID}">${a.wasmBase64}</script>
<script type="module">${inlineSource(a.bundle, 'script')}</script>
</body>
</html>
`;
}
