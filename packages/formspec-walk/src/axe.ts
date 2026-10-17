/** @filedesc The reference-renderer accessibility check: axe-core (WCAG A/AA) on each wizard page and again with validation errors shown, as a structured report. */
import type { Page } from '@playwright/test';
import { revealSearch, type RecipeStep } from './reveal.js';

/** axe rule tags the check runs: WCAG 2.0 A/AA, 2.1 A/AA and 2.2 AA. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] as const;

/** Version of this check's report shape and procedure; changes when what is run, or how, changes. */
export const CHECK_VERSION = '1';

/** The 60 s cap on one whole check, browser start to report (ADR 0166 §3). */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** One DOM node a rule flagged. */
export interface AxeNodeFinding {
    /** axe selector path to the node. */
    target: string[];
    /** The node's markup, cut to 300 characters. */
    html: string;
    /** What to change, in axe's words. */
    summary: string;
}

/** One axe rule's result in one state of the form. */
export interface AxeFinding {
    /** The state it was found in: `page-<n>` or `errors-<n>`. */
    state: string;
    /** The axe rule id. */
    rule: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    /** WCAG success criteria the rule maps to, e.g. `1.4.3`. */
    wcag: string[];
    nodes: AxeNodeFinding[];
}

/** One state of the form that axe ran on. */
export interface AxeState {
    id: string;
    kind: 'page' | 'validation-errors';
    /** 1-based wizard step; 1 for a form without a wizard. */
    step: number;
    /** Milliseconds axe took on this state. */
    axeMs: number;
}

/** A WCAG criterion that neither the document rules nor axe can decide, so a person reviews it. */
export interface ManualReviewCriterion {
    criterion: string;
    name: string;
    why: string;
}

/**
 * Criteria still for human review after both checks, whatever they find. Not an exhaustive WCAG list: what
 * the two checks cannot decide about a Formspec form, kept short so each entry is something a reviewer does.
 */
export const MANUAL_REVIEW: readonly ManualReviewCriterion[] = [
    { criterion: '1.1.1', name: 'Non-text content', why: 'A tool can see that alternative text exists, not that it says the right thing.' },
    { criterion: '1.3.1', name: 'Info and relationships', why: 'Whether the structure matches how the form reads visually needs a person.' },
    { criterion: '1.3.5', name: 'Identify input purpose', why: 'No document property names an input purpose, so autocomplete tokens are for review.' },
    { criterion: '1.4.1', name: 'Use of colour', why: 'Only English wording is checked; colour used in the theme or in other languages is for review.' },
    { criterion: '1.4.10', name: 'Reflow', why: 'Needs the form viewed at 320 CSS px and at 400% zoom.' },
    { criterion: '2.1.1', name: 'Keyboard', why: 'Every function working by keyboard needs a person to try it.' },
    { criterion: '2.4.3', name: 'Focus order', why: 'The walk checks Tab order against the documents; whether it is meaningful is for review.' },
    { criterion: '2.4.6', name: 'Headings and labels', why: 'Whether a label describes its purpose needs a person.' },
    { criterion: '2.4.7', name: 'Focus visible', why: 'axe cannot judge a custom focus style on every control.' },
    { criterion: '3.1.2', name: 'Language of parts', why: 'Text in another language than the page is not detectable from the documents.' },
    { criterion: '3.3.1', name: 'Error identification', why: 'Whether error text says what is wrong needs a person.' },
    { criterion: '3.3.3', name: 'Error suggestion', why: 'Whether error text helps the respondent fix it needs a person.' },
    { criterion: '3.3.4', name: 'Error prevention', why: 'Whether legal or financial submissions can be reviewed and corrected is a design judgement.' },
    { criterion: '3.3.7', name: 'Redundant entry', why: 'Whether the form asks again for what it already has needs a person.' },
    { criterion: '4.1.3', name: 'Status messages', why: 'Whether messages reach a screen reader at the right time needs assistive technology.' },
];

/** Why the check could not finish. Every reason is a failure, never a pass. */
export type FailureReason = 'timeout' | 'browser' | 'renderer' | 'axe-missing' | 'pages';

export interface CheckFailure {
    reason: FailureReason;
    message: string;
}

/** Pages the form has, how many were visited, and how the count was reached. */
export interface PageCoverage {
    kind: 'single' | 'wizard' | 'tabs';
    /** Pages the Definition guarantees (conditional pages not counted); null when not derived. */
    expectedMin: number | null;
    /** Pages the renderer drew. */
    drawn: number;
    /** Pages axe ran on in the page state. */
    visited: number;
    /** Fields hidden by relevance that were shown and checked. */
    revealedFields: number;
}

/**
 * The reference-renderer half of the accessibility report (ADR 0166 §3 `referenceRendererCheck`). There is
 * no `passed` field: `status: 'completed'` means axe ran on every page and every state, and `violations` says
 * what it found. `status: 'failed'` means it could not, and then `violations` is not a complete list.
 */
export interface RendererCheckReport {
    checkVersion: string;
    axeVersion: string | null;
    /** The render adapter that drew the form; the check says nothing about any other. */
    adapter: string | null;
    tags: readonly string[];
    status: 'completed' | 'failed';
    failure?: CheckFailure;
    pages: PageCoverage | null;
    states: AxeState[];
    /** axe violations: errors. */
    violations: AxeFinding[];
    /** axe incomplete results and requests the check refused: a person reviews them. */
    needsReview: AxeFinding[];
    /** Criteria for human review whatever the checks find. */
    manualReview: readonly ManualReviewCriterion[];
    /** Wall-clock milliseconds for the whole check. */
    totalMs: number;
}

/** What an axe pass needs of the page under test. */
export interface AxePassOptions {
    /** Selector of the `<formspec-render>` under test. */
    root?: string;
    /** Pages the Definition guarantees; fewer visited fails the check. */
    expectedPages?: number | null;
    /** More pages than this fails the check instead of ending it early. Defaults to 200. */
    maxPages?: number;
    /** Fields hidden by relevance to reach and check; the rest are listed for review. Defaults to 20. */
    maxReveals?: number;
}

/** The slice of axe-core's result this check reads. */
interface AxeResultLike {
    id: string;
    impact?: string | null;
    help: string;
    helpUrl: string;
    tags: string[];
    nodes: Array<{ target: unknown[]; html: string; failureSummary?: string }>;
}

interface AxeResultsLike {
    violations: AxeResultLike[];
    incomplete: AxeResultLike[];
    testEngine?: { version?: string };
}

/** `wcag143` -> `1.4.3`. */
export function criteriaOf(tags: string[]): string[] {
    const out = new Set<string>();
    for (const tag of tags) {
        const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
        if (m) out.add(`${m[1]}.${m[2]}.${m[3]}`);
    }
    return [...out];
}

function toFinding(state: string, r: AxeResultLike): AxeFinding {
    return {
        state,
        rule: r.id,
        impact: r.impact ?? null,
        help: r.help,
        helpUrl: r.helpUrl,
        wcag: criteriaOf(r.tags),
        nodes: r.nodes.map((n) => ({
            target: n.target.map(String),
            html: n.html.length > 300 ? `${n.html.slice(0, 300)}…` : n.html,
            summary: (n.failureSummary ?? '').replace(/\s+/g, ' ').trim(),
        })),
    };
}

/** A finding for something the check could not test, for a person to review. */
export function reviewFinding(state: string, rule: string, help: string, target: string): AxeFinding {
    return {
        state, rule, impact: null, help, helpUrl: '', wcag: [],
        nodes: [{ target: [target.length > 300 ? `${target.slice(0, 300)}…` : target], html: '', summary: help }],
    };
}

/** Thrown when `@axe-core/playwright` is not installed; the peer dependency is optional. */
export class AxeMissingError extends Error {
    constructor() {
        super('@axe-core/playwright is not installed; add it (npm install --save-dev @axe-core/playwright) to run the accessibility check');
        this.name = 'AxeMissingError';
    }
}

/** Thrown when the page reports that the form could not be drawn, or a page would not show. */
export class RendererError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RendererError';
    }
}

/** Thrown when the check visited fewer pages than the form has. */
export class PageCoverageError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PageCoverageError';
    }
}

type AxeBuilderCtor = new (options: { page: Page }) => { withTags(tags: string[]): { analyze(): Promise<AxeResultsLike> } };

async function loadAxe(): Promise<AxeBuilderCtor> {
    try {
        const mod = await import('@axe-core/playwright');
        return (mod.AxeBuilder ?? (mod as { default?: unknown }).default) as AxeBuilderCtor;
    } catch {
        throw new AxeMissingError();
    }
}

/** A minimal Definition, for counting pages. */
interface DefinitionLike {
    formPresentation?: { pageMode?: string };
    binds?: Array<{ path?: string; relevant?: unknown }>;
    items?: Array<{ key?: string; type?: string; children?: unknown[] }>;
}
interface ThemeLike {
    pages?: Array<{ regions?: Array<{ key?: string }> }>;
}

const hasKey = (items: unknown[] | undefined, key: string): boolean =>
    (items ?? []).some((i) => {
        const item = i as { key?: string; children?: unknown[] };
        return item.key === key || hasKey(item.children, key);
    });

/**
 * The pages a form is guaranteed to have, from the Definition alone (and the Theme's `pages`): the renderer
 * makes one page per top-level group and one more for loose top-level items, or one per Theme page that
 * names an item, plus the same extra. A page whose top-level group has a `relevant` bind may be absent, so
 * it is not counted. A form with no wizard or tabs has one page.
 */
export function expectedPages(definition: unknown, theme?: unknown): number {
    const d = definition as DefinitionLike;
    const mode = d.formPresentation?.pageMode;
    if (mode !== 'wizard' && mode !== 'tabs') return 1;
    const items = d.items ?? [];
    const conditional = new Set((d.binds ?? []).filter((b) => b.relevant !== undefined && b.relevant !== null && b.path).map((b) => b.path));
    const themed = ((theme as ThemeLike | null | undefined)?.pages ?? [])
        .filter((p) => (p.regions ?? []).some((r) => r.key && hasKey(items, r.key)));
    if (themed.length) {
        const assigned = new Set(themed.flatMap((p) => (p.regions ?? []).map((r) => r.key as string)));
        const loose = items.some((i) => !assigned.has(i.key ?? '') && !(assigned.size && [...assigned].some((k) => hasKey(i.children, k))));
        return themed.length + (loose ? 1 : 0);
    }
    const groups = items.filter((i) => i.type === 'group');
    if (!groups.length) return 1;
    const fixed = groups.filter((g) => !conditional.has(g.key));
    const loose = items.some((i) => i.type !== 'group');
    return fixed.length + (loose ? 1 : 0);
}

/** What an axe pass over a rendered form collected. */
export interface AxePassResult {
    axeVersion: string | null;
    adapter: string | null;
    pages: PageCoverage;
    states: AxeState[];
    violations: AxeFinding[];
    needsReview: AxeFinding[];
}

type Mode = 'single' | 'wizard' | 'tabs';

/** Pages are found by the renderer's own structure — panels, tab roles, button classes — never by translated words. */
const WIZARD_PANEL = '.formspec-wizard-panel';
const TAB_PANEL = '[role="tabpanel"]';
const TAB = '[role="tab"]';

/**
 * Run axe on `page`, which already shows a `<formspec-render>`: on every page of a wizard or tabs form,
 * once more on every page after the form is submitted empty (each field's validation error), and on
 * each field that relevance hides, shown by the values that reveal it. Fails (throws) when the pages
 * axe visited are fewer than the form has.
 */
export async function runAxePass(page: Page, options: AxePassOptions = {}): Promise<AxePassResult> {
    const AxeBuilder = await loadAxe();
    const rootSelector = options.root ?? 'formspec-render';
    const maxPages = options.maxPages ?? 200;
    const maxReveals = options.maxReveals ?? 20;
    const result: AxePassResult = {
        axeVersion: null, adapter: null, pages: { kind: 'single', expectedMin: options.expectedPages ?? null, drawn: 1, visited: 0, revealedFields: 0 },
        states: [], violations: [], needsReview: [],
    };
    result.adapter = await page.evaluate((sel) => (document.querySelector(sel) as any)?.resolvedAdapterName ?? null, rootSelector);

    const mode: Mode = await page.evaluate(({ sel, wizard, tab }) => {
        const root = document.querySelector(sel)!;
        if (root.querySelector(wizard)) return 'wizard';
        if (root.querySelector(tab)) return 'tabs';
        return 'single';
    }, { sel: rootSelector, wizard: WIZARD_PANEL, tab: TAB });
    const panelSelector = mode === 'wizard' ? WIZARD_PANEL : mode === 'tabs' ? TAB_PANEL : null;
    const drawn = panelSelector ? await page.locator(`${rootSelector} ${panelSelector}`).count() : 1;
    result.pages = { ...result.pages, kind: mode, drawn };
    if (drawn > maxPages) throw new PageCoverageError(`the form has ${drawn} pages, more than the ${maxPages} the check visits`);
    if (options.expectedPages != null && drawn < options.expectedPages) {
        throw new PageCoverageError(`the Definition has at least ${options.expectedPages} pages but the renderer drew ${drawn}`);
    }

    /** Index of the page showing now. */
    const active = (): Promise<number> => page.evaluate(({ sel, ps }) => {
        if (!ps) return 0;
        const panels = [...document.querySelector(sel)!.querySelectorAll(ps)] as HTMLElement[];
        return panels.findIndex((p) => !p.classList.contains('formspec-hidden') && !p.hidden);
    }, { sel: rootSelector, ps: panelSelector });

    /** Show page `index`: tabs by clicking its tab, a wizard by its Next / Previous buttons. */
    const goTo = async (index: number): Promise<void> => {
        for (let guard = 0; guard <= drawn * 2; guard += 1) {
            const now = await active();
            if (now === index) return;
            if (mode === 'tabs') {
                await page.locator(`${rootSelector} ${TAB}`).nth(index).click();
            } else {
                const button = page.locator(`${rootSelector} ${now < index ? '.formspec-wizard-next' : '.formspec-wizard-prev'}`);
                if (!(await button.count()) || (await button.first().isDisabled())) {
                    throw new RendererError(`page ${index + 1} cannot be reached: no enabled ${now < index ? 'Next' : 'Previous'} button on page ${now + 1}`);
                }
                await button.first().click();
            }
            await page.waitForTimeout(100);
            if ((await active()) === now) throw new RendererError(`the form stayed on page ${now + 1} when asked to show page ${index + 1}`);
        }
        throw new RendererError(`page ${index + 1} was not reached`);
    };

    const analyse = async (id: string, kind: AxeState['kind'], step: number) => {
        const started = performance.now();
        const axe: AxeResultsLike = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
        result.axeVersion ??= axe.testEngine?.version ?? null;
        result.states.push({ id, kind, step, axeMs: Math.round(performance.now() - started) });
        result.violations.push(...axe.violations.map((r) => toFinding(id, r)));
        result.needsReview.push(...axe.incomplete.map((r) => toFinding(id, r)));
    };

    for (let i = 0; i < drawn; i += 1) {
        await goTo(i);
        await analyse(`page-${i + 1}`, 'page', i + 1);
        result.pages.visited += 1;
    }
    await goTo(0);
    // Submitting shows every field's error, and a wizard may move to a page that has one: start over from the first.
    await page.evaluate((selector) => (document.querySelector(selector) as any).submit({ emitEvent: false }), rootSelector);
    await page.waitForTimeout(100);
    await goTo(0);
    for (let i = 0; i < drawn; i += 1) {
        await goTo(i);
        await analyse(`errors-${i + 1}`, 'validation-errors', i + 1);
    }

    // Fields relevance hides: show each by the values that reveal it, check its page, put the values back.
    const hidden: string[] = await page.evaluate((sel) => {
        const engine = (document.querySelector(sel) as any).engine;
        const base = (p: string) => p.replace(/\[\d+\]/g, '');
        return [...new Set((engine.getFieldPaths() as string[]).filter((p) => !engine.isPathRelevant(p)).map(base))];
    }, rootSelector);
    for (const [n, path] of hidden.entries()) {
        const id = `reveal-${path}`;
        if (n >= maxReveals) {
            result.needsReview.push(reviewFinding(id, 'formspec-unreached-field', `Field ${path} is hidden by a relevance rule and was not checked: more than ${maxReveals} such fields`, path));
            continue;
        }
        const recipe: RecipeStep[] | null = await page.evaluate(({ sel, src, p }) => {
            const engine = (document.querySelector(sel) as any).engine;
            const search = new Function(`return ${src}`)();
            return search(engine, p, {}) as RecipeStep[] | null;
        }, { sel: rootSelector, src: revealSearch.toString(), p: path });
        if (!recipe) {
            result.needsReview.push(reviewFinding(id, 'formspec-unreached-field', `Field ${path} is hidden by a relevance rule that no value the documents name can satisfy, so it was not checked`, path));
            continue;
        }
        try {
            await page.waitForTimeout(100);
            const pageIndex: number = await page.evaluate(({ sel, ps, p }) => {
                const root = document.querySelector(sel)!;
                const field = root.querySelector(`[data-name="${p}"]`);
                if (!field || !ps) return 0;
                return [...root.querySelectorAll(ps)].findIndex((panel) => panel.contains(field));
            }, { sel: rootSelector, ps: panelSelector, p: path });
            if (pageIndex < 0) throw new RendererError(`field ${path} was revealed but sits on no page`);
            await goTo(pageIndex);
            await analyse(id, 'page', pageIndex + 1);
            result.pages.revealedFields += 1;
        } finally {
            await page.evaluate(({ sel, steps }) => {
                const engine = (document.querySelector(sel) as any).engine;
                for (const { path, previous } of [...steps].reverse()) engine.setValue(path, previous);
            }, { sel: rootSelector, steps: recipe });
        }
    }
    return result;
}

/** The page after `open`: drawn, or a renderer failure with its reason. */
async function waitForForm(page: Page, rootSelector: string): Promise<void> {
    await page.waitForSelector(`${rootSelector} [data-name], html[data-formspec-host="error"]`, { state: 'attached' });
    const error = await page.evaluate(() => (window as { __formspecHost?: { error?: string } }).__formspecHost?.error);
    if (error) throw new RendererError(error);
}

export interface AccessibilityCheckOptions extends AxePassOptions {
    /** Load the page under test into `page` (the host entry, or any page that mounts a `<formspec-render>`). */
    open(page: Page): Promise<void>;
    /** Hard cap on the whole check; defaults to 60 s. */
    timeoutMs?: number;
    /**
     * When set, every request the page makes is refused unless this accepts its URL. Each refusal is listed
     * in `needsReview` (what the form wanted to fetch was not tested) and never reaches the network.
     */
    allow?: (url: string) => boolean;
}

/** Sort an error into the reason the check failed. */
function classify(error: unknown, timedOut: boolean): CheckFailure {
    const message = error instanceof Error ? error.message : String(error);
    if (timedOut || (error instanceof Error && error.name === 'TimeoutError')) return { reason: 'timeout', message };
    if (error instanceof AxeMissingError) return { reason: 'axe-missing', message };
    if (error instanceof PageCoverageError) return { reason: 'pages', message };
    if (error instanceof RendererError) return { reason: 'renderer', message };
    return { reason: 'browser', message };
}

/**
 * Run the reference-renderer check on `page` and report. Never throws and never reports a pass it did
 * not earn: a timeout, a crashed or unreachable browser, a form that did not draw, pages not visited, or a
 * missing axe all come back as `status: 'failed'` with the reason. On timeout the page is closed to stop the work.
 */
export async function checkAccessibility(page: Page, options: AccessibilityCheckOptions): Promise<RendererCheckReport> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = performance.now();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    page.setDefaultTimeout(timeoutMs);
    const refused = new Set<string>();
    if (options.allow) {
        const allow = options.allow;
        await page.route('**/*', (route) => {
            const url = route.request().url();
            if (allow(url)) return route.continue();
            refused.add(url);
            return route.abort('blockedbyclient');
        });
    }
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            void page.close().catch(() => undefined);
            reject(new Error(`accessibility check exceeded ${timeoutMs} ms`));
        }, timeoutMs);
    });
    const work = (async () => {
        await options.open(page);
        await waitForForm(page, options.root ?? 'formspec-render');
        const pass = await runAxePass(page, options);
        // The page's own policy refuses what routing never saw (a fetch from the engine, a stylesheet link).
        const blocked: string[] = await page.evaluate(() => (window as { __formspecHost?: { blocked?: string[] } }).__formspecHost?.blocked ?? []);
        for (const url of blocked) refused.add(url);
        return pass;
    })();
    work.catch(() => undefined); // after a timeout the page closes under it; that rejection is already reported
    const base = { checkVersion: CHECK_VERSION, tags: WCAG_TAGS, manualReview: MANUAL_REVIEW } as const;
    const refusals = () => [...refused].map((url) => reviewFinding('page-load', 'formspec-blocked-request',
        'The form asked for an external resource. The check does not fetch it, so what it would supply was not tested.', url));
    try {
        const pass = await Promise.race([work, deadline]);
        return { ...base, ...pass, needsReview: [...pass.needsReview, ...refusals()], status: 'completed', totalMs: Math.round(performance.now() - started) };
    } catch (error) {
        return {
            ...base, axeVersion: null, adapter: null, pages: null, status: 'failed', failure: classify(error, timedOut),
            states: [], violations: [], needsReview: refusals(), totalMs: Math.round(performance.now() - started),
        };
    } finally {
        clearTimeout(timer);
    }
}
