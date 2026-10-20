import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planDefinitionFallback, resolvePageSequence } from '../src/index';
import { findItemAtPath } from '../src/planner-path-utils';
import type { LayoutNode, PlanContext } from '../src/types';

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../examples/grant-application/${path}`, import.meta.url), 'utf8'));
const definition = read('definition.json');
const theme = read('theme.json');
const component = read('component.json');
const pageIds = ['applicant-info', 'project-narrative', 'budget', 'project-phases', 'subcontractors', 'review-submit']
    .map(id => `grant-web-${id}`);

function plan(activeBreakpoint: string | null, themed = true): LayoutNode[] {
    return planDefinitionFallback(definition.items, {
        items: definition.items,
        formPresentation: definition.formPresentation,
        ...(themed ? { theme } : {}),
        activeBreakpoint,
        findItem: path => findItemAtPath(definition.items, path),
    } as PlanContext);
}

function fields(nodes: LayoutNode[]): string[] {
    return nodes.flatMap(node => [
        ...(node.fieldItem && node.bindPath ? [node.bindPath] : []),
        ...fields(node.children),
    ]).sort();
}

describe('grant web Theme layout', () => {
    it('preserves all six web steps, including project phases and supporting documents', () => {
        const pages = resolvePageSequence(definition, { theme });
        expect(pages.map(page => page.id)).toEqual(pageIds);
        expect(pages.map(page => page.title)).toEqual([
            'Applicant Info', 'Project Narrative', 'Budget', 'Project Phases', 'Subcontractors', 'Review & Submit',
        ]);
    });

    it.each([
        [null, '1 / span 12'], ['sm', '1 / span 12'], ['md', '2 / span 10'],
        ['lg', '3 / span 8'], ['xl', '3 / span 8'],
    ])('keeps every field once and a usable reading width at breakpoint %s', (breakpoint, readingColumn) => {
        const pages = plan(breakpoint);
        expect(pages.map(page => page.props.id)).toEqual(pageIds);
        // Comparing the full list (not only a Set) catches duplicate as well as omitted fields.
        expect(fields(pages)).toEqual(fields(plan(breakpoint, false)));
        for (const index of [0, 1]) expect(pages[index].children[0].children[0].style?.gridColumn).toBe(readingColumn);
        for (const index of [2, 3, 4, 5]) expect(pages[index].children[0].children[0].style?.gridColumn).toBe('1 / span 12');
    });

    it('preserves the existing Component-owned navigation when both sidecars are loaded', () => {
        expect(resolvePageSequence(definition, { theme, component }))
            .toEqual(resolvePageSequence(definition, { component }));
    });
});
