/** @filedesc Preserve Playwright's execution verdict and optionally write per-form walk evidence. */
import { readFileSync, writeFileSync } from 'node:fs';
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestError, TestResult } from '@playwright/test/reporter';
import type { RendererCheckReport } from './axe.js';

function evidence<T>(result: TestResult, name: string): T | undefined {
    const attachment = result.attachments.find(item => item.name === name);
    if (!attachment) return;
    const bytes = attachment.body ?? (attachment.path && readFileSync(attachment.path));
    if (!bytes) throw new Error(`Missing contents of ${name} attachment`);
    return JSON.parse(bytes.toString()) as T;
}

function errorMessage(error: TestError): string {
    return error.message ?? error.value ?? String(error);
}

function summarize(test: TestCase, axeReports: RendererCheckReport[]) {
    const attempts = test.results.map(result => {
        const axe = evidence<RendererCheckReport>(result, 'formspec-axe');
        return {
            retry: result.retry, status: result.status, errors: result.errors.map(errorMessage),
            walk: evidence<{ findings: string[]; uncovered: string[] }>(result, 'formspec-walk'),
            axeIndex: axe && axeReports.push(axe) - 1,
        };
    });
    return { title: test.titlePath(), outcome: test.outcome(), attempts,
        axeRequested: test.annotations.some(a => a.type === 'formspec-axe') };
}

function formsIn(suite?: Suite) {
    type Form = { formId: string; tests: ReturnType<typeof summarize>[]; findings: Set<string>;
        uncovered: Set<string>; axe: RendererCheckReport[] };
    const forms = new Map<string, Form>();
    for (const test of suite?.allTests() ?? []) {
        const formId = test.annotations.find(a => a.type === 'formspec-form')?.description ?? test.location.file;
        const form: Form = forms.get(formId) ?? { formId, tests: [], findings: new Set(), uncovered: new Set(), axe: [] };
        forms.set(formId, form);
        const row = summarize(test, form.axe);
        form.tests.push(row);
        for (const a of test.annotations) if (a.type === 'formspec-uncovered' && a.description) form.uncovered.add(a.description);
        for (const attempt of row.attempts) {
            for (const finding of attempt.walk?.findings ?? []) form.findings.add(finding);
            for (const item of attempt.walk?.uncovered ?? []) form.uncovered.add(item);
        }
    }
    return [...forms.values()].map(form => ({ ...form, findings: [...form.findings], uncovered: [...form.uncovered] }));
}

export default class WalkReporter implements Reporter {
    private executed = 0;
    private executionExpected = true;
    private suite?: Suite;
    private errors: string[] = [];
    onBegin(config: FullConfig, suite: Suite): void {
        this.suite = suite;
        this.executed = 0;
        this.executionExpected = !process.argv.includes('--list') && !(config.shard && suite.allTests().length === 0);
    }
    onError(error: TestError): void { this.errors.push(errorMessage(error)); }
    onTestEnd(_test: TestCase, result: TestResult): void {
        if (result.status !== 'skipped') this.executed += 1;
    }
    async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | void> {
        let status = result.status;
        if (status === 'passed' && this.executionExpected && this.executed === 0) {
            const reason = 'formspec-walk: no tests executed; the walk failed';
            this.errors.push(reason);
            console.error(reason);
            status = 'failed';
        }
        if (process.env.FORMSPEC_WALK_SUMMARY) {
            try {
                const summary = { status, executed: this.executed, errors: this.errors, forms: formsIn(this.suite) };
                writeFileSync(process.env.FORMSPEC_WALK_SUMMARY, JSON.stringify(summary, null, 2) + '\n');
            } catch (error) {
                console.error('formspec-walk: could not write summary', error);
                return { status: 'failed' };
            }
        }
        if (status !== result.status) return { status };
    }
    printsToStdio(): boolean { return false; }
}
