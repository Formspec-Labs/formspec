/** @filedesc Host entry: builds <formspec-render> from pinned Definition, Theme and Locale documents with no network and no sibling assets. */
import { initFormspecEngine } from '@formspec-org/engine/init-formspec-engine';
import { registerDefaultComponents } from './components';
import { FormspecRender } from './element';
import { HOST_CONFIG_ID, HOST_STATE_ATTRIBUTE, HOST_WASM_ID, type HostDocuments } from './host-contract';

export { HOST_CONFIG_ID, HOST_STATE_ATTRIBUTE, HOST_WASM_ID, type HostDocuments };

/** What the page supplies because it has no network: the engine's runtime `.wasm` bytes. */
export interface HostRuntime {
    wasmBytes: BufferSource;
}

declare global {
    interface Window {
        /** The mounted renderer, or the failure, for whoever drives the page. */
        __formspecHost?: { element?: FormspecRender; error?: string };
    }
}

/** Wait until the renderer has drawn at least one field, or give up after `timeoutMs`. */
function drawn(element: FormspecRender, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const found = () => element.querySelector('[data-name]') !== null;
        if (found()) { resolve(); return; }
        const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`form not drawn within ${timeoutMs} ms`)); }, timeoutMs);
        const observer = new MutationObserver(() => {
            if (!found()) return;
            clearTimeout(timer);
            observer.disconnect();
            resolve();
        });
        observer.observe(element, { childList: true, subtree: true });
    });
}

/**
 * Mount `<formspec-render>` in `container` from `documents` and resolve once it has drawn.
 *
 * Self-contained: the engine is started from `runtime.wasmBytes`, so no request is made. The element
 * links its stylesheets only when the page lacks them; the page builder inlines both.
 */
export async function mountHost(
    documents: HostDocuments,
    runtime: HostRuntime,
    container: HTMLElement = document.body,
    timeoutMs = 20_000,
): Promise<FormspecRender> {
    await initFormspecEngine({ wasmBytes: runtime.wasmBytes });
    registerDefaultComponents();
    if (!customElements.get('formspec-render')) customElements.define('formspec-render', FormspecRender);

    const element = document.createElement('formspec-render') as FormspecRender;
    container.appendChild(element);
    if (documents.locales?.length) element.localeDocuments = documents.locales;
    if (documents.locale) element.locale = documents.locale;
    if (documents.theme) element.themeDocument = documents.theme;
    if (documents.initialData) element.initialData = documents.initialData;
    element.definition = documents.definition;
    await drawn(element, timeoutMs);
    return element;
}

/** Decode standard base64 into bytes. */
function fromBase64(text: string): Uint8Array<ArrayBuffer> {
    const binary = atob(text.trim());
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/** Read the page's inline config and `.wasm`, mount, and report on `<html>` and `window.__formspecHost`. */
export async function bootHost(root: Document = document): Promise<void> {
    const host: NonNullable<Window['__formspecHost']> = (window.__formspecHost = {});
    try {
        const config = JSON.parse(root.getElementById(HOST_CONFIG_ID)!.textContent!) as HostDocuments;
        const wasmBytes = fromBase64(root.getElementById(HOST_WASM_ID)!.textContent!);
        host.element = await mountHost(config, { wasmBytes }, root.getElementById('formspec-host-root') ?? root.body);
        root.documentElement.setAttribute(HOST_STATE_ATTRIBUTE, 'ready');
    } catch (error) {
        host.error = error instanceof Error ? error.message : String(error);
        root.documentElement.setAttribute(HOST_STATE_ATTRIBUTE, 'error');
    }
}
