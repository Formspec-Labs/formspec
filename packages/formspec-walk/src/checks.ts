/** @filedesc One check per thing the documents promise, on a rendered form: names, required, hints, options, Tab order, reading order, repeats, reveals, the submit summary. */
import type { Locator, Page } from '@playwright/test';
import type { IFormEngine } from '@formspec-org/engine';
import { UI_STRINGS } from '@formspec-org/layout';
import { expected, type ExpectedText } from './plan.js';
import { needsHostData, revealSearch, type RecipeStep } from './reveal.js';
import { virtualScreenReader, type ScreenReader } from './screen-reader.js';
import { stepPage } from './page-navigation.js';

/** A string as the documents write it, or one already turned into an expectation. */
export type Text = string | ExpectedText;
const want = (t: Text): ExpectedText => (typeof t === 'string' ? expected(t) : t);

/** Compare option spellings exactly, without loading the engine or rounding through Number. */
function numericChoiceKey(text: string): string | undefined {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());
    if (!match || !(match[2] || match[3])) return undefined;
    const digits = (match[2] + (match[3] ?? '')).replace(/^0+/, '');
    if (!digits) return '0';
    const significant = digits.replace(/0+$/, '');
    const exponent = BigInt(match[4] ?? '0') - BigInt(match[3]?.length ?? 0) + BigInt(digits.length - significant.length);
    return `${match[1] === '-' ? '-' : ''}${significant}e${exponent}`;
}

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
const INPUT_ROLES = ['textbox', 'spinbutton', 'combobox', 'listbox', 'checkbox', 'switch', 'slider'] as const;
const CONTROL_ROLES = [...INPUT_ROLES, 'radiogroup', 'group', 'button'] as const;
/** Roles the reader may open a phrase with: a control, an option inside a group control, or the structure around them. */
const HEARD_ROLES: string[] = [...CONTROL_ROLES, 'radio', 'option', 'menuitemradio', 'heading', 'region', 'navigation', 'list', 'listitem', 'paragraph', 'link',
    'article', 'form', 'status', 'alert', 'dialog', 'table', 'row', 'cell', 'columnheader', 'rowheader', 'img', 'figure', 'separator', 'main', 'banner',
    'contentinfo', 'complementary', 'search', 'tablist', 'tab', 'tabpanel', 'menu', 'menuitem', 'progressbar', 'meter', 'note', 'term', 'definition', 'document'];
/** The states the virtual reader appends after a name, each its own comma segment. */
const STATE_SEGMENT = /^(not )?(checked|invalid|read only|required|expanded|selected|pressed|disabled|busy|current|multi-?selectable)$|^(has popup|placeholder|position|set size|level|orientation|value|min value|max value|current value) |^(mixed|end of .*)$/;
const GROUP_CONTROL = 'fieldset, [role="group"], [role="radiogroup"]';
const MAX_TABS = 800;
const MAX_PHRASES = 4000;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A pattern's anchors dropped, so it can be searched for inside a longer text. */
const loose = (w: ExpectedText) => new RegExp(w.pattern ? w.pattern.source.replace(/^\^\\s\*/, '').replace(/\[\\s\\S\]\*\$$/, '') : escapeRe(w.text).replace(/\s+/g, '\\s+'));
/** Match the normalized authored name, allowing the renderer's required marker. */
const asRegex = (w: ExpectedText, suffix = '') => w.pattern ?? new RegExp(
    `^\\s*${escapeRe(norm(w.text)).replace(/\s+/g, '\\s+')}(?:\\s*\\*)?${suffix}\\s*$`);
/** `w` appears somewhere in `text`. */
const contains = (text: string, w: ExpectedText) => loose(w).test(text);
/** Words only: a hint rendered as a list loses its separators in `textContent`. */
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const nameOpensWith = (actual: string, w: ExpectedText) => asRegex(w, '(?:\\s+.*)?').test(actual);
/** Speech may append a comma-delimited value or description to the accessible name. */
const heardIs = (heard: string, w: ExpectedText, opensWith: boolean) =>
    asRegex(w, opensWith ? '(?:, .*|\\s+.*)?' : '(?:, .*)?').test(heard);
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
        /** Captured before a host can rerender; retain the original value in-page for exact restoration. */
        __formspecWalkChoice?: { chosen: { value: string; label: string } | null; previous: unknown; listener: (e: Event) => void };
    }
}

/** Default selector matching `<formspec-render>` or a React `<FormspecForm>` root container. */
export const DEFAULT_WALK_ROOT_SELECTOR =
    ':is(formspec-render, [data-formspec-render-root], .formspec-container:not(formspec-render .formspec-container):has([data-formspec-form]))';

/**
 * One rendered form under test. Each method checks one thing the documents promise and records what
 * contradicts them in `findings`; `expectClean()` raises them all at once, so a run reports everything.
 * `uncovered` holds what could not be judged and why.
 */
export class Walk {
    readonly findings: string[] = [];
    private findingCount = 0;
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
        const rootSelector = options.root ?? DEFAULT_WALK_ROOT_SELECTOR;
        if (options.url) await page.goto(options.url);
        if (options.mount) await options.mount(page);
        // A display-only pager can mount without fields. Hidden earlier tabs may already be in the DOM.
        const ready = ':is([data-name], .formspec-repeat, .formspec-workspace, .formspec-wizard-panel, [role="tabpanel"]):visible';
        const root = options.root === undefined ? rootSelector : `:is(${rootSelector})`;
        await page.waitForSelector(`${root} ${ready}`);
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
        this.findingCount += 1;
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

    /** Check one concrete path, creating and then removing only its missing parent rows. */
    private async withRows<T>(path: string, check: (path: string) => Promise<T>): Promise<T | false> {
        const sample = await this.page.evaluate(({ selector, path }) => {
            const engine = (document.querySelector(selector) as any).engine;
            const added: string[] = [];
            const parts = path.split('.');
            let concrete = '';
            for (const [i, key] of parts.entries()) {
                concrete = concrete ? `${concrete}.${key}` : key;
                if (i === parts.length - 1) break;
                const count = engine.repeats?.[concrete];
                if (!count) continue;
                if (!count.value) {
                    if (engine.addRepeatInstance(concrete) === undefined) return { concrete, added, blocked: true };
                    added.push(concrete);
                }
                concrete += '[0]';
            }
            return { concrete, added, blocked: false };
        }, { selector: this.rootSelector, path });
        try {
            if (sample.blocked) {
                this.uncover(`${path}: repeat ${sample.concrete} cannot take a sample row`);
                return false;
            }
            if (sample.added.length) await this.page.waitForTimeout(100);
            return await check(sample.concrete);
        } finally {
            if (sample.added.length) await this.page.evaluate(({ selector, added }) => {
                const engine = (document.querySelector(selector) as any).engine;
                for (const group of added.reverse()) engine.removeRepeatInstance(group, 0);
            }, { selector: this.rootSelector, added: sample.added });
        }
    }

    /** Bring the step that holds `path` into view — forward through a wizard, then from its first step; whether it is visible now. */
    show(path: string): Promise<boolean> {
        return this.showControl(this.root.locator(`[data-name="${path}"]`));
    }

    private async showControl(control: Locator): Promise<boolean> {
        for (let pass = 0; pass < 2; pass += 1) {
            do {
                if (await control.isVisible()) return true;
            } while (await this.step('next'));
            if (pass === 0) while (await this.step('previous')) { /* back to the first step */ }
        }
        return control.isVisible();
    }

    /** Advance to the next tab, wizard page, or workspace section. */
    nextStep(): Promise<boolean> {
        return this.step('next');
    }

    /** Return to the previous tab, wizard page, or workspace section. */
    previousStep(): Promise<boolean> {
        return this.step('previous');
    }

    private step(direction: 'next' | 'previous'): Promise<boolean> {
        return stepPage(this.root, direction, (key) => this.chrome(key));
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
    async tabWalk(throughPath?: string): Promise<Stop[]> {
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
            if (at.path === throughPath) break;
            if (i === MAX_TABS - 1) this.found(`Tab walk: still inside the form after ${MAX_TABS} presses; the form may trap focus`);
        }
        return stops;
    }

    /** Query Playwright's role/name implementation, including a fieldset that is itself the field root. */
    private byRoles(field: Locator, roles: readonly Parameters<Locator['getByRole']>[0][], name?: RegExp): Locator {
        const scope = field.locator('..');
        const matches = roles.map(role => scope.getByRole(role, { name }));
        return field.or(field.locator('*')).and(matches.reduce((a, b) => a.or(b)));
    }

    // ── the checks ─────────────────────────────────────────────────

    /**
     * The field is on the page, named by its label (its own controls extend the label in a composite
     * widget), heard that way with its required state when focused, described by its hint, offering
     * every option. Brings its wizard step into view first.
     */
    async field(pathOrBase: string, w: FieldWant, stop?: Stop, live?: LiveField): Promise<boolean> {
        const existing = live ?? await this.live(pathOrBase);
        if (existing) return this.checkField(existing, w, stop);
        return this.withRows(pathOrBase, async path => {
            const f = await this.live(path);
            if (f) return this.checkField(f, w, stop);
            this.found(`${pathOrBase}: the engine has no such field`);
            return false;
        });
    }

    private async checkField(f: LiveField, w: FieldWant, stop?: Stop): Promise<boolean> {
        const before = this.findingCount;
        if (!(await this.show(f.path))) { this.found(`${f.path}: never shown on any step`); return false; }
        const label = want(w.label);
        const fieldRoot = this.root.locator(`[data-name="${f.path}"]`).filter({ visible: true });
        if ((await fieldRoot.count()) !== 1) { this.found(`${f.path}: expected one visible field root, got ${await fieldRoot.count()}`); return false; }
        const required = w.required === 'engine' || w.required === undefined ? f.required : w.required;
        const actionable = [...INPUT_ROLES, 'radio', 'button'] as const;
        const controls = this.byRoles(fieldRoot, actionable);
        const count = await controls.count();
        if (!count) { this.found(`${f.path}: no control with a role inside the field`); return false; }
        // Only a group around the principal control can name the field. An optgroup
        // or a sibling help panel does not change a single input into a composite.
        const owners = controls.first().locator('xpath=ancestor::*');
        const groupName = asRegex(label, required ? '(?:\\s+required)?' : '');
        const groups = this.byRoles(fieldRoot, ['group', 'radiogroup'], groupName).and(owners);
        const isGroup = await groups.count() > 0;
        const composite = !isGroup && count > 1;
        if (!isGroup) {
            const name = asRegex(label, composite ? '(?:\\s+.*)?' : '');
            if (!await this.byRoles(fieldRoot, actionable, name).count())
                this.found(`${f.path}: no control named for the label "${label.text}"`);
            if (composite && await this.byRoles(fieldRoot, INPUT_ROLES, name).count() !== await this.byRoles(fieldRoot, INPUT_ROLES).count())
                this.found(`${f.path}: a control does not open with the label "${label.text}"`);
            if (await fieldRoot.evaluate((el, selector) => el.matches(selector), GROUP_CONTROL))
                this.found(`${f.path}: no group named for the label "${label.text}"`);
        }
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
                // Focus lands on an option, or on the one control a group wraps (an upload's Browse button),
                // whose name extends the label like a composite widget's; the group's own name is checked in the reading order.
                const options = (w.options ?? []).map(want);
                if (!options.some((o) => asRegex(o).test(heardName)) && !asRegex(label).test(heardName) && !(options.length === 0 && heardIs(heardName, label, true)))
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
            const groupRequired = await groups.evaluateAll(nodes => nodes.some(g =>
                g.getAttribute('aria-required') === 'true' ||
                /\brequired\b/i.test(g.querySelector('legend')?.textContent ?? '')));
            if (groupRequired !== required) this.found(`${f.path}: ${required ? 'required' : 'not required'}, but the group says ${groupRequired ? 'required' : 'nothing'}`);
        }
        if (w.options?.length) {
            for (const option of w.options.map(want)) {
                if (!await this.byRoles(fieldRoot, ['option', 'radio', 'checkbox', 'menuitemradio'], asRegex(option)).count())
                    this.found(`${f.path}: option "${option.text}" is not offered`);
            }
        }
        if (!f.readonly) await this.choice(f.path, fieldRoot);
        return this.findingCount === before;
    }

    /** One native keyboard action must persist in the DOM, field state, and exported Response. */
    async choice(path: string, fieldRoot = this.root.locator(`[data-name="${path}"]`).filter({ visible: true })): Promise<void> {
        const select = fieldRoot.locator('select:not([multiple])').filter({ visible: true });
        if (await select.count() !== 1 || !await select.isEnabled()) return;
        const key = await select.evaluate((el: HTMLSelectElement) => {
            const next = [...el.options].find(o => !o.disabled && !o.hidden && !o.parentElement?.matches('optgroup:disabled') &&
                o.value && o.value !== '__formspec_clear__' && o.value !== el.value && /^[\x21-\x7e]/.test(o.label.trim()));
            return next ? [...next.label.trim()][0] : null;
        });
        if (!key) { this.uncover(`${path}: no different enabled option with a key supported by Playwright native typeahead; choice persistence was not checked`); return; }
        await this.page.evaluate(({ selector, path }) => {
            const root = document.querySelector(selector) as any;
            const el = root.querySelector(`[data-name="${path}"] select`)! as HTMLSelectElement;
            const state = window.__formspecWalkChoice = {
                chosen: null as { value: string; label: string } | null,
                previous: root.engine.getFieldVM(path)?.value.value,
                listener: (e: Event) => { if (e.target === el) state.chosen ??= { value: el.value, label: el.selectedOptions[0]?.label ?? '' }; },
            };
            window.addEventListener('input', state.listener, true);
        }, { selector: this.rootSelector, path });
        try {
            await select.focus();
            // selectOption() dispatches both events in one script and masks the host rerender race.
            await this.page.keyboard.type(key);
            await this.page.waitForTimeout(100);
            const result = await this.page.evaluate(({ selector, path }) => {
                const root = document.querySelector(selector) as HTMLElement & { engine: IFormEngine };
                const vm = root.engine.getFieldVM(path);
                const data = root.engine.getResponse().data;
                const saved = path.replace(/\[(\d+)\]/g, '.$1').split('.').reduce((at: any, key) => at?.[key], data);
                const scalar = (v: any) => v && typeof v === 'object' && typeof v.rawJSON === 'string' ? v.rawJSON : v;
                return { chosen: window.__formspecWalkChoice!.chosen, shown: (root.querySelector(`[data-name="${path}"] select`) as HTMLSelectElement | null)?.value,
                    value: scalar(vm?.value.value), saved: scalar(saved), numeric: ['integer', 'decimal', 'number'].includes(vm?.dataType ?? '') };
            }, { selector: this.rootSelector, path });
            const { chosen } = result;
            const keeps = (value: unknown) => {
                if (!chosen || value === null || value === undefined || value === '') return false;
                if (String(value) === chosen.value) return true;
                if (!result.numeric) return false;
                const actual = numericChoiceKey(String(value));
                return actual !== undefined && actual === numericChoiceKey(chosen.value);
            };
            if (!chosen) this.found(`${path}: typing "${key}" chose no option; the choice was not checked`);
            else {
                const choice = `${path}: chose "${chosen.label}" with one keyboard action`;
                if (!keeps(result.value)) this.found(`${choice}, but the field kept ${JSON.stringify(result.value ?? null)}`);
                if (!keeps(result.saved)) this.found(`${choice}, but the response kept ${JSON.stringify(result.saved ?? null)}`);
                if (result.shown !== chosen.value) this.found(`${choice}, but the control shows ${JSON.stringify(result.shown ?? null)}`);
            }
        } finally {
            await this.page.evaluate(({ selector, path }) => {
                const state = window.__formspecWalkChoice;
                if (!state) return;
                window.removeEventListener('input', state.listener, true);
                delete window.__formspecWalkChoice;
                const root = document.querySelector(selector) as any;
                (root?.querySelector(`[data-name="${path}"] select`) as HTMLSelectElement | null)?.blur();
                root?.engine.setValue(path, state.previous);
            }, { selector: this.rootSelector, path });
            await this.page.waitForTimeout(30);
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
        const entries: Array<{ phrase: string; path?: string | null; heads?: string[] }> = [];
        while (entries.length < MAX_PHRASES) {
            const next = await this.sr.next();
            if (!next) break;
            entries.push(this.sr.readingPosition?.() ?? { phrase: await this.sr.lastSpokenPhrase() });
        }
        if (entries.length === MAX_PHRASES) this.found(`reading order: still reading after ${MAX_PHRASES} phrases; the reader may be looping`);
        const phrases = entries.map(entry => entry.phrase);
        const indexOf = (path: string, label: ExpectedText, from: number) => entries.findIndex((entry, i) =>
            i >= from && (entry.path === undefined ? !/^heading, /.test(entry.phrase) : entry.path === path)
            && heardIs(heardNameOf(entry.phrase), label, true));
        let cursor = 0;
        const at = new Map<string, number>();
        for (const f of shown) {
            const label = want(f.label);
            // Same-labelled fields (repeat rows) are told apart by reading on from the last one.
            let i = indexOf(f.path, label, cursor);
            if (i < 0 && indexOf(f.path, label, 0) >= 0) { this.found(`${f.path}: read before the field the Definition puts ahead of it`); i = indexOf(f.path, label, 0); }
            if (i < 0) { this.found(`${f.path}: never read aloud; the reader listed ${phrases.length} phrases`); continue; }
            at.set(f.path, i);
            cursor = i + 1;
        }
        const headingLabels = groups.map(g => want(g.label).text);
        for (const g of groups) {
            const first = at.get(g.firstField);
            if (first === undefined) continue;
            const label = want(g.label);
            if (!this.sr.readingPosition && headingLabels.indexOf(label.text) !== headingLabels.lastIndexOf(label.text)) {
                this.uncover(`group "${label.text}": ${this.sr.name} supplies speech without a DOM cursor; repeated heading ownership is unverified`);
            }
            // A group is a heading (a landmark's name alone does not head it), read before its first field.
            const heading = entries.slice(0, first).some(({ phrase, heads }) => /^heading, /.test(phrase)
                && (heads === undefined || heads.includes(g.firstField)) && asRegex(label).test(heardNameOf(phrase)));
            if (!heading) this.found(`group "${label.text}": not announced as a heading before its first field ${g.firstField}`);
        }
        return phrases;
    }

    /** Check a conditional field in the section where the respondent can reach it. */
    async reveal(pathOrBase: string, w: RevealWant, options: { stay?: boolean } = {}): Promise<'revealed' | 'visible' | false> {
        return this.withRows<'revealed' | 'visible' | false>(pathOrBase, async path => {
            const f = await this.live(path);
            if (!f) { this.found(`${path}: the engine has no such field`); return false; }
            const recipe = f.relevant ? [] : await this.applyRecipe(f.path, w.shownBy ?? 'engine');
            if (!recipe) return false;
            const fieldRoot = this.root.locator(`[data-name="${f.path}"]`);
            try {
                if (options.stay && !(await fieldRoot.waitFor({ state: 'visible', timeout: 300 }).then(() => true, () => false))) return false;
                if (!(await this.show(f.path))) {
                    this.found(`${f.path}: never shown on any step`);
                    return false;
                }
                const reached = (await this.tabWalk(f.path)).find(stop => stop.path === f.path);
                if (!reached) {
                    this.found(`${f.path}: not reachable by Tab in its section`);
                    return false;
                }
                if (!await this.field(f.path, w, reached)) return false;
            } finally {
                if (recipe.length) await this.restore(recipe);
            }
            if (!f.relevant && !(await fieldRoot.waitFor({ state: 'hidden', timeout: 1500 }).then(() => true, () => false))) {
                this.found(`${f.path}: still shown after its driver was reset`);
                return false;
            }
            return f.relevant ? 'visible' : 'revealed';
        });
    }

    /** Set the values that reveal `path` — given, or searched against the page's engine. Null when none do. */
    private async applyRecipe(path: string, shownBy: Array<{ path: string; value: unknown }> | RecipeStep[] | 'engine'): Promise<RecipeStep[] | null> {
        const result = await this.page.evaluate(({ selector, src, path, steps }) => {
            const engine = (document.querySelector(selector) as any).engine;
            const search = new Function(`return ${src}`)();
            return { recipe: search(engine, path, {}, steps) as RecipeStep[] | null, expression: engine.whyRelevant(path).expression as string | null };
        }, { selector: this.rootSelector, src: revealSearch.toString(), path, steps: shownBy === 'engine' ? undefined : shownBy });
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
    async repeat(groupPath: string, w: RepeatWant): Promise<boolean> {
        if (!w.addLabel) return false;
        const addLabel = want(w.addLabel);
        return this.withRows(groupPath, async concrete => {
            const scope = this.root.locator(`[data-repeat-path="${concrete}"]`);
            const add = scope.getByRole('button', { name: asRegex(addLabel) });
            const before = await this.repeatCount(concrete);
            if (w.maxRepeat !== undefined && before >= w.maxRepeat) {
                this.uncover(`${concrete}: already at maxRepeat; Add was not exercised`);
                return false;
            }
            const relevant = await this.page.evaluate(({ selector, path }) =>
                (document.querySelector(selector) as any).engine.isPathRelevant(path), { selector: this.rootSelector, path: concrete });
            const recipe = relevant ? [] : await this.applyRecipe(concrete, w.shownBy ?? 'engine');
            if (!recipe) return false;
            try {
                if (!await this.showControl(scope)) {
                    this.found(`${concrete}: never shown on any step`);
                    return false;
                }
                // A nested repeat can have the same accessible Add label. Only operate controls owned by this group.
                const owned = await this.ownedButton(add, [concrete]);
                if (!owned) {
                    this.found(`${concrete}: expected one Add control named "${addLabel.text}"`);
                    return false;
                }
                return await this.repeatShown(concrete, before, w, scope, owned);
            } finally {
                if (recipe.length) await this.restore(recipe);
            }
        });
    }

    private async ownedButton(buttons: Locator, paths: string[]): Promise<Locator | undefined> {
        const indices = await buttons.evaluateAll((nodes, paths) => nodes.flatMap((node, i) =>
            paths.includes(node.closest('[data-repeat-path]')?.getAttribute('data-repeat-path') ?? '') ? [i] : []), paths);
        return indices.length === 1 ? buttons.nth(indices[0]) : undefined;
    }

    private repeatCount(path: string): Promise<number> {
        return this.page.evaluate(({ selector, path }) =>
            (document.querySelector(selector) as any).engine.repeats[path]?.value ?? 0, { selector: this.rootSelector, path });
    }

    private async repeatShown(path: string, before: number, w: RepeatWant, scope: Locator, add: Locator): Promise<boolean> {
        const findingsBefore = this.findingCount;
        // A faulty Add/Remove handler can mutate a different row, even when its button is in the right place.
        const snapshot = await this.page.evaluateHandle(sel => (document.querySelector(sel) as any).engine.getDraftSnapshot(), this.rootSelector);
        try {
            await this.sr.clearSpokenPhraseLog();
            await add.click();
            await this.page.waitForTimeout(50);
            const after = await this.repeatCount(path);
            if (after !== before + 1) {
                this.found(`${path}: Add went from ${before} to ${after} rows`);
                return false;
            }
            const index = after - 1;
            const row = scope.locator(`[data-repeat-path="${path}[${index}]"], [data-repeat-rows="${path}"] > :nth-child(${after})`);
            if (await row.count() !== 1) {
                this.found(`${path}: cannot identify new row ${index + 1}`);
                return false;
            }
            const state = await row.evaluate(el => {
                const legend = el.querySelector(':scope > legend, :scope > summary');
                const labelled = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/)
                    .map(id => el.ownerDocument.getElementById(id)?.textContent ?? '').join(' ').trim();
                return { focused: el.contains(el.ownerDocument.activeElement), name: legend?.textContent ?? el.getAttribute('aria-label') ?? labelled };
            });
            if (!state.focused) this.found(`${path}: focus did not move into the new row after Add`);
            const rowWant = want(w.rowName);
            if (!state.name || !nameOpensWith(state.name, rowWant)) this.found(`${path}: new row named "${state.name}", expected "${rowWant.text}"`);
            if (w.removeLabel) {
                const name = want(w.removeLabel);
                const remove = row.getByRole('button', { name: asRegex(name) });
                const owned = await this.ownedButton(remove, [path, `${path}[${index}]`]);
                if (!owned) this.found(`${path}: no Remove control named "${name.text}" uniquely identifies the new row`);
                else {
                    await owned.click();
                    await this.page.waitForTimeout(50);
                    if (await this.repeatCount(path) !== before) this.found(`${path}: Remove did not restore the original row count`);
                }
            }
        } finally {
            const changed = await this.page.evaluate(({ sel, path, before, snapshot }) => {
                const engine = (document.querySelector(sel) as any).engine;
                // Prefer deleting precisely the sample. Reload only if the control changed other draft data.
                const count = engine.repeats[path]?.value;
                if (count === before + 1) engine.removeRepeatInstance(path, before);
                if (JSON.stringify(engine.getDraftSnapshot().data) === JSON.stringify(snapshot.data)) return false;
                engine.loadDraftSnapshot(snapshot);
                return true;
            }, { sel: this.rootSelector, path, before, snapshot }).finally(() => snapshot.dispose());
            if (changed) this.found(`${path}: repeat controls changed pre-existing draft data`);
        }
        return this.findingCount === findingsBefore;
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
