/** @filedesc Vitest setup — act-environment flag plus per-test React root cleanup. */
import { act } from 'react';
import { afterEach, vi } from 'vitest';

// Tell React's act() that this is a test environment
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Track every React root the tests create so afterEach can unmount them.
// Without cleanup, the 84+ roots created across this package's test files
// accumulate in document.body. During vitest worker teardown React emits
// warnings about leaked roots; vitest tries to forward them via its
// worker→main RPC; the worker dies mid-RPC and surfaces the run as
// `EnvironmentTeardownError: Closing rpc while "onUserConsoleLog" was pending`.
// Per-test unmount keeps the tree clean and the teardown silent.
const trackedRoots: Array<{ unmount: () => void }> = [];

vi.mock('react-dom/client', async (importOriginal) => {
    const actual = await importOriginal<typeof import('react-dom/client')>();
    return {
        ...actual,
        createRoot: (...args: Parameters<typeof actual.createRoot>) => {
            const root = actual.createRoot(...args);
            trackedRoots.push(root);
            return root;
        },
    };
});

afterEach(() => {
    act(() => {
        while (trackedRoots.length > 0) {
            const root = trackedRoots.pop();
            try {
                root?.unmount();
            } catch {
                // Root may already be unmounted by the test itself; ignore.
            }
        }
        document.body.innerHTML = '';
    });
});
