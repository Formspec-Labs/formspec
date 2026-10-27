import { describe, it, expect } from 'vitest';
import { admitScreenerPresentation, resolveScreenerDetermination } from '../src/screener-slot.js';
const document = { $formspecScreener: '1.0', url: 'urn:gate', version: '1.0.0', items: [{ type: 'field', key: 'eligible', dataType: 'boolean', label: 'Eligible' }], binds: [{path:'eligible',required:'true'}], evaluation: [{id:'main',strategy:'first-match',routes:[{condition:'$eligible',target:'surface:apply'},{condition:'true',target:'surface:paper'}]}] } as any;
const record = () => ({$formspecDetermination:'1.0',screener:{url:'urn:gate',version:'1.0.0'},evaluationVersion:'1.0.0',timestamp:'2026-10-09T00:00:00Z',status:'completed',overrides:{matched:[],halted:false},phases:[{id:'main',status:'evaluated',strategy:'first-match',matched:[{target:'surface:paper'}],eliminated:[],warnings:[]}],inputs:{eligible:{state:'answered',value:false}}}) as any;
const resolve = (r:any) => resolveScreenerDetermination({document,allowedTargets:['surface:apply','surface:paper'],determination:r,answers:{eligible:false},evaluationTime:'2026-10-09T00:00:00Z',nowIso:'2026-10-09T00:00:01Z'});
describe('native Screener admission',()=>{
 it('admits canonical flat boolean fields and literal requiredness',()=>expect(admitScreenerPresentation(document).status).toBe('ready'));
 it.each([{...document,binds:[{path:'eligible',required:true}]},{...document,binds:[{path:'eligible',required:'$other'}]},{...document,binds:[{path:'eligible',readonly:'true'}]},{...document,items:[{...document.items[0],required:true}]},{...document,items:[{type:'group',key:'g',children:document.items}]}])('refuses unsupported presentation %j',d=>expect(admitScreenerPresentation(d).status).toBe('unavailable'));
 it('admits canonical Bind generation metadata without changing routing or authored metadata',()=>{
  const annotated={...document,binds:[{...document.binds[0],'x-generation':{anchors:['need:d1-r13@1']}}]};
  const before=JSON.stringify(annotated);
  expect(admitScreenerPresentation(annotated)).toEqual({status:'ready'});
  expect(resolveScreenerDetermination({document:annotated,allowedTargets:['surface:apply','surface:paper'],determination:record(),answers:{eligible:false},evaluationTime:'2026-10-09T00:00:00Z',nowIso:'2026-10-09T00:00:01Z'})).toEqual(resolve(record()));
  expect(JSON.stringify(annotated)).toBe(before);
 });
 it.each([
  [{path:'eligible',required:'true',readonly:'true','x-generation':{anchors:['need:d1-r13@1']}}],
  [{path:'eligible',required:'$other','x-generation':{anchors:['need:d1-r13@1']}}],
  [{path:'foreign',required:'true','x-generation':{anchors:['need:d1-r13@1']}}],
  [{path:'eligible',required:'true','x-generation':{anchors:['need:d1-r13@1']}},{path:'eligible',required:'true'}],
  [{path:'eligible',required:'true',unknownSemantic:true,'x-generation':{anchors:['need:d1-r13@1']}}],
 ].map(binds=>({binds})))('keeps unsupported Bind semantics refused with generation metadata %j',({binds})=>expect(admitScreenerPresentation({...document,binds})).toEqual({status:'unavailable',reason:'bind-unsupported'}));
 it('routes deliberate false through the actual record',()=>expect(resolve(record())).toEqual({status:'ready',target:'surface:paper'}));
 it.each(['partial','expired','unavailable'])('refuses %s',status=>expect(resolve({...record(),status}).status).toBe('refused'));
 it('checks every match rather than filtering a disallowed target',()=>{const r=record();r.overrides.matched=[{target:'surface:foreign'}];expect(resolve(r).status).toBe('refused');});
 it('refuses distinct destinations and deduplicates equal destinations',()=>{const r=record();r.overrides.matched=[{target:'surface:apply'}];expect(resolve(r).status).toBe('refused');r.overrides.matched=[{target:'surface:paper'}];expect(resolve(r).status).toBe('ready');});
 it.each([{}, {eligible:{state:'not-presented',value:false}}, {eligible:{state:'answered',value:'false'}}, {eligible:{state:'answered',value:true}}, {eligible:{state:'answered',value:false},extra:{state:'answered',value:1}}])('refuses incomplete or changed input %j',inputs=>expect(resolve({...record(),inputs}).status).toBe('refused'));
 it('refuses warnings, changed pins, future time and stale invocation',()=>{for(const r of [{...record(),evaluationVersion:'2.0.0'},{...record(),timestamp:'2027-01-01T00:00:00Z'},{...record(),timestamp:'2026-10-08T00:00:00Z'},{...record(),phases:[{...record().phases[0],warnings:['bad']}]}])expect(resolve(r).status).toBe('refused');});
 it('requires valid unexpired validity when authored',()=>{const input={document:{...document,resultValidity:'PT1H'},allowedTargets:['surface:paper'],determination:record(),answers:{eligible:false},evaluationTime:'2026-10-09T00:00:00Z',nowIso:'2026-10-09T00:00:01Z'};expect(resolveScreenerDetermination(input).status).toBe('refused');input.determination.validity={validUntil:'2026-10-09T01:00:00Z'};expect(resolveScreenerDetermination(input).status).toBe('ready');});
});
