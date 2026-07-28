/**
 * @filedesc Browser-only fixture for the collision navigation refusal.
 *
 * This is host probe chrome, not bundle-derived output. It appears only when
 * the evidence runner requests it by query parameter.
 */
import { useState } from 'react';
import { composeSurfaceApp } from '@formspec-org/surface';
import { SurfaceNav } from '@formspec-org/surface-react';
import type { SurfaceDocument } from '@formspec-org/types';

const collisionApp = composeSurfaceApp([
  {
    $formspecSurface: '0.1',
    id: 'collision-first',
    entry: 'first-claimant',
    routes: [
      {
        id: 'first-claimant',
        path: '/shared',
        title: 'First claimant',
        routeClass: 'intake',
        slots: [],
      },
      {
        id: 'unique',
        path: '/unique',
        title: 'Unique route',
        routeClass: 'intake',
        slots: [],
      },
    ],
  } as unknown as SurfaceDocument,
  {
    $formspecSurface: '0.1',
    id: 'collision-second',
    entry: 'second-claimant',
    routes: [
      {
        id: 'second-claimant',
        path: '/shared',
        title: 'Second claimant',
        routeClass: 'intake',
        slots: [],
      },
    ],
  } as unknown as SurfaceDocument,
]);

const collisionDiagnostics = collisionApp.diagnostics.filter(
  (diagnostic) => diagnostic.code === 'ROUTE-PATH-COLLISION',
);

export function CollisionNavigationProbe() {
  const [navigations, setNavigations] = useState(0);

  return (
    <section
      data-probe="collision-navigation"
      data-collision-diagnostic-count={collisionDiagnostics.length}
      data-collision-diagnostic-codes={collisionDiagnostics
        .map((diagnostic) => diagnostic.code)
        .join(',')}
      data-navigation-count={navigations}
    >
      <SurfaceNav
        app={collisionApp}
        location="/shared"
        onNavigate={() => setNavigations((count) => count + 1)}
        label="Collision navigation fixture"
      />
    </section>
  );
}
