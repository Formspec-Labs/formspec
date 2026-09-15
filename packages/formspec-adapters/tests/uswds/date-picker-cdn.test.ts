/** @filedesc window.uswdsPresent branch — a host-loaded USWDS CDN bundle already runs body-level
 * delegated listeners for every usa-date-picker; the adapter must enhance (init) without also attaching
 * a second listener set (on/add), or a calendar-button click double-fires (see src/uswds/date-picker.ts). */
import { describe, it, expect, afterEach, vi } from 'vitest';

const onSpy = vi.fn();
const offSpy = vi.fn();
const initSpy = vi.fn();

// Minimal stand-in for usa-date-picker/src/index.js's `behavior()` export: real `on` = init + add
// (uswds-core/src/js/utils/behavior.js), so this mock's `on` calls `init` too, matching that shape.
vi.mock('@uswds/uswds/js/usa-date-picker', () => {
    const markEnhanced = (root: ParentNode) => {
        const input = (root as HTMLElement).querySelector('input');
        input?.classList.add('usa-date-picker__external-input');
    };
    const mod = {
        on: (root: ParentNode) => { onSpy(root); markEnhanced(root); },
        off: offSpy,
        init: (root: ParentNode) => { initSpy(root); markEnhanced(root); },
        setCalendarValue: vi.fn(),
    };
    return { default: mod };
});

import { renderDatePicker } from '../../src/uswds/date-picker';
import { mockDatePicker, mockAdapterContext } from '../helpers';

function makeParent(): HTMLElement { return document.createElement('div'); }

describe('USWDS DatePicker — window.uswdsPresent (host-loaded USWDS CDN bundle)', () => {
    afterEach(() => {
        delete (window as any).uswdsPresent;
        onSpy.mockClear();
        offSpy.mockClear();
        initSpy.mockClear();
    });

    it('calls only init(), never on(), when window.uswdsPresent is set', async () => {
        (window as any).uswdsPresent = true;
        const parent = makeParent();
        renderDatePicker(mockDatePicker(), parent, mockAdapterContext());

        await vi.waitFor(() => expect(initSpy).toHaveBeenCalledTimes(1));
        expect(onSpy).not.toHaveBeenCalled();
    });

    it('calls on() when window.uswdsPresent is not set (we own enhancement and listeners)', async () => {
        const parent = makeParent();
        renderDatePicker(mockDatePicker(), parent, mockAdapterContext());

        await vi.waitFor(() => expect(onSpy).toHaveBeenCalledTimes(1));
    });
});
