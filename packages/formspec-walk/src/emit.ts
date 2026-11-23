/** @filedesc Emit a plan as a readable Playwright spec: one test per thing the documents promise, every expectation written out. */
import type { ComponentDocument, FormDefinition, LocaleDocument, ThemeDocument } from '@formspec-org/types';
import type { ExpectedText, Plan, PlanField } from './plan.js';
import { revealSearch, type RevealEngine } from './reveal.js';

export interface EmitOptions {
    /** The URL of the rendered form, including its Surface route when hosted in an app. */
    url: string;
    /** Scope the walk to one renderer when the route has multiple form slots. */
    root?: string;
    /** What the header says the spec was generated from, and the command that regenerates it. */
    source: string;
    command: string;
    /** The Locale the plan was derived with, for its code and `$ui` strings. */
    locale?: LocaleDocument;
    /** The engine's own answer to "what shows this field", found at emit time; absent means the spec searches at runtime. */
    recipes?: Map<string, Array<{ path: string; value: unknown }> | null>;
    /** Open a field or repeat check in an alternate host context, keyed by the Definition item path. */
    caseUrls?: Readonly<Record<string, string>>;
    /** Manifest form identity used for reporting and checking the mounted Definition. */
    formId?: string;
    /** Include an accessibility check of the host with the authored documents. */
    axe?: boolean;
    theme?: ThemeDocument;
    component?: ComponentDocument;
    /** The package the emitted spec imports the walk from. */
    from?: string;
}

const comment = (s: string) => s.replace(/\*\//g, '* /');
const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
const text = (t: ExpectedText) => q(t.text);
const baseOf = (path: string) => path.replace(/\[\d+\]/g, '');
/** A title that fits one line of a test report. */
const short = (s: string, max = 90) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/** Keep authored wording when possible; paths distinguish duplicates, including truncated labels. */
function distinct(items: Array<{ title: string; path: string }>): string[] {
    const used = new Set<string>();
    return items.map(({ title, path }) => {
        const base = items.filter(item => item.title === title).length > 1 ? `${title} (${path})` : title;
        let result = base;
        for (let n = 2; used.has(result); n += 1) result = `${base} (${n})`;
        used.add(result);
        return result;
    });
}

/** The literal a field check takes, as source; `extra` rides along in the same object. */
function fieldWantSource(f: PlanField, extra: string[] = []): string {
    const parts = [`label: ${text(f.label)}`];
    if (f.required !== false) parts.push(`required: ${f.required === 'engine' ? "'engine'" : 'true'}`);
    if (f.hint) parts.push(`hint: ${text(f.hint)}`);
    if (f.options?.length) parts.push(`options: [${f.options.map((o) => text(o.label)).join(', ')}]`);
    return `{ ${[...parts, ...extra].join(', ')} }`;
}

function fieldFacts(f: PlanField, shownBy?: Array<{ path: string; value: unknown }> | null, labelOf?: (path: string) => string): string {
    const facts: string[] = [];
    facts.push(f.required === true ? 'required' : f.required === 'engine' ? 'required by rule' : 'optional');
    if (f.options?.length) facts.push(f.options.map((o) => o.label.text).join(' / '));
    if (f.hint) facts.push('with a hint');
    if (f.conditional) {
        if (shownBy?.length) facts.push(`shown when ${shownBy.map((s) => `${labelOf?.(s.path) ?? s.path} = ${JSON.stringify(s.value)}`).join(' and ')}`);
        else facts.push('shown conditionally');
    }
    return facts.join(', ');
}

/**
 * The spec's source. Grouped by top-level group; one test per field (named by its label and what the
 * documents say of it), one per repeat, one for the reading and Tab order over every step, one for the
 * submit summary. Every expectation is written into the file: the walk package supplies only the how.
 */
export function emitSpec(plan: Plan, definition: FormDefinition, options: EmitOptions): string {
    const from = options.from ?? '@formspec-org/walk';
    const code = options.locale?.locale;
    const chrome = Object.fromEntries(Object.entries((options.locale?.strings as Record<string, string> | undefined) ?? {}).filter(([k]) => k.startsWith('$ui.')));
    const labelOf = (path: string) => plan.fields.find((f) => f.path === baseOf(path))?.label.text ?? path;
    const recipes = options.recipes ?? new Map<string, Array<{ path: string; value: unknown }> | null>();
    const cases = new Map(Object.entries(options.caseUrls ?? {}));
    const checkable = new Set([...plan.fields.map(field => field.path), ...plan.groups.filter(group => group.repeat?.addLabel).map(group => group.path)]);
    for (const [path, url] of cases) {
        if (!checkable.has(path) || !url) throw new Error(`No checkable item and case URL for ${path}`);
    }
    const caseDetails = (path: string) => {
        const url = cases.get(path);
        return url ? `, { tag: '@formspec-case', annotation: ${JSON.stringify([
            { type: 'formspec-item-path', description: path },
            { type: 'formspec-case-url', description: url },
        ])} }` : '';
    };
    const checked = (path: string, call: string) => cases.has(path)
        ? `if (!await ${call}) walk.found(${q(`${path}: the configured case did not exercise the item`)});`
        : `await ${call};`;
    const lines: string[] = [];
    const push = (s = '') => lines.push(s);

    push('/**');
    push(` * ${comment(`${plan.title.text} ${definition.version}${code ? ` — ${code} wording` : ''}`)}.`);
    push(` * Generated by ${comment(from)} from ${comment(options.source)}. Regenerate, don't edit:`);
    push(` *   ${comment(options.command)}`);
    push(' *');
    push(' * Every test states what the documents promise; the walk checks the rendered form keeps it, by keyboard');
    push(' * and screen reader (Guidepup\'s virtual reader in the page; FORMSPEC_WALK_SR=os for the OS\'s own).');
    push(' * Run with formspec-walk test <this-file> (or configure @formspec-org/walk/reporter): zero executed tests fail.');
    push(' * A failure reads as a list of what contradicted the documents.');
    push(' */');
    push("import { test as base } from '@playwright/test';");
    push(`import { Walk, orderFieldPaths${options.axe ? ', checkAccessibility' : ''} } from ${q(from)};`);
    push();
    push(`const PAGE = ${q(options.url)};`);
    const identity = options.formId ? `, expectedDefinition: ${JSON.stringify({ url: definition.url, version: definition.version })}` : '';
    const rootOption = options.root ? `, root: ${q(options.root)}` : '';
    const openOptions = `{ url: PAGE${rootOption}${code ? `, locale: ${q(code)}` : ''}${identity}${Object.keys(chrome).length ? `, chrome: ${JSON.stringify(chrome, null, 4).replace(/\n/g, '\n    ')}` : ''} }`;
    if (cases.size) {
        push(`const open = (page: import('@playwright/test').Page, url: string) => Walk.open(page, { ...${openOptions}, url });`);
    } else {
        push(`const open = (page: import('@playwright/test').Page) => Walk.open(page, ${openOptions});`);
    }
    push('const test = base.extend<{ walk: Walk }>({');
    push('    walk: async ({ page }, use, info) => {');
    push(cases.size
        ? "        const walk = await open(page, info.annotations.find(a => a.type === 'formspec-case-url')?.description ?? PAGE);"
        : '        const walk = await open(page);');
    push('        try { await use(walk); } finally {');
    push("            await info.attach('formspec-walk', { contentType: 'application/json', body: JSON.stringify({ findings: walk.findings, uncovered: walk.uncovered, intentionallyHidden: walk.intentionallyHidden }) });");
    push('        }');
    push('    },');
    push('});');
    push();
    const annotations = [{ type: 'formspec-form', description: options.formId ?? definition.url },
        ...plan.uncovered.map(description => ({ type: 'formspec-uncovered', description }))];
    push(`test.describe(${q(`${short(plan.title.text)}${code ? ` (${code})` : ''}`)}, { annotation: ${JSON.stringify(annotations)} }, () => {`);
    if (options.axe) {
        push("    test('axe accessibility on the host page', { annotation: { type: 'formspec-axe' } }, async ({ page }, info) => {");
        push('        if (info.timeout && info.timeout < 75_000) test.setTimeout(75_000);');
        push(`        const report = await checkAccessibility(page, { open: page => Walk.openPage(page, ${openOptions})${rootOption}, scanWholePage: true,`);
        push(`            documents: ${JSON.stringify({ definition, theme: options.theme, component: options.component })} });`);
        push("        await info.attach('formspec-axe', { contentType: 'application/json', body: JSON.stringify(report) });");
        push("        if (report.status === 'failed') throw new Error(report.failure?.message ?? 'axe could not finish');");
        push("        if (report.violations.length) throw new Error(JSON.stringify(report.violations));");
        push('    });');
    }
    push("    test('every field is read and every editable field reached by Tab in Definition order, each group headed', async ({ walk }) => {");
    push('        const fields = [');
    for (const f of plan.fields) push(`            { path: ${q(f.path)}, label: ${text(f.label)} },`);
    push('        ];');
    push('        const labels = new Map(fields.map(f => [f.path, f.label]));');
    push('        const groups = [');
    for (const g of plan.groups) {
        if (!g.label.text) continue;
        if (plan.fields.some(f => f.groups.some(pg => pg.path === g.path))) {
            push(`            { path: ${q(g.path)}, label: ${text(g.label)} },`);
        }
    }
    push('        ];');
    push('        while (await walk.previousStep()) { /* Start at the first page. */ }');
    push('        do {');
    push('            const live = await walk.state();');
    push('            const ordered = orderFieldPaths([...labels.keys()], live.filter(f => f.relevant && f.inDom).map(f => f.path));');
    push("            const authoredPath = (path: string) => path.replace(/\\[\\d+\\]/g, '');");
    push('            await walk.readingOrder(ordered.map(path => ({ path, label: labels.get(authoredPath(path))! })), groups.flatMap(g => {');
    push("                const firstField = ordered.find(path => authoredPath(path).startsWith(g.path + '.'));");
    push('                return firstField ? [{ label: g.label, firstField }] : [];');
    push('            }));');
    push('            await walk.tabOrder(ordered);');
    push('        } while (await walk.nextStep());');
    push('        walk.expectClean();');
    push('    });');
    push();

    // Fields, in the Definition's own tree: one describe per labelled group, nested as the groups are.
    type Node = { groups: Map<string, { label: string; node: Node }>; fields: PlanField[] };
    const tree: Node = { groups: new Map(), fields: [] };
    for (const f of plan.fields) {
        let at = tree;
        for (const g of f.groups) {
            if (!g.label.text) continue;
            const next = at.groups.get(g.path) ?? { label: g.label.text, node: { groups: new Map(), fields: [] } };
            at.groups.set(g.path, next);
            at = next.node;
        }
        at.fields.push(f);
    }
    const emitNode = (node: Node, indent: string) => {
        const recipeFor = (path: string) => cases.has(path) ? undefined : recipes.get(path);
        const titles = distinct(node.fields.map(f => ({ path: f.path,
            title: `${short(f.label.text)} — ${fieldFacts(f, recipeFor(f.path), labelOf)}` })));
        for (const [i, f] of node.fields.entries()) {
            const recipe = recipeFor(f.path);
            const title = titles[i];
            push(`${indent}test(${q(title)}${caseDetails(f.path)}, async ({ walk }) => {`);
            if (f.conditional) {
                const shownBy = recipe?.length ? `[${recipe.map((s) => `{ path: ${q(s.path)}, value: ${JSON.stringify(s.value)} }`).join(', ')}]` : "'engine'";
                push(`${indent}    ${checked(f.path, `walk.reveal(${q(f.path)}, ${fieldWantSource(f, [`shownBy: ${shownBy}`])})`)}`);
            } else {
                push(`${indent}    ${checked(f.path, `walk.field(${q(f.path)}, ${fieldWantSource(f)})`)}`);
            }
            push(`${indent}    walk.expectClean();`);
            push(`${indent}});`);
        }
        const groups = [...node.groups].map(([path, group]) => ({ path, ...group }));
        const groupTitles = distinct(groups.map(g => ({ path: g.path, title: short(g.label) })));
        for (const [i, g] of groups.entries()) {
            push(`${indent}test.describe(${q(groupTitles[i])}, () => {`);
            emitNode(g.node, `${indent}    `);
            push(`${indent}});`);
        }
    };
    emitNode(tree, '    ');
    push();

    // Repeats.
    const repeats = plan.groups.filter(g => g.repeat?.addLabel);
    const repeatTitles = distinct(repeats.map(g => ({ path: g.path, title: short(g.label.text) })));
    for (const [i, g] of repeats.entries()) {
        const r = g.repeat!;
        push(`    test(${q(`${repeatTitles[i]} — ${r.addLabel!.text}, focus lands in the new row${r.removeLabel ? `, ${r.removeLabel.text}` : ''}`)}${caseDetails(g.path)}, async ({ walk }) => {`);
        push(`        ${checked(g.path, `walk.repeat(${q(g.path)}, { rowName: ${text(r.rowName)}, addLabel: ${text(r.addLabel!)}${r.removeLabel ? `, removeLabel: ${text(r.removeLabel)}` : ''}${r.maxRepeat !== undefined ? `, maxRepeat: ${r.maxRepeat}` : ''} })`)}`);
        push('        walk.expectClean();');
        push('    });');
        push();
    }

    // Summary.
    const required = plan.fields.filter((f) => f.required !== false && !f.conditional);
    push("    test('submitting as-is lists every unanswered required question as a link to its answer', async ({ walk }) => {");
    push('        await walk.summary([');
    for (const f of required) push(`            { path: ${q(f.path)}, label: ${text(f.label)}${f.requiredMessage ? `, message: ${text(f.requiredMessage)}` : ''} },`);
    push('        ]);');
    push('        walk.expectClean();');
    push('    });');
    push('});');
    push();
    return lines.join('\n');
}

/**
 * What shows each conditional field, asked of an engine at emit time — the values the spec then states
 * outright. Null for a field nothing enumerable reveals; absent from the map when the engine has no
 * instance of it (a repeat with no rows yet).
 */
export function deriveRecipes(engine: RevealEngine, plan: Plan): Map<string, Array<{ path: string; value: unknown }> | null> {
    const optionValues = Object.fromEntries(plan.fields.filter((f) => f.options).map((f) => [f.path, f.options!.map((o) => o.value)]));
    const representative = new Map<string, string>();
    for (const live of [...engine.getFieldPaths()].sort()) {
        const path = baseOf(live);
        if (!representative.has(path)) representative.set(path, live);
    }
    const out = new Map<string, Array<{ path: string; value: unknown }> | null>();
    const pending = new Map<string, string>();
    for (const field of plan.fields) {
        const live = representative.get(field.path);
        if (!field.conditional || !live) continue;
        if (engine.isPathRelevant(live)) out.set(field.path, []);
        else pending.set(field.path, live);
    }
    for (const [path, live] of pending) {
        const recipe = revealSearch(engine, live, optionValues);
        if (!recipe) {
            out.set(path, null);
            continue;
        }
        try {
            // One answer can reveal a whole section. Reuse it only for fields the engine actually opened.
            for (const [other, instance] of pending) {
                if (!engine.isPathRelevant(instance)) continue;
                out.set(other, recipe.map(step => ({ path: step.path, value: Array.isArray(step.value) ? [...step.value] : step.value })));
                pending.delete(other);
            }
        } finally {
            for (const step of [...recipe].reverse()) engine.setValue(step.path, step.previous);
        }
    }
    return out;
}
