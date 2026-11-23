/** @filedesc Unit tests for shared grouped blank-answer warning acknowledgement view models. */
import { describe, expect, it } from 'vitest';
import { readWarningAcknowledgementGroups } from '../src/warning-acknowledgement.js';

describe('readWarningAcknowledgementGroups', () => {
    const source = {
        field: (path: string) => {
            const labels: Record<string, string> = {
                outcome: 'Outcome',
                partner: 'Partner',
                topic: 'Topic',
                venue: 'Venue',
            };
            return labels[path] ? { label: labels[path]!, controlId: `field-${path}` } : null;
        },
        rootLabel: () => 'Workshop report',
        resolveText: (_key: string, fallback: string) => fallback,
    };

    it('Suppresses set difference before the first acknowledgement and surfaces added/removed after changes', () => {
        const initial = readWarningAcknowledgementGroups(
            {
                groups: [{
                    code: 'WORKSHOP_NOT_ANSWERED',
                    paths: ['outcome', 'topic', 'venue'],
                    current: false,
                    added: ['outcome', 'topic', 'venue'],
                    removed: [],
                }],
                entries: [],
            },
            source,
        );
        expect(initial).toHaveLength(1);
        expect(initial[0]!.legend).toBe('3 unanswered questions');
        expect(initial[0]!.hasChanges).toBe(false);
        expect(initial[0]!.added).toEqual([]);
        expect(initial[0]!.removed).toEqual([]);
        expect(initial[0]!.buttonLabel).toBe('Accept 3 unanswered questions');
        expect(initial[0]!.items.map(i => [i.label, i.jumpHref])).toEqual([
            ['Outcome', '#field-outcome'],
            ['Topic', '#field-topic'],
            ['Venue', '#field-venue'],
        ]);

        const stale = readWarningAcknowledgementGroups(
            {
                groups: [{
                    code: 'WORKSHOP_NOT_ANSWERED',
                    paths: ['outcome', 'partner', 'topic'],
                    current: false,
                    added: ['partner'],
                    removed: ['venue'],
                }],
                entries: [{ group: true, code: 'WORKSHOP_NOT_ANSWERED', paths: ['outcome', 'topic', 'venue'], basis: 'b1' }],
            },
            source,
        );
        expect(stale[0]!.hasChanges).toBe(true);
        expect(stale[0]!.added.map(i => i.label)).toEqual(['Partner']);
        expect(stale[0]!.removed.map(i => i.label)).toEqual(['Venue']);
    });

    it('Handles singular count and root path cleanly', () => {
        const single = readWarningAcknowledgementGroups(
            {
                groups: [{
                    code: 'ROOT_CONFIRM',
                    paths: ['#'],
                    current: true,
                    added: [],
                    removed: [],
                }],
                entries: [{ group: true, code: 'ROOT_CONFIRM', paths: ['#'], basis: 'b1' }],
            },
            source,
        );
        expect(single[0]!.legend).toBe('1 unanswered question');
        expect(single[0]!.buttonLabel).toBe('Accepted 1 unanswered question');
        expect(single[0]!.items).toEqual([{ path: '#', label: 'Workshop report', jumpPath: null, jumpHref: null }]);
    });

    it('Requests only schema-supported Locale keys and exposes shared change labels and custom route hrefs', () => {
        const seenKeys: string[] = [];
        const groups = readWarningAcknowledgementGroups(
            {
                groups: [{
                    code: 'WORKSHOP_NOT_ANSWERED',
                    shapeIds: ['blankQuestions'],
                    paths: ['outcome', 'partner'],
                    current: false,
                    added: ['partner'],
                    removed: ['venue'],
                }],
                entries: [{ group: true, code: 'WORKSHOP_NOT_ANSWERED', paths: ['outcome', 'venue'], basis: 'b1' }],
            },
            {
                ...source,
                resolveText: (key, fallback) => {
                    seenKeys.push(key);
                    return key === '$shape.blankQuestions.explanationPrompt'
                        ? 'Confirm blank workshop questions'
                        : fallback;
                },
                hrefForPath: (path) => `/filing/2025?slot=form&section=${path}`,
            },
        );
        expect(seenKeys.some(key => key.startsWith('$code.'))).toBe(false);
        expect(groups[0]!.legend).toBe('Confirm blank workshop questions');
        expect(groups[0]!.addedText).toBe('Newly unanswered: Partner');
        expect(groups[0]!.removedText).toBe('Now answered: Venue');
        expect(groups[0]!.items.map(i => i.jumpHref)).toEqual([
            '/filing/2025?slot=form&section=outcome',
            '/filing/2025?slot=form&section=partner',
        ]);
    });

    it('Uses raw lookupUi for $ui.validationSummary.row instead of resolveText and propagates group basis', () => {
        const resolvedKeys: string[] = [];
        const groups = readWarningAcknowledgementGroups(
            {
                groups: [{
                    code: 'WORKSHOP_NOT_ANSWERED',
                    basis: 'sha256:group-basis-1',
                    shapeIds: ['blankQuestions'],
                    paths: ['outcome'],
                    current: false,
                    added: ['outcome'],
                    removed: ['venue'],
                }],
                entries: [{ group: true, code: 'WORKSHOP_NOT_ANSWERED', paths: ['venue'], basis: 'sha256:old' }],
            },
            {
                ...source,
                resolveText: (key, fallback) => {
                    resolvedKeys.push(key);
                    return fallback;
                },
                lookupUi: (key) => key === 'validationSummary.row' ? 'Écart [{{$message}}] — {{$label}}' : null,
            },
        );
        expect(resolvedKeys).toEqual(['$shape.blankQuestions.explanationPrompt']);
        expect(groups[0]!.basis).toBe('sha256:group-basis-1');
        expect(groups[0]!.removedText).toBe('Écart [Venue] — Now answered');
    });
});
