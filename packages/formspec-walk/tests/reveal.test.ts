/** @filedesc Reveal recipes enable their drivers, use typed choices, and undo dead ends. */
import { beforeAll, expect, it } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { revealSearch } from '../src/reveal';

beforeAll(async () => { await initFormspecEngine(); });

it('reveals an initially hidden multiple choice before using its selected option', () => {
    const engine = createFormEngine({
        $formspec: '1.0', url: 'urn:test:chained-reveal', version: '1.0.0', title: 'Chained reveal',
        items: [
            { key: 'enabled', type: 'field', dataType: 'boolean', label: 'Enabled' },
            { key: 'picks', type: 'field', dataType: 'multiChoice', label: 'Pick',
                options: [{ value: 'first', label: 'First' }, { value: 'other', label: 'Other' }] },
            { key: 'detail', type: 'field', dataType: 'string', label: 'Detail' },
            { key: 'never', type: 'field', dataType: 'string', label: 'Never' },
        ],
        binds: [
            { path: 'picks', relevant: '$enabled = true' },
            { path: 'detail', relevant: "selected($picks, 'other')" },
            { path: 'never', relevant: "selected($picks, 'absent')" },
        ],
    });
    const before = engine.getResponse().data;
    expect(revealSearch(engine, 'never', {})).toBeNull();
    expect(engine.getResponse().data).toEqual(before);
    expect(revealSearch(engine, 'detail', {})?.map(({ path, value }) => [path, value])).toEqual([
        ['enabled', true], ['picks', ['other']],
    ]);
    expect(engine.isPathRelevant('detail')).toBe(true);
});
