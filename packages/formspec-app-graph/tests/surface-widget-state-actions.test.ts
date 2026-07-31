/** @filedesc Generic module-widget state actions use declared mapped outputs. */
import { describe, expect, it } from 'vitest';
import {
  validateSurfaceResponseActionTriggers,
  validateSurfaceWidgetActions,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    ref: { url: `https://example.test/${slot}`, version: '1.0.0' },
    document,
  };
}

describe('module-widget state actions', () => {
  it('rejects unmapped outputs and Response Action labels the state cannot render', () => {
    const registry = handle('registry', 'registry', {
      entries: [{
        name: 'x-module',
        category: 'module',
        contributes: ['x-widget'],
      }, {
        name: 'x-widget',
        category: 'widget',
        widgetShape: {
          widgetName: 'AnyWidget',
          actionOutputs: [
            { name: 'unmapped' },
            { name: 'translated' },
          ],
        },
      }],
    });
    const surface = handle('surface', 'surface', {
      routes: [{
        id: 'home',
        slots: [{
          id: 'widget',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-module',
            widgetName: 'AnyWidget',
            config: {
              stateViews: {
                empty: {
                  actions: [{ kind: 'output', outputName: 'unmapped' }],
                },
                error: {
                  actions: [{ kind: 'output', outputName: 'translated' }],
                },
              },
            },
            actionBindings: {
              translated: { actionRef: 'translated-action' },
            },
          },
        }],
      }],
    });
    const responseActions = handle('responseActions', 'responseActions', {
      scope: 'app',
      actions: [{
        id: 'translated-action',
        intent: 'review',
        label: { ref: 'actions.review' },
      }],
    });
    const context: AppGraphContext = {
      manifest: handle('manifest', 'appManifest', {}),
      handles: [registry, surface, responseActions],
      schemaResults: [],
      evidenceResults: [],
    };

    const stateDiagnostics = validateSurfaceWidgetActions(context).filter(
      (diagnostic) =>
        diagnostic.details?.reason === 'state-action-output-unmapped' ||
        diagnostic.details?.reason === 'state-action-label-not-renderable',
    );
    expect(stateDiagnostics).toMatchObject([{
      code: 'E612',
      primarySource: {
        jsonPointer:
          '/routes/0/slots/0/binding/config/stateViews/empty/actions/0/outputName',
      },
      details: { reason: 'state-action-output-unmapped' },
    }, {
      code: 'E612',
      primarySource: {
        jsonPointer:
          '/routes/0/slots/0/binding/config/stateViews/error/actions/0/outputName',
      },
      relatedSources: [{
        artifactSlot: 'responseActions',
        jsonPointer: '/actions/0/label',
      }],
      details: { reason: 'state-action-label-not-renderable' },
    }]);
  });

  it('requires one application-scoped action owner for a widget binding', () => {
    const registry = handle('registry', 'registry', {
      entries: [{
        name: 'x-module',
        category: 'module',
        contributes: ['x-widget'],
      }, {
        name: 'x-widget',
        category: 'widget',
        widgetShape: {
          widgetName: 'AnyWidget',
          actionOutputs: [{ name: 'open' }],
        },
      }],
    });
    const surface = handle('surface', 'surface', {
      routes: [{
        id: 'home',
        slots: [{
          id: 'widget',
          slotType: 'module-widget',
          binding: {
            moduleId: 'x-module',
            widgetName: 'AnyWidget',
            actionBindings: { open: { actionRef: 'open-record' } },
          },
        }],
        transitions: [{ trigger: 'open-record', to: 'done' }],
      }, {
        id: 'done',
        slots: [],
      }],
    });
    const responseScoped = handle('responseActions[0]', 'responseActions', {
      targetDefinition: { url: 'urn:definition' },
      actions: [{ id: 'open-record', intent: 'review' }],
    });
    const responseContext: AppGraphContext = {
      manifest: handle('manifest', 'appManifest', {}),
      handles: [registry, surface, responseScoped],
      schemaResults: [],
      evidenceResults: [],
    };

    expect(validateSurfaceWidgetActions(responseContext)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'E612',
          details: expect.objectContaining({
            reason: 'widget-action-scope-mismatch',
            actualScope: 'response',
            requiredScope: 'app',
          }),
        }),
      ]),
    );
    expect(validateSurfaceResponseActionTriggers(responseContext)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'E611',
          details: expect.objectContaining({ reason: 'transition-unfireable' }),
        }),
      ]),
    );

    const formSurface = handle('surface', 'surface', {
      routes: [{
        id: 'home',
        slots: [{
          id: 'form',
          slotType: 'definition-form',
          binding: { definitionRef: 'urn:definition' },
        }],
        transitions: [{ trigger: 'open-record', to: 'done' }],
      }, {
        id: 'done',
        slots: [],
      }],
    });
    expect(validateSurfaceResponseActionTriggers({
      ...responseContext,
      handles: [formSurface, responseScoped],
    }).some((diagnostic) => diagnostic.code === 'E611')).toBe(false);

    const missingContext: AppGraphContext = {
      ...responseContext,
      handles: [registry, surface],
    };
    expect(validateSurfaceWidgetActions(missingContext)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'E612',
          details: expect.objectContaining({
            reason: 'widget-action-ref-unresolved',
            actionMatches: 0,
          }),
        }),
      ]),
    );

    const ambiguousContext: AppGraphContext = {
      ...responseContext,
      handles: [
        registry,
        surface,
        handle('responseActions[0]', 'responseActions', {
          scope: 'app',
          actions: [{ id: 'open-record', intent: 'review' }],
        }),
        handle('responseActions[1]', 'responseActions', {
          scope: 'app',
          actions: [{ id: 'open-record', intent: 'review' }],
        }),
      ],
    };
    expect(validateSurfaceWidgetActions(ambiguousContext)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'E612',
          details: expect.objectContaining({
            reason: 'widget-action-ref-ambiguous',
            actionMatches: 2,
          }),
        }),
      ]),
    );
  });
});
