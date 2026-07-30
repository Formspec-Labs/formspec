/** @filedesc Generic module-widget state actions use declared mapped outputs. */
import { describe, expect, it } from 'vitest';
import {
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
});
