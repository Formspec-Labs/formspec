import test from 'node:test';
import assert from 'node:assert/strict';

test('public static-presentation entry performs no fetch, WASM compilation or evaluation initialization',async()=>{
  const saved={fetch:globalThis.fetch,instantiate:WebAssembly.instantiate,compile:WebAssembly.compile};let calls=0;
  const forbidden=()=>{calls++;throw new Error('static entry attempted runtime initialization');};
  globalThis.fetch=forbidden;WebAssembly.instantiate=forbidden;WebAssembly.compile=forbidden;
  try {
    const {createStaticResponseMetadataReader}=await import('@formspec-org/engine/static-presentation');
    const definition={$formspec:'1.0',url:'urn:isolation',version:'1',status:'active',title:'Isolation',items:[{key:'answer',type:'field',dataType:'string',label:'Retained'}]};
    const response={$formspecResponse:'1.0',definitionUrl:definition.url,definitionVersion:'1',status:'completed',authored:'2026-10-07T00:00:00Z',data:{answer:'value'}};
    const reader=createStaticResponseMetadataReader({definition,response,locale:null});
    assert.equal(reader.label('answer'),'Retained');assert.deepEqual(reader.options('answer'),[]);assert.equal(calls,0);
  } finally {globalThis.fetch=saved.fetch;WebAssembly.instantiate=saved.instantiate;WebAssembly.compile=saved.compile;}
});
