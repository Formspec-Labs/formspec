/** @filedesc Reusable FormEngine fixture factories for webcomponent unit tests. */
import type { ThemeDocument, PresentationBlock } from '@formspec-org/layout';

/**
 * Minimal valid Formspec definition with a single string field.
 * Override any property via the `overrides` param.
 */
export function singleFieldDef(overrides?: Record<string, any>, bind?: Record<string, unknown>) {
    return {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test Form',
        ...(bind && { binds: [{ path: overrides?.key ?? 'name', ...bind }] }),
        items: [
            {
                key: 'name',
                type: 'field',
                label: 'Name',
                dataType: 'string',
                ...overrides,
            },
        ],
    };
}

/** Definition with multiple fields for broader testing. */
export function multiFieldDef(fields: Array<Record<string, any>>) {
    return {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test Form',
        items: fields.map(f => ({
            key: f.key || 'field1',
            type: f.type || 'field',
            label: f.label || f.key || 'Field',
            dataType: f.dataType || 'string',
            ...f,
        })),
    };
}

/** Field definition with bind-level properties (required/relevant/readonly/calculate). */
export function boundFieldDef(binds: {
    required?: string | boolean;
    relevant?: string;
    readonly?: string | boolean;
    calculate?: string;
    constraint?: string;
    message?: string;
}) {
    return {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test Form',
        items: [
            {
                key: 'field1',
                type: 'field' as const,
                label: 'Field 1',
                dataType: 'string' as const,
                ...binds,
            },
        ],
    };
}

/** Repeatable group definition. */
export function repeatGroupDef() {
    return {
        $formspec: '1.0',
        url: 'urn:test:form',
        version: '1.0.0',
        title: 'Test Form',
        items: [
            {
                key: 'items',
                type: 'group' as const,
                label: 'Items',
                repeatable: true,
                children: [
                    {
                        key: 'name',
                        type: 'field' as const,
                        label: 'Item Name',
                        dataType: 'string' as const,
                    },
                ],
            },
        ],
    };
}

/** Wrap a component tree in a minimal component document. */
export function minimalComponentDoc(tree: any, extras?: Record<string, any>) {
    return {
        $formspecComponent: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        tree,
        ...extras,
    };
}

/** Create a minimal theme document with optional overrides. */
export function minimalTheme(overrides?: Partial<ThemeDocument>): ThemeDocument {
    return {
        $formspecTheme: '1.0',
        version: '1.0.0',
        targetDefinition: { url: 'urn:test:form' },
        ...overrides,
    };
}
