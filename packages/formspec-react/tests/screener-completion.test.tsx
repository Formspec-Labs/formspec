import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, expect, it, vi } from 'vitest';
import { initFormspecEngine } from '@formspec-org/engine';
import { useScreener } from '../src/screener/use-screener';
import type { UseScreenerOptions, UseScreenerResult } from '../src/screener/types';
beforeAll(() => initFormspecEngine());
const document = {$formspecScreener:'1.0',url:'urn:gate',version:'1.0.0',items:[{type:'field',key:'eligible',dataType:'boolean'}],evaluation:[{id:'main',strategy:'first-match',routes:[{condition:'true',target:'surface:paper'}]}]} as any;
function mount(complete: NonNullable<UseScreenerOptions['onDetermination']>) {
 let hook!: UseScreenerResult;
 function Probe(){hook=useScreener({screenerDocument:document,onDetermination:complete});return null;}
 const root=createRoot(globalThis.document.createElement('div'));act(()=>root.render(<Probe/>));
 act(()=>hook.setAnswer('eligible',false));
 return {get hook(){return hook;},unmount:()=>act(()=>root.unmount())};
}
it('blocks a reentrant submit before invoking the host',()=>{
 const complete=vi.fn(()=>{m.hook.submit();return {status:'refused',reason:'retry'} as const;});const m=mount(complete);
 act(()=>m.hook.submit());expect(complete).toHaveBeenCalledTimes(1);expect(m.hook.state).toBe('answering');m.unmount();
});
it.each(['restart','answer'] as const)('aborts pending work on %s and ignores late success',async operation=>{
 let resolve!: (result:any)=>void;const complete=vi.fn(()=>new Promise<any>(yes=>resolve=yes));const m=mount(complete);act(()=>m.hook.submit());
 const signal=complete.mock.calls[0]![3].signal;act(()=>operation==='restart'?m.hook.restart():m.hook.setAnswer('eligible',true));expect(signal.aborted).toBe(true);
 await act(async()=>{resolve({status:'accepted'});await Promise.resolve();});expect(m.hook.state).toBe(operation==='restart'?'idle':'answering');m.unmount();
});
it('uses a fresh act after explicit new-act refusal and answer edits',()=>{
 const complete=vi.fn(()=>({status:'refused',reason:'fresh-screening',retry:'new-act'} as const));const m=mount(complete);
 act(()=>m.hook.submit());act(()=>m.hook.submit());expect(complete.mock.calls[0]![3].completionId).not.toBe(complete.mock.calls[1]![3].completionId);
 act(()=>m.hook.setAnswer('eligible',true));act(()=>m.hook.submit());expect(complete.mock.calls[2]![1]).toEqual({eligible:true});m.unmount();
});

it('accepts only once across sequential same-turn submits',()=>{
 const complete=vi.fn(()=>({status:'accepted'} as const));const m=mount(complete);
 act(()=>{m.hook.submit();m.hook.submit();});expect(complete).toHaveBeenCalledTimes(1);
 act(()=>m.hook.restart());act(()=>m.hook.setAnswer('eligible',false));act(()=>m.hook.submit());expect(complete).toHaveBeenCalledTimes(2);m.unmount();
});
