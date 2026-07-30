import { describe, expect, it } from 'vitest';
import type {
  DataSource,
  FormBind,
  FormShape,
  Generation,
  SurfacePreviewScenario,
  SurfaceScenarioActionOutcome,
  SurfaceScenarioLoadedSource,
  ThemeDocument,
  WidgetActionBinding,
  WidgetDataBinding,
} from '../src/index.js';

const generation: Generation = {
  anchors: ['need:need-eligibility@3'],
};

describe('direct Generation provenance type sites', () => {
  it('keeps Bind, Shape, and Theme provenance strongly typed', () => {
    const bind = {
      path: 'applicant.age',
      'x-generation': generation,
    } satisfies FormBind;
    const shape = {
      id: 'adult',
      target: 'applicant.age',
      message: 'Applicant must be an adult.',
      constraint: '$ >= 18',
      'x-generation': generation,
    } satisfies FormShape;
    const theme = {
      $formspecTheme: '1.0',
      version: '1.0.0',
      'x-generation': generation,
    } satisfies ThemeDocument;

    const sites: Array<Generation | undefined> = [
      bind['x-generation'],
      shape['x-generation'],
      theme['x-generation'],
    ];
    expect(sites).toEqual([generation, generation, generation]);
  });

  it('types binding, Data Source, and preview scenario provenance with common Generation', () => {
    const dataBinding = {
      catalogRef: 'https://example.test/data-sources',
      sourceRef: 'query:records',
      'x-generation': generation,
    } satisfies WidgetDataBinding;
    const actionBinding = {
      actionRef: 'open-record',
      'x-generation': generation,
    } satisfies WidgetActionBinding;
    const dataSource = {
      id: 'query:records',
      kind: 'query-result',
      owner: 'host',
      scope: 'session',
      availability: { level: 'app' },
      runtime: {
        delivery: 'snapshot',
        cache: { mode: 'snapshot' },
        authorizationBoundary: 'host',
        failureMode: 'empty-state',
        provenance: {
          kind: 'query-result',
          source: 'test query',
        },
      },
      'x-generation': generation,
    } satisfies DataSource;
    const sourceOutcome = {
      catalogRef: 'https://example.test/data-sources',
      sourceRef: 'query:records',
      status: 'loaded',
      freshness: 'fresh',
      value: [],
      'x-generation': generation,
    } satisfies SurfaceScenarioLoadedSource;
    const actionOutcome = {
      status: 'complete',
      'x-generation': generation,
    } satisfies SurfaceScenarioActionOutcome;
    const scenario = {
      $formspecSurfaceScenario: '0.1',
      version: '1.0.0',
      initialPath: '/records',
      routeParams: { recordId: 'record-1' },
      routeParamsGeneration: generation,
      defaultProfile: 'loaded',
      'x-generation': generation,
      profiles: {
        loaded: {
          authorization: { default: 'authorized' },
          sources: [sourceOutcome],
        },
      },
      actions: {
        default: actionOutcome,
      },
    } satisfies SurfacePreviewScenario;

    const sites: Array<Generation | undefined> = [
      dataBinding['x-generation'],
      actionBinding['x-generation'],
      dataSource['x-generation'],
      scenario['x-generation'],
      scenario.routeParamsGeneration,
      sourceOutcome['x-generation'],
      actionOutcome['x-generation'],
    ];
    expect(sites).toEqual(Array.from({ length: 7 }, () => generation));
  });
});
