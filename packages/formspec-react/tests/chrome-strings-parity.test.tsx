/** @filedesc Locale §3.1.10: every React chrome string comes from the shared inventory and follows a locale switch. */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { UI_STRINGS } from '@formspec-org/layout';
import { initFormspecEngine, createFormEngine } from '@formspec-org/engine';
import { FormspecForm } from '../src/renderer';
import { actRender } from './render-utils';

beforeAll(async () => {
    await initFormspecEngine();
});

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every source file under `src`, recursively. */
function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

describe('the React renderer draws its own words from the shared inventory', () => {
    const files = sourceFiles(SRC);

    it('consumes only declared $ui keys, and lists them', () => {
        const consumed = new Set<string>();
        for (const file of files) {
            const source = readFileSync(file, 'utf8');
            for (const match of source.matchAll(/chrome(?:Text)?\((?:engine,\s*)?'([a-zA-Z.]+)'/g)) {
                consumed.add(match[1]);
            }
        }
        // Every key the renderer asks for exists in the closed inventory (Locale §3.1.10).
        for (const key of consumed) expect(UI_STRINGS, key).toHaveProperty(key);
        // The list itself, so a key leaving the renderer is visible in the diff. The repeat renderer also
        // picks between `repeat.row`, `repeat.rowOf` and `repeat.rowNamed` through a variable, so that
        // third key is resolved the same way without appearing as a literal here.
        expect([...consumed].sort()).toEqual([
            'alert.dismiss',
            'money.amount',
            'repeat.add',
            'repeat.remove',
            'repeat.row',
            'repeat.rowOf',
            'select.clearSelection',
            'select.placeholder',
            'select.selectedValues',
            'signature.canvas',
            'signature.clear',
        ]);
    });

    it('reads the inventory through one module, so every site follows the engine', () => {
        const importers = files
            .filter((file) => /\bUI_STRINGS\b/.test(readFileSync(file, 'utf8')))
            .map((file) => file.slice(SRC.length + 1));
        expect(importers).toEqual(['use-chrome-text.ts']);
    });
});

describe('a locale switch changes the renderer’s own words', () => {
    const definition = {
        $formspec: '1.0', url: 'urn:test:chrome', version: '1.0.0', title: 'Chrome',
        items: [
            { key: 'colour', type: 'field', dataType: 'choice', label: 'Colour', options: [{ value: 'r', label: 'Red' }] },
            { key: 'fee', type: 'field', dataType: 'money', label: 'Fee' },
            { key: 'sig', type: 'field', dataType: 'string', label: 'Signature', presentation: { widgetHint: 'Signature' } },
        ],
    };

    it('re-resolves the select placeholder, money placeholder and signature button', () => {
        const engine = createFormEngine(definition);
        engine.loadLocale({
            $formspecLocale: '2.0', locale: 'fr', version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:chrome' },
            strings: {
                '$ui.select.placeholder': 'Choisir…',
                '$ui.money.amount': 'Montant',
                '$ui.signature.clear': 'Effacer',
            },
        });
        const container = actRender(<FormspecForm engine={engine} />);

        expect(container.querySelector('option[hidden]')?.textContent).toBe(UI_STRINGS['select.placeholder']);

        act(() => { engine.setLocale('fr'); });

        expect(container.querySelector('option[hidden]')?.textContent).toBe('Choisir…');
        expect(container.querySelector('input[inputmode="decimal"]')?.getAttribute('placeholder')).toBe('Montant');
        expect(container.querySelector('.formspec-signature-clear')?.textContent).toBe('Effacer');
    });
});
