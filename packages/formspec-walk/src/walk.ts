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
    const revealTried = new Set<string>();
    const repeatDone = new Set<string>();
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

        // Repeats whose rows are shown on this step.
        for (const g of plan.groups.filter((g) => g.repeat?.addLabel && !repeatDone.has(g.path))) {
            const first = visible.find((f) => baseOf(f.path).startsWith(`${g.path}.`));
            if (!first) continue;
            await walk.repeat(g.path, { rowName: g.repeat!.rowName, addLabel: g.repeat!.addLabel, removeLabel: g.repeat!.removeLabel, maxRepeat: g.repeat!.maxRepeat, firstField: first.path });
            repeatDone.add(g.path);
            report.repeats += 1;
        }

        for (const field of plan.fields.filter((f) => f.conditional && !covered.has(f.path))) {
            const target = live.find((f) => baseOf(f.path) === field.path && !f.inDom);
            if (!target || revealTried.has(target.path)) continue;
            const here = await walk.reveal(target.path, { ...fieldWant(field), shownBy: 'engine' }, { stay: true });
            if (!here) continue; // another step's field; tried again there
            revealTried.add(target.path);
            covered.add(field.path);
            report.revealed += 1;
        }

        if (!(await walk.nextStep())) break;
    }

    // Repeats inside a conditional group: shown by the values that reveal them, on whichever step holds them.
    for (const g of plan.groups.filter((g) => g.repeat?.addLabel && !repeatDone.has(g.path))) {
        const first = (await walk.state()).find((f) => baseOf(f.path).startsWith(`${g.path}.`));
        if (!first) continue;
        await walk.repeat(g.path, { rowName: g.repeat!.rowName, addLabel: g.repeat!.addLabel, removeLabel: g.repeat!.removeLabel, maxRepeat: g.repeat!.maxRepeat, firstField: first.path, shownBy: 'engine' });
        repeatDone.add(g.path);
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
