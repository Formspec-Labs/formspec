/** @filedesc Focused coverage for D1 UX and authoring quality gates in AppGraphValidator. */

import { describe, expect, it } from 'vitest';
import {
  LOCALE_ASSOCIATION_CODES,
  UX_AUTHORING_QUALITY_CODES,
  validateLocaleAssociations,
  validateUxAuthoringQuality,
  type AppGraphContext,
  type ResolvedArtifactHandle,
} from '../src/index.js';

function handle(
  slot: string,
  artifactKind: string,
  document: unknown,
  url = `https://example.gov/${slot}`,
): ResolvedArtifactHandle {
  return {
    slot,
    artifactKind,
    status: 'loaded',
    source: `memory://${slot}`,
    ref: { url, version: '1.0.0' },
    document,
  };
}

function context(
  manifestDoc: Record<string, unknown>,
  ...artifacts: ResolvedArtifactHandle[]
): AppGraphContext {
  const manifest = handle('manifest', 'appManifest', manifestDoc);
  return {
    manifest,
    handles: [manifest, ...artifacts],
    schemaResults: [],
    evidenceResults: [],
  };
}

function makeFields(count: number) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `field_${idx + 1}`,
    type: 'field',
    key: `field_${idx + 1}`,
    label: `Field ${idx + 1}`,
    dataType: 'string',
  }));
}

describe('validateUxAuthoringQuality', () => {
  describe('APP-GRAPH-UNGROUPED-LARGE-DEFINITION', () => {
    it('flags a flat definition with more than 12 fields and no group or Component Section/Collapsible', () => {
      const defUrl = 'urn:example:form:large:1.0.0';
      const definition = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'large-form',
          url: defUrl,
          version: '1.0.0',
          title: 'Large Application',
          items: makeFields(15),
        },
        defUrl,
      );

      const diagnostics = validateUxAuthoringQuality(
        context({ definitions: [{ url: defUrl, version: '1.0.0' }] }, definition),
      );

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: UX_AUTHORING_QUALITY_CODES.ungroupedLargeDefinition,
        severity: 'error',
        primarySource: {
          artifactSlot: 'definitions/0',
          jsonPointer: '/items',
        },
        details: {
          reason: 'ungrouped-large-definition',
          definitionUrl: defUrl,
          fieldCount: 15,
          maxUngroupedFields: 12,
        },
      });
    });

    it('accepts a large definition when grouped via Definition group item or Component Section', () => {
      const defUrl = 'urn:example:form:grouped:1.0.0';
      const groupedDefinition = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'grouped-form',
          url: defUrl,
          version: '1.0.0',
          title: 'Grouped Application',
          items: [
            {
              id: 'section-1',
              type: 'group',
              label: 'Applicant Identity',
              children: makeFields(15),
            },
          ],
        },
        defUrl,
      );

      expect(
        validateUxAuthoringQuality(
          context({ definitions: [{ url: defUrl, version: '1.0.0' }] }, groupedDefinition),
        ),
      ).toEqual([]);

      const flatDefWithComponent = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'flat-form',
          url: defUrl,
          version: '1.0.0',
          title: 'Component-Grouped Application',
          items: makeFields(15),
        },
        defUrl,
      );
      const component = handle('components/0', 'component', {
        $formspecComponent: '0.1',
        id: 'grouped-comp',
        target: { url: defUrl, version: '1.0.0' },
        tree: {
          component: 'Stack',
          children: [
            {
              component: 'Section',
              title: 'Step 1',
              children: [{ component: 'Field', fieldKey: 'field_1' }],
            },
          ],
        },
      });

      expect(
        validateUxAuthoringQuality(
          context(
            { definitions: [{ url: defUrl, version: '1.0.0' }] },
            flatDefWithComponent,
            component,
          ),
        ),
      ).toEqual([]);
    });
  });

  describe('APP-GRAPH-DEAD-END-FORM-SLOT', () => {
    it('flags an editable definition-form slot on a multi-route 0.2/0.3 Surface with no completion path', () => {
      const defUrl = 'urn:example:form:dispute:1.0.0';
      const definition = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'dispute',
          url: defUrl,
          version: '1.0.0',
          items: makeFields(2),
        },
        defUrl,
      );
      const surface = handle('surfaces/0', 'surface', {
        $formspecSurface: '0.2',
        id: 'urn:example:surface:main',
        title: 'Main Surface',
        routes: [
          {
            id: 'intake',
            title: 'Intake',
            routeClass: 'form',
            transitions: { submit: { targetRouteId: 'dispute' } },
            slots: [
              {
                id: 'intake-form',
                slotType: 'definition-form',
                binding: { definitionRef: defUrl },
              },
            ],
          },
          {
            id: 'dispute',
            title: 'Dispute',
            routeClass: 'form',
            slots: [
              {
                id: 'dispute-form',
                slotType: 'definition-form',
                binding: { definitionRef: defUrl },
              },
            ],
          },
        ],
      });

      const diagnostics = validateUxAuthoringQuality(context({}, definition, surface));
      const deadEnd = diagnostics.filter(
        (d) => d.code === UX_AUTHORING_QUALITY_CODES.deadEndFormSlot,
      );

      expect(deadEnd).toHaveLength(1);
      expect(deadEnd[0]).toMatchObject({
        code: UX_AUTHORING_QUALITY_CODES.deadEndFormSlot,
        severity: 'error',
        primarySource: {
          artifactSlot: 'surfaces/0',
          jsonPointer: '/routes/1/slots/0',
        },
        details: {
          reason: 'dead-end-form-slot',
          routeId: 'dispute',
          slotId: 'dispute-form',
          definitionUrl: defUrl,
        },
      });
    });
  });

  describe('APP-GRAPH-COMPONENT-ROUTE-PARAM-UNUSED', () => {
    it('warns when a Component on a parameterized route ignores route parameters', () => {
      const defUrl = 'urn:example:form:review:1.0.0';
      const definition = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'review',
          url: defUrl,
          version: '1.0.0',
          items: makeFields(1),
        },
        defUrl,
      );
      const component = handle('components/0', 'component', {
        $formspecComponent: '0.1',
        id: 'review-component',
        target: { url: defUrl, version: '1.0.0' },
        tree: {
          component: 'Stack',
          children: [{ component: 'Field', fieldKey: 'field_1' }],
        },
      });
      const surface = handle('surfaces/0', 'surface', {
        $formspecSurface: '0.2',
        id: 'urn:example:surface:main',
        routes: [
          {
            id: 'review',
            path: '/review/:applicationId',
            slots: [
              {
                id: 'review-form',
                slotType: 'definition-form',
                binding: { definitionRef: defUrl },
              },
            ],
          },
        ],
      });

      const diagnostics = validateUxAuthoringQuality(
        context({}, definition, component, surface),
      );
      const unused = diagnostics.filter(
        (d) => d.code === UX_AUTHORING_QUALITY_CODES.componentRouteParamUnused,
      );

      expect(unused).toHaveLength(1);
      expect(unused[0]).toMatchObject({
        code: UX_AUTHORING_QUALITY_CODES.componentRouteParamUnused,
        severity: 'warning',
        primarySource: {
          artifactSlot: 'components/0',
          jsonPointer: '/tree',
        },
        details: {
          reason: 'component-route-param-unused',
          routeId: 'review',
          routeParams: ['applicationId'],
        },
      });
    });
  });

  describe('APP-GRAPH-ROUTE-TITLE-MISSING and APP-GRAPH-ROUTE-CLASS-MISSING', () => {
    it('warns when a non-embedded route omits title or routeClass on a classified/titled Surface', () => {
      const surface = handle('surfaces/0', 'surface', {
        $formspecSurface: '0.2',
        id: 'urn:example:surface:main',
        title: 'Passport Portal',
        routes: [
          {
            id: 'start',
            title: 'Start Application',
            routeClass: 'form',
            slots: [],
          },
          {
            id: 'unclassified',
            slots: [],
          },
        ],
      });

      const diagnostics = validateUxAuthoringQuality(context({}, surface));
      expect(diagnostics.map((d) => d.code)).toEqual([
        UX_AUTHORING_QUALITY_CODES.routeTitleMissing,
        UX_AUTHORING_QUALITY_CODES.routeClassMissing,
      ]);
    });
  });

  describe('APP-GRAPH-SURFACE-WIDGET-CHROME-LEAK', () => {
    it('warns when user-facing route or StructuredPanel labels leak URNs, URLs, or binding identifiers', () => {
      const surface = handle('surfaces/0', 'surface', {
        $formspecSurface: '0.2',
        id: 'urn:example:surface:main',
        routes: [
          {
            id: 'summary',
            title: 'Summary for urn:example:form:passport:1.0.0',
            slots: [
              {
                id: 'panel',
                slotType: 'module-widget',
                binding: {
                  moduleId: 'x-panel-module',
                  widgetName: 'StructuredPanel',
                  config: {
                    title: 'Data from dataBindings.primary',
                    blocks: [
                      {
                        id: 'status',
                        type: 'key-value',
                        title: 'Status',
                        items: [
                          {
                            id: 'ref',
                            label: 'https://example.gov/internal/schema',
                            path: 'primary.status',
                          },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      });

      const diagnostics = validateUxAuthoringQuality(context({}, surface));
      const leaks = diagnostics.filter(
        (d) => d.code === UX_AUTHORING_QUALITY_CODES.surfaceWidgetChromeLeak,
      );

      expect(leaks.map((d) => d.primarySource?.jsonPointer)).toEqual([
        '/routes/0/title',
        '/routes/0/slots/0/binding/config/title',
        '/routes/0/slots/0/binding/config/blocks/0/items/0/label',
      ]);
    });
  });

  describe('APP-GRAPH-LOCALE-UI-CHROME-MISSING', () => {
    it('warns when a non-English Locale targets a Definition with Select/FileUpload controls without $ui chrome keys', () => {
      const defUrl = 'urn:example:form:passport:1.0.0';
      const localeUrl = 'urn:example:locale:passport:es-US:1.0.0';
      const definition = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'passport',
          url: defUrl,
          version: '1.0.0',
          items: [
            {
              id: 'book-size',
              type: 'field',
              key: 'bookSize',
              dataType: 'choice',
              presentation: { widgetHint: 'Select' },
            },
            {
              id: 'photo',
              type: 'field',
              key: 'photo',
              dataType: 'attachment',
              presentation: { widgetHint: 'FileUpload' },
            },
          ],
        },
        defUrl,
      );
      const locale = handle(
        'locales/0',
        'locale',
        {
          $formspecLocale: '0.1',
          id: localeUrl,
          locale: 'es-US',
          target: {
            kind: 'definition',
            url: defUrl,
            compatibleVersions: '^1.0.0',
          },
          strings: {
            'field.bookSize.label': 'Tamaño de libreta',
          },
        },
        localeUrl,
      );

      const diagnostics = validateLocaleAssociations(
        context(
          {
            $formspecBundle: '2.4',
            definitions: [{ url: defUrl, version: '1.0.0' }],
            locales: [{ url: localeUrl, locale: 'es-US' }],
          },
          definition,
          locale,
        ),
      );

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({
        code: LOCALE_ASSOCIATION_CODES.localeUiChromeMissing,
        severity: 'warning',
        primarySource: {
          artifactSlot: 'locales/0',
          jsonPointer: '/strings',
        },
        details: {
          reason: 'missing-ui-chrome-keys',
          locale: 'es-US',
          targetUrl: defUrl,
          missingKeys: ['$ui.select.placeholder', '$ui.fileUpload.browse'],
        },
      });
    });
  });

  describe('APP-GRAPH-INLINE-BILINGUAL-SLASH and APP-GRAPH-BINARY-CHOICE-DROPDOWN', () => {
    it('warns when a multi-locale bundle uses slash-concatenated bilingual headings while ignoring form-code slashes in parentheses', () => {
      const localeEn = handle('locales/0', 'locale', {
        $formspecLocale: '0.1',
        id: 'urn:example:locale:en',
        locale: 'en-US',
        strings: {},
      });
      const localeEs = handle('locales/1', 'locale', {
        $formspecLocale: '0.1',
        id: 'urn:example:locale:es',
        locale: 'es-US',
        strings: {},
      });
      const surface = handle('surfaces/0', 'surface', {
        $formspecSurface: '0.2',
        id: 'urn:example:surface:main',
        title: 'Passport Portal',
        routes: [
          {
            id: 'queue',
            title: 'Your authorized tasks / Sus tareas autorizadas',
            routeClass: 'operation',
            slots: [],
          },
          {
            id: 'paper-help',
            title: 'Renew by Mail (Form DS-82 / DS-11 Guidance)',
            routeClass: 'intake',
            slots: [],
          },
        ],
      });

      const diagnostics = validateUxAuthoringQuality(
        context({}, localeEn, localeEs, surface),
      );
      const bilingual = diagnostics.filter(
        (d) => d.code === UX_AUTHORING_QUALITY_CODES.inlineBilingualSlash,
      );

      expect(bilingual).toHaveLength(1);
      expect(bilingual[0]).toMatchObject({
        code: UX_AUTHORING_QUALITY_CODES.inlineBilingualSlash,
        severity: 'warning',
        primarySource: {
          artifactSlot: 'surfaces/0',
          jsonPointer: '/routes/0/title',
        },
      });
    });

    it('warns when a 2-option choice field or Screener question explicitly selects a Dropdown/Select control', () => {
      const defUrl = 'urn:example:form:binary:1.0.0';
      const definition = handle(
        'definitions/0',
        'definition',
        {
          $formspec: '1.0',
          id: 'binary-form',
          url: defUrl,
          version: '1.0.0',
          items: [
            {
              id: 'service_tier',
              type: 'field',
              key: 'serviceTier',
              dataType: 'choice',
              options: [
                { value: 'routine', label: 'Routine' },
                { value: 'expedited', label: 'Expedited' },
              ],
              presentation: { widgetHint: 'Select' },
            },
          ],
        },
        defUrl,
      );
      const screener = handle('screeners/0', 'screener', {
        $formspecScreener: '0.1',
        id: 'urn:example:screener:1.0.0',
        questions: [
          {
            id: 'has_passport',
            prompt: 'Do you have your passport in your possession?',
            control: 'Dropdown',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
          },
        ],
      });

      const diagnostics = validateUxAuthoringQuality(
        context({}, definition, screener),
      );
      const binaryWarnings = diagnostics.filter(
        (d) => d.code === UX_AUTHORING_QUALITY_CODES.binaryChoiceDropdown,
      );

      expect(binaryWarnings).toHaveLength(2);
      expect(binaryWarnings.map((d) => d.primarySource?.jsonPointer)).toEqual([
        '/items/0/presentation/widgetHint',
        '/questions/0',
      ]);
    });
  });
});
