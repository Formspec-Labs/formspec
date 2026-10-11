import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import type { FormDefinition, SurfaceDocument, ResponseActionsDocument } from '@formspec-org/types';
import type { ResolvedBundle } from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
const DEFINITION_REF = 'https://example.test/definitions/application';
const SURFACE_REF = 'https://example.test/surfaces/respondent';
beforeAll(async () => { await initFormspecEngine(); });
function fixture(): ResolvedBundle {
  const surface = {
    $formspecSurface: '0.2',
    id: 'respondent',
    entry: 'apply',
    routes: [
      {
        id: 'apply',
        path: '/apply',
        routeClass: 'intake',
        slots: [
          {
            id: 'form',
            slotType: 'definition-form',
            binding: { definitionRef: DEFINITION_REF },
          },
        ],
      },
    ],
  } as unknown as SurfaceDocument;
  const definition = {
    $formspec: '1.0',
    url: DEFINITION_REF,
    version: '1.0.0',
    title: 'Application',
    items: [],
  } as unknown as FormDefinition;
  const actions = {
    $formspecResponseActions: '1.0',
    version: '1.0.0',
    targetDefinition: { url: DEFINITION_REF },
    actions: [{ id: 'submitApplication', intent: 'submit' }],
  } as unknown as ResponseActionsDocument;
  return {
    manifest: {
      $formspecBundle: '2.4',
      surfaces: [{ url: SURFACE_REF }],
      entrySurface: SURFACE_REF,
      definitions: [{ url: DEFINITION_REF }],
    },
    title: 'Application',
    surfaces: [surface],
    surfaceRefs: new Map([[surface, SURFACE_REF]]),
    experiences: [],
    tenantTheme: undefined,
    registries: [],
    responseActions: [actions],
    definitions: new Map([[DEFINITION_REF, definition]]),
    diagnostics: [],
  };
}


it.each([['en','Submit review action'],['es-US','Enviar revisión']])('resolves declared native Action labels in %s through the exact Definition Locale', (activeLocale, expectedLabel) => {
 const bundle = fixture();
 bundle.responseActions[0].scope = 'response';
 Object.assign(bundle.responseActions[0].actions[0], {id:'submit-review',effects:[{type:'hostEvent',eventName:'review-complete',onError:'fail'}], validation:{profile:'on-submit',blocking:'block-on-error',persistence:'complete-response'}});
 bundle.responseActions[0].actions[0].label = { ref: '$action.submitApplication.label' };
 const localeDocuments = [
 { $formspecLocale:'2.0',version:'1.0.0',locale:'en',target:{kind:'definition',url:DEFINITION_REF},strings:{'$action.submitApplication.label':'Submit review action'} },
 { $formspecLocale:'2.0',version:'1.0.0',locale:'es-US',target:{kind:'definition',url:DEFINITION_REF},strings:{'$action.submitApplication.label':'Enviar revisión'} },
 { $formspecLocale:'2.0',version:'1.0.0',locale:'en',target:{kind:'definition',url:'urn:other-definition'},strings:{'$action.submitApplication.label':'Wrong target'} },
 ] as any;
 const container=document.createElement('div'); document.body.appendChild(container);
 const root=createRoot(container);
 const show=(activeLocale:string)=>root.render(<SurfaceApp bundle={bundle} location="/apply" onNavigate={()=>{}} onDefinitionActionResult={()=>{}} localeDocuments={localeDocuments} activeLocale={activeLocale} setDocumentTitle={false}/>);
 act(()=>show(activeLocale));
 expect(container.querySelector('.formspec-theme-scope button')?.textContent).toBe(expectedLabel);
 expect(container.textContent).not.toContain('Wrong target');
});
