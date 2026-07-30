/** @filedesc Safe structured browser-resource action adapter tests. */

import { describe, expect, it, vi } from 'vitest';
import {
  executeBrowserResourceEffect,
  resolveBrowserResourceCommand,
} from '../src/browser-resource.js';

describe('browser resource actions', () => {
  it('opens safe internal, HTTPS, and mailto destinations from structured input', () => {
    for (const href of [
      '/items/item-42',
      'https://status.example.com',
      'mailto:support@example.com',
    ]) {
      expect(resolveBrowserResourceCommand(
        {
          type: 'browserResource',
          operation: 'open',
          resourceRef: 'resource',
        },
        { resource: { href } },
      )).toEqual({
        ok: true,
        command: { operation: 'open', href, target: 'self' },
      });
    }
  });

  it('rejects unsafe schemes, protocol-relative URLs, and prototype paths', () => {
    for (const [resourceRef, href] of [
      ['resource', 'javascript:alert(1)'],
      ['resource', 'data:text/html,unsafe'],
      ['resource', '//evil.example'],
      ['constructor.resource', '/safe'],
    ]) {
      expect(resolveBrowserResourceCommand(
        {
          type: 'browserResource',
          operation: 'open',
          resourceRef,
        },
        { resource: { href } },
      ).ok).toBe(false);
    }
  });

  it('dispatches a download only from a complete structured resource', () => {
    const open = vi.fn();
    const download = vi.fn();
    const result = executeBrowserResourceEffect(
      {
        type: 'browserResource',
        operation: 'download',
        resourceRef: 'export',
      },
      {
        export: {
          filename: 'items.csv',
          mediaType: 'text/csv',
          content: 'id,status\nitem-42,Ready\n',
        },
      },
      { open, download },
    );

    expect(result.status).toBe('succeeded');
    expect(open).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledWith({
      filename: 'items.csv',
      mediaType: 'text/csv',
      content: 'id,status\nitem-42,Ready\n',
    });
  });

  it('fails closed for malformed downloads without invoking host ports', () => {
    const open = vi.fn();
    const download = vi.fn();
    const result = executeBrowserResourceEffect(
      {
        type: 'browserResource',
        operation: 'download',
        resourceRef: 'export',
      },
      {
        export: {
          filename: '../items.csv',
          mediaType: 'text/csv',
          content: 'unsafe',
        },
      },
      { open, download },
    );

    expect(result.status).toBe('failed');
    expect(open).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
});
