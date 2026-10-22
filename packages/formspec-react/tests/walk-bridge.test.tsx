/** @filedesc React FormspecForm exposes the @formspec-org/walk DOM inspection contract on .formspec-container. */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import React, { act } from 'react';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender, settleAct } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const definition = {
    $formspec: '1.0',
    url: 'urn:test:walk-bridge',
    version: '1.0.0',
    title: 'Walk Bridge Form',
    items: [
        {
            key: 'fullName',
            type: 'field',
            dataType: 'string',
            label: 'Full Name',
        },
    ],
    binds: [{ path: 'fullName', required: 'true' }],
};

describe('FormspecForm — @formspec-org/walk DOM inspection contract', () => {
    it('exposes .engine on .formspec-container matching the active IFormEngine', () => {
        const engine = createFormEngine(definition);
        const host = actRender(<FormspecForm engine={engine} />);
        const container = host.querySelector('.formspec-container') as any;

        expect(container).toBeTruthy();
        expect(container.engine).toBe(engine);
    });

    it('supports setting .locale on .formspec-container, declarative initial locale, and engine.setLocale() syncing lang/dir attributes', () => {
        const engine = createFormEngine(definition);
        engine.loadLocale({
            $formspecLocale: '2.0',
            version: '1.0.0',
            locale: 'es-US',
            target: { kind: 'definition', url: definition.url },
            strings: {
                '$form.title': 'Formulario',
                'fullName.label': 'Nombre completo',
            },
        });

        engine.setLocale('es-US');
        const host = actRender(<FormspecForm engine={engine} />);
        const container = host.querySelector('.formspec-container') as any;

        expect(container.hasAttribute('data-formspec-render-root')).toBe(true);
        expect(container.locale).toBe('es-US');
        expect(container.getAttribute('lang')).toBe('es-US');
        expect(container.getAttribute('dir')).toBe('ltr');

        act(() => {
            container.locale = '';
        });
        expect(container.locale).toBe('');
        expect(container.getAttribute('lang')).toBeNull();

        act(() => {
            engine.setLocale('es-US');
        });
        expect(container.locale).toBe('es-US');
        expect(container.getAttribute('lang')).toBe('es-US');
        expect(container.getAttribute('dir')).toBe('ltr');
    });

    it('reacts to show-validation-summary attribute, focuses the first invalid field, and populates jump links on el.submit({ emitEvent: false }) without firing onSubmit', async () => {
        const engine = createFormEngine(definition);
        const onSubmit = vi.fn();
        const host = actRender(<FormspecForm engine={engine} onSubmit={onSubmit} />);
        const container = host.querySelector('.formspec-container') as any;

        // Before setting show-validation-summary or submitting, no summary links are rendered
        expect(container.querySelector('.formspec-validation-summary')).toBeNull();

        await act(async () => {
            container.setAttribute('show-validation-summary', '');
            await new Promise((r) => setTimeout(r, 10));
        });
        await settleAct();

        let submitResult: any;
        act(() => {
            submitResult = container.submit({ emitEvent: false });
        });

        expect(onSubmit).not.toHaveBeenCalled();
        expect(submitResult.validationReport?.valid).toBe(false);

        const input = container.querySelector<HTMLInputElement>('input[name="fullName"]');
        expect(input).toBeTruthy();
        expect(document.activeElement).toBe(input);

        const summary = container.querySelector('.formspec-validation-summary');
        expect(summary).toBeTruthy();

        const link = container.querySelector<HTMLAnchorElement>('a.formspec-validation-summary-link');
        expect(link).toBeTruthy();
        expect(link?.textContent).toMatch(/^Full Name: /);
        expect(link?.getAttribute('href')).toBe('#' + input!.id);
    });

    it('resolves through DEFAULT_WALK_ROOT_SELECTOR and satisfies Walk.open + walk.state() + walk.live()', async () => {
        const { Walk, DEFAULT_WALK_ROOT_SELECTOR } = await import('@formspec-org/walk');
        const engine = createFormEngine(definition);
        engine.loadLocale({
            $formspecLocale: '2.0',
            version: '1.0.0',
            locale: 'es-US',
            target: { kind: 'definition', url: definition.url },
            strings: {
                '$form.title': 'Formulario',
                'fullName.label': 'Nombre completo',
            },
        });

        const host = actRender(<FormspecForm engine={engine} />);
        const container = host.querySelector(DEFAULT_WALK_ROOT_SELECTOR) as HTMLElement;
        expect(container).toBeTruthy();
        if (typeof (container as any).checkVisibility !== 'function') {
            for (const node of host.querySelectorAll<HTMLElement>('[data-name]')) {
                (node as any).checkVisibility = () => true;
            }
        }

        const pageStub: any = {
            locator: (sel: string) => ({
                count: async () => host.querySelectorAll(sel).length,
            }),
            waitForSelector: async (sel: string) => {
                expect(host.querySelector(sel)).toBeTruthy();
            },
            waitForTimeout: async () => {
                await settleAct();
            },
            evaluate: async (fn: any, arg: any) => {
                let out: any;
                await act(async () => {
                    out = fn(arg);
                    await new Promise((r) => setTimeout(r, 10));
                });
                await settleAct();
                return out;
            },
        };
        const srStub = {
            start: async () => {},
            stop: async () => {},
            next: async () => false,
            spokenPhraseLog: async () => [],
            clearSpokenPhraseLog: async () => {},
        };

        const walk = await Walk.open(pageStub, {
            locale: 'es-US',
            screenReader: srStub,
        });
        expect(container.hasAttribute('show-validation-summary')).toBe(true);
        expect((container as any).locale).toBe('es-US');

        const liveField = await walk.live('fullName');
        expect(liveField).toEqual({
            path: 'fullName',
            relevant: true,
            required: true,
            readonly: false,
            empty: true,
            inDom: true,
        });
    });
});
