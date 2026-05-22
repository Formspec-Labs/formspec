import { describe, expect, it } from 'vitest';
import { mergeBreakpointNamespace, sortBreakpoints } from '../src/index.js';

describe('breakpoint namespace helpers', () => {
  it('sorts breakpoints by minWidth ascending', () => {
    expect(sortBreakpoints({ desktop: 1024, mobile: 320, tablet: 768 })).toEqual({
      mobile: 320,
      tablet: 768,
      desktop: 1024,
    });
  });

  it('merges theme breakpoints with component additions', () => {
    expect(
      mergeBreakpointNamespace(
        { tablet: 768, desktop: 1024 },
        { compact: 480 },
      ),
    ).toEqual({
      compact: 480,
      tablet: 768,
      desktop: 1024,
    });
  });

  it('keeps the theme value for same-name breakpoints', () => {
    expect(
      mergeBreakpointNamespace(
        { tablet: 768 },
        { tablet: 900, compact: 480 },
      ),
    ).toEqual({
      compact: 480,
      tablet: 768,
    });
  });

  it('keeps component additions whose names exist on Object.prototype', () => {
    expect(
      mergeBreakpointNamespace(
        { mobile: 320 },
        { constructor: 1024 },
      ),
    ).toEqual({
      mobile: 320,
      constructor: 1024,
    });
  });
});
