/** @filedesc `walk serve`: an HTTP service that loads the webcomponent host entry for given documents in a browser and answers with the accessibility report. */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from '@playwright/test';
import { renderHostPage, type HostDocuments } from '@formspec-org/webcomponent/host';
import { checkAccessibility, expectedPages, CHECK_VERSION, DEFAULT_TIMEOUT_MS, MANUAL_REVIEW, WCAG_TAGS, type CheckFailure, type RendererCheckReport } from './axe.js';

/** Largest request body accepted: a Definition with its Theme and Locales. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

export interface AccessibilityServerOptions {
    /** Hard cap on one check, browser start to report; defaults to 60 s. */
    timeoutMs?: number;
    /** How many checks may run at once; the rest wait. Defaults to 2. */
    maxConcurrent?: number;
    /** Start a browser. Defaults to Playwright's Chromium; tests inject a failing one. */
    launch?: (timeoutMs: number) => Promise<Browser>;
}

/** A failed report for a check that never got as far as axe. */
function failedReport(failure: CheckFailure, totalMs: number): RendererCheckReport {
    return {
        checkVersion: CHECK_VERSION, axeVersion: null, adapter: null, pages: null, tags: WCAG_TAGS, status: 'failed', failure,
        states: [], violations: [], needsReview: [], manualReview: MANUAL_REVIEW, totalMs,
    };
}

/**
 * The accessibility service. `check(documents)` builds the host page for the pinned documents, serves it
 * from this process, loads it in a fresh browser context and returns the report; `listen` exposes that as
 * `POST /check`. The browser is started on the first check and reused; if it dies the next check starts a new one.
 */
export class AccessibilityServer {
    private readonly timeoutMs: number;
    private readonly maxConcurrent: number;
    private readonly launch: (timeoutMs: number) => Promise<Browser>;
    private browser: Promise<Browser> | null = null;
    private readonly pages = new Map<string, string>();
    private running = 0;
    private readonly waiting: Array<() => void> = [];
    private server: Server | null = null;

    constructor(options: AccessibilityServerOptions = {}) {
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.maxConcurrent = options.maxConcurrent ?? 2;
        this.launch = options.launch ?? ((timeout) => chromium.launch({ timeout }));
    }

    /** Base URL once listening, e.g. `http://127.0.0.1:8123`. */
    get url(): string {
        const address = this.server?.address() as AddressInfo | null;
        if (!address) throw new Error('server is not listening');
        return `http://${address.address === '::' ? '127.0.0.1' : address.address}:${address.port}`;
    }

    private async acquire(): Promise<void> {
        if (this.running >= this.maxConcurrent) await new Promise<void>((resolve) => this.waiting.push(resolve));
        this.running += 1;
    }

    private release(): void {
        this.running -= 1;
        this.waiting.shift()?.();
    }

    private ensureBrowser(timeoutMs: number): Promise<Browser> {
        if (!this.browser) {
            const launched = this.launch(timeoutMs);
            this.browser = launched;
            launched.then((b) => b.on('disconnected', () => { if (this.browser === launched) this.browser = null; }), () => { if (this.browser === launched) this.browser = null; });
        }
        return this.browser;
    }

    /** Run the reference-renderer check on the pinned documents. Never rejects: failure is a report. */
    async check(documents: HostDocuments): Promise<RendererCheckReport> {
        const started = performance.now();
        const elapsed = () => Math.round(performance.now() - started);
        await this.acquire();
        const id = randomUUID();
        try {
            this.pages.set(id, renderHostPage({ ...documents, theme: documents.theme ?? null }));
            let browser: Browser;
            try {
                browser = await this.ensureBrowser(this.timeoutMs);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return failedReport({ reason: /timeout/i.test(message) ? 'timeout' : 'browser', message }, elapsed());
            }
            // No service workers, and only the host page itself may be requested: the documents are untrusted.
            const context = await browser.newContext({ serviceWorkers: 'block' }).catch(() => null);
            const page = await context?.newPage().catch(() => null);
            if (!context || !page) {
                this.browser = null;
                return failedReport({ reason: 'browser', message: 'the browser could not open a page' }, elapsed());
            }
            try {
                const hostUrl = `${this.url}/host/${id}`;
                const report = await checkAccessibility(page, {
                    open: async (p) => { await p.goto(hostUrl, { timeout: Math.max(1, this.timeoutMs - elapsed()) }); },
                    allow: (url) => url === hostUrl,
                    expectedPages: expectedPages(documents.definition, documents.theme),
                    timeoutMs: Math.max(1, this.timeoutMs - elapsed()),
                });
                return { ...report, totalMs: elapsed() };
            } finally {
                await context.close().catch(() => undefined);
            }
        } finally {
            this.pages.delete(id);
            this.release();
        }
    }

    /** Start listening. `POST /check` takes the documents and answers 200 with the report, 503 (with `Retry-After`) when the check could not finish and a retry may, or 422 when this form can never be checked (it does not draw, a page cannot be reached, its Theme names a missing adapter). */
    async listen(port = 0, host = '127.0.0.1'): Promise<void> {
        this.server = createServer((req, res) => void this.handle(req, res));
        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject);
            this.server!.listen(port, host, resolve);
        });
    }

    async close(): Promise<void> {
        const server = this.server;
        this.server = null;
        if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
        const browser = this.browser;
        this.browser = null;
        if (browser) await (await browser).close().catch(() => undefined);
    }

    private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const send = (status: number, body: unknown, type = 'application/json') => {
            res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...(status === 503 ? { 'retry-after': '5' } : {}) });
            res.end(typeof body === 'string' ? body : JSON.stringify(body));
        };
        try {
            const path = new URL(req.url ?? '/', 'http://localhost').pathname;
            if (req.method === 'GET' && path === '/health') return send(200, { status: 'ok' });
            if (req.method === 'GET' && path.startsWith('/host/')) {
                const html = this.pages.get(path.slice('/host/'.length));
                return html ? send(200, html, 'text/html; charset=utf-8') : send(404, { error: 'unknown page' });
            }
            if (req.method === 'POST' && path === '/print') {
                // The print page for the receipt PDF: the same host page, read-only, with the receipt after the form.
                // No browser is started here; Gotenberg loads the returned document.
                const body = await readJson(req);
                if (typeof body === 'string') return send(body.startsWith('too large') ? 413 : 400, { error: body });
                const { documents, receipt } = body as { documents?: unknown; receipt?: HostDocuments['receipt'] };
                const shaped = shapeDocuments(documents);
                if (typeof shaped === 'string') return send(400, { error: shaped });
                if (!receipt || typeof receipt.heading !== 'string' || !Array.isArray(receipt.facts) || typeof receipt.verify !== 'string') {
                    return send(400, { error: 'body needs a `receipt` with heading, facts and verify' });
                }
                return send(200, renderHostPage({ ...shaped, theme: shaped.theme ?? null, readOnly: true, receipt }), 'text/html; charset=utf-8');
            }
            if (req.method === 'POST' && path === '/check') {
                const documents = await readDocuments(req);
                if (typeof documents === 'string') return send(documents.startsWith('too large') ? 413 : 400, { error: documents });
                const report = await this.check(documents);
                // A form the renderer cannot draw, or whose pages cannot all be reached, fails the same way every
                // time: 422, no Retry-After. A browser that died or ran out of time may succeed later: 503.
                const retryable = report.failure && report.failure.reason !== 'renderer' && report.failure.reason !== 'pages';
                return send(report.status === 'completed' ? 200 : retryable ? 503 : 422, report);
            }
            return send(404, { error: 'not found' });
        } catch (error) {
            return send(500, { error: error instanceof Error ? error.message : String(error) });
        }
    }
}

/** Read a request body as JSON; a string is the reason it was refused. */
async function readJson(req: IncomingMessage): Promise<unknown | string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY_BYTES) return `too large: more than ${MAX_BODY_BYTES} bytes`;
        chunks.push(chunk as Buffer);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return 'body is not JSON'; }
}

/** Shape-check pinned documents; a string is the reason they were refused. */
function shapeDocuments(body: unknown): HostDocuments | string {
    const d = body as Partial<HostDocuments> | null;
    if (!d || typeof d !== 'object' || !d.definition || typeof d.definition !== 'object') return 'body needs a `definition` object';
    if (d.locales !== undefined && !Array.isArray(d.locales)) return '`locales` must be an array';
    return d as HostDocuments;
}

/** Read and shape-check a `POST /check` body; a string is the reason it was refused. */
async function readDocuments(req: IncomingMessage): Promise<HostDocuments | string> {
    const body = await readJson(req);
    return typeof body === 'string' ? body : shapeDocuments(body);
}
