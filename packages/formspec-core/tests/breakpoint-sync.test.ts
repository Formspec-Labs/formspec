import { describe, it, expect } from 'vitest';
import { createRawProject } from '../src/index.js';

describe('breakpoint normalization', () => {
  it('sorts theme breakpoints by minWidth ascending', () => {
    const project = createRawProject();
    project.batch([
      { type: 'theme.setBreakpoint', payload: { name: 'desktop', minWidth: 1024 } },
      { type: 'theme.setBreakpoint', payload: { name: 'tablet', minWidth: 768 } },
      { type: 'theme.setBreakpoint', payload: { name: 'mobile', minWidth: 320 } },
    ]);

    const keys = Object.keys(project.theme.breakpoints!);
    const values = Object.values(project.theme.breakpoints!);
    expect(keys).toEqual(['mobile', 'tablet', 'desktop']);
    expect(values).toEqual([320, 768, 1024]);
  });

  it('does not copy theme breakpoints into component state', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'theme.setBreakpoint',
      payload: { name: 'tablet', minWidth: 768 },
    });

    expect(project.theme.breakpoints).toEqual({ tablet: 768 });
    expect(project.component.breakpoints).toBeUndefined();
  });

  it('keeps component additions separate from theme breakpoints', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.setBreakpoint',
      payload: { name: 'custom', minWidth: 500 },
    });
    project.dispatch({
      type: 'theme.setBreakpoint',
      payload: { name: 'tablet', minWidth: 768 },
    });

    expect(project.component.breakpoints).toEqual({
      custom: 500,
    });
    expect(project.theme.breakpoints).toEqual({ tablet: 768 });
  });

  it('preserves same-name component values so lint can report divergent definitions', () => {
    const project = createRawProject();
    project.dispatch({
      type: 'component.setBreakpoint',
      payload: { name: 'tablet', minWidth: 900 },
    });
    project.dispatch({
      type: 'theme.setBreakpoint',
      payload: { name: 'tablet', minWidth: 768 },
    });

    expect(project.component.breakpoints).toEqual({ tablet: 900 });
    expect(project.theme.breakpoints).toEqual({ tablet: 768 });
  });
});
