/** @filedesc Full text, explicit assent, snapshot resets, and verified-result gating through supported Surface channels. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { resolveModules, moduleResolverInputFromAppGraph } from '@formspec-org/app-graph';
import addFormats from 'ajv-formats';
import content from '../../../tests/fixtures/signing-content/content-en.json';
import common from '../../../schemas/common.schema.json';
import { SigningCeremony, SIGNING_CEREMONY_CONFIG_SCHEMA, SIGNING_CEREMONY_WIDGET_SHAPE, starterWidgetModule } from '../src/widgets/index.js';
import type { SurfaceWidgetProps } from '../src/widget-api.js';
import type { SigningCeremonyData } from '../src/widgets/signing-ceremony.js';
const copy = { heading:'Review and sign',readInstruction:'Read the complete text.',readConfirmation:'I have read the complete text.',signerName:'Your name',pending:'Working…',signed:'Signed. You can submit now.',failed:'The action failed. Try again.',unavailable:'The required action is unavailable.' };
function props(): SurfaceWidgetProps {
 const response = {$formspecResponse:'1.0',id:'response-1',definitionUrl:'urn:test:signing-content',definitionVersion:'2.0.0',status:'completed',authored:'2026-10-06T12:00:00Z',data:{answer:'yes'}};
 return {moduleId:'x-starter',widgetName:'SigningCeremony',slot:{id:'signing'},route:{surfaceId:'surface',routeId:'sign',routeClass:'ceremony',params:{}},headingLevel:2,admitsTenantTheme:false,
 config:{contentRefs:{en:content.source},copy:{en:copy}},data:{content:structuredClone(content),response,draft:{id:'draft-1',version:7,responseHash:'a'.repeat(64)},actor:{id:'owner-1'},signingResult:{state:'unsigned'},actionLabels:{'sign.label':'Sign','submit.label':'Submit'}},
 actions:[{outputName:'sign',actionRef:'urn:sign',intent:'urn:sign',label:{ref:'sign.label'}},{outputName:'submit',actionRef:'urn:submit',intent:'urn:submit',label:{ref:'submit.label'}},{outputName:'paper',actionRef:'urn:paper',intent:'urn:paper',label:{literal:'Use paper'}}],
 emitAction:vi.fn(()=>({started:true,completion:Promise.resolve({status:'completed' as const})}))};
}
function mount(p:SurfaceWidgetProps) { const el=document.createElement('div');document.body.append(el);const root=createRoot(el);act(()=>root.render(<SigningCeremony {...p}/>));return {el,rerender(next:SurfaceWidgetProps){act(()=>root.render(<SigningCeremony {...next}/>));}}; }
function button(el:HTMLElement,label:string) { return Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!; }
function bottom(el:HTMLElement) { const area=el.querySelector<HTMLElement>('[role=region]')!;Object.defineProperties(area,{clientHeight:{value:100,configurable:true},scrollHeight:{value:300,configurable:true},scrollTop:{value:200,configurable:true}});act(()=>area.dispatchEvent(new Event('scroll',{bubbles:true}))); }
function name(el:HTMLElement,value='Test Person') { const input=el.querySelector<HTMLInputElement>('input[autocomplete=name]')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}); }
function assent(el:HTMLElement) { bottom(el);const boxes=el.querySelectorAll<HTMLInputElement>('input[type=checkbox]');act(()=>boxes[0]!.click());act(()=>boxes[1]!.click());name(el); }
function signed(p:SurfaceWidgetProps):SurfaceWidgetProps {
 const next=structuredClone({...p,emitAction:undefined});next.emitAction=p.emitAction;
 const data=next.data as unknown as SigningCeremonyData;
 const commitment={version:'1.0' as const,draftId:data.draft.id,draftVersion:data.draft.version,actorRef:data.actor.id,signerName:'Test Person',signedAt:'2026-10-06T12:00:00Z',consentAccepted:true as const,content:data.content,documentHash:'b'.repeat(64),documentHashAlgorithm:'sha-256' as const};
 data.response.extensions={'x-formspec-signing-content':commitment};
 data.response.authoredSignatures=[{signatureId:'sig-1',documentId:content.documentId,signingIntent:content.signingIntent,signatureValue:'AA==',signerId:'owner-1',signerName:'Test Person',consentAccepted:true,consentTextRef:content.electronicConsent.textRef,consentVersion:content.electronicConsent.version,affirmationText:content.affirmationText,documentHash:commitment.documentHash,documentHashAlgorithm:'sha-256',signatureProvider:'urn:formspec:provider:delegated-response@1',ceremonyId:'ceremony-1',signedPayload:{canonicalization:'formspec-response-signing-v1',digest:'c'.repeat(64),digestAlgorithm:'sha-256',responseId:data.response.id!,definitionUrl:data.response.definitionUrl,definitionVersion:data.response.definitionVersion,signedAt:commitment.signedAt,signingIntent:content.signingIntent}}];
 data.draft.version+=1;
 data.signingResult={state:'signed',response:structuredClone(data.response),draft:{id:data.draft.id,version:data.draft.version},verification:{mode:'delegated-service-key',provider:'urn:formspec:provider:delegated-response@1',keyId:'actual-key'}};
 return next;
}
describe('SigningCeremony',()=>{
 it('shows an unknown Submit outcome, preserves signed data and fences forced clicks across rerender',async()=>{
  const p=signed(props());p.emitAction=vi.fn(()=>({started:true,completion:Promise.resolve({status:'outcome-unknown' as const})}));
  const original=structuredClone(p.data);const view=mount(p);
  await act(async()=>button(view.el,'Submit').click());
  expect(view.el.textContent).toContain('Your signed response is saved. The submission outcome is unknown. Check application status.');
  expect(view.el.textContent).not.toContain(copy.failed);expect(view.el.textContent).not.toContain(copy.signed);
  expect(button(view.el,'Submit').disabled).toBe(true);
  view.rerender({...p});const submit=button(view.el,'Submit');submit.disabled=false;
  await act(async()=>submit.click());expect(p.emitAction).toHaveBeenCalledOnce();expect(p.data).toEqual(original);submit.disabled=true;
  await act(async()=>button(view.el,'Use paper').click());
  expect(view.el.textContent).toContain('The submission outcome is unknown.');expect(button(view.el,'Submit').disabled).toBe(true);
 });
 it('keeps ordinary Submit failures retryable without claiming unknown or accepted',async()=>{
  const p=signed(props());p.emitAction=vi.fn(()=>({started:true,completion:Promise.resolve({status:'failed' as const})}));
  const view=mount(p);await act(async()=>button(view.el,'Submit').click());
  expect(view.el.textContent).toContain(copy.failed);expect(view.el.textContent).not.toContain('The submission outcome is unknown.');
  expect(button(view.el,'Submit').disabled).toBe(false);
 });
 it('does not classify a Sign failure as an unknown Submit outcome',async()=>{
  const p=props();p.emitAction=vi.fn(()=>({started:true,completion:Promise.resolve({status:'outcome-unknown' as const})}));
  const view=mount(p);assent(view.el);await act(async()=>button(view.el,'Sign').click());
  expect(view.el.textContent).toContain(copy.failed);expect(view.el.textContent).not.toContain('The submission outcome is unknown.');
  expect(button(view.el,'Submit').disabled).toBe(true);
 });
 it('publishes exact delivery, required inputs, config schema and separate action outputs',()=>{
  const shape=SIGNING_CEREMONY_WIDGET_SHAPE;
  expect(shape.dataInputs.map(i=>i.name)).toEqual(['content','response','draft','actor','signingResult','actionLabels','review']);
  expect(shape.dataInputs.filter(i=>i.required)).toHaveLength(6);
  expect(shape.actionOutputs.map(o=>o.name)).toEqual(['sign','submit','paper']);
  expect(starterWidgetModule('x-starter').contracts?.SigningCeremony?.deliveryContractId).toBe(shape.deliveryContractId);
  const ajv=new Ajv2020({strict:false});addFormats(ajv);ajv.addSchema(common);
  const validate=ajv.compile(SIGNING_CEREMONY_CONFIG_SCHEMA);expect(validate(props().config)).toBe(true);
  expect(validate({...props().config,declaration:'host copy'})).toBe(false);
 });
 it('qualifies authored config through native ModuleResolver default schema admission',()=>{
  function resolve(payload:unknown) {
   const manifest={slot:'app',artifactKind:'appManifest' as const,status:'loaded' as const,source:'memory://app',document:{$formspecApp:'1.0',version:'1.0.0',modules:[{id:'x-starter',version:'0.1.0'}]}};
   const surface={slot:'surfaces[0]',artifactKind:'surface' as const,status:'loaded' as const,source:'memory://surface',document:{$formspecSurface:'0.2',id:'signing',entry:'sign',routes:[{id:'sign',path:'/',slots:[{id:'signing',slotType:'module-widget',binding:{moduleId:'x-starter',widgetName:'SigningCeremony',config:payload}}]}]}};
   const registry={slot:'registries[0]',artifactKind:'registry' as const,status:'loaded' as const,source:'memory://registry',document:{$formspecRegistry:'1.0',version:'1.0.0',entries:[{name:'x-starter',category:'module',version:'0.1.0',contributes:['x-signing-ceremony']},{name:'x-signing-ceremony',category:'widget',version:'0.1.0',widgetShape:SIGNING_CEREMONY_WIDGET_SHAPE}]}};
   return resolveModules(moduleResolverInputFromAppGraph({manifest,handles:[surface,registry]}));
  }
  expect(resolve(props().config).ok).toBe(true);
  const invalid=structuredClone(props().config);delete (invalid.contentRefs as any).en.version;
  expect(resolve(invalid).ok).toBe(false);
  expect(resolve({...props().config,declaration:'parallel legal source'}).ok).toBe(false);
 });
 it('preserves complete exact strings and exposes keyboard reading and paper alternative',()=>{
  const {el}=mount(props());
  expect(el.querySelector('[data-probe=signing-declaration]')?.textContent).toBe(content.declaration);
  expect(el.querySelector('[data-probe=signing-electronic-consent]')?.textContent).toBe(content.electronicConsent.text);
  expect(el.querySelector('[data-probe=signing-delegation]')?.textContent).toBe(content.delegatedSigningNotice);
  expect(el.querySelector('[data-probe=signing-paper-alternative]')?.textContent).toBe(content.paperAlternative);
  expect(el.querySelector<HTMLElement>('[role=region]')?.tabIndex).toBe(0);
  expect(button(el,'Sign').disabled).toBe(true);expect(button(el,'Submit').disabled).toBe(true);
 });
 it('requires reaching end, separate reading/consent and name; emits actual assent without time or auto-submit',async()=>{
  const p=props();const {el}=mount(p);assent(el);expect(button(el,'Sign').disabled).toBe(false);
  await act(async()=>button(el,'Sign').click());
  expect(p.emitAction).toHaveBeenCalledTimes(1);
  expect(p.emitAction).toHaveBeenCalledWith('sign',{draftId:'draft-1',draftVersion:7,responseId:'response-1',responseHash:'a'.repeat(64),source:content.source,locale:'en',signerName:'Test Person',consentAccepted:true});
  expect(button(el,'Submit').disabled).toBe(true);
 });
 it('keeps paper choice separate from electronic signing and submission',async()=>{
  const p=props();const {el}=mount(p);await act(async()=>button(el,'Use paper').click());expect(p.emitAction).toHaveBeenCalledWith('paper',{source:content.source,locale:'en'});
 });
 it('allows distinct Submit only for exact qualified signed current revision n+1',async()=>{
  const p=signed(props());const {el}=mount(p);expect(button(el,'Sign').disabled).toBe(true);expect(button(el,'Submit').disabled).toBe(false);
  await act(async()=>button(el,'Submit').click());expect(p.emitAction).toHaveBeenCalledWith('submit',{draftId:'draft-1',draftVersion:8,canonical_response:p.data.response});
 });
 for(const [label,change] of Object.entries({
  'stale receipt':(d:any)=>d.signingResult.draft.version--,
  'edited answers':(d:any)=>d.response.data.answer='changed',
  'changed actor':(d:any)=>d.actor.id='other',
  'changed source content':(d:any)=>d.content.declaration+='changed',
  'wrong unsigned revision':(d:any)=>d.response.extensions['x-formspec-signing-content'].draftVersion=8,
  'missing outer consent':(d:any)=>d.response.authoredSignatures[0].consentAccepted=false,
  'wrong provider':(d:any)=>d.signingResult.verification.provider='urn:other',
  'personal key claim':(d:any)=>d.signingResult.verification.mode='personal-key',
  'missing signature':(d:any)=>delete d.response.authoredSignatures,
 })) it('refuses Submit for '+label,()=>{const p=signed(props());change(p.data);const {el}=mount(p);expect(button(el,'Submit').disabled).toBe(true);});
 it('resets assent on answer, revision, actor or content changes',()=>{
  const p=props();const view=mount(p);assent(view.el);expect(button(view.el,'Sign').disabled).toBe(false);
  const next=props();(next.data.response as any).data.answer='changed';view.rerender(next);
  expect(view.el.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
  expect(view.el.querySelector<HTMLInputElement>('input[autocomplete=name]')?.value).toBe('');expect(button(view.el,'Sign').disabled).toBe(true);
 });
 for (const field of ['response', 'content']) it('refuses mutation without rerender of '+field, async()=>{
  const p=props();const {el}=mount(p);assent(el);expect(button(el,'Sign').disabled).toBe(false);
  if(field==='response') (p.data.response as any).data.answer='changed';else (p.data.content as any).declaration+='changed';
  await act(async()=>button(el,'Sign').click());expect(p.emitAction).not.toHaveBeenCalled();
 });
 it('displays the committed signer name after signed refresh',()=>{const {el}=mount(signed(props()));expect(el.querySelector<HTMLInputElement>('input[autocomplete=name]')?.value).toBe('Test Person');});
 it('renders selected locale copy and refs without fallback or invented labels',()=>{
  const p=props();const c=structuredClone(content);c.locale='es';c.source.ref=c.source.ref.replace('certification-en','certification-es');p.data={...p.data,content:c};p.config={contentRefs:{es:c.source},copy:{es:{...copy,heading:'Revisar y firmar'}}};p.data.actionLabels={'sign.label':'Firmar','submit.label':'Enviar'};
  const {el}=mount(p);expect(el.textContent).toContain('Revisar y firmar');expect(button(el,'Firmar')).toBeDefined();
 });
 it('refuses incomplete data, tenant-themed routes and ambiguous locale config',()=>{
  for(const change of [(p:SurfaceWidgetProps)=>{p.data={...p.data,signingResult:undefined};},(p:SurfaceWidgetProps)=>{p.admitsTenantTheme=true;},(p:SurfaceWidgetProps)=>{p.config={...p.config,copy:{en:copy,EN:copy}};}]) {
   const p=props();change(p);const {el}=mount(p);expect(el.querySelector('button')).toBeNull();
  }
 });
 it('withholds unresolved mapped action labels',()=>{const p=props();p.data={...p.data,actionLabels:{}};const {el}=mount(p);expect(el.textContent).toContain(copy.unavailable);expect(button(el,'Sign')).toBeUndefined();});
 it('waits for action completion, reports failure and never treats completion as signing',async()=>{
  let complete!:(r:{status:'failed'})=>void;const p=props();p.emitAction=vi.fn(()=>({started:true,completion:new Promise(resolve=>complete=resolve)}));const {el}=mount(p);assent(el);
  act(()=>button(el,'Sign').click());expect(button(el,'Sign').disabled).toBe(true);expect(el.textContent).toContain(copy.pending);
  await act(async()=>complete({status:'failed'}));expect(el.textContent).toContain(copy.failed);expect(button(el,'Submit').disabled).toBe(true);
 });
});

function requireReview(p:SurfaceWidgetProps,status='ready') {
 p.config={...p.config,requireResponseReview:true,copy:{en:{...copy,reviewPending:'Full response review is loading.',reviewUnavailable:'Full response review is unavailable. Retry the attachment preview.'}}};
 const d=p.data as any;d.review={contextIdentity:'d'.repeat(64),state:{status,contextIdentity:'d'.repeat(64),responseHash:d.draft.responseHash,actorRef:d.actor.id,draft:{id:d.draft.id,version:d.draft.version},locale:d.content.locale,phase:d.signingResult.state==='signed'?'before-submit':'before-sign'}};return p;
}
describe('SigningCeremony full Response review gate',()=>{
 it('disables Sign and refuses forced clicks when opted-in review is missing or pending',async()=>{
  for(const missing of [true,false]) {const p=requireReview(props(),'pending');if(missing)delete (p.data as any).review;const view=mount(p);assent(view.el);const sign=button(view.el,'Sign');expect(sign.disabled).toBe(true);expect(view.el.textContent).toContain(missing?'Full response review is unavailable.':'Full response review is loading.');sign.disabled=false;await act(async()=>sign.click());expect(p.emitAction).not.toHaveBeenCalled();}
 });
 it.each(['contextIdentity','responseHash','actorRef','draft','locale','phase','status'])('refuses mismatched %s on otherwise ready review',field=>{
  const p=requireReview(props());const r=(p.data as any).review.state;r[field]=field==='draft'?{id:'other',version:7}:field==='status'?'unavailable':'wrong';const view=mount(p);assent(view.el);expect(button(view.el,'Sign').disabled).toBe(true);
 });
 it('enables Sign only after explicit assent and matching review, resets assent on expected identity change',()=>{
  const p=requireReview(props());const view=mount(p);expect(button(view.el,'Sign').disabled).toBe(true);assent(view.el);expect(button(view.el,'Sign').disabled).toBe(false);
  const next=requireReview(props());(next.data as any).review.contextIdentity='e'.repeat(64);(next.data as any).review.state.contextIdentity='e'.repeat(64);view.rerender(next);expect(button(view.el,'Sign').disabled).toBe(true);expect(view.el.querySelector<HTMLInputElement>('input[type=checkbox]')?.checked).toBe(false);
 });
 it('gates Submit on review of the exact returned signed phase',async()=>{
  const p=requireReview(signed(props()),'pending');const view=mount(p);expect(button(view.el,'Submit').disabled).toBe(true);const ready=requireReview(signed(props()));view.rerender(ready);expect(button(view.el,'Submit').disabled).toBe(false);
  (ready.data as any).review.state.phase='before-sign';button(view.el,'Submit').disabled=false;await act(async()=>button(view.el,'Submit').click());expect(ready.emitAction).not.toHaveBeenCalled();
 });
});

it('refuses mutable opt-in flag bypass without a rerender',async()=>{
 const p=requireReview(props(),'ready');const view=mount(p);assent(view.el);expect(button(view.el,'Sign').disabled).toBe(false);
 (p.config as any).requireResponseReview=false;button(view.el,'Sign').disabled=false;await act(async()=>button(view.el,'Sign').click());expect(p.emitAction).not.toHaveBeenCalled();
});

it('requires localized review reason strings only for opted-in config',()=>{
 const ajv=new Ajv2020({strict:false});addFormats(ajv);ajv.addSchema(common);const validate=ajv.compile(SIGNING_CEREMONY_CONFIG_SCHEMA);
 expect(validate(props().config)).toBe(true);expect(validate({...props().config,requireResponseReview:true})).toBe(false);expect(validate(requireReview(props()).config)).toBe(true);
});
