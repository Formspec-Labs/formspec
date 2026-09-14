import { act, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import {
  composeSurfaceApp,
  createSurfaceSemanticOutputRegistry,
  createThemeAuthority,
  createWidgetRegistry,
  planMatchedRoute,
  type SurfaceSemanticOutputScope,
  type SurfaceSemanticOutputPublisherScope,
  type SurfaceSemanticOutputTarget,
  type SurfaceRouteHandle,
} from '@formspec-org/surface';
import type { SurfaceDocument } from '@formspec-org/types';
import { SurfaceRouteView } from '../src/SurfaceRoute.js';
import {
  createSurfaceSemanticOutputScopeResolver,
} from '../src/semantic-output.js';
import type {
  SurfaceWidget,
  SurfaceWidgetProps,
} from '../src/widget-api.js';
import { StructuredPanel } from '../src/widgets/structured-panel.js';

const ARTIFACT_REF = 'https://example.test/surfaces/main';
const ARTIFACT_DIGEST = `sha256:${'a'.repeat(64)}`;

function outputScope(): SurfaceSemanticOutputPublisherScope {
  return {
    registry: createSurfaceSemanticOutputRegistry(),
    surfaceArtifact: {
      artifactRef: ARTIFACT_REF,
      artifactDigest: ARTIFACT_DIGEST,
    },
    renderInstanceId: 'render-1',
    subjectPrefix: 'admin/panelSlot',
  };
}

function target(
  scope: SurfaceSemanticOutputScope,
  subjectRef: string,
): SurfaceSemanticOutputTarget {
  return {
    renderInstanceId: scope.renderInstanceId,
    node: {
      ...scope.surfaceArtifact,
      subjectKind: 'surface-node',
      subjectRef,
    },
  };
}

function widgetProps(
  scope: SurfaceSemanticOutputScope,
  overrides: Partial<SurfaceWidgetProps> = {},
): SurfaceWidgetProps {
  return {
    moduleId: 'x-generic',
    widgetName: 'StructuredPanel',
    slot: { id: 'panelSlot' },
    route: {
      surfaceId: 'main',
      surfaceRef: ARTIFACT_REF,
      routeId: 'admin',
      routeClass: 'operation',
      params: {},
    },
    headingLevel: 2,
    config: {},
    data: {},
    emitAction: () => {},
    admitsTenantTheme: true,
    semanticOutputScope: scope,
    ...overrides,
  };
}

const trace = {
  'x-generation': {
    anchors: ['need:inspect-output@1'],
  },
};

describe('Surface semantic output publishing', () => {
  it('updates StructuredPanel values in place and removes them on unmount', () => {
    const scope = outputScope();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const config = {
      id: 'adminPanel',
      title: 'Administration',
      blocks: [{
        id: 'organizationSummary',
        type: 'key-value',
        items: [{
          id: 'organization',
          label: 'Organization',
          path: 'organization.name',
          ...trace,
        }],
        ...trace,
      }],
      actions: [{
        outputName: 'continue',
        ...trace,
      }],
      ...trace,
    };
    const actions = [{
      outputName: 'continue',
      actionRef: 'continue-action',
      intent: 'continue',
      label: { literal: 'Continue' as const },
    }];

    act(() => {
      root.render(
        <StructuredPanel
          {...widgetProps(scope, {
            config,
            data: { organization: { name: 'New Organization' } },
            actions,
          })}
        />,
      );
    });

    expect(scope.registry.lookup(target(
      scope,
      'admin/panelSlot/adminPanel/organizationSummary/organization',
    ))).toMatchObject({
      status: 'resolved',
      output: {
        rendered: true,
        semanticValue: 'New Organization',
      },
    });
    expect(scope.registry.lookup(target(
      scope,
      'admin/panelSlot/adminPanel/continue',
    ))).toMatchObject({
      status: 'resolved',
      output: {
        rendered: true,
        semanticValue: {
          outputName: 'continue',
          actionRef: 'continue-action',
          intent: 'continue',
        },
      },
    });
    const actionOutput = scope.registry.lookup(target(
      scope,
      'admin/panelSlot/adminPanel/continue',
    ));
    if (actionOutput.status === 'resolved') {
      expect(actionOutput.output).not.toHaveProperty('operable');
    }

    act(() => {
      root.render(
        <StructuredPanel
          {...widgetProps(scope, {
            config,
            data: { organization: { name: 'Renamed Organization' } },
            actions,
          })}
        />,
      );
    });
    expect(scope.registry.lookup(target(
      scope,
      'admin/panelSlot/adminPanel/organizationSummary/organization',
    ))).toMatchObject({
      status: 'resolved',
      output: { semanticValue: 'Renamed Organization' },
    });

    act(() => root.unmount());
    expect(scope.registry.lookup(target(
      scope,
      'admin/panelSlot/adminPanel/organizationSummary/organization',
    ))).toMatchObject({ status: 'missing' });
  });

  it('publishes a confirmed action only when its control actually renders', () => {
    const scope = outputScope();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const confirmed = {
      heading: 'Retire this version?',
      body: 'Existing records remain pinned to it.',
      confirmLabel: 'Retire version',
      cancelLabel: 'Keep version',
      ...trace,
    };
    const untraced = { ...confirmed, 'x-generation': { anchors: ['need:x@0'] } };
    const table = (id: string, outputName: string, confirmation: unknown) => ({
      id,
      type: 'table',
      path: 'versions',
      columns: [{ id: 'version', label: 'Version', path: 'version', ...trace }],
      rowAction: { outputName, columnLabel: 'Action', confirmation, ...trace },
      ...trace,
    });
    const action = (outputName: string) => ({
      outputName,
      actionRef: `${outputName}-action`,
      intent: 'submit',
      label: { literal: outputName },
    });

    act(() => {
      root.render(
        <StructuredPanel
          {...widgetProps(scope, {
            config: {
              id: 'adminPanel',
              blocks: [
                table('kept', 'retireRow', confirmed),
                table('withheld', 'purgeRow', untraced),
              ],
              actions: [
                { outputName: 'archive', confirmation: confirmed, ...trace },
                { outputName: 'purge', confirmation: untraced, ...trace },
              ],
              ...trace,
            },
            data: { versions: [{ version: '1.0.0' }] },
            actions: ['retireRow', 'purgeRow', 'archive', 'purge'].map(action),
          })}
        />,
      );
    });

    const rendered = [...container.querySelectorAll('button')].map((button) => button.textContent);
    expect(rendered.sort()).toEqual(['archive', 'retireRow']);
    for (const subject of ['kept/retireRow', 'archive']) {
      expect(scope.registry.lookup(target(scope, `admin/panelSlot/adminPanel/${subject}`)))
        .toMatchObject({ status: 'resolved', output: { rendered: true } });
    }
    for (const subject of ['withheld/purgeRow', 'purge']) {
      expect(scope.registry.lookup(target(scope, `admin/panelSlot/adminPanel/${subject}`)))
        .toMatchObject({ status: 'missing' });
    }
    act(() => root.unmount());
  });

  it('records unrelated static content from the mounted renderer', () => {
    const surface = {
      $formspecSurface: '0.2',
      id: 'main',
      entry: 'control',
      routes: [{
        id: 'control',
        path: '/control',
        slots: [{
          id: 'controlSummary',
          slotType: 'static-content',
          binding: {
            kind: 'text',
            content: 'Check today’s availability before planning a visit.',
            ...trace,
          },
          ...trace,
        }],
        ...trace,
      }],
    } as unknown as SurfaceDocument;
    const app = composeSurfaceApp([surface]);
    const handle = app.routes[0] as SurfaceRouteHandle;
    const plan = planMatchedRoute<SurfaceWidget>({
      handle,
      app,
      surfaceRef: ARTIFACT_REF,
      experiences: [],
      definitions: new Map(),
      registryEntries: [],
      widgets: createWidgetRegistry({}),
      themeAuthority: createThemeAuthority({}),
    });
    const scope = outputScope();
    const resolver = createSurfaceSemanticOutputScopeResolver({
      registry: scope.registry,
      surfaceArtifactFor: () => scope.surfaceArtifact,
      renderInstanceIdFor: () => scope.renderInstanceId,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <SurfaceRouteView
          plan={plan}
          resolveSemanticOutputScope={resolver}
        />,
      );
    });

    expect(scope.registry.lookup(target(
      scope,
      'control/controlSummary',
    ))).toMatchObject({
      status: 'resolved',
      output: {
        rendered: true,
        semanticValue: 'Check today’s availability before planning a visit.',
      },
    });
  });

  it('publishes no config evidence for an unimplemented widget', () => {
    const surface = {
      $formspecSurface: '0.2',
      id: 'main',
      entry: 'admin',
      routes: [{
        id: 'admin',
        path: '/admin',
        slots: [{
          id: 'unknownPanel',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-missing',
            widgetName: 'Unimplemented',
            config: {
              id: 'looksRenderable',
              title: 'This config exists but has no renderer',
              ...trace,
            },
          },
          ...trace,
        }],
        ...trace,
      }],
    } as unknown as SurfaceDocument;
    const app = composeSurfaceApp([surface]);
    const plan = planMatchedRoute<SurfaceWidget>({
      handle: app.routes[0] as SurfaceRouteHandle,
      app,
      surfaceRef: ARTIFACT_REF,
      experiences: [],
      definitions: new Map(),
      registryEntries: [],
      widgets: createWidgetRegistry({}),
      themeAuthority: createThemeAuthority({}),
    });
    const scope = outputScope();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <SurfaceRouteView
          plan={plan}
          resolveSemanticOutputScope={() => scope}
        />,
      );
    });

    expect(scope.registry.snapshot(scope)).toEqual([]);
    expect(scope.registry.lookup(target(
      scope,
      'admin/unknownPanel/looksRenderable',
    ))).toMatchObject({ status: 'missing' });
  });

  it('gives a custom widget only its slot prefix and rejects cross-slot output', () => {
    let assignedPrefix: string | undefined;
    let refusal: unknown;
    const SpoofingWidget: SurfaceWidget = ({ semanticOutputScope }) => {
      assignedPrefix = semanticOutputScope?.subjectPrefix;
      useLayoutEffect(() => {
        if (!semanticOutputScope) return;
        const mount = semanticOutputScope.registry.mount(semanticOutputScope);
        try {
          mount.replace([{ subjectRef: 'admin/otherSlot/spoofed' }]);
        } catch (error) {
          refusal = error;
        }
        return () => mount.dispose();
      }, [semanticOutputScope]);
      return <div data-probe="spoofing-widget" />;
    };
    const surface = {
      $formspecSurface: '0.2',
      id: 'main',
      entry: 'admin',
      routes: [{
        id: 'admin',
        path: '/admin',
        slots: [{
          id: 'ownedSlot',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-spoof',
            widgetName: 'Spoofer',
          },
          ...trace,
        }],
        ...trace,
      }],
    } as unknown as SurfaceDocument;
    const app = composeSurfaceApp([surface]);
    const plan = planMatchedRoute<SurfaceWidget>({
      handle: app.routes[0] as SurfaceRouteHandle,
      app,
      surfaceRef: ARTIFACT_REF,
      experiences: [],
      definitions: new Map(),
      registryEntries: [],
      widgets: createWidgetRegistry({
        modules: [{
          moduleId: 'x-spoof',
          widgets: { Spoofer: SpoofingWidget },
        }],
      }),
      themeAuthority: createThemeAuthority({}),
    });
    const scope = outputScope();
    const resolver = createSurfaceSemanticOutputScopeResolver({
      registry: scope.registry,
      surfaceArtifactFor: () => scope.surfaceArtifact,
      renderInstanceIdFor: () => scope.renderInstanceId,
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <SurfaceRouteView
          plan={plan}
          resolveSemanticOutputScope={resolver}
        />,
      );
    });

    expect(assignedPrefix).toBe('admin/ownedSlot');
    expect(refusal).toBeInstanceOf(TypeError);
    expect(scope.registry.lookup(target(
      scope,
      'admin/otherSlot/spoofed',
    ))).toMatchObject({ status: 'missing' });
    act(() => root.unmount());
  });

  it('fails closed when caller pairing names a different Surface reference', () => {
    const scope = outputScope();
    const resolver = createSurfaceSemanticOutputScopeResolver({
      registry: scope.registry,
      surfaceArtifactFor: () => ({
        ...scope.surfaceArtifact,
        artifactRef: 'https://example.test/surfaces/other',
      }),
      renderInstanceIdFor: () => scope.renderInstanceId,
    });
    const request = {
      plan: {
        surfaceRef: ARTIFACT_REF,
      },
      route: {
        surfaceId: 'main',
        surfaceRef: ARTIFACT_REF,
        routeId: 'admin',
        routeClass: 'operation',
        params: {},
      },
      runtimeGeneration: 'generation-1',
    };

    expect(resolver(request as never)).toBeUndefined();
  });
});
