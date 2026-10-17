/** @filedesc The FileUpload field, run through every registered adapter, has no axe violations: a drop zone is never an interactive role around a control. */
import axe from 'axe-core';
import { globalRegistry } from '@formspec-org/webcomponent';
import { describe, expect, it } from 'vitest';
import { tailwindAdapter } from '../src/tailwind/index';
import { uswdsAdapter } from '../src/uswds/index';
import { mockAdapterContext, mockFileUpload } from './helpers';

globalRegistry.registerAdapter(uswdsAdapter);
globalRegistry.registerAdapter(tailwindAdapter);

describe('FileUpload through every registered adapter (axe, WCAG A/AA)', () => {
    it('registers the adapters this package ships', () => {
        expect(globalRegistry.adapterNames).toEqual(expect.arrayContaining(['default', 'uswds', 'tailwind']));
    });

    for (const name of ['default', 'uswds', 'tailwind']) {
        it(`${name}: no violations, and no drop target holds a control inside an interactive role`, async () => {
            const render = globalRegistry.resolveAdapterFn('FileUpload', name)!;
            const parent = document.createElement('div');
            document.body.appendChild(parent);
            render(mockFileUpload({ dragDrop: true, accept: '.pdf', files: () => [] } as never), parent, mockAdapterContext());
            for (const holder of parent.querySelectorAll('[role="button"], [role="link"]')) {
                expect(holder.querySelector('input, button, a[href], [tabindex]'), `${name}: ${holder.className}`).toBeNull();
            }
            const results = await axe.run(parent, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], rules: { 'color-contrast': { enabled: false } } });
            expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
            parent.remove();
        });
    }
});
