import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Ajv from 'ajv/dist/2020.js';
import { StructuredPanel } from '../src/widgets/structured-panel.js';
import { STRUCTURED_PANEL_CONFIG_SCHEMA } from '../src/widget-metadata.js';
import common from '../../../schemas/common.schema.json';
import { render, textOf } from './render.js';
const trace = { 'x-generation': { anchors: ['need:ordered-records@1'] } };
const orderBy = [
  { path: 'state', kind: 'priority', values: ['Ready'] },
  { path: 'created', kind: 'date-time', direction: 'desc' },
  { path: 'id', kind: 'string', direction: 'asc' },
];
function block(order: unknown = orderBy) { return {
  type: 'table', id: 'records', path: 'rows', columns: [{ id: 'id', label: 'Record', path: 'id', ...trace }],
  ...trace, ...(order === false ? {} : { orderBy: order }),
}; }
function ids(rows: readonly unknown[], order: unknown = orderBy) {
  const container = render(<StructuredPanel moduleId="x-records" widgetName="StructuredPanel"
    slot={{id:'slot',title:undefined}} route={{surfaceId:'s',routeId:'r',routeClass:'operation',params:{}}}
    headingLevel={2} config={{blocks:[block(order)]}} data={{rows}} emitAction={()=>{}} admitsTenantTheme />);
  return [...container.querySelectorAll('tbody tr')].map(row => textOf(row.querySelector('td')));
}
const ajv = new Ajv({ strict: false }); ajv.addSchema(common);
const validate = ajv.compile(STRUCTURED_PANEL_CONFIG_SCHEMA);
describe('authored StructuredPanel table ordering', () => {
  it('applies priority, actual instants and ordinal IDs without mutating frozen records', () => {
    const rows = Object.freeze([
      {id:'z',state:'Other',created:'2026-01-01T00:00:00Z'},
      {id:'b',state:'Ready',created:'2026-01-01T01:00:00.000001+01:00'},
      {id:'a',state:'Ready',created:'2026-01-01T00:00:00.000001Z'},
      {id:'c',state:'Ready',created:'2026-01-01T00:00:00.000002Z'},
    ].map(Object.freeze));
    expect(ids(rows)).toEqual(['c','a','b','z']);
    expect(rows.map(row=>row.id)).toEqual(['z','b','a','c']);
  });
  it('uses subsequent keys for unknown priorities; puts missing and invalid values last', () => {
    expect(ids([
      {id:'missing',created:'2026-01-01T00:00:00Z'},
      {id:'invalid',state:'Ready',created:'2026-02-30T00:00:00Z'},
      {id:'old',state:'Other',created:'2025-01-01T00:00:00Z'},
      {id:'new',state:'Another',created:'2026-01-01T00:00:00Z'},
      {id:'valid',state:'Ready',created:'2026-01-01T00:00:00Z'},
    ])).toEqual(['valid','invalid','new','old','missing']);
  });
  it('preserves equal-key source order and original order when ordering is absent', () => {
    const rows=[{id:'second',state:'Ready'},{id:'first',state:'Ready'}];
    expect(ids(rows,[{path:'state',kind:'priority',values:['Ready']}])).toEqual(['second','first']);
    expect(ids(rows,false)).toEqual(['second','first']);
    expect(ids(rows,null)).toEqual(['second','first']);
    expect(ids(rows,[])).toEqual(['second','first']);
  });
  it('uses ordinal strings, puts wrong types last, and rejects partial malformed ordering', () => {
    const rows=[{id:'lower',key:'a'},{id:'upper',key:'Z'},{id:'number',key:3},{id:'null',key:null}];
    expect(ids(rows,[{path:'key',kind:'string',direction:'asc'}])).toEqual(['upper','lower','number','null']);
    expect(ids(rows,[{path:'key',kind:'string',direction:'desc'}])).toEqual(['lower','upper','number','null']);
    expect(ids(rows,[{path:'key',kind:'string',direction:'asc'},{path:'id',kind:'unknown'}])).toEqual(['lower','upper','number','null']);
  });
  it('rejects permissive dates and unknown offsets while recognizing leap years', () => {
    expect(ids([
      {id:'short',created:'2024-02-29'}, {id:'unknown',created:'2024-02-29T00:00:00-00:00'},
      {id:'leap-second',created:'2024-02-29T00:00:60Z'}, {id:'valid',created:'2024-02-29T00:00:00Z'},
    ],[{path:'created',kind:'date-time',direction:'asc'}])).toEqual(['valid','short','unknown','leap-second']);
  });
  it('accepts the authored schema and rejects malformed sorting', () => {
    expect(validate({blocks:[block()]}),JSON.stringify(validate.errors)).toBe(true);
    for(const bad of [[],[{path:'id',kind:'string'}],[{path:'id',kind:'string',direction:'sideways'}],
      [{path:'constructor.name',kind:'string',direction:'asc'}], [{path:'state',kind:'priority',values:['x','x']}],
      [{path:'state',kind:'priority',values:[]}], [{path:'id',kind:'string',direction:'asc',extra:true}]]) {
      expect(validate({blocks:[block(bad)]}),JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('ordered row action identity', () => {
  function setup(emitAction: any, confirmation = true) {
    const container=document.createElement('div'); document.body.appendChild(container);
    const root=createRoot(container);
    const update=(rows: any[])=>act(()=>root.render(<StructuredPanel moduleId="x-records" widgetName="StructuredPanel"
      slot={{id:'slot',title:undefined}} route={{surfaceId:'s',routeId:'r',routeClass:'operation',params:{}}}
      headingLevel={2} config={{blocks:[{...block([{path:'rank',kind:'string',direction:'asc'}]),rowAction:{
        outputName:'open',columnLabel:'Action',payload:{task:{path:'task'}},...trace,
        ...(confirmation ? {confirmation:{heading:'Confirm',body:'Open this task?',confirmLabel:'Proceed',cancelLabel:'Cancel',...trace}} : {}),
      }}]}} data={{rows}} actions={[{outputName:'open',actionRef:'openTask',intent:'review',label:{literal:'Open'}}]}
      emitAction={emitAction} admitsTenantTheme/>));
    return {container,update,root};
  }
  it('cancels confirmation when sorted row position acquires a different action input', () => {
    const emit=vi.fn();const {container,update,root}=setup(emit);
    update([{id:'A',rank:'a',task:'task-A'},{id:'B',rank:'b',task:'task-B'}]);
    act(()=>container.querySelector<HTMLButtonElement>('[data-row-action]')!.click());
    expect(container.querySelector('[data-action-confirmation]')).not.toBeNull();
    update([{id:'A',rank:'z',task:'task-A'},{id:'B',rank:'b',task:'task-B'}]);
    expect(container.querySelector('[data-action-confirmation]')).toBeNull();
    expect(emit).not.toHaveBeenCalled(); act(()=>root.unmount());
  });
  it('does not transfer pending or old completion to changed input with the same record ID', async () => {
    let resolve!: (value:any)=>void;
    const emit=vi.fn(()=>({completion:new Promise(done=>{resolve=done;})}));
    const {container,update,root}=setup(emit,false);
    update([{id:'A',rank:'a',task:'task-old'}]);
    act(()=>container.querySelector<HTMLButtonElement>('[data-row-action]')!.click());
    expect(container.querySelector('[data-row-action]')?.getAttribute('data-action-status')).toBe('pending');
    update([{id:'A',rank:'a',task:'task-new'}]);
    expect(container.querySelector('[data-row-action]')?.getAttribute('data-action-status')).toBe('idle');
    await act(async()=>{resolve({status:'completed'});await Promise.resolve();});
    expect(container.querySelector('[data-row-action]')?.getAttribute('data-action-status')).toBe('idle');
    expect(emit).toHaveBeenCalledWith('open',{task:'task-old'});act(()=>root.unmount());
  });
});
