/** @filedesc UI_STRINGS inventory: parity with the Locale schema's ChromeStringKey enum, and fillUiParams substitution. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { UI_STRINGS, fillUiParams } from '../src/index.js';

const schemaPath = fileURLToPath(new URL('../../../schemas/locale.schema.json', import.meta.url));
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

describe('UI_STRINGS parity with the Locale schema ChromeStringKey enum', () => {
    it('is one-for-one with schemas/locale.schema.json $defs.ChromeStringKey', () => {
        const enumKeys: string[] = schema.$defs.ChromeStringKey.enum;
        const suffixes = enumKeys.map((key) => key.replace(/^\$ui\./, ''));
        expect(new Set(Object.keys(UI_STRINGS))).toEqual(new Set(suffixes));
    });

    it('keeps the normative chrome table and generated lint mirror in parity', () => {
        const spec = readFileSync(new URL('../../../specs/locale/locale-spec.md', import.meta.url), 'utf8');
        const table = spec.split('| Key suffix | English default | Parameters |')[1].split('\n\nParameters are renderer-supplied')[0];
        const rows = [...table.matchAll(/^\| `([^`]+)` \| `([^`]+)` \|/gm)].map(match => [match[1], match[2]]);
        expect(Object.fromEntries(rows)).toEqual(UI_STRINGS);
        expect(rows.length).toBe(Object.keys(UI_STRINGS).length);
        const mirror = JSON.parse(readFileSync(new URL('../../../crates/formspec-lint/schemas/locale.schema.json', import.meta.url), 'utf8'));
        expect(mirror).toEqual(schema);
    });

    it('every enum entry carries the $ui. prefix', () => {
        const enumKeys: string[] = schema.$defs.ChromeStringKey.enum;
        for (const key of enumKeys) {
            expect(key.startsWith('$ui.')).toBe(true);
        }
    });
});

describe('fillUiParams', () => {
    it('substitutes {{$name}} literally, no FEL evaluation', () => {
        expect(fillUiParams('Add {{$label}}', { label: 'Jobs' })).toBe('Add Jobs');
        expect(fillUiParams('{{$label}} {{$index}} of {{$total}}', { label: 'Job', index: 1, total: 3 }))
            .toBe('Job 1 of 3');
    });

    it('leaves an unmatched placeholder as-is', () => {
        expect(fillUiParams('{{$count}} characters left', {})).toBe('{{$count}} characters left');
    });

    it('is a no-op without params', () => {
        expect(fillUiParams('Next')).toBe('Next');
    });
});
