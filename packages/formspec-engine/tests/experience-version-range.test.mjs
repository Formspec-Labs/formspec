/** @filedesc Pins the Experience `targetDefinition.compatibleVersions` range matcher (EXP-TARGET-DEFINITION-VERSION-MISMATCH). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { targetDefinitionFindings } from '../dist/index.js';

const URL = 'https://example.org/forms/experience-range';

/** Whether the Experience analyzer accepts `version` for `compatibleVersions: range`. */
function accepts(range, version) {
    const findings = targetDefinitionFindings(
        { url: URL, version },
        { targetDefinition: { url: URL, compatibleVersions: range } },
    );
    return !findings.some((finding) => finding.code === 'EXP-TARGET-DEFINITION-VERSION-MISMATCH');
}

/**
 * Accepted and rejected `compatibleVersions` forms.
 *
 * `@formspec-org/types` exports `targetDefinitionMatches` (97615628) over a second, independently
 * written range matcher. Measured over this corpus the two disagree on 8 of 34 rows, so the engine
 * does NOT delegate to it: `targetDefinitionMatches` accepts wildcards (`*`, `1.x`, `1.*`, `x`) and
 * four-part bases (`^1.0.0.0`) the engine rejects, and rejects partial ranges (`1.2` for `1.2.0`)
 * and prerelease-tagged comparisons (`1.0.0-beta` against `1.0.0`, `1.0.0` against `1.0.0-rc.1`)
 * the engine accepts. It also folds the URL check into the same answer, which would collapse
 * EXP-TARGET-DEFINITION-MISMATCH and EXP-TARGET-DEFINITION-VERSION-MISMATCH into one finding.
 * Unifying them is a behavior change to one side or the other, not a refactor; this table is the
 * record of what the engine promises today.
 */
const CASES = [
    // Caret: same major, at or above the base. (0.x behaves like any other major here.)
    ['^1.0.0', '1.4.2', true],
    ['^1.0.0', '1.0.0', true],
    ['^1.2.0', '1.1.0', false],
    ['^1.0.0', '2.0.0', false],
    ['^0.2.0', '0.3.0', true],

    // Tilde: same major and minor, at or above the base; a missing part defaults to 0.
    ['~1.2.0', '1.2.9', true],
    ['~1.2.0', '1.3.0', false],
    ['~1.2.0', '1.1.9', false],
    ['~1.2', '1.2.5', true],

    // Bare version: exact equality after both sides are padded to major.minor.patch.
    ['1.0.0', '1.0.0', true],
    ['1.0.0', '1.0.1', false],
    ['1.2', '1.2.0', true],
    ['1.2', '1.2.3', false],

    // Comparators, and whitespace-separated parts as conjunction.
    ['>=1.2.0', '1.5.0', true],
    ['>=1.2.0', '1.1.0', false],
    ['<=1.2.0', '1.2.0', true],
    ['>1.0.0', '1.0.0', false],
    ['<2.0.0', '1.9.9', true],
    ['=1.0.0', '1.0.0', true],
    ['>1.0.0 <2.0.0', '1.5.0', true],
    ['>=1.0.0 <2.0.0', '2.0.0', false],
    // A space after the operator splits it from its version, so neither part parses.
    ['>= 1.2.0', '1.5.0', false],

    // `||` is alternation; parts are trimmed, and a spaceless form works too.
    ['^1.0.0 || ^2.0.0', '2.1.0', true],
    ['^1.0.0||^2.0.0', '2.1.0', true],
    ['^1.0.0 || ^2.0.0', '3.0.0', false],
    ['||', '1.0.0', false],

    // Prerelease tags are dropped from both sides before comparing.
    ['1.0.0-beta', '1.0.0-beta', true],
    ['1.0.0-beta', '1.0.0', true],
    ['1.0.0', '1.0.0-rc.1', true],
    ['^1.0.0-beta', '1.2.0', true],
    ['^2.0.0-beta', '1.2.0', false],

    // Unparseable ranges match nothing — wildcards included; the engine has no wildcard form.
    ['*', '9.9.9', false],
    ['1.x', '1.4.0', false],
    ['1.*', '1.4.0', false],
    ['x', '3.0.0', false],
    ['^1.0.0.0', '1.2.0', false],
    ['1.0.0.0', '1.0.0', false],
    ['nonsense', '1.0.0', false],
    ['^', '1.0.0', false],
];

test('compatibleVersions ranges accepted and rejected by the Experience analyzer', () => {
    for (const [range, version, expected] of CASES) {
        assert.equal(
            accepts(range, version),
            expected,
            `compatibleVersions ${JSON.stringify(range)} vs version ${version}`,
        );
    }
});

test('an absent or empty compatibleVersions never reports a version mismatch', () => {
    for (const target of [{ url: URL }, { url: URL, compatibleVersions: '' }]) {
        assert.deepEqual(targetDefinitionFindings({ url: URL, version: '1.0.0' }, { targetDefinition: target }), []);
    }
    // No Definition version to check against is likewise not a mismatch.
    assert.deepEqual(
        targetDefinitionFindings({ url: URL }, { targetDefinition: { url: URL, compatibleVersions: '^2.0.0' } }),
        [],
    );
});

test('the URL and version mismatches are separate findings', () => {
    const findings = targetDefinitionFindings(
        { url: URL, version: '3.0.0' },
        { targetDefinition: { url: 'https://example.org/forms/other', compatibleVersions: '^1.0.0' } },
    );
    assert.deepEqual(findings.map((finding) => finding.code), [
        'EXP-TARGET-DEFINITION-MISMATCH',
        'EXP-TARGET-DEFINITION-VERSION-MISMATCH',
    ]);
    assert.deepEqual(findings.map((finding) => finding.path), [
        'targetDefinition.url',
        'targetDefinition.compatibleVersions',
    ]);
});
