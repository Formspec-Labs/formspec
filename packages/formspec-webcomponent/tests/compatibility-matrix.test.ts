import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { COMPATIBILITY_MATRIX } from '@formspec-org/types';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach(el => el.remove());
});

describe('core input compatibility matrix', () => {
    it('emits warnings only for unsupported dataType/component pairs', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const coreInputComponents = [
            'TextInput',
            'NumberInput',
            'DatePicker',
            'Select',
            'CheckboxGroup',
            'Toggle',
        ];

        const dataTypes = [
            'string',
            'text',
            'decimal',
            'integer',
            'boolean',
            'date',
            'dateTime',
            'time',
            'uri',
            'choice',
            'multiChoice',
            'attachment',
            'money',
        ];

        const compatibility: Record<string, readonly string[]> = Object.fromEntries(
            Object.entries(COMPATIBILITY_MATRIX).map(([dataType, components]) => [
                dataType,
                components.filter((component) => coreInputComponents.includes(component)),
            ]),
        );

        for (const dataType of dataTypes) {
            for (const component of coreInputComponents) {
                const warningsBefore = warn.mock.calls.length;
                const child: Record<string, unknown> = { component, bind: 'field' };
                if (component === 'Select' && dataType === 'multiChoice') {
                    child.multiple = true;
                }

                const el = document.createElement('formspec-render') as any;
                document.body.appendChild(el);
                el.componentDocument = {
                    $formspecComponent: '1.0',
                    version: '1.0.0',
                    targetDefinition: { url: 'urn:test:form' },
                    tree: {
                        component: 'Section',
                        children: [child],
                    },
                };
                el.definition = {
                    $formspec: '1.0',
                    url: 'urn:test:form',
                    version: '1.0.0',
                    title: 'Matrix Test',
                    items: [
                        {
                            key: 'field',
                            type: 'field',
                            dataType,
                            label: 'Field',
                            options: [
                                { value: 'a', label: 'A' },
                                { value: 'b', label: 'B' },
                            ],
                        },
                    ],
                };
                el.render();

                const compatible = compatibility[dataType]?.includes(component) ?? false;
                const newCalls = warn.mock.calls.slice(warningsBefore);
                const hasPairWarning = newCalls.some((args) =>
                    typeof args[0] === 'string' &&
                    args[0].includes(`Incompatible component ${component} for dataType ${dataType}.`),
                );

                if (compatible) {
                    expect(hasPairWarning, `${component}/${dataType} should NOT warn`).toBe(false);
                } else {
                    expect(hasPairWarning, `${component}/${dataType} should warn`).toBe(true);
                }

                el.remove();
            }
        }

        warn.mockRestore();
    });

    it('warns when Select is bound to multiChoice without multiple=true', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const el = document.createElement('formspec-render') as any;
        document.body.appendChild(el);
        el.componentDocument = {
            $formspecComponent: '1.0',
            version: '1.0.0',
            targetDefinition: { url: 'urn:test:form' },
            tree: {
                component: 'Section',
                children: [{ component: 'Select', bind: 'field' }],
            },
        };
        el.definition = {
            $formspec: '1.0',
            url: 'urn:test:form',
            version: '1.0.0',
            title: 'Matrix Test',
            items: [
                {
                    key: 'field',
                    type: 'field',
                    dataType: 'multiChoice',
                    label: 'Field',
                    options: [
                        { value: 'a', label: 'A' },
                        { value: 'b', label: 'B' },
                    ],
                },
            ],
        };
        el.render();

        expect(warn.mock.calls.some((args) =>
            typeof args[0] === 'string'
            && args[0].includes('Incompatible component Select for dataType multiChoice.'),
        )).toBe(true);
        el.remove();
        warn.mockRestore();
    });
});
