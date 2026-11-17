/** @filedesc Pass, failure, skip and collection errors exercised by the walk CLI tests. */
import { test, expect } from '@playwright/test';
test('pass', () => expect(true).toBe(true));
test('failure', () => expect(true).toBe(false));
test.skip('skip', () => {});
if (process.env.WALK_RUN_DUPLICATE) {
    test('duplicate', () => {});
    test('duplicate', () => {});
}
