/** @filedesc USWDS display adapter smoke tests. */
import { describe, it, expect, vi } from 'vitest';
import type { DisplayComponentBehavior } from '@formspec-org/webcomponent';
import { renderUSWDSAlert, renderUSWDSBadge, renderUSWDSCard, renderUSWDSHeading, renderUSWDSText } from '../../src/uswds/display-components';
import { mockAdapterContext } from '../helpers';

function mockHost(): DisplayComponentBehavior['host'] {
    return {
        engine: {} as any,
        prefix: '',
        cleanupFns: [],
        watchCompText: (_c, _p, fb, write) => write(fb),
        renderComponent: vi.fn(),
        resolveToken: (v) => v,
        findItemByKey: () => null,
        resolveValidationTarget: () =>
            ({ path: '', label: '', formLevel: true, jumpable: false } as any),
        focusField: () => false,
        latestSubmitDetailSignal: { value: null } as any,
        touchedVersion: { value: 0 } as any,
    };
}

describe('USWDS display', () => {
    it('renderUSWDSHeading wraps in usa-prose', () => {
        const parent = document.createElement('div');
        const behavior: DisplayComponentBehavior = {
            comp: { text: 'Hi', level: 2 },
            host: mockHost(),
        };
        renderUSWDSHeading(behavior, parent, mockAdapterContext());
        expect(parent.querySelector('.usa-prose .formspec-heading')).toBeTruthy();
        expect(parent.querySelector('.formspec-uswds-heading-wrap')?.className).toContain('margin-bottom-2');
        expect(parent.querySelector('h2')?.className).toContain('margin-top-0');
        expect(parent.querySelector('h2')?.textContent).toBe('Hi');
    });

    it('renderUSWDSCard uses usa-card structure', () => {
        const parent = document.createElement('div');
        const behavior: DisplayComponentBehavior = {
            comp: { title: 'T', children: [] },
            host: mockHost(),
        };
        renderUSWDSCard(behavior, parent, mockAdapterContext());
        expect(parent.querySelector('.usa-card .usa-card__heading')?.textContent).toBe('T');
    });

    it('renderUSWDSAlert uses usa-alert body', () => {
        const parent = document.createElement('div');
        const behavior: DisplayComponentBehavior = {
            comp: { text: 'Msg', severity: 'info' },
            host: mockHost(),
        };
        renderUSWDSAlert(behavior, parent, mockAdapterContext());
        expect(parent.querySelector('.margin-y-2 > .usa-alert')).toBeTruthy();
        expect(parent.querySelector('.usa-alert.usa-alert--info .usa-alert__text')?.textContent).toBe('Msg');
    });

    it('renderUSWDSText removes the default prose top margin from paragraphs', () => {
        const parent = document.createElement('div');
        const behavior: DisplayComponentBehavior = {
            comp: { text: 'Body copy' },
            host: mockHost(),
        };
        renderUSWDSText(behavior, parent, mockAdapterContext());
        expect(parent.querySelector('.usa-prose p')?.className).toContain('margin-top-0');
    });

    it('renderUSWDSBadge uses usa-tag', () => {
        const parent = document.createElement('div');
        const behavior: DisplayComponentBehavior = {
            comp: { text: 'New', variant: 'success' },
            host: mockHost(),
        };
        renderUSWDSBadge(behavior, parent, mockAdapterContext());
        const tag = parent.querySelector('.usa-tag');
        expect(tag?.textContent).toBe('New');
        expect(tag?.className).toContain('formspec-uswds-tag--success');
    });

    it.each([
        ['Text', renderUSWDSText, '.usa-prose p'],
        ['Heading', renderUSWDSHeading, 'h2'],
        ['Alert', renderUSWDSAlert, '.usa-alert__text'],
        ['Badge', renderUSWDSBadge, '.usa-tag'],
    ] as const)('renderUSWDS%s writes live text from host.watchCompText (display Item Locale/{{}})', (_name, renderFn, selector) => {
        const parent = document.createElement('div');
        let writeText: (text: string) => void = () => {};
        const host = mockHost();
        host.watchCompText = (_c, prop, fallback, write) => {
            expect(prop).toBe('text');
            writeText = write;
            write(fallback);
        };
        renderFn({ comp: { text: 'Hello {{$name}}' }, host }, parent, mockAdapterContext());
        expect(parent.querySelector(selector)?.textContent).toBe('Hello {{$name}}');

        writeText('Hello Ada');
        expect(parent.querySelector(selector)?.textContent).toBe('Hello Ada');
    });
});
