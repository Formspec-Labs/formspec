/** @filedesc The generic walk: every check the plan asks for, over every wizard step, in one run. */
import type { Page } from '@playwright/test';
import { Walk, type FieldWant, type OpenOptions } from './checks.js';
import type { Plan, PlanField } from './plan.js';

export interface WalkReport {
    locale: string;
    steps: number;
    fields: number;
    revealed: number;
    repeats: number;
    summaryRows: number;
    uncovered: string[];
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
    const report: WalkReport = { locale: plan.locale, steps: 0, fields: 0, revealed: 0, repeats: 0, summaryRows: 0, uncovered: walk.uncovered, findings: walk.findings };
    for (const u of plan.uncovered) walk.uncover(u);
    const byBase = new Map(plan.fields.map((f) => [f.path, f]));
    const order = new Map(plan.fields.map((f, i) => [f.path, i]));
    const covered = new Set<string>();
    const everVisible = new Set<string>();

    for (let step = 0; step < 50; step += 1) {
        report.steps += 1;
        // Plan order, instances by index — the engine lists paths alphabetically.
        const live = (await walk.state())
            .filter((f) => order.has(baseOf(f.path)))
            .sort((a, b) => (order.get(baseOf(a.path))! - order.get(baseOf(b.path))!) || a.path.localeCompare(b.path, undefined, { numeric: true }));
        const visible = live.filter((f) => f.relevant && f.inDom);
        for (const f of visible) everVisible.add(f.path);

        // Every group heads its first visible field on this step.
        const groups = new Map<string, { label: Plan['groups'][number]['label']; firstField: string }>();
        for (const f of visible) for (const g of byBase.get(baseOf(f.path))!.groups) if (g.label.text && !groups.has(g.path)) groups.set(g.path, { label: g.label, firstField: f.path });
        await walk.readingOrder(visible.map((f) => ({ path: f.path, label: byBase.get(baseOf(f.path))!.label })), [...groups.values()]);

        await walk.tabOrder(visible.map((f) => f.path), Object.fromEntries(visible.map((f) => [f.path, fieldWant(byBase.get(baseOf(f.path))!)])));
        for (const f of visible) { covered.add(baseOf(f.path)); report.fields += 1; }

        if (!(await walk.nextStep())) break;
    }

    // Check changed states after the baseline traversal. A reveal can navigate to any section.
    const live = await walk.state();
    for (const field of plan.fields) {
        const instances = live.filter(f => baseOf(f.path) === field.path);
        if (field.conditional) {
            const hidden = instances.filter(f => !f.relevant).map(f => f.path);
            if (!instances.length) hidden.push(field.path);
            for (const path of hidden) {
                await walk.reveal(path, fieldWant(field));
                covered.add(field.path);
                report.revealed += 1;
            }
        } else if (!instances.length && field.repeatOf) {
            await walk.field(field.path, fieldWant(field));
            covered.add(field.path);
            report.fields += 1;
        }
    }

    for (const g of plan.groups.filter(g => g.repeat?.addLabel)) {
        const r = g.repeat!;
        await walk.repeat(g.path, { rowName: r.rowName, addLabel: r.addLabel, removeLabel: r.removeLabel, maxRepeat: r.maxRepeat, shownBy: 'engine' });
        report.repeats += 1;
    }

    // One row per live field the walk saw — every instance of a repeat answers for itself.
    report.summaryRows = await walk.summary([...everVisible].map((path) => {
        const f = byBase.get(baseOf(path))!;
        return { path, label: f.label, message: f.requiredMessage };
    }));
    for (const f of plan.fields) if (!covered.has(f.path) && !walk.uncovered.some((u) => u.startsWith(`${f.path}:`))) walk.found(`${f.path}: never rendered on any step`);
    return report;
}

/** The one assertion: no findings. The message is the whole report, so a failure reads as a list. */
export function expectClean(report: WalkReport): void {
    const summary = `${report.locale}: ${report.steps} step(s), ${report.fields} fields, ${report.revealed} revealed, ${report.repeats} repeats, ${report.summaryRows} summary rows` +
        (report.uncovered.length ? `\nuncovered:\n  ${report.uncovered.join('\n  ')}` : '');
    if (report.findings.length) throw new Error(`${summary}\nfindings:\n  ${report.findings.join('\n  ')}`);
}
