/** @filedesc Tests for the useScreener hook — FEL required evaluation and explicit routeType. */
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { initFormspecEngine } from '@formspec-org/engine';
import * as engineModule from '@formspec-org/engine';
import { useScreener, isItemRequired } from '../src/screener/use-screener';
import type { UseScreenerResult } from '../src/screener/types';

beforeAll(async () => {
    await initFormspecEngine();
});

afterEach(() => {
    vi.restoreAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────

function renderHook<T>(hookFn: () => T): { result: { current: T }; container: HTMLElement } {
    const result = { current: null as T };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    function HookConsumer() {
        result.current = hookFn();
        return null;
    }
    flushSync(() => root.render(<HookConsumer />));
    return { result, container };
}

// ── isItemRequired tests ──────────────────────────────────────────

describe('isItemRequired', () => {
    it('treats literal true as required', () => {
        expect(isItemRequired(
            { key: 'name' },
            { binds: [{ path: 'name', required: true }] },
            {},
        )).toBe(true);
    });

    it('treats literal string "true" as required', () => {
        expect(isItemRequired(
            { key: 'name' },
            { binds: [{ path: 'name', required: 'true' }] },
            {},
        )).toBe(true);
    });

    it('treats item.required = true as required regardless of binds', () => {
        expect(isItemRequired(
            { key: 'name', required: true },
            {},
            {},
        )).toBe(true);
    });

    it('evaluates FEL expression in required bind using the engine', () => {
        const screener = {
            items: [
                { key: 'awardType', label: 'Award Type' },
                { key: 'details', label: 'Details' },
            ],
            binds: [
                { path: 'details', required: "awardType = 'grant'" },
            ],
        };

        // When awardType is not 'grant', details should NOT be required
        expect(isItemRequired(
            { key: 'details' },
            screener,
            { awardType: 'loan' },
        )).toBe(false);

        // When awardType IS 'grant', details SHOULD be required
        expect(isItemRequired(
            { key: 'details' },
            screener,
            { awardType: 'grant' },
        )).toBe(true);
    });

    it('treats non-evaluable FEL as not-required (graceful fallback)', () => {
        expect(isItemRequired(
            { key: 'name' },
            { binds: [{ path: 'name', required: "$foo = 'bar'" }] },
            {},
        )).toBe(false);
    });
});

// ── routeType tests ──────────────────────────────────────────────

describe('useScreener routeType', () => {
    it('uses explicit routeType from the matched route definition', () => {
        const screenerDocument = {
            $formspecScreener: '1.0',
            url: 'urn:screener-test:gate',
            version: '1.0.0',
            title: 'Eligibility',
            items: [
                { key: 'eligible', label: 'Are you eligible?', dataType: 'choice', options: [{ value: 'yes' }, { value: 'no' }] },
            ],
            evaluation: [
                {
                    id: 'main',
                    strategy: 'first-match',
                    routes: [
                        { condition: "$eligible = 'yes'", target: 'urn:screener-test', routeType: 'internal' },
                        { condition: "$eligible = 'no'", target: 'https://example.com/denied', routeType: 'external' },
                    ],
                },
            ],
        };

        let capturedResult: UseScreenerResult['routeResult'] = null;
        const { result } = renderHook(() =>
            useScreener({
                screenerDocument,
                onRoute: (route, routeType) => {
                    capturedResult = { route, routeType };
                },
            }),
        );

        // Set answer and submit
        flushSync(() => result.current.setAnswer('eligible', 'no'));
        flushSync(() => result.current.submit());

        expect(capturedResult).not.toBeNull();
        expect(capturedResult!.routeType).toBe('external');
    });

    it('preserves plain-object route extensions from WASM matches', () => {
        const screenerDocument = {
            $formspecScreener: '1.0',
            url: 'urn:screener-test:gate',
            version: '1.0.0',
            title: 'Eligibility',
            items: [
                { key: 'eligible', label: 'Are you eligible?', dataType: 'choice', options: [{ value: 'yes' }, { value: 'no' }] },
            ],
            evaluation: [
                {
                    id: 'main',
                    strategy: 'first-match',
                    routes: [
                        { condition: "$eligible = 'yes'", target: 'urn:screener-test' },
                    ],
                },
            ],
        };

        let capturedResult: UseScreenerResult['routeResult'] = null;

        vi.spyOn(engineModule, 'wasmEvaluateScreenerDocument').mockReturnValue({
            overrides: {
                matched: [
                    {
                        target: 'urn:screener-test',
                        label: 'Eligible',
                        extensions: { audience: 'grant', allowFastTrack: true },
                    },
                ],
            },
            phases: [],
        } as any);

        const { result } = renderHook(() =>
            useScreener({
                screenerDocument,
                onRoute: (route, routeType) => {
                    capturedResult = { route, routeType };
                },
            }),
        );

        flushSync(() => result.current.setAnswer('eligible', 'yes'));
        flushSync(() => result.current.submit());

        expect(capturedResult).not.toBeNull();
        expect(capturedResult!.route.extensions).toEqual({
            audience: 'grant',
            allowFastTrack: true,
        });
    });

    it('degrades to a none route when WASM evaluation throws', () => {
        const screenerDocument = {
            $formspecScreener: '1.0',
            url: 'urn:screener-test:gate',
            version: '1.0.0',
            title: 'Eligibility',
            items: [
                { key: 'eligible', label: 'Are you eligible?', dataType: 'choice', options: [{ value: 'yes' }, { value: 'no' }] },
            ],
            evaluation: [
                {
                    id: 'main',
                    strategy: 'first-match',
                    routes: [
                        { condition: "$eligible = 'yes'", target: 'urn:screener-test' },
                    ],
                },
            ],
        };

        let capturedResult: UseScreenerResult['routeResult'] = null;

        vi.spyOn(engineModule, 'wasmEvaluateScreenerDocument').mockImplementation(() => {
            throw new Error('boom');
        });

        const { result } = renderHook(() =>
            useScreener({
                screenerDocument,
                onRoute: (route, routeType) => {
                    capturedResult = { route, routeType };
                },
            }),
        );

        flushSync(() => result.current.setAnswer('eligible', 'yes'));

        expect(() => {
            flushSync(() => result.current.submit());
        }).not.toThrow();
        expect(capturedResult).toEqual({
            route: { target: '' },
            routeType: 'none',
        });
    });
});

describe('native Determination acceptance', () => {
 it('preserves answers and answering state when native completion is refused', () => {
  const onRoute = vi.fn(); const onDetermination = vi.fn(() => ({status:'refused',reason:'expired'}));
  const screenerDocument = {$formspecScreener:'1.0',url:'urn:gate',version:'1.0.0',items:[{type:'field',key:'eligible',dataType:'boolean'}],binds:[{path:'eligible',required:'true'}],evaluation:[{id:'main',strategy:'first-match',routes:[{condition:'true',target:'surface:paper'}]}]};
  const {result}=renderHook(()=>useScreener({screenerDocument,onDetermination,onRoute} as any));
  flushSync(()=>result.current.setAnswer('eligible',false));flushSync(()=>result.current.submit());
  expect(onDetermination).toHaveBeenCalledOnce();expect(onRoute).not.toHaveBeenCalled();
  expect(result.current.answers.eligible).toBe(false);expect(result.current.state).toBe('answering');expect(result.current.routeResult).toBeNull();expect(result.current.errors.$completion).toBe('expired');
  flushSync(()=>result.current.skip());expect(result.current.skipped).toBe(false);
 });
});
