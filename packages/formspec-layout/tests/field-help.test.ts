/** @filedesc Tests for the shared field-help rule — URI admission and which References qualify. */
import { describe, it, expect } from 'vitest';
import { admitFieldHelpUri, resolveFieldHelp } from '../src/field-help';

describe('admitFieldHelpUri', () => {
    it('admits an HTTPS URI unchanged', () => {
        expect(admitFieldHelpUri('https://nj.gov/help/gig-work')).toBe('https://nj.gov/help/gig-work');
    });

    it('admits a same-app relative URI', () => {
        expect(admitFieldHelpUri('/help/gig-work')).toBe('/help/gig-work');
    });

    it.each([
        ['empty', ''],
        ['http', 'http://nj.gov/help'],
        ['mailto', 'mailto:help@nj.gov'],
        ['javascript', 'javascript:alert(1)'],
        ['data', 'data:text/html,x'],
        ['protocol-relative', '//evil.test/help'],
        ['backslash', 'https://nj.gov\\@evil.test'],
        ['embedded credentials', 'https://user:pw@nj.gov/help'],
        ['surrounding whitespace', ' https://nj.gov/help '],
        ['unparseable', 'https://['],
    ])('refuses %s', (_name, uri) => {
        expect(admitFieldHelpUri(uri)).toBeUndefined();
    });
});

const doc = (references: unknown[]) => ({ $formspecReferences: '1.0', references });

describe('resolveFieldHelp — which references qualify', () => {
    it('returns human and both audiences, never agent-only', () => {
        const refs = resolveFieldHelp(doc([
            { target: 'workType', audience: 'human', title: 'What is gig work?' },
            { target: 'workType', audience: 'both', title: 'NJ statute' },
            { target: 'workType', audience: 'agent', title: 'Vector store' },
        ]), 'workType');
        expect(refs.map((r) => r.title)).toEqual(['What is gig work?', 'NJ statute']);
    });

    it('ignores references bound to another item', () => {
        expect(resolveFieldHelp(doc([
            { target: 'somethingElse', audience: 'human', title: 'Elsewhere' },
        ]), 'workType')).toEqual([]);
    });

    it('never treats a form-level reference as field help', () => {
        expect(resolveFieldHelp(doc([{ target: '#', audience: 'human', title: 'Form guide' }]), 'workType'))
            .toEqual([]);
    });

    it('matches a repeat instance through the wildcard target', () => {
        const refs = resolveFieldHelp(doc([
            { target: 'jobs[*].workType', audience: 'human', title: 'Types of work' },
        ]), 'jobs[1].workType');
        expect(refs).toHaveLength(1);
    });

    it('orders primary before supplementary before background, authoring order within a tier', () => {
        const refs = resolveFieldHelp(doc([
            { target: 'f', audience: 'human', title: 'bg', priority: 'background' },
            { target: 'f', audience: 'human', title: 'supp-1' },
            { target: 'f', audience: 'human', title: 'primary', priority: 'primary' },
            { target: 'f', audience: 'human', title: 'supp-2', priority: 'supplementary' },
        ]), 'f');
        expect(refs.map((r) => r.title)).toEqual(['primary', 'supp-1', 'supp-2', 'bg']);
    });

    it('carries the reference URI and Need anchors through', () => {
        const [ref] = resolveFieldHelp(doc([{
            target: 'f',
            audience: 'human',
            title: 'Guide',
            uri: 'https://nj.gov/guide',
            'x-generation': { anchors: ['need:workType@3', 7] },
        }]), 'f');
        expect(ref.uri).toBe('https://nj.gov/guide');
        expect(ref.needAnchors).toEqual(['need:workType@3']);
    });

    it('is empty for a missing or malformed document', () => {
        expect(resolveFieldHelp(null, 'f')).toEqual([]);
        expect(resolveFieldHelp({ references: 'nope' } as never, 'f')).toEqual([]);
        expect(resolveFieldHelp(doc([null, 42, { audience: 'human' }]), 'f')).toEqual([]);
    });
});
