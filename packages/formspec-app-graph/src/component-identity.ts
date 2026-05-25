/** @filedesc Component graph identity helpers. */

import type { AppGraphArtifactRef } from './types.js';

export interface AppGraphComponentMembershipIdentity {
  handle: string;
  url?: string;
  version?: string;
}

export interface AppGraphComponentNodeIdentity {
  component: AppGraphComponentMembershipIdentity;
  surface: AppGraphArtifactRef;
  route: string;
  nodePath: string;
  id?: string;
  nodeId?: string;
}

function keyPart(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function componentNodeIdentityKey(identity: AppGraphComponentNodeIdentity): string {
  return [
    keyPart(identity.component.handle),
    keyPart(identity.component.url),
    keyPart(identity.component.version),
    keyPart(identity.surface.url),
    keyPart(identity.surface.version),
    keyPart(identity.route),
    keyPart(identity.nodePath),
    keyPart(identity.id),
    keyPart(identity.nodeId),
  ].join('\u0000');
}
