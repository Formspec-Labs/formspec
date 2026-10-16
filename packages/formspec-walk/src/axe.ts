/** @filedesc The reference-renderer accessibility check: axe-core (WCAG A/AA) on each wizard page and again with validation errors shown, as a structured report. */
import type { Page } from '@playwright/test';
import { UI_STRINGS } from '@formspec-org/layout';
import { stepWizard } from './wizard.js';

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
export type FailureReason = 'timeout' | 'browser' | 'renderer' | 'axe-missing';

export interface CheckFailure {
    reason: FailureReason;
    message: string;
}

/**
 * The reference-renderer half of the accessibility report (ADR 0166 §3 `referenceRendererCheck`). There is
 * no `passed` field: `status: 'completed'` means axe ran on every state, and `violations` says what it found.
 * `status: 'failed'` means it could not, and then `violations` is not a complete list.
 */
export interface RendererCheckReport {
    checkVersion: string;
    axeVersion: string | null;
    tags: readonly string[];
    status: 'completed' | 'failed';
    failure?: CheckFailure;
    states: AxeState[];
    /** axe violations: errors. */
    violations: AxeFinding[];
    /** axe incomplete results: axe could not decide; a person reviews them. */
    needsReview: AxeFinding[];
    /** Criteria for human review whatever the checks find. */
    manualReview: readonly ManualReviewCriterion[];
    /** Wall-clock milliseconds for the whole check. */
    totalMs: number;
}

/** What the check needs of the page under test. */
export interface AxePassOptions {
    /** Selector of the `<formspec-render>` under test. */
    root?: string;
    /** The active Locale's `$ui.*` strings, for the wizard buttons' names. */
    chrome?: Record<string, string>;
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

/** Thrown when `@axe-core/playwright` is not installed; the peer dependency is optional. */
export class AxeMissingError extends Error {
    constructor() {
        super('@axe-core/playwright is not installed; add it (npm install --save-dev @axe-core/playwright) to run the accessibility check');
        this.name = 'AxeMissingError';
    }
}

/** Thrown when the page reports that the form could not be drawn. */
export class RendererError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RendererError';
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

/** What an axe pass over a rendered form collected. */
export interface AxePassResult {
    axeVersion: string | null;
    states: AxeState[];
    violations: AxeFinding[];
    needsReview: AxeFinding[];
}

/**
 * Run axe on `page`, which already shows a `<formspec-render>`: on every wizard page as it loads, then
 * once more on every page after the form is submitted empty, which shows each field's validation error.
 * Cost: two axe runs per page, each linear in that page's DOM.
 */
export async function runAxePass(page: Page, options: AxePassOptions = {}): Promise<AxePassResult> {
    const AxeBuilder = await loadAxe();
    const rootSelector = options.root ?? 'formspec-render';
    const root = page.locator(rootSelector);
    const chrome = (key: keyof typeof UI_STRINGS) => options.chrome?.[`$ui.${key}`] ?? UI_STRINGS[key];
    const result: AxePassResult = { axeVersion: null, states: [], violations: [], needsReview: [] };

    const analyse = async (kind: AxeState['kind'], step: number) => {
        const id = `${kind === 'page' ? 'page' : 'errors'}-${step}`;
        const started = performance.now();
        const axe: AxeResultsLike = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze();
        result.axeVersion ??= axe.testEngine?.version ?? null;
        result.states.push({ id, kind, step, axeMs: Math.round(performance.now() - started) });
        result.violations.push(...axe.violations.map((r) => toFinding(id, r)));
        result.needsReview.push(...axe.incomplete.map((r) => toFinding(id, r)));
    };

    /** Visit every wizard page from the current one forward. Returns how many there were. */
    const eachPage = async (kind: AxeState['kind']) => {
        let step = 1;
        for (;;) {
            await analyse(kind, step);
            if (step >= 50 || !(await stepWizard(page, root, 'next', chrome))) return step;
            step += 1;
        }
    };

    const toFirstPage = async () => { while (await stepWizard(page, root, 'previous', chrome)) { /* back */ } };
    await eachPage('page');
    await toFirstPage();
    // Submitting shows every field's error, and a wizard moves to a page that has one: start over from the first.
    await page.evaluate((selector) => (document.querySelector(selector) as any).submit({ emitEvent: false }), rootSelector);
    await page.waitForTimeout(100);
    await toFirstPage();
    await eachPage('validation-errors');
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
}

/** Sort an error into the reason the check failed. */
function classify(error: unknown, timedOut: boolean): CheckFailure {
    const message = error instanceof Error ? error.message : String(error);
    if (timedOut) return { reason: 'timeout', message };
    if (error instanceof AxeMissingError) return { reason: 'axe-missing', message };
    if (error instanceof RendererError) return { reason: 'renderer', message };
    return { reason: 'browser', message };
}

/**
 * Run the reference-renderer check on `page` and report. Never throws and never reports a pass it did
 * not earn: a timeout, a crashed or unreachable browser, a form that did not draw, or a missing axe all
 * come back as `status: 'failed'` with the reason. On timeout the page is closed to stop the work.
 */
export async function checkAccessibility(page: Page, options: AccessibilityCheckOptions): Promise<RendererCheckReport> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const started = performance.now();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
        return runAxePass(page, options);
    })();
    work.catch(() => undefined); // after a timeout the page closes under it; that rejection is already reported
    const base = { checkVersion: CHECK_VERSION, tags: WCAG_TAGS, manualReview: MANUAL_REVIEW } as const;
    try {
        const pass = await Promise.race([work, deadline]);
        return { ...base, ...pass, status: 'completed', totalMs: Math.round(performance.now() - started) };
    } catch (error) {
        return {
            ...base, axeVersion: null, status: 'failed', failure: classify(error, timedOut),
            states: [], violations: [], needsReview: [], totalMs: Math.round(performance.now() - started),
        };
    } finally {
        clearTimeout(timer);
    }
}
