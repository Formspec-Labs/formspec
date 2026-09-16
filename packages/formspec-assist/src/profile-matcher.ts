/** @filedesc Ontology-aware profile matching for formspec-assist. */

import type { ConceptBinding, ProfileEntrySource, ProfileMatch, UserProfile } from './types.js';

/** A match with the value it would write and where that value came from. In-page only: the wire gets {@link ProfileMatch}. */
export interface ResolvedProfileMatch extends ProfileMatch {
  value: unknown;
  source: ProfileEntrySource;
}

/** Project a resolved match to the wire shape (Assist spec §6.1): no value, no provenance, `concept` only when matched by concept. */
export function toWireMatch({ path, concept, confidence, relationship }: ResolvedProfileMatch): ProfileMatch {
  return { path, ...(concept !== undefined ? { concept } : {}), confidence, relationship };
}

function equivalentKey(system?: string, code?: string): string | null {
  if (!system || !code) {
    return null;
  }
  return `${system}#${code}`;
}

function confidenceForRelationship(type?: string): number {
  switch (type ?? 'exact') {
    case 'exact':
      return 0.95;
    case 'close':
      return 0.8;
    case 'broader':
    case 'narrower':
      return 0.6;
    case 'related':
      return 0.4;
    default:
      return 0.4;
  }
}

function profileRelationship(type?: string): ProfileMatch['relationship'] {
  switch (type) {
    case undefined:
    case 'exact':
      return 'exact';
    case 'close':
    case 'broader':
    case 'narrower':
    case 'related':
      return type;
    default:
      return 'related';
  }
}

export class ProfileMatcher {
  public constructor(
    private readonly resolveConcept: (path: string) => ConceptBinding | undefined,
    private readonly threshold = 0.5,
  ) {}

  public match(profile: UserProfile | undefined, fieldPaths: string[]): ResolvedProfileMatch[] {
    if (!profile) {
      return [];
    }

    const matches: ResolvedProfileMatch[] = [];
    for (const path of fieldPaths) {
      const concept = this.resolveConcept(path);
      if (concept?.concept && profile.concepts[concept.concept]) {
        const entry = profile.concepts[concept.concept];
        matches.push({
          path,
          concept: concept.concept,
          value: entry.value,
          confidence: 1,
          relationship: 'exact',
          source: entry.source,
        });
        continue;
      }

      let equivalentMatch: ResolvedProfileMatch | undefined;
      for (const equivalent of concept?.equivalents ?? []) {
        const key = equivalent.concept ?? equivalentKey(equivalent.system, equivalent.code);
        if (!key || !profile.concepts[key]) {
          continue;
        }
        const entry = profile.concepts[key];
        const confidence = confidenceForRelationship(equivalent.type);
        if (!equivalentMatch || confidence > equivalentMatch.confidence) {
          equivalentMatch = {
            path,
            concept: key,
            value: entry.value,
            confidence,
            relationship: profileRelationship(equivalent.type),
            source: entry.source,
          };
        }
      }
      if (equivalentMatch && equivalentMatch.confidence >= this.threshold) {
        matches.push(equivalentMatch);
        continue;
      }

      const fieldEntry = profile.fields[path];
      if (fieldEntry && 0.3 >= this.threshold) {
        matches.push({
          path,
          value: fieldEntry.value,
          confidence: 0.3,
          relationship: 'field-key',
          source: fieldEntry.source,
        });
      }
    }

    return matches.sort((left, right) => right.confidence - left.confidence || left.path.localeCompare(right.path));
  }
}
