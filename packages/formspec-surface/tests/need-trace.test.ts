/** @filedesc Canonical Need-anchor extraction for renderer review metadata. */

import { describe, expect, it } from 'vitest';
import {
  generationNeedAnchors,
  isCanonicalNeedAnchor,
  mergeNeedAnchors,
} from '../src/index.js';

describe('Need trace metadata', () => {
  it('accepts only pinned canonical Need anchors', () => {
    expect(generationNeedAnchors({
      'x-generation': {
        anchors: [
          'need:publish-form@2',
          'feature:publish-form@2',
          'need:not-pinned',
          'need:zero@0',
          42,
        ],
      },
    })).toEqual(['need:publish-form@2']);
    expect(isCanonicalNeedAnchor('need:publish-form@2')).toBe(true);
  });

  it('merges valid anchors without changing declaration order', () => {
    expect(mergeNeedAnchors(
      ['need:first@1', 'bad'],
      ['need:second@3', 'need:first@1'],
    )).toEqual(['need:first@1', 'need:second@3']);
  });
});
