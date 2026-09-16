/** @filedesc Screen-reader port for the Definition walk: Guidepup's virtual reader injected in-page (CI), or the OS's own — VoiceOver, NVDA — through @guidepup/playwright. */
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import virtualBuild from './virtual-build.cjs';

/**
 * What the walk needs from any screen reader: a reading cursor over the form and the log of what was
 * spoken. Focus changes made with the real keyboard are heard too — that is how the Tab walk is judged.
 */
export interface ScreenReader {
    readonly name: string;
    start(): Promise<void>;
    /** Move the reading cursor forward; false when it wrapped back to where it started. */
    next(): Promise<boolean>;
    lastSpokenPhrase(): Promise<string>;
    spokenPhraseLog(): Promise<string[]>;
    clearSpokenPhraseLog(): Promise<void>;
    stop(): Promise<void>;
}

declare global {
    interface Window {
        __formspecVirtualScreenReader?: {
            start(o: { container: Node }): Promise<void>;
            next(): Promise<void>;
            lastSpokenPhrase(): Promise<string>;
            spokenPhraseLog(): Promise<string[]>;
            clearSpokenPhraseLog(): Promise<void>;
            stop(): Promise<void>;
            readonly activeNode: Node | null;
        };
        /** The first (node, phrase) the reading cursor produced after start — seeing it again is the wrap. */
        __formspecVirtualFirst?: { node: Node; phrase: string } | null;
    }
}


/**
 * Guidepup's Virtual Screen Reader running inside the page under test, scoped to `rootSelector`. It
 * computes names and roles with its own implementation (dom-accessibility-api), so what it hears is a
 * second opinion on Playwright's. Injected as a blob module: works on the harness and on any built page.
 */
export function virtualScreenReader(page: Page, rootSelector = 'formspec-render'): ScreenReader {
    return {
        name: 'virtual',
        async start() {
            if (!(await page.evaluate(() => Boolean(window.__formspecVirtualScreenReader)))) {
                await page.evaluate(async (src) => {
                    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
                    const mod = await import(/* @vite-ignore */ url);
                    window.__formspecVirtualScreenReader = mod.virtual;
                }, readFileSync(virtualBuild.virtualBrowserBuild(), 'utf8'));
            }
            await page.evaluate(async (selector) => {
                const v = window.__formspecVirtualScreenReader!;
                await v.start({ container: document.querySelector(selector)! });
                window.__formspecVirtualFirst = null;
            }, rootSelector);
        },
        // The cursor wraps silently inside a container: the wrap is being back at the first thing it said
        // after start, on the same node. (A node may be announced more than once on the way — on entry, on
        // exit — so a repeated node alone is not the signal.)
        next: () => page.evaluate(async () => {
            const v = window.__formspecVirtualScreenReader!;
            await v.next();
            const node = v.activeNode ?? document;
            const phrase = await v.lastSpokenPhrase();
            const first = window.__formspecVirtualFirst;
            if (!first) { window.__formspecVirtualFirst = { node, phrase }; return true; }
            return !(first.node === node && first.phrase === phrase);
        }),
        lastSpokenPhrase: () => page.evaluate(() => window.__formspecVirtualScreenReader!.lastSpokenPhrase()),
        spokenPhraseLog: () => page.evaluate(() => window.__formspecVirtualScreenReader!.spokenPhraseLog()),
        clearSpokenPhraseLog: () => page.evaluate(() => window.__formspecVirtualScreenReader!.clearSpokenPhraseLog()),
        stop: () => page.evaluate(() => window.__formspecVirtualScreenReader!.stop()),
    };
}

/** The subset of `@guidepup/playwright`'s `screenReader` fixture the port needs. */
export interface GuidepupLike {
    navigateToWebContent(): Promise<void>;
    next(): Promise<void>;
    lastSpokenPhrase(): Promise<string>;
    spokenPhraseLog(): Promise<string[]>;
    clearSpokenPhraseLog(): Promise<void>;
}

/**
 * The OS's own screen reader — VoiceOver on macOS, NVDA on Windows — driven by `@guidepup/playwright`'s
 * `screenReaderTest` fixture (one-time OS grant locally: VoiceOver's "controlled with AppleScript"; on a
 * runner, `guidepup/setup-action`). Same walk, real ears: the phrases follow that reader's own verbosity,
 * so what the walk asks of them is the same name / required / invalid vocabulary, nothing tighter.
 */
export function guidepupScreenReader(reader: GuidepupLike): ScreenReader {
    let start = '';
    let moved = false;
    return {
        name: 'guidepup',
        async start() {
            await reader.navigateToWebContent();
            start = await reader.lastSpokenPhrase();
            moved = false;
        },
        async next() {
            await reader.next();
            const phrase = await reader.lastSpokenPhrase();
            const wrapped = moved && phrase === start;
            moved = true;
            return !wrapped;
        },
        lastSpokenPhrase: () => reader.lastSpokenPhrase(),
        spokenPhraseLog: () => reader.spokenPhraseLog(),
        clearSpokenPhraseLog: () => reader.clearSpokenPhraseLog(),
        async stop() {},
    };
}
