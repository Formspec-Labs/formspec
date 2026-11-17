/** @filedesc Playwright execution gate: skipped or undiscovered tests never establish a passing walk. */
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter';

export default class WalkReporter implements Reporter {
    private executed = 0;
    private executionExpected = true;
    onBegin(config: FullConfig, suite: Suite): void {
        this.executed = 0;
        this.executionExpected = !process.argv.includes('--list') && !(config.shard && suite.allTests().length === 0);
    }
    onTestEnd(_test: TestCase, result: TestResult): void {
        if (result.status !== 'skipped') this.executed += 1;
    }
    async onEnd(result: FullResult): Promise<{ status: FullResult['status'] } | void> {
        if (result.status === 'passed' && this.executionExpected && this.executed === 0) {
            console.error('formspec-walk: no tests executed; the walk failed');
            return { status: 'failed' };
        }
    }
    printsToStdio(): boolean { return false; }
}
