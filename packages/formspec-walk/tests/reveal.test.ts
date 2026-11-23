/** @filedesc Reveal recipes enable their drivers, use typed choices, and undo dead ends. */
import { beforeAll, expect, it } from 'vitest';
import { createFormEngine, initFormspecEngine } from '@formspec-org/engine';
import { intentionallyHidden, revealSearch } from '../src/reveal';

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

it('requires an effective literal false bind before classifying a descendant as intentionally hidden', () => {
    const locked = { path: 'rows[*].subgroup', relevant: 'false' };
    const target = 'rows[0].subgroup.child';
    expect(intentionallyHidden(target, [locked, { path: locked.path, disabledDisplay: 'hidden' }])).toBe(true);
    expect(intentionallyHidden(target, [locked, { path: locked.path, relevant: '$open' }])).toBe(false);
    expect(intentionallyHidden(target, [locked, { path: locked.path, disabledDisplay: 'protected' }])).toBe(false);
    expect(intentionallyHidden(target, [locked, { path: 'rows[@index = 1].subgroup', relevant: 'true' }])).toBe(false);
});

it('keeps an ancestor relevant while adding a different option for its descendant', () => {
    const engine = createFormEngine({
        $formspec: '1.0', url: 'urn:test:nested-choice', version: '1.0.0', title: 'Nested choices',
        items: [
            { key: 'picks', type: 'field', dataType: 'multiChoice', label: 'Pick',
                options: [{ value: 'first', label: 'First' }, { value: 'detail', label: 'Detail' }] },
            { key: 'group', type: 'group', label: 'Group', children: [
                { key: 'detail', type: 'field', dataType: 'string', label: 'Detail' },
                { key: 'never', type: 'field', dataType: 'string', label: 'Never' },
            ] },
        ],
        binds: [
            { path: 'group', relevant: "selected($picks, 'first')" },
            { path: 'group.detail', relevant: "selected($picks, 'detail')" },
            { path: 'group.never', relevant: "selected($picks, 'absent')" },
        ],
    });
    const before = engine.getDraftSnapshot().data;
    expect(revealSearch(engine, 'group.never', {})).toBeNull();
    expect(engine.getDraftSnapshot().data).toEqual(before);
    expect(revealSearch(engine, 'group.detail', {})).not.toBeNull();
    expect(engine.getDraftSnapshot().data.picks).toEqual(['first', 'detail']);
    expect(engine.isPathRelevant('group.detail')).toBe(true);
});

it('revisits an earlier valid choice when the next rule has no solution under it', () => {
    const engine = createFormEngine({
        $formspec: '1.0', url: 'urn:test:reveal-backtrack', version: '1.0.0', title: 'Backtrack',
        items: [
            { key: 'mode', type: 'field', dataType: 'choice', label: 'Mode',
                options: [{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }] },
            { key: 'prepared', type: 'field', dataType: 'string', label: 'Prepared' },
            { key: 'group', type: 'group', label: 'Group', children: [
                { key: 'detail', type: 'field', dataType: 'string', label: 'Detail' },
            ] },
        ],
        binds: [
            { path: 'group', relevant: "$mode = 'first' or $mode = 'second'" },
            { path: 'prepared', calculate: "if($mode = 'second', 'yes', 'no')" },
            { path: 'group.detail', relevant: "$prepared = 'yes'" },
        ],
    });
    expect(revealSearch(engine, 'group.detail', {})).not.toBeNull();
    expect(engine.getDraftSnapshot().data.mode).toBe('second');
});
