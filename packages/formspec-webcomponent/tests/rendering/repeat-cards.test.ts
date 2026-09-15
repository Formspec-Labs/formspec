/** @filedesc A theme RepeatCards widget routes the repeat's chrome to the card render; locks and rows are unchanged. */
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

/** Jobs repeat, 1..2 instances, one field per row. */
function jobsDefinition() {
    return {
        $formspec: '1.0',
        url: 'urn:test:jobs',
        version: '1.0.0',
        title: 'Jobs',
        items: [
            {
                key: 'jobs',
                type: 'group',
                label: 'Job',
                repeatable: true,
                minRepeat: 1,
                maxRepeat: 2,
                children: [{ key: 'employer', type: 'field', dataType: 'string', label: 'Employer' }],
            },
        ],
    };
}

function render(themeItems?: Record<string, unknown>, localeStrings?: Record<string, string>) {
    const el = document.createElement('formspec-render') as any;
    document.body.appendChild(el);
    if (themeItems) {
        el.themeDocument = { $formspecTheme: '1.0', version: '1.0.0', items: themeItems };
    }
    if (localeStrings) {
        el.localeDocuments = {
            $formspecLocale: '2.0',
            locale: 'en',
            version: '1.0.0',
            target: { kind: 'definition', url: 'urn:test:jobs' },
            strings: localeStrings,
        };
        el.locale = 'en';
    }
    el.definition = jobsDefinition();
    el.render();
    return { el: el as HTMLElement, engine: el.getEngine() };
}

const cards = (el: HTMLElement) => [...el.querySelectorAll('.formspec-card')];

describe('RepeatCards — default adapter', () => {
    it('draws one card per instance, headed by the row label', () => {
        const { el, engine } = render({ jobs: { widget: 'RepeatCards' } });

        expect(cards(el)).toHaveLength(1);
        expect(cards(el)[0].querySelector('.formspec-card-title')?.textContent).toBe('Job 1');
        expect(cards(el)[0].querySelector('input')).not.toBeNull();

        engine.addRepeatInstance('jobs');
        expect(cards(el)).toHaveLength(2);
        expect(cards(el)[1].querySelector('.formspec-card-title')?.textContent).toBe('Job 2');
    });

    it("draws the group's own title above the cards, distinct from each card's row title", () => {
        const { el } = render({ jobs: { widget: 'RepeatCards' } });
        const container = el.querySelector('.formspec-repeat[data-bind="jobs"]') as HTMLElement;
        const title = container.querySelector('.formspec-group-title') as HTMLElement;

        expect(title).not.toBeNull();
        expect(title.textContent).toBe('Job');
        // The group's own title sits above the list, never inside a card — a card's row heading is
        // `.formspec-card-title`, a separate element naming that one instance.
        expect(container.firstElementChild).toBe(title);
        expect(title.closest('.formspec-card')).toBeNull();
    });

    it('names each card for assistive technology even when the heading is suppressed', () => {
        const { el } = render({ jobs: { widget: 'RepeatCards' } }, { 'jobs.rowLabel': '' });
        const card = cards(el)[0];

        expect(card.getAttribute('role')).toBe('group');
        expect(card.getAttribute('aria-label')).toBe('Job 1 of 1');
        expect((card.querySelector('.formspec-card-title') as HTMLElement).hidden).toBe(true);
    });

    it('keeps the group fieldset render when the theme names no repeat presentation', () => {
        const { el } = render();

        expect(cards(el)).toHaveLength(0);
        expect(el.querySelectorAll('.formspec-repeat-instance')).toHaveLength(1);
    });

    it('hides Add at maxRepeat and drops Remove at minRepeat, exactly as the default chrome does', () => {
        const { el, engine } = render({ jobs: { widget: 'RepeatCards' } });
        const add = el.querySelector('.formspec-repeat-add') as HTMLElement;

        expect(add).not.toBeNull();
        expect(add.classList.contains('formspec-hidden')).toBe(false);
        expect(el.querySelectorAll('.formspec-repeat-remove')).toHaveLength(0);

        engine.addRepeatInstance('jobs');
        expect(add.classList.contains('formspec-hidden')).toBe(true);
        expect(el.querySelectorAll('.formspec-repeat-remove')).toHaveLength(2);
    });

    it('honors the theme widgetConfig Add and Remove locks', () => {
        const { el, engine } = render({
            jobs: { widget: 'RepeatCards', widgetConfig: { allowAdd: false, allowRemove: false } },
        });
        engine.addRepeatInstance('jobs');

        expect(cards(el)).toHaveLength(2);
        expect((el.querySelector('.formspec-repeat-add') as HTMLElement).classList.contains('formspec-hidden'))
            .toBe(true);
        expect(el.querySelectorAll('.formspec-repeat-remove')).toHaveLength(0);
    });

    it('adds and removes rows from the card affordances', () => {
        const { el, engine } = render({ jobs: { widget: 'RepeatCards' } });

        (el.querySelector('.formspec-repeat-add') as HTMLButtonElement).click();
        expect(cards(el)).toHaveLength(2);

        engine.setValue('jobs[1].employer', 'ACME');
        (el.querySelectorAll('.formspec-repeat-remove')[1] as HTMLButtonElement).click();
        expect(cards(el)).toHaveLength(1);
        expect(engine.getResponse().data.jobs).toHaveLength(1);
    });
});
