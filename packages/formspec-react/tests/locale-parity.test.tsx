/** @filedesc React locale parity with the engine locale surface used by renderers. */
import { beforeAll, describe, expect, it } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { FormspecProvider } from '../src/context';
import { useLocale } from '../src/use-locale';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'https://example.gov/forms/locale-parity',
    version: '1.0.0',
    status: 'active',
    title: 'Locale parity',
    items: [],
};

function renderLocaleHook(engine: ReturnType<typeof createFormEngine>) {
    const result = { current: null as ReturnType<typeof useLocale> | null };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function Inner() {
        result.current = useLocale();
        return null;
    }

    flushSync(() => {
        root.render(
            <FormspecProvider engine={engine}>
                <Inner />
            </FormspecProvider>,
        );
    });

    return { result, root, container };
}

describe('React locale parity', () => {
    it('mirrors engine active locale, loaded locales, and direction', () => {
        const engine = createFormEngine(definition);
        const { result, root, container } = renderLocaleHook(engine);

        flushSync(() => {
            result.current!.loadLocale({
                $formspecLocale: '1.0',
                version: '1.0.0',
                locale: 'ar',
                targetDefinition: { url: definition.url },
                strings: { '$form.title': 'طلب' },
            });
            result.current!.setLocale('ar');
        });

        expect(result.current!.activeLocale).toBe(engine.getActiveLocale());
        expect(result.current!.availableLocales).toContain('ar');
        expect(result.current!.availableLocales).toEqual(engine.getAvailableLocales());
        expect(result.current!.direction).toBe(engine.getLocaleDirection());

        root.unmount();
        container.remove();
    });
});
