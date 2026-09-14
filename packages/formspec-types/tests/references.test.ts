/** @filedesc Tests for References sidecar processing — target matching and field reference resolution. */
import { describe, expect, it } from 'vitest';
import {
  resolveFieldReferences,
  targetDefinitionMatches,
  unresolvedReferenceRefs,
  type ReferencesDocument,
} from '../src/index.js';

const FORM_URL = 'https://example.org/forms/grant';

function referencesDocument(
  references: ReferencesDocument['references'],
  referenceDefs?: ReferencesDocument['referenceDefs'],
): ReferencesDocument {
  return {
    $formspecReferences: '1.0',
    version: '1.0.0',
    targetDefinition: { url: FORM_URL },
    ...(referenceDefs ? { referenceDefs } : {}),
    references,
  };
}

function titles(
  grouped: ReturnType<typeof resolveFieldReferences>,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(grouped).map(([type, entries]) => [
      type,
      (entries ?? []).map((entry) => String(entry.title)),
    ]),
  );
}

describe('targetDefinitionMatches', () => {
  const definition = { url: FORM_URL, version: '1.4.2' };

  it('requires the target URL to equal the Definition URL', () => {
    expect(targetDefinitionMatches({ url: FORM_URL }, definition)).toBe(true);
    expect(targetDefinitionMatches({ url: `${FORM_URL}/other` }, definition)).toBe(false);
    expect(targetDefinitionMatches({}, definition)).toBe(false);
    expect(targetDefinitionMatches(undefined, definition)).toBe(false);
  });

  it('treats an absent range or an unversioned Definition as compatible', () => {
    expect(targetDefinitionMatches({ url: FORM_URL, compatibleVersions: '>=9.0.0' }, { url: FORM_URL }))
      .toBe(true);
    expect(targetDefinitionMatches({ url: FORM_URL, compatibleVersions: '' }, definition)).toBe(true);
  });

  it.each([
    ['*', true],
    ['1.4.2', true],
    ['>=1.0.0 <2.0.0', true],
    ['>=2.0.0 <3.0.0', false],
    ['^1.2.0', true],
    ['^2.0.0', false],
    ['~1.4.0', true],
    ['~1.3.0', false],
    ['1.x', true],
    ['2.x', false],
    ['<1.0.0 || 1.4.x', true],
    ['not-a-range', false],
  ])('evaluates compatibleVersions %j against 1.4.2 as %s', (range, expected) => {
    expect(targetDefinitionMatches({ url: FORM_URL, compatibleVersions: range }, definition))
      .toBe(expected);
  });
});

describe('resolveFieldReferences', () => {
  const documents = [
    referencesDocument(
      [
        { target: '#', type: 'regulation', audience: 'both', title: 'Form rules', priority: 'background' },
        { target: 'household', type: 'context', audience: 'agent', title: 'Household context' },
        { target: 'household.members[*]', type: 'documentation', audience: 'human', title: 'Member row help' },
        { target: 'household.members.income', type: 'documentation', audience: 'both', title: 'Income help' },
        { target: 'household.members.name', type: 'documentation', audience: 'both', title: 'Sibling help' },
        {
          target: 'household.members.income',
          $ref: '#/referenceDefs/incomeRule',
          title: 'Income rule (overridden title)',
        },
      ],
      {
        incomeRule: {
          type: 'documentation',
          audience: 'human',
          title: 'Income rule',
          content: 'Count gross monthly income.',
          priority: 'primary',
        },
      },
    ),
    referencesDocument([
      { target: 'household.members[1].income', type: 'documentation', audience: 'human', title: 'Second doc help' },
    ]),
  ];

  it('collects exact, index-stripped, wildcard-ancestor, ancestor, and form-level targets for a human', () => {
    expect(titles(resolveFieldReferences(documents, 'household.members[1].income', 'human'))).toEqual({
      regulation: ['Form rules'],
      documentation: [
        'Income rule (overridden title)',
        'Member row help',
        'Income help',
        'Second doc help',
      ],
    });
  });

  it('filters by audience: agent receives agent and both entries, both receives every entry', () => {
    expect(titles(resolveFieldReferences(documents, 'household.members[1].income', 'agent'))).toEqual({
      regulation: ['Form rules'],
      context: ['Household context'],
      documentation: ['Income help'],
    });
    expect(
      titles(resolveFieldReferences(documents, 'household.members[1].income', 'both')).documentation,
    ).toHaveLength(4);
  });

  it('never inherits a sibling target and strips the binding target from resolved entries', () => {
    const resolved = resolveFieldReferences(documents, 'household.members[0].income', 'both');
    const all = Object.values(resolved).flatMap((entries) => entries ?? []);
    expect(all.map((entry) => entry.title)).not.toContain('Sibling help');
    expect(all.every((entry) => !('target' in entry))).toBe(true);
  });

  it('resolves $ref pointers with shallow sibling overrides', () => {
    const [rule] = resolveFieldReferences(documents, 'household.members.income', 'human').documentation ?? [];
    expect(rule).toEqual({
      type: 'documentation',
      audience: 'human',
      title: 'Income rule (overridden title)',
      content: 'Count gross monthly income.',
      priority: 'primary',
    });
  });

  it('fails loudly when any document carries a $ref naming no referenceDefs entry', () => {
    const broken = referencesDocument([
      { target: 'elsewhere', $ref: '#/referenceDefs/missing' },
      { target: 'household', $ref: 'not-a-pointer' },
    ]);
    expect(unresolvedReferenceRefs(broken)).toEqual(['#/referenceDefs/missing', 'not-a-pointer']);
    expect(unresolvedReferenceRefs(documents[0]!)).toEqual([]);
    expect(() => resolveFieldReferences([...documents, broken], 'household', 'human'))
      .toThrow(/unknown reference definition: #\/referenceDefs\/missing/i);
  });
});
