/** @filedesc Safe browser navigation and download adapter for structured app actions. */

import type { ResponseActionEffectOutcome } from '@formspec-org/engine';

type UnknownRecord = Readonly<Record<string, unknown>>;

export interface BrowserResourceEffectInput {
  type: 'browserResource';
  operation: 'open' | 'download';
  resourceRef: string;
  target?: 'self' | 'new' | undefined;
}

export interface BrowserOpenResource {
  href: string;
}

export interface BrowserDownloadResource {
  filename: string;
  mediaType: string;
  content: string;
}

export type BrowserResourceCommand =
  | Readonly<{
      operation: 'open';
      href: string;
      target: 'self' | 'new';
    }>
  | Readonly<{
      operation: 'download';
      filename: string;
      mediaType: string;
      content: string;
    }>;

export type BrowserResourceResolution =
  | Readonly<{ ok: true; command: BrowserResourceCommand }>
  | Readonly<{ ok: false; reason: string }>;

export interface BrowserResourcePorts {
  open(href: string, target: 'self' | 'new'): void;
  download(resource: BrowserDownloadResource): void;
}

const SAFE_PATH_PART = /^[A-Za-z0-9_-]+$/;
const UNSAFE_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor']);

function record(value: unknown): UnknownRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function ownPath(root: unknown, path: string): unknown {
  const parts = path.split('.');
  if (
    parts.length === 0 ||
    parts.some((part) => !SAFE_PATH_PART.test(part) || UNSAFE_PATH_PARTS.has(part))
  ) {
    return undefined;
  }
  let current: unknown = root;
  for (const part of parts) {
    const object = record(current);
    if (!object || !Object.prototype.hasOwnProperty.call(object, part)) {
      return undefined;
    }
    current = object[part];
  }
  return current;
}

function safeOpenHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'mailto:'
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

export function resolveBrowserResourceCommand(
  candidateEffect: unknown,
  input: unknown,
): BrowserResourceResolution {
  const effect = record(candidateEffect);
  if (
    effect?.type !== 'browserResource' ||
    (effect.operation !== 'open' && effect.operation !== 'download') ||
    typeof effect.resourceRef !== 'string'
  ) {
    return { ok: false, reason: 'invalid browser resource effect' };
  }
  const resource = record(ownPath(input, effect.resourceRef));
  if (!resource) {
    return { ok: false, reason: 'browser resource input did not resolve' };
  }

  if (effect.operation === 'open') {
    const href = safeOpenHref(resource.href);
    if (!href) {
      return { ok: false, reason: 'browser resource destination is not allowed' };
    }
    return {
      ok: true,
      command: {
        operation: 'open',
        href,
        target: effect.target === 'new' ? 'new' : 'self',
      },
    };
  }

  if (
    typeof resource.filename !== 'string' ||
    resource.filename.length === 0 ||
    resource.filename.includes('/') ||
    resource.filename.includes('\\') ||
    typeof resource.mediaType !== 'string' ||
    !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(resource.mediaType) ||
    typeof resource.content !== 'string'
  ) {
    return { ok: false, reason: 'browser download resource is malformed' };
  }
  return {
    ok: true,
    command: {
      operation: 'download',
      filename: resource.filename,
      mediaType: resource.mediaType,
      content: resource.content,
    },
  };
}

export function executeBrowserResourceEffect(
  effect: unknown,
  input: unknown,
  ports: BrowserResourcePorts,
): ResponseActionEffectOutcome {
  const resolution = resolveBrowserResourceCommand(effect, input);
  if (!resolution.ok) {
    return {
      type: 'browserResource',
      status: 'failed',
      reason: resolution.reason,
    } as ResponseActionEffectOutcome;
  }
  try {
    if (resolution.command.operation === 'open') {
      ports.open(resolution.command.href, resolution.command.target);
    } else {
      const { filename, mediaType, content } = resolution.command;
      ports.download({ filename, mediaType, content });
    }
    return {
      type: 'browserResource',
      status: 'succeeded',
    } as ResponseActionEffectOutcome;
  } catch (error) {
    return {
      type: 'browserResource',
      status: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    } as ResponseActionEffectOutcome;
  }
}
