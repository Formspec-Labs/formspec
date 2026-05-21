import { describe, it, expect } from 'vitest';
import { ComponentRegistry } from '../src/registry';
import { registerDefaultComponents } from '../src/components';
import { globalRegistry } from '../src/registry';
import type { ComponentPlugin } from '../src/types';

describe('ComponentRegistry', () => {
    it('registers and retrieves a plugin', () => {
        const reg = new ComponentRegistry();
        const plugin: ComponentPlugin = {
            type: 'TestWidget',
            render: () => {},
        };
        reg.register(plugin);
        expect(reg.get('TestWidget')).toBe(plugin);
    });

    it('returns undefined for unregistered type', () => {
        const reg = new ComponentRegistry();
        expect(reg.get('NonExistent')).toBeUndefined();
    });

    it('re-registering same type replaces previous', () => {
        const reg = new ComponentRegistry();
        const first: ComponentPlugin = { type: 'W', render: () => {} };
        const second: ComponentPlugin = { type: 'W', render: () => {} };
        reg.register(first);
        reg.register(second);
        expect(reg.get('W')).toBe(second);
    });

    it('registerDefaultComponents populates all expected types', () => {
        // registerDefaultComponents() is called at module load in index.ts,
        // but we call it again here to be explicit — re-registration is idempotent.
        registerDefaultComponents();

        const expectedTypes = [
            // Layout
            'Section', 'Stack', 'Grid', 'Divider', 'Collapsible', 'Panel', 'Accordion', 'Modal', 'Popover',
            // Inputs
            'TextInput', 'NumberInput', 'Select', 'Toggle', 'DatePicker',
            'RadioGroup', 'CheckboxGroup', 'Slider', 'Rating', 'FileUpload', 'Signature', 'MoneyInput',
            // Display
            'Heading', 'Text', 'Card', 'Alert', 'Badge', 'ProgressBar', 'Summary', 'ValidationSummary',
            // Interactive (Wizard is driven by formPresentation.pageMode, not a plugin)
            'Tabs', 'SubmitButton',
            // Special
            'ConditionalGroup', 'DataTable',
        ];

        for (const type of expectedTypes) {
            expect(globalRegistry.get(type), `Missing default component: ${type}`).toBeDefined();
        }
        // Verify the test list is complete — no unaccounted registrations
        expect(globalRegistry.size).toBe(expectedTypes.length);
    });
});
