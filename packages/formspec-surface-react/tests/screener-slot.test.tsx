import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import * as reactPackage from '@formspec-org/react';
import * as engine from '@formspec-org/engine';
import { dereferenceBundleExport } from '@formspec-org/surface';
import { SurfaceApp } from '../src/SurfaceApp.js';
beforeAll(() => initFormspecEngine());
const screener = {$formspecScreener:'1.0',url:'urn:gate',version:'1.0.0',title:'Eligibility',items:[{type:'field',key:'eligible',dataType:'boolean',label:'Eligible?'}],binds:[{path:'eligible',required:'true'}],evaluation:[{id:'main',strategy:'first-match',routes:[{condition:'$eligible',target:'surface:apply'},{condition:'true',target:'surface:paper'}]}]};
function mount(embedded = false, localized = false) {
 const bundle=dereferenceBundleExport({manifest:{$formspecBundle:'2.4',surfaces:[{url:'urn:surface',version:'1.0.0'}],screeners:[{url:'urn:gate',version:'1.0.0'}]},documents:{'urn:gate':screener,'urn:surface':{$formspecSurface:'0.3',id:'app',entry:'screen',routes:[{id:'screen',path:'/screen',routeClass:'intake',slots:[{id:'gate',slotType:'screener',binding:{screenerRef:'urn:gate',allowedTargets:['surface:apply','surface:paper']}}]},{id:'apply',path:'/apply',routeClass:'intake',slots:[{id:'t',slotType:'static-content',binding:{kind:'text',text:'Apply'}}]},{id:'paper',path:'/paper',routeClass:'intake',slots:[{id:'t',slotType:'static-content',binding:{kind:'text',text:'Paper'}}]}]}}});
 if (localized) bundle.localeDocuments = [{ $formspecLocale: '2.1', locale: 'es-US', version: '1.0.0', target: { kind: 'screener', url: 'urn:gate' }, strings: { '$form.title': 'Elegibilidad', '$ui.screener.yes': 'Sí' } }];
 if (embedded) {const surface=bundle.surfaces[0]!;const native=surface.routes[0]!.slots;surface.routes[0]!.slots=[{id:'embedded',slotType:'embed-route',binding:{routeRef:'questions'}}] as any;surface.routes.push({id:'questions',path:'/questions',routeClass:'intake',slots:native} as any);}
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);const onNavigate=vi.fn();
 const show=(nextBundle=bundle,nextLocation="/screen", activeLocale="en")=>act(()=>root.render(<SurfaceApp bundle={nextBundle} location={nextLocation} onNavigate={onNavigate} activeLocale={activeLocale} setDocumentTitle={false}/>));
 show();
 const answer=(value:string)=>act(()=>{const select=container.querySelector('select')!;select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));});
 const submit=()=>act(()=>{(container.querySelector('.formspec-screener-continue') as HTMLButtonElement).click();});
 return {container,onNavigate,answer,submit,bundle,show,unmount:()=>act(()=>root.unmount())};
}
describe('native Screener Surface slot',()=>{
 it('navigates a native Screener inside an embedded route',()=>{const m=mount(true);m.answer('no');m.submit();expect(m.onNavigate).toHaveBeenCalledExactlyOnceWith('/paper');});
 it('retires old completion callbacks on package replacement, route return and unmount',()=>{
  const Original=reactPackage.FormspecScreener;let captured:any;
  const spy=vi.spyOn(reactPackage,'FormspecScreener').mockImplementation(props=>{captured=props.onDetermination;return <Original {...props}/>;});
  try {
   const m=mount();m.answer('no');const first=captured;
   const invoke=(callback:any)=>{const evaluationTime=new Date().toISOString();const answers={eligible:false};return callback(engine.wasmEvaluateScreenerDocument(screener as any,answers,{nowIso:evaluationTime}),answers,evaluationTime);};
   m.show(structuredClone(m.bundle));expect(m.container.querySelector('select')!.value).toBe('');expect(invoke(first)).toEqual({status:'refused',reason:'screener-generation-stale'});
   const second=captured;m.show(m.bundle,'/paper');m.show(m.bundle);expect(invoke(second).status).toBe('refused');
   const third=captured;m.unmount();expect(invoke(third).status).toBe('refused');expect(m.onNavigate).not.toHaveBeenCalled();
  } finally {spy.mockRestore();}
 });

 it.each([['yes','/apply'],['no','/paper']])('routes explicit %s through the native Determination', (answer,href)=>{const m=mount();expect(m.container.querySelector('select')!.value).toBe('');m.submit();expect(m.onNavigate).not.toHaveBeenCalled();m.answer(answer);m.submit();expect(m.onNavigate).toHaveBeenCalledExactlyOnceWith(href);});
 it('retains visible controls and false answer on refused completion',()=>{
  const evaluate=engine.wasmEvaluateScreenerDocument;
  const spy=vi.spyOn(engine,'wasmEvaluateScreenerDocument').mockImplementation((...args)=>({...evaluate(...args),status:'expired'}));
  try {const m=mount();m.answer('no');m.submit();expect(m.onNavigate).not.toHaveBeenCalled();expect(m.container.querySelector('select')!.value).toBe('no');expect(m.container.querySelector('[data-finding]')?.getAttribute('data-finding')).toBe('determination-not-completed');expect(m.container.querySelector('.formspec-screener-continue')).not.toBeNull();} finally {spy.mockRestore();}
 });
 it.each([false, true])('preserves native answers and completion after Locale switch, embedded=%s', embedded => {
  const m = mount(embedded, true); m.answer('no');
  m.show(m.bundle, '/screen', 'es-US');
  expect(m.container.querySelector('h2')?.textContent).toBe('Elegibilidad');
  expect(m.container.querySelector('select')?.value).toBe('no');
  m.submit(); expect(m.onNavigate).toHaveBeenCalledExactlyOnceWith('/paper');
 });

});
