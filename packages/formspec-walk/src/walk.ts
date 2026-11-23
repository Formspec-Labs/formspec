/** @filedesc The generic walk: every check the plan asks for, over every wizard step, in one run. */
import type { Page } from '@playwright/test';
import { Walk, type FieldWant, type OpenOptions } from './checks.js';
import { orderFieldPaths, type Plan, type PlanField } from './plan.js';

export interface WalkReport {
    locale: string;
    steps: number;
    fields: number;
    revealed: number;
    repeats: number;
    summaryRows: number;
    uncovered: string[];
    intentionallyHidden: string[];
    findings: string[];
}

const baseOf = (path: string) => path.replace(/\[\d+\]/g, '');

/** What the plan promises for one field, in the shape a check takes. */
export function fieldWant(f: PlanField): FieldWant {
    return { label: f.label, required: f.required, hint: f.hint, options: f.options?.map((o) => o.label) };
}

/**
 * Walk one rendered form against `plan`: per wizard step the reading order, the Tab order with every
 * visible field's checks, the repeats and the conditional reveals; then, once, the submit summary.
 */
export async function walkDefinition(page: Page, plan: Plan, options: OpenOptions): Promise<WalkReport> {
    const walk = await Walk.open(page, options);
    const report: WalkReport = { locale: plan.locale, steps: 0, fields: 0, revealed: 0, repeats: 0, summaryRows: 0,
        uncovered: walk.uncovered, intentionallyHidden: walk.intentionallyHidden, findings: walk.findings };
    for (const u of plan.uncovered) walk.uncover(u);
    const byBase = new Map(plan.fields.map((f) => [f.path, f]));
    const authoredPaths = [...byBase.keys()];
    const covered = new Set<string>();
    const everVisible = new Set<string>();

    while (await walk.previousStep()) { /* A form can open on a later authored tab. */ }
    do {
        report.steps += 1;
        const visible = orderFieldPaths(authoredPaths, (await walk.state()).filter(f => f.relevant && f.inDom).map(f => f.path));
        for (const path of visible) everVisible.add(path);

        // Every group heads its first visible field on this step.
        const groups = new Map<string, { label: Plan['groups'][number]['label']; firstField: string }>();
        for (const path of visible) for (const g of byBase.get(baseOf(path))!.groups) if (g.label.text && !groups.has(g.path)) groups.set(g.path, { label: g.label, firstField: path });
        await walk.readingOrder(visible.map(path => ({ path, label: byBase.get(baseOf(path))!.label })), [...groups.values()]);

        await walk.tabOrder(visible, Object.fromEntries(visible.map(path => [path, fieldWant(byBase.get(baseOf(path))!)])));
        for (const path of visible) { covered.add(baseOf(path)); report.fields += 1; }

    } while (await walk.nextStep());

    // Check changed states after the baseline traversal. A reveal can navigate to any section.
    const live = await walk.state();
    for (const field of plan.fields) {
        const instances = live.filter(f => baseOf(f.path) === field.path);
        if (field.conditional) {
            const hidden = instances.filter(f => !f.relevant).map(f => f.path);
            if (!instances.length) hidden.push(field.path);
            for (const path of hidden) {
                const result = await walk.reveal(path, fieldWant(field));
                if (result) {
                    covered.add(field.path);
                    if (result === 'revealed') report.revealed += 1;
                    else report.fields += 1;
                }
            }
        } else if (!instances.length && field.repeatOf) {
            if (await walk.field(field.path, fieldWant(field))) {
                covered.add(field.path);
                report.fields += 1;
            }
        }
    }

    for (const g of plan.groups.filter(g => g.repeat?.addLabel)) {
        const r = g.repeat!;
        if (await walk.repeat(g.path, { rowName: r.rowName, addLabel: r.addLabel, removeLabel: r.removeLabel, maxRepeat: r.maxRepeat })) report.repeats += 1;
    }

    // One row per live field the walk saw — every instance of a repeat answers for itself.
    report.summaryRows = await walk.summary([...everVisible].map((path) => {
        const f = byBase.get(baseOf(path))!;
        return { path, label: f.label, message: f.requiredMessage };
    }));
    const hidden = new Set(walk.intentionallyHidden.map(baseOf));
    for (const f of plan.fields) if (!covered.has(f.path) && !hidden.has(f.path) && ![...walk.uncovered, ...walk.findings].some(message => baseOf(message).startsWith(`${f.path}:`))) walk.found(`${f.path}: never rendered on any step`);
    return report;
}

/** The one assertion: no findings. The message is the whole report, so a failure reads as a list. */
export function expectClean(report: WalkReport): void {
    const summary = `${report.locale}: ${report.steps} step(s), ${report.fields} fields, ${report.revealed} revealed, ${report.repeats} repeats, ${report.summaryRows} summary rows` +
        (report.uncovered.length ? `\nuncovered:\n  ${report.uncovered.join('\n  ')}` : '');
    if (report.findings.length) throw new Error(`${summary}\nfindings:\n  ${report.findings.join('\n  ')}`);
}
