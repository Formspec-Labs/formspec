import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  evaluateActorPostureAdmission,
  evaluateModulePostureAdmission,
  type PostureModuleRef,
} from '../src/posture-admission.js';

interface PostureAdmissionCase {
  id: string;
  description: string;
  document: Record<string, unknown>;
  postureDeclaration?: {
    allowedModules?: PostureModuleRef[];
    allowedActors?: string[];
  };
  expectedCodes: string[];
  forbiddenCodes: string[];
}

const FIXTURE_DIR = resolve(
  fileURLToPath(new URL('../../../tests/conformance/fixtures/posture-admission', import.meta.url)),
);

function fixtureCases(): PostureAdmissionCase[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.case.json'))
    .map((name) => {
      const raw = readFileSync(resolve(FIXTURE_DIR, name), 'utf8');
      return JSON.parse(raw) as PostureAdmissionCase;
    });
}

function documentModules(document: Record<string, unknown>): PostureModuleRef[] {
  const modules = document.modules;
  if (!Array.isArray(modules)) {
    return [];
  }
  return modules
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      id: String(entry.id ?? ''),
      version: String(entry.version ?? ''),
      ...(entry.publisher !== undefined ? { publisher: String(entry.publisher) } : {}),
      ...(entry.lockHash !== undefined ? { lockHash: String(entry.lockHash) } : {}),
    }))
    .filter((entry) => entry.id.length > 0 && entry.version.length > 0);
}

function actorUrnFromDocument(document: Record<string, unknown>): string | undefined {
  const tree = document.tree;
  if (!tree || typeof tree !== 'object') {
    return undefined;
  }
  const children = (tree as { children?: unknown }).children;
  if (!Array.isArray(children)) {
    return undefined;
  }
  for (const child of children) {
    if (!child || typeof child !== 'object') {
      continue;
    }
    const generation = (child as { 'x-generation'?: { generatedBy?: unknown } })['x-generation'];
    const generatedBy = generation?.generatedBy;
    if (typeof generatedBy === 'string' && generatedBy.trim()) {
      return generatedBy.trim();
    }
  }
  return undefined;
}

function moduleAdmissionDenied(
  document: Record<string, unknown>,
  allowedModules: readonly PostureModuleRef[] | undefined,
): boolean {
  const modules = documentModules(document);
  if (modules.length === 0) {
    return false;
  }
  return modules.some((moduleRef) => !evaluateModulePostureAdmission(moduleRef, allowedModules).admitted);
}

function actorAdmissionDenied(
  document: Record<string, unknown>,
  allowedActors: readonly string[] | undefined,
): boolean {
  const actorUrn = actorUrnFromDocument(document);
  if (!actorUrn) {
    return false;
  }
  return !evaluateActorPostureAdmission(actorUrn, allowedActors);
}

describe('posture-admission conformance fixtures (TS matchers)', () => {
  it.each(fixtureCases().map((fixtureCase) => [fixtureCase.id, fixtureCase] as const))(
    '%s',
    (_id, fixtureCase) => {
      const posture = fixtureCase.postureDeclaration;
      const expectsE608 = fixtureCase.expectedCodes.includes('E608');
      const forbidsE608 = fixtureCase.forbiddenCodes.includes('E608');
      const expectsE609 = fixtureCase.expectedCodes.includes('E609');
      const forbidsE609 = fixtureCase.forbiddenCodes.includes('E609');

      const moduleDenied = moduleAdmissionDenied(
        fixtureCase.document,
        posture?.allowedModules,
      );
      const actorDenied = actorAdmissionDenied(
        fixtureCase.document,
        posture?.allowedActors,
      );

      if (expectsE608) {
        expect(moduleDenied, `${fixtureCase.id}: expected module denial (E608)`).toBe(true);
      }
      if (forbidsE608) {
        expect(moduleDenied, `${fixtureCase.id}: forbidden module denial (E608)`).toBe(false);
      }
      if (expectsE609) {
        expect(actorDenied, `${fixtureCase.id}: expected actor denial (E609)`).toBe(true);
      }
      if (forbidsE609) {
        expect(actorDenied, `${fixtureCase.id}: forbidden actor denial (E609)`).toBe(false);
      }
    },
  );
});
