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

  it('dispatches a download only from a complete structured resource', async () => {
    const open = vi.fn();
    const download = vi.fn();
    const result = await executeBrowserResourceEffect(
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

  it('fails closed for malformed downloads without invoking host ports', async () => {
    const open = vi.fn();
    const download = vi.fn();
    const result = await executeBrowserResourceEffect(
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

  it('fetches a host-service download only when the effect is activated', async () => {
    const open = vi.fn();
    const download = vi.fn();
    const fetchServiceResource = vi.fn(async () => new Response(
      'id,status\nitem-42,Ready\n',
      {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': "attachment; filename*=UTF-8''responses%20July.csv",
        },
      },
    ));
    const effect = {
      type: 'browserResource',
      operation: 'download',
      resourceRef: 'export',
    };
    const input = {
      export: {
        kind: 'host-service-download',
        path: '/responses/export?format=csv&mapping=formspec-default-response-export',
        filename: 'responses.csv',
        mediaType: 'text/csv',
      },
    };

    expect(resolveBrowserResourceCommand(effect, input).ok).toBe(true);
    expect(fetchServiceResource).not.toHaveBeenCalled();

    const result = await executeBrowserResourceEffect(effect, input, {
      open,
      download,
      fetchServiceResource,
      maxServiceDownloadBytes: 1024,
    });

    expect(result.status).toBe('succeeded');
    expect(fetchServiceResource).toHaveBeenCalledOnce();
    expect(fetchServiceResource).toHaveBeenCalledWith(
      '/responses/export?format=csv&mapping=formspec-default-response-export',
    );
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0]?.[0]).toMatchObject({
      filename: 'responses July.csv',
      mediaType: 'text/csv',
    });
    expect(download.mock.calls[0]?.[0].content).toBeInstanceOf(ArrayBuffer);
    expect(open).not.toHaveBeenCalled();
  });

  it.each([
    ['absolute origin', 'https://evil.example/export'],
    ['protocol-relative origin', '//evil.example/export'],
    ['fragment', '/responses/export#secret'],
    ['backslash', '/responses\\export'],
  ])('rejects a %s service path before fetching', async (_label, path) => {
    const fetchServiceResource = vi.fn();
    const download = vi.fn();
    const result = await executeBrowserResourceEffect(
      {
        type: 'browserResource',
        operation: 'download',
        resourceRef: 'export',
      },
      {
        export: {
          kind: 'host-service-download',
          path,
          filename: 'responses.csv',
          mediaType: 'text/csv',
        },
      },
      { open: vi.fn(), download, fetchServiceResource },
    );

    expect(result.status).toBe('failed');
    expect(fetchServiceResource).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'non-success response',
      response: new Response('', { status: 503, headers: { 'content-type': 'text/csv' } }),
    },
    {
      name: 'problem response',
      response: new Response('{}', { headers: { 'content-type': 'application/problem+json' } }),
    },
    {
      name: 'wrong media type',
      response: new Response('{}', { headers: { 'content-type': 'application/json' } }),
    },
    {
      name: 'announced oversize response',
      response: new Response('small', {
        headers: { 'content-type': 'text/csv', 'content-length': '2048' },
      }),
    },
    {
      name: 'actual oversize response',
      response: new Response('x'.repeat(2048), { headers: { 'content-type': 'text/csv' } }),
    },
  ])('fails closed for $name without downloading bytes', async ({ response }) => {
    const download = vi.fn();
    const result = await executeBrowserResourceEffect(
      {
        type: 'browserResource',
        operation: 'download',
        resourceRef: 'export',
      },
      {
        export: {
          kind: 'host-service-download',
          path: '/responses/export?format=csv&mapping=formspec-default-response-export',
          filename: 'responses.csv',
          mediaType: 'text/csv',
        },
      },
      {
        open: vi.fn(),
        download,
        fetchServiceResource: vi.fn(async () => response),
        maxServiceDownloadBytes: 1024,
      },
    );

    expect(result.status).toBe('failed');
    expect(download).not.toHaveBeenCalled();
  });

  it('uses the safe authored filename when Content-Disposition is unsafe', async () => {
    const download = vi.fn();
    const result = await executeBrowserResourceEffect(
      {
        type: 'browserResource',
        operation: 'download',
        resourceRef: 'export',
      },
      {
        export: {
          kind: 'host-service-download',
          path: '/responses/export?format=json&mapping=formspec-default-response-export',
          filename: 'responses.json',
          mediaType: 'application/json',
        },
      },
      {
        open: vi.fn(),
        download,
        fetchServiceResource: vi.fn(async () => new Response('[]', {
          headers: {
            'content-type': 'application/json',
            'content-disposition': 'attachment; filename="../secrets.json"',
          },
        })),
      },
    );

    expect(result.status).toBe('succeeded');
    expect(download.mock.calls[0]?.[0].filename).toBe('responses.json');
  });

  it('reports a network failure without including response bytes', async () => {
    const download = vi.fn();
    const result = await executeBrowserResourceEffect(
      {
        type: 'browserResource',
        operation: 'download',
        resourceRef: 'export',
      },
      {
        export: {
          kind: 'host-service-download',
          path: '/responses/export?format=csv&mapping=formspec-default-response-export',
          filename: 'responses.csv',
          mediaType: 'text/csv',
        },
      },
      {
        open: vi.fn(),
        download,
        fetchServiceResource: vi.fn(async () => {
          throw new Error('network unavailable');
        }),
      },
    );

    expect(result).toMatchObject({ status: 'failed', reason: 'network unavailable' });
    expect(download).not.toHaveBeenCalled();
  });
});
