/** @filedesc One check per thing the documents promise, on a rendered form: names, required, hints, options, Tab order, reading order, repeats, reveals, the submit summary. */
import type { Locator, Page } from '@playwright/test';
import { UI_STRINGS } from '@formspec-org/layout';
import { expected, matches, type ExpectedText } from './plan.js';
import { needsHostData, revealSearch, type RecipeStep } from './reveal.js';
import { virtualScreenReader, type ScreenReader } from './screen-reader.js';

/** A string as the documents write it, or one already turned into an expectation. */
export type Text = string | ExpectedText;
const want = (t: Text): ExpectedText => (typeof t === 'string' ? expected(t) : t);

export interface FieldWant {
    /** Bind-style or live (indexed) path; the walk tries the live one, then the first instance. */
    label: Text;
    /** `true` / `false` as the documents say; `'engine'` when an expression decides. */
    required?: boolean | 'engine';
    hint?: Text;
    /** Every option label the field must offer. */
    options?: Text[];
}

export interface RevealWant extends FieldWant {
    /** The values that show the field, as the documents (or an emit-time engine) found them; `'engine'` searches at runtime. */
    shownBy?: Array<{ path: string; value: unknown }> | 'engine';
}

export interface RepeatWant {
    /** How one instance is named; an adapter may say more after it ("… of 3"). */
    rowName: Text;
    addLabel?: Text;
    removeLabel?: Text;
    maxRepeat?: number;
    /** For a repeat inside a conditional group: the values that show it, or `'engine'` to search. */
    shownBy?: Array<{ path: string; value: unknown }> | 'engine';
    /** A field inside the group, for the search and for bringing its step into view. */
    firstField?: string;
}

export interface SummaryRowWant {
    path: string;
    label: Text;
    /** The REQUIRED message a Locale authors; absent means the processor's own. */
    message?: Text;
}

export interface OpenOptions {
    /** The page to open; it must mount a `<formspec-render>`. */
    url?: string;
    /** Or mount the form yourself (a harness). */
    mount?: (page: Page) => Promise<void>;
    /** Locale code to activate once the form is up. */
    locale?: string;
    /** The active Locale's strings, for the `$ui` chrome the walk must recognise (Next step, summary rows). */
    chrome?: Record<string, string>;
    /** Selector of the `<formspec-render>` under test. */
    root?: string;
    /** Defaults to Guidepup's virtual reader inside the page. */
    screenReader?: ScreenReader;
}

/** A live field as the engine and the DOM see it at one moment. */
export interface LiveField {
    path: string;
    relevant: boolean;
    required: boolean;
    readonly: boolean;
    empty: boolean;
    /** Rendered and visible right now (a wizard keeps other steps in the DOM, hidden). */
    inDom: boolean;
}

/** Where the focus is: the field root it sits in, what the reader said, what describes it. */
interface Stop {
    path: string | null;
    phrase: string;
    descs: string[];
}

/** Roles a Formspec control can carry; a phrase or snapshot line opens with one of these. */
const CONTROL_ROLES = ['textbox', 'spinbutton', 'combobox', 'checkbox', 'switch', 'radiogroup', 'group', 'listbox', 'slider', 'button'];
/** Roles the reader may open a phrase with: a control, an option inside a group control, or the structure around them. */
const HEARD_ROLES = [...CONTROL_ROLES, 'radio', 'option', 'menuitemradio', 'heading', 'region', 'navigation', 'list', 'listitem', 'paragraph', 'link',
    'article', 'form', 'status', 'alert', 'dialog', 'table', 'row', 'cell', 'columnheader', 'rowheader', 'img', 'figure', 'separator', 'main', 'banner',
    'contentinfo', 'complementary', 'search', 'tablist', 'tab', 'tabpanel', 'menu', 'menuitem', 'progressbar', 'meter', 'note', 'term', 'definition', 'document'];
/** Controls that take a value; a button inside a field is named for its action ("Toggle calendar", "Browse"). */
const INPUT_ROLES = ['textbox', 'spinbutton', 'combobox', 'listbox', 'checkbox', 'switch', 'slider'];
/** The states the virtual reader appends after a name, each its own comma segment. */
const STATE_SEGMENT = /^(not )?(checked|invalid|read only|required|expanded|selected|pressed|disabled|busy|current|multi-?selectable)$|^(has popup|placeholder|position|set size|level|orientation|value|min value|max value|current value) |^(mixed|end of .*)$/;
const GROUP_CONTROL = 'fieldset, [role="group"], [role="radiogroup"]';
const MAX_TABS = 800;
const MAX_PHRASES = 4000;

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*\*\s*$/, '').trim();
/** A required marker rides the label's end ("Full Name*"); drop it wherever a name segment ends. */
const unstarred = (s: string) => norm(s).replace(/\s*\*\s*(?=,|$)/g, '');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A pattern's anchors dropped, so it can be searched for inside a longer text. */
const loose = (w: ExpectedText) => new RegExp(w.pattern ? w.pattern.source.replace(/^\^\\s\*/, '').replace(/\[\\s\\S\]\*\$$/, '') : escapeRe(w.text).replace(/\s+/g, '\\s+'));
const asRegex = (w: ExpectedText) => w.pattern ?? new RegExp(`^\\s*${escapeRe(w.text).replace(/\s+/g, '\\s+')}\\s*\\*?\\s*$`);
/** `w` appears somewhere in `text`. */
const contains = (text: string, w: ExpectedText) => loose(w).test(text);
/** Words only: a hint rendered as a list loses its separators in `textContent`. */
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
/** Playwright's name for a control is the label and nothing else (a required marker aside). */
const nameIs = (actual: string, w: ExpectedText) => matches(unstarred(actual), w) || matches(norm(actual), w);
/** The name opens with the label: a composite widget's own control extends it ("Salary currency code"). */
const nameOpensWith = (actual: string, w: ExpectedText) => {
    const clean = unstarred(actual);
    return nameIs(actual, w) || (w.pattern ? w.pattern.test(clean) : clean.startsWith(`${w.text} `));
};
/** What the reader said is the name — then, as further segments, a value and a description. */
const heardIs = (heard: string, w: ExpectedText, opensWith: boolean) => {
    const clean = unstarred(heard);
    if (matches(clean, w)) return true;
    if (w.pattern) return w.pattern.test(clean);
    return clean.startsWith(`${w.text}, `) || (opensWith && clean.startsWith(`${w.text} `));
};
/** What the reader called the thing: the phrase without its role and its trailing states. Names may contain commas. */
const heardNameOf = (phrase: string) => {
    const segments = phrase.split(', ');
    if (HEARD_ROLES.includes(segments[0])) segments.shift();
    while (segments.length > 1 && STATE_SEGMENT.test(segments[segments.length - 1])) segments.pop();
    return norm(segments.join(', '));
};
const baseOf = (path: string) => path.replace(/\[\d+\]/g, '');
/** A regex for a template such as `{{$label}}: {{$message}}`, each slot filled with what the documents promise. */
const templateRegex = (template: string, slots: Record<string, ExpectedText | undefined>) => new RegExp(
    `^\\s*${template.split(/(\{\{\$\w+\}\})/).map((part) => {
        const slot = /^\{\{\$(\w+)\}\}$/.exec(part)?.[1];
        if (!slot) return escapeRe(part).replace(/\s+/g, '\\s+');
        const w = slots[slot];
        return w ? loose(w).source : '[\\s\\S]+';
    }).join('')}\\s*$`);

declare global {
    interface Window {
        /** Elements the Tab walk has already stopped on, by identity. */
        __formspecWalkSeen?: Set<Element>;
    }
}

/**
 * One rendered form under test. Each method checks one thing the documents promise and records what
 * contradicts them in `findings`; `expectClean()` raises them all at once, so a run reports everything.
 * `uncovered` holds what could not be judged and why.
 */
export class Walk {
    readonly findings: string[] = [];
    readonly uncovered: string[] = [];
    readonly root: Locator;
    /** The Tab-walk starting point, before the form. */
    private sentinel = '__formspec-walk-start';

    private constructor(
        readonly page: Page,
        readonly sr: ScreenReader,
        readonly rootSelector: string,
        private readonly chromeStrings: Record<string, string>,
    ) {
        this.root = page.locator(rootSelector);
    }

    /** Open the page (or mount), activate the locale, add the renderer's default summary if the page placed none. */
    static async open(page: Page, options: OpenOptions): Promise<Walk> {
        const rootSelector = options.root ?? 'formspec-render';
        if (options.url) await page.goto(options.url);
        if (options.mount) await options.mount(page);
        await page.waitForSelector(`${rootSelector} [data-name]`);
        if (options.locale) {
            await page.evaluate(({ selector, code }) => { (document.querySelector(selector) as any).locale = code; }, { selector: rootSelector, code: options.locale });
            await page.waitForTimeout(150);
        }
        // A page that places no ValidationSummary gets the renderer's default one (jump links on) before the
        // walk starts, so the form re-plans once, up front.
        const added = await page.evaluate((selector) => {
            const el = document.querySelector(selector)!;
            if (el.hasAttribute('show-validation-summary')) return false;
            el.setAttribute('show-validation-summary', '');
            return true;
        }, rootSelector);
        if (added) await page.waitForTimeout(150);
        const walk = new Walk(page, options.screenReader ?? virtualScreenReader(page, rootSelector), rootSelector, options.chrome ?? {});
        await walk.sr.start();
        return walk;
    }

    /** One `$ui` chrome string as the active Locale writes it. */
    chrome(key: keyof typeof UI_STRINGS): string {
        return this.chromeStrings[`$ui.${key}`] ?? UI_STRINGS[key];
    }

    found(finding: string): void {
        if (!this.findings.includes(finding)) this.findings.push(finding);
    }

    uncover(reason: string): void {
        if (!this.uncovered.includes(reason)) this.uncovered.push(reason);
    }

    /** The one assertion: no findings. The message is the whole report, so a failure reads as a list. */
    expectClean(summary = ''): void {
        const head = [summary, this.uncovered.length ? `uncovered:\n  ${this.uncovered.join('\n  ')}` : ''].filter(Boolean).join('\n');
        if (this.findings.length) throw new Error(`${head}\nfindings:\n  ${this.findings.join('\n  ')}`);
    }

    // ── state ──────────────────────────────────────────────────────

    /** Every field the engine knows, as it and the DOM see it now. */
    async state(): Promise<LiveField[]> {
        return this.page.evaluate((selector) => {
            const el = document.querySelector(selector) as any;
            const engine = el.engine;
            const shown = new Set<string>();
            for (const node of el.querySelectorAll('[data-name]') as NodeListOf<HTMLElement>) if (node.checkVisibility()) shown.add(node.dataset.name!);
            return (engine.getFieldPaths() as string[]).map((path) => {
                const vm = engine.getFieldVM(path);
                const value = vm?.value?.value;
                return {
                    path,
                    relevant: engine.isPathRelevant(path),
                    required: Boolean(vm?.required?.value),
                    readonly: Boolean(vm?.readonly?.value),
                    empty: value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0),
                    inDom: shown.has(path),
                };
            });
        }, this.rootSelector);
    }

    /** The live path for a bind-style one: itself, else its first instance. */
    async live(path: string): Promise<LiveField | undefined> {
        const all = await this.state();
        return all.find((f) => f.path === path) ?? all.filter((f) => baseOf(f.path) === path).sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))[0];
    }

    /** Bring the step that holds `path` into view — forward through a wizard, then from its first step; whether it is visible now. */
    async show(path: string): Promise<boolean> {
        const fieldRoot = this.root.locator(`[data-name="${path}"]`);
        for (let pass = 0; pass < 2; pass += 1) {
            for (let i = 0; i < 50; i += 1) {
                if (await fieldRoot.isVisible()) return true;
                if (!(await this.step('next'))) break;
            }
            if (pass === 0) while (await this.step('previous')) { /* back to the first step */ }
        }
        return fieldRoot.isVisible();
    }

    /** Advance a wizard one step; false when there is no enabled Next. */
    nextStep(): Promise<boolean> {
        return this.step('next');
    }

    private async step(direction: 'next' | 'previous'): Promise<boolean> {
        const names = direction === 'next' ? ['wizard.next', 'wizard.nextStep'] : ['wizard.previous', 'wizard.previousStep'];
        const button = this.root.getByRole('button', { name: new RegExp(`^(${names.map((k) => escapeRe(this.chrome(k as keyof typeof UI_STRINGS))).join('|')})$`, 'i') });
        if (!(await button.count()) || (await button.first().isDisabled())) return false;
        await button.first().click();
        await this.page.waitForTimeout(100);
        return true;
    }

    // ── focus and what is heard ────────────────────────────────────

    private async focusStop(): Promise<(Stop & { key: string }) | null> {
        const at = await this.page.evaluate((selector) => {
            const el = document.activeElement as HTMLElement | null;
            const rootEl = document.querySelector(selector);
            if (!el || !rootEl || !rootEl.contains(el)) return null;
            const field = el.closest('[data-name]') as HTMLElement | null;
            // An option is described by its group: a radio's hint rides the fieldset / radiogroup it sits in.
            const group = el.closest('fieldset, [role="group"], [role="radiogroup"]');
            const ids = [el, ...(group && group !== el ? [group] : [])]
                .flatMap((n) => (n.getAttribute('aria-describedby') ?? '').split(/\s+/)).filter(Boolean);
            const seen = (window.__formspecWalkSeen ??= new Set<Element>());
            const repeat = seen.has(el);
            seen.add(el);
            return {
                path: field?.dataset.name ?? null,
                key: repeat ? 'seen' : 'new',
                descs: ids.map((id) => (document.getElementById(id)?.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean),
            };
        }, this.rootSelector);
        if (!at) return null;
        const log = await this.sr.spokenPhraseLog();
        return { ...at, phrase: log[log.length - 1] ?? '' };
    }

    /** Put the focus just before the form, so the next Tab is the form's first stop wherever focus was. */
    private async focusBeforeForm(): Promise<void> {
        await this.page.evaluate(({ selector, id }) => {
            const rootEl = document.querySelector(selector)!;
            let s = document.getElementById(id);
            if (!s) {
                s = document.createElement('span');
                s.id = id;
                s.tabIndex = -1;
                rootEl.insertAdjacentElement('beforebegin', s);
            }
            window.__formspecWalkSeen = new Set<Element>();
            s.focus();
        }, { selector: this.rootSelector, id: this.sentinel });
    }

    /** Press Tab through the form from before it; each stop is the field root the focus landed in and what was heard. */
    async tabWalk(): Promise<Stop[]> {
        await this.focusBeforeForm();
        const stops: Stop[] = [];
        let entered = false;
        let last: string | null = null;
        let dwell = 0;
        for (let i = 0; i < MAX_TABS; i += 1) {
            await this.sr.clearSpokenPhraseLog();
            await this.page.keyboard.press('Tab');
            const at = await this.focusStop();
            if (!at) { if (entered) break; continue; }
            // A composite control (a date input's segments) keeps focus while Tab moves inside it.
            if (at.key === 'seen') {
                if (at.path !== null && at.path === last && (dwell += 1) <= 8) continue;
                break;
            }
            last = at.path;
            dwell = 0;
            entered = true;
            stops.push({ path: at.path, phrase: at.phrase, descs: at.descs });
            if (i === MAX_TABS - 1) this.found(`Tab walk: still inside the form after ${MAX_TABS} presses; the form may trap focus`);
        }
        return stops;
    }

    /** Playwright's own role + name for every control inside a field root. */
    private async controls(fieldRoot: Locator): Promise<Array<{ role: string; name: string }>> {
        const snapshot = await fieldRoot.ariaSnapshot();
        return [...snapshot.matchAll(/^\s*- (\w+) "((?:[^"\\]|\\.)*)"/gm)].map((m) => ({ role: m[1], name: m[2].replace(/\\"/g, '"') }));
    }

    // ── the checks ─────────────────────────────────────────────────

    /**
     * The field is on the page, named by its label (its own controls extend the label in a composite
     * widget), heard that way with its required state when focused, described by its hint, offering
     * every option. Brings its wizard step into view first.
     */
    async field(pathOrBase: string, w: FieldWant, stop?: Stop, live?: LiveField): Promise<void> {
        const f = live ?? await this.live(pathOrBase);
        if (!f) { this.found(`${pathOrBase}: the engine has no such field`); return; }
        if (!(await this.show(f.path))) { this.found(`${f.path}: never shown on any step`); return; }
        const label = want(w.label);
        const fieldRoot = this.root.locator(`[data-name="${f.path}"]`).filter({ visible: true });
        if ((await fieldRoot.count()) !== 1) { this.found(`${f.path}: expected one visible field root, got ${await fieldRoot.count()}`); return; }
        const all = await this.controls(fieldRoot);
        const owned = all.filter((c) => CONTROL_ROLES.includes(c.role));
        const control = owned.find((c) => nameOpensWith(c.name, label)) ?? owned[0];
        if (!control) { this.found(`${f.path}: no control with a role inside the field`); return; }
        const isGroup = control.role === 'group' || control.role === 'radiogroup';
        // One control carries the label as its name. In a composite widget every control that takes a value
        // opens with the label ("Salary currency code"); a button keeps its action's name. Options inside a
        // group control are named by their own labels and checked below.
        const composite = !isGroup && owned.length > 1;
        if (isGroup) {
            if (!nameIs(control.name, label)) this.found(`${f.path}: accessible name "${control.name}" is not the label "${label.text}"`);
        } else if (composite) {
            if (!nameOpensWith(control.name, label)) this.found(`${f.path}: first control "${control.name}" does not open with the label "${label.text}"`);
            for (const c of owned) if (c !== control && INPUT_ROLES.includes(c.role) && !nameOpensWith(c.name, label))
                this.found(`${f.path}: control "${c.name}" does not open with the label "${label.text}"`);
        } else if (!nameIs(control.name, label)) {
            this.found(`${f.path}: accessible name "${control.name}" is not the label "${label.text}"`);
        }
        const required = w.required === 'engine' || w.required === undefined ? f.required : w.required;
        if (w.required === 'engine') this.uncover(`${f.path}: required is an expression; the engine decides`);

        if (!stop) {
            // Focus the control and hear it — the Tab order is the tabOrder check's business.
            await this.sr.clearSpokenPhraseLog();
            await fieldRoot.locator('input, select, textarea, button, [tabindex="0"]').filter({ visible: true }).first().focus();
            await this.page.waitForTimeout(30);
            stop = (await this.focusStop()) ?? undefined;
        }
        if (stop) {
            const heardName = heardNameOf(stop.phrase);
            if (isGroup) {
                // Focus lands on an option; the group's own name is checked in the reading order.
                const options = (w.options ?? []).map(want);
                if (!options.some((o) => matches(heardName, o)) && !asRegex(label).test(heardName))
                    this.found(`${f.path}: screen reader heard "${stop.phrase}", neither the label "${label.text}" nor one of its options`);
            } else {
                if (!heardIs(heardName, label, composite)) this.found(`${f.path}: screen reader heard "${stop.phrase}", not the label "${label.text}"`);
                if (required && !/(^|, )required(,|$)/.test(stop.phrase)) this.found(`${f.path}: required, but the screen reader heard "${stop.phrase}"`);
                if (!required && /(^|, )required(,|$)/.test(stop.phrase)) this.found(`${f.path}: not required, but the screen reader heard "${stop.phrase}"`);
            }
            if (w.hint) {
                const hint = want(w.hint);
                if (!stop.descs.some((d) => contains(d, hint) || squash(d).includes(squash(hint.text))))
                    this.found(`${f.path}: hint "${hint.text}" is not in the control's description (${JSON.stringify(stop.descs)})`);
            }
        }
        if (isGroup) {
            // Required rides the group (aria-required, or the legend's own "required" text for checkbox groups).
            const groupRequired = await fieldRoot.evaluate((el, sel) => {
                const g = el.matches(sel) ? el : el.querySelector(sel);
                if (!g) return null;
                return g.getAttribute('aria-required') === 'true' || /\brequired\b/i.test(g.querySelector('legend')?.textContent ?? '');
            }, GROUP_CONTROL);
            if (groupRequired !== null && groupRequired !== required) this.found(`${f.path}: ${required ? 'required' : 'not required'}, but the group says ${groupRequired ? 'required' : 'nothing'}`);
        }
        if (w.options?.length) {
            const names = all.filter((c) => ['option', 'radio', 'checkbox', 'menuitemradio'].includes(c.role)).map((c) => c.name);
            for (const o of w.options.map(want))
                if (!names.some((n) => nameIs(n, o))) this.found(`${f.path}: option "${o.text}" is not offered; saw ${JSON.stringify(names)}`);
        }
    }

    /** Tab reaches every visible one of `paths`, in that order, on the current step; each stop is heard as its field. */
    async tabOrder(paths: string[], fields?: Record<string, FieldWant>): Promise<Map<string, Stop>> {
        const live = await this.state();
        const visible = paths.filter((p) => live.some((f) => f.path === p && f.relevant && f.inDom));
        const stops = await this.tabWalk();
        const stopAt = new Map<string, Stop>();
        for (const s of stops) if (s.path && !stopAt.has(s.path)) stopAt.set(s.path, s);
        let last = -1;
        for (const p of visible) {
            const at = stops.findIndex((s, i) => i > last && s.path === p);
            if (at < 0) this.found(stops.some((s) => s.path === p) ? `${p}: reached by Tab out of Definition order` : `${p}: not reachable by Tab`);
            else last = at;
        }
        if (fields) for (const p of visible) if (fields[p]) await this.field(p, fields[p], stopAt.get(p), live.find((f) => f.path === p));
        return stopAt;
    }

    /** The reader lists every visible field in Definition order, and each group's heading before its first field. */
    async readingOrder(fields: Array<{ path: string; label: Text }>, groups: Array<{ label: Text; firstField: string }> = []): Promise<string[]> {
        const live = await this.state();
        const shown = fields.filter((f) => live.some((l) => l.path === f.path && l.relevant && l.inDom));
        await this.sr.start();
        await this.sr.clearSpokenPhraseLog();
        let n = 0;
        while (n < MAX_PHRASES && (await this.sr.next())) n += 1;
        if (n === MAX_PHRASES) this.found(`reading order: still reading after ${MAX_PHRASES} phrases; the reader may be looping`);
        const phrases = await this.sr.spokenPhraseLog();
        const indexOf = (label: ExpectedText, from: number) => {
            for (let i = from; i < phrases.length; i += 1) if (heardIs(heardNameOf(phrases[i]), label, true)) return i;
            return -1;
        };
        let cursor = 0;
        const at = new Map<string, number>();
        for (const f of shown) {
            const label = want(f.label);
            // Same-labelled fields (repeat rows) are told apart by reading on from the last one.
            let i = indexOf(label, cursor);
            if (i < 0 && indexOf(label, 0) >= 0) { this.found(`${f.path}: read before the field the Definition puts ahead of it`); i = indexOf(label, 0); }
            if (i < 0) { this.found(`${f.path}: never read aloud; the reader listed ${phrases.length} phrases`); continue; }
            at.set(f.path, i);
            cursor = i + 1;
        }
        for (const g of groups) {
            const first = at.get(g.firstField);
            if (first === undefined) continue;
            const label = want(g.label);
            // A group is a heading (a landmark's name alone does not head it), read before its first field.
            const heading = phrases.slice(0, first).some((p) => /^heading, /.test(p) && asRegex(label).test(norm(heardNameOf(p))));
            if (!heading) this.found(`group "${label.text}": not announced as a heading before its first field ${g.firstField}`);
        }
        return phrases;
    }

    /**
     * A conditional field: shown by the given values (or by values searched at runtime), then reachable by
     * Tab right after its last driver, heard and named like any field, and gone again when they are reset.
     * A field on a later wizard step is reached by stepping forward — or, with `stay`, left for that step
     * (false: not on this one).
     */
    async reveal(pathOrBase: string, w: RevealWant, options: { stay?: boolean } = {}): Promise<boolean> {
        const f = await this.live(pathOrBase);
        if (!f) { this.found(`${pathOrBase}: the engine has no such field`); return true; }
        if (f.inDom) { await this.field(f.path, w, undefined, f); return true; }
        const recipe = await this.applyRecipe(f.path, w.shownBy ?? 'engine');
        if (!recipe) return true;
        const fieldRoot = this.root.locator(`[data-name="${f.path}"]`);
        // Relevant now; on this step it renders at once, on another it stays hidden until that step shows.
        let shown = await fieldRoot.waitFor({ state: 'visible', timeout: 300 }).then(() => true, () => false);
        if (!shown && options.stay) { await this.restore(recipe); return false; }
        if (!shown) shown = await this.show(f.path);
        if (!shown) { this.found(`${f.path}: relevant after ${describe(recipe)} but never shown on any step`); await this.restore(recipe); return true; }
        const driver = this.root.locator(`[data-name="${recipe[recipe.length - 1].path}"]`);
        await driver.locator('input, select, textarea, button').first().focus();
        let reached: Stop | undefined;
        await this.page.evaluate(() => { window.__formspecWalkSeen = new Set<Element>(); });
        for (let i = 0; i < 80; i += 1) {
            await this.sr.clearSpokenPhraseLog();
            await this.page.keyboard.press('Tab');
            const at = await this.focusStop();
            if (!at) break;
            if (at.path === f.path) { reached = at; break; }
        }
        if (!reached) this.found(`${f.path}: shown by ${describe(recipe)} but not reachable by Tab after its driver`);
        await this.field(f.path, w, reached);
        await this.restore(recipe);
        const hidden = await fieldRoot.waitFor({ state: 'hidden', timeout: 1500 }).then(() => true, () => false);
        if (!hidden) this.found(`${f.path}: still shown after its driver was reset`);
        return true;
    }

    /** Set the values that reveal `path` — given, or searched against the page's engine. Null when none do. */
    private async applyRecipe(path: string, shownBy: Array<{ path: string; value: unknown }> | RecipeStep[] | 'engine'): Promise<RecipeStep[] | null> {
        if (shownBy !== 'engine') {
            return this.page.evaluate(({ selector, steps }) => {
                const engine = (document.querySelector(selector) as any).engine;
                return steps.map(({ path, value }) => {
                    const previous = engine.getFieldVM(path)?.value?.value ?? null;
                    engine.setValue(path, value);
                    return { path, value, previous };
                });
            }, { selector: this.rootSelector, steps: shownBy });
        }
        const result = await this.page.evaluate(({ selector, src, path, optionValues }) => {
            const engine = (document.querySelector(selector) as any).engine;
            const search = new Function(`return ${src}`)();
            return { recipe: search(engine, path, optionValues) as RecipeStep[] | null, expression: engine.whyRelevant(path).expression as string | null };
        }, { selector: this.rootSelector, src: revealSearch.toString(), path, optionValues: {} });
        if (result.recipe) return result.recipe;
        if (needsHostData(result.expression)) this.uncover(`${path}: shown only with host data (${result.expression}); not derivable from the documents`);
        else this.found(`${path}: nothing enumerable reveals it (${result.expression}); a relevance the documents cannot exercise`);
        return null;
    }

    private restore(recipe: RecipeStep[]): Promise<void> {
        return this.page.evaluate(({ selector, recipe }) => {
            const engine = (document.querySelector(selector) as any).engine;
            for (const { path, previous } of [...recipe].reverse()) engine.setValue(path, previous);
        }, { selector: this.rootSelector, recipe });
    }

    /** Add names a control, adds a row the focus lands in, names the row and its Remove control, which removes it. */
    async repeat(groupPath: string, w: RepeatWant): Promise<void> {
        if (!w.addLabel) return;
        let recipe: RecipeStep[] | null = null;
        if (w.firstField) {
            const f = await this.live(w.firstField);
            if (f && !f.relevant && w.shownBy) { recipe = await this.applyRecipe(f.path, w.shownBy); if (!recipe) return; }
            if (!(await this.show(f?.path ?? w.firstField))) { this.found(`${groupPath}: never shown on any step`); if (recipe) await this.restore(recipe); return; }
        }
        await this.repeatShown(groupPath, w);
        if (recipe) await this.restore(recipe);
    }

    private async repeatShown(groupPath: string, w: RepeatWant): Promise<void> {
        const rows = () => this.root.locator(`[data-name^="${groupPath}["]`).evaluateAll((els) => new Set(els.map((e) => /\[(\d+)\]/.exec((e as HTMLElement).dataset.name ?? '')?.[1])).size);
        const addLabel = want(w.addLabel!);
        const add = this.root.getByRole('button', { name: asRegex(addLabel) });
        if (!(await add.count())) { this.found(`${groupPath}: no Add control named "${addLabel.text}"`); return; }
        const before = await rows();
        if (w.maxRepeat !== undefined && before >= w.maxRepeat) return;
        await this.sr.clearSpokenPhraseLog();
        await add.first().click();
        await this.page.waitForTimeout(50);
        const after = await rows();
        if (after !== before + 1) { this.found(`${groupPath}: Add went from ${before} to ${after} rows`); return; }
        const rowPrefix = `[data-name^="${groupPath}[${after - 1}]"]`;
        const focusInRow = await this.page.evaluate((sel) => Boolean((document.activeElement as HTMLElement | null)?.closest(sel)), `${rowPrefix}, fieldset:has(${rowPrefix}), [aria-label]:has(${rowPrefix})`);
        if (!focusInRow) this.found(`${groupPath}: focus did not move into the new row after Add`);
        // The row's accessible name: the nearest named ancestor — a fieldset's legend, or an aria-label(ledby).
        const rowName = await this.root.locator(rowPrefix).first().evaluate((el, selector) => {
            for (let n: HTMLElement | null = (el as HTMLElement).parentElement; n && !n.matches(selector); n = n.parentElement) {
                const legend = n.tagName === 'FIELDSET' ? n.querySelector(':scope > legend') : null;
                if (legend) return legend.textContent?.replace(/\s+/g, ' ').trim() ?? '';
                if (n.getAttribute('aria-label')) return n.getAttribute('aria-label');
                if (n.getAttribute('aria-labelledby')) return document.getElementById(n.getAttribute('aria-labelledby')!)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            }
            return null;
        }, this.rootSelector);
        const rowWant = want(w.rowName);
        if (!rowName || !nameOpensWith(rowName, rowWant)) this.found(`${groupPath}: new row named "${rowName}", expected "${rowWant.text}"`);
        if (w.removeLabel) {
            const removeLabel = want(w.removeLabel);
            const remove = this.root.getByRole('button', { name: asRegex(removeLabel) });
            if (!(await remove.count())) this.found(`${groupPath}: no Remove control named "${removeLabel.text}"`);
            else {
                await remove.last().click();
                await this.page.waitForTimeout(50);
                if ((await rows()) !== before) this.found(`${groupPath}: Remove left ${await rows()} rows, expected ${before}`);
            }
        }
    }

    /**
     * Submit as-is: each required, relevant, empty field among `rows` is a summary row — a link that reads as
     * `$ui.validationSummary.row` over its label and message — and Enter on it moves focus to the invalid
     * control, whose description carries the message. Across wizard steps, so a link may bring its step back.
     */
    async summary(rows: SummaryRowWant[]): Promise<number> {
        await this.page.evaluate((selector) => (document.querySelector(selector) as any).submit({ emitEvent: false }), this.rootSelector);
        await this.page.waitForTimeout(100);
        const summary = this.root.locator('.formspec-validation-summary');
        const links = (await summary.count()) ? await summary.getByRole('link').all() : [];
        const texts = await Promise.all(links.map((r) => r.textContent().then((t) => norm(t ?? ''))));
        const live = await this.state();
        const template = this.chrome('validationSummary.row');
        const taken = new Set<number>();
        let checked = 0;
        for (const r of rows) {
            const f = live.find((l) => l.path === r.path) ?? live.find((l) => baseOf(l.path) === r.path);
            if (!f || !f.required || !f.empty || f.readonly || !f.relevant) continue;
            // Two rows of one repeat read alike, so each row answers for one field, in order.
            const pattern = templateRegex(template, { label: want(r.label), message: r.message ? want(r.message) : undefined });
            const i = texts.findIndex((t, k) => !taken.has(k) && pattern.test(t));
            if (i < 0) { this.found(`${f.path}: required and empty, but no summary link reads as ${pattern}; rows: ${JSON.stringify(texts)}`); continue; }
            taken.add(i);
            await links[i].focus();
            await this.sr.clearSpokenPhraseLog();
            await this.page.keyboard.press('Enter');
            await this.page.waitForTimeout(50);
            await this.root.locator(`[data-name="${f.path}"]`).waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
            const landed = await this.page.evaluate((p) => Boolean((document.activeElement as HTMLElement | null)?.closest(`[data-name="${p}"]`)), f.path);
            if (!landed) { this.found(`${f.path}: Enter on its summary link did not move focus to the field`); continue; }
            const at = (await this.focusStop())!;
            const inGroup = await this.page.evaluate((sel) => Boolean((document.activeElement as HTMLElement | null)?.closest(sel)), GROUP_CONTROL);
            const invalid = await this.page.locator(':focus').evaluate((el) => el.getAttribute('aria-invalid') === 'true' || Boolean(el.closest('[aria-invalid="true"]')));
            if (!invalid) this.found(`${f.path}: focused from the summary, but the control is not marked aria-invalid`);
            if (!at.descs.some((d) => texts[i].includes(d))) this.found(`${f.path}: the summary row "${texts[i]}" carries a message the control's description does not (${JSON.stringify(at.descs)})`);
            if (!inGroup && at.phrase && !/(^|, )invalid(,|$)/.test(at.phrase)) this.found(`${f.path}: screen reader heard "${at.phrase}" on the invalid control — no "invalid"`);
            checked += 1;
        }
        return checked;
    }
}

const describe = (recipe: Array<{ path: string; value: unknown }>) => recipe.map((r) => `${r.path}=${JSON.stringify(r.value)}`).join(', ');
