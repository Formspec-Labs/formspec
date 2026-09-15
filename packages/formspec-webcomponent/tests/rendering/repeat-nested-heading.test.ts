/** @filedesc A group nested in a repeat row heads one level below the row, like a group nested in a group. */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let FormspecRender: any;

beforeAll(async () => {
    const mod = await import('../../src/index');
    FormspecRender = mod.FormspecRender;
    if (!customElements.get('formspec-render')) {
        customElements.define('formspec-render', FormspecRender);
    }
});

afterEach(() => {
    document.body.querySelectorAll('formspec-render').forEach((el) => el.remove());
});

function render(items: Record<string, unknown>[]) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    el.definition = {
        $formspec: '1.0',
        url: 'urn:test:repeat-nested-heading',
        version: '1.0.0',
        title: 'Nested headings',
        items,
    };
    el.render();
    return el as HTMLElement;
}

const hoursWorked = {
    key: 'hoursWorked',
    type: 'group',
    label: 'Enter the total number of hours and minutes you worked.',
    children: [
        { key: 'hours', type: 'field', dataType: 'integer', label: 'Hours' },
        { key: 'minutes', type: 'field', dataType: 'integer', label: 'Minutes' },
    ],
};

describe('heading depth inside a repeat row', () => {
    it('heads a nested group one level below the row, exactly as a group nested in a group', () => {
        const el = render([
            {
                key: 'jobs',
                type: 'group',
                label: 'Job',
                repeatable: true,
                minRepeat: 1,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }, hoursWorked],
            },
            { key: 'work', type: 'group', label: 'Work', children: [hoursWorked] },
        ]);

        const titles = [...el.querySelectorAll('.formspec-group-title')].map((h) => `${h.tagName}:${h.textContent}`);
        const inRow = titles.find((t) => t.endsWith('worked.'));
        const inGroup = titles.filter((t) => t.endsWith('worked.'))[1];
        const rowHeading = el.querySelector('.formspec-repeat-instance-label') as HTMLElement;

        // The row heading is at the repeat's own level; what sits inside a row is one deeper — the same
        // rule a group applies to its children (`childHeadingLevel`), so a nested group never reads as a
        // section of the page.
        expect(rowHeading).not.toBeNull();
        expect(inRow).toBe(inGroup);
        expect(inRow?.startsWith('H3:')).toBe(false);
    });
});
