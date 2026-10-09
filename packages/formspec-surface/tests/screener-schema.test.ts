import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv/dist/2020.js';
const read=(path:string)=>JSON.parse(readFileSync(new URL('../../../schemas/'+path,import.meta.url),'utf8'));
const ajv=new Ajv({strict:false,validateFormats:false});ajv.addSchema(read('common.schema.json'));ajv.addSchema(read('issuer.schema.json'));ajv.addSchema(read('definition.schema.json'));
const latest=read('surface.schema.json');const historical=read('surface-v0.2.schema.json');const validate=ajv.compile(latest);const old=ajv.compile(historical);
const doc=()=>({$formspecSurface:'0.3',id:'app',entry:'screen',routes:[{id:'screen',path:'/screen',routeClass:'intake',slots:[{id:'gate',slotType:'screener',binding:{screenerRef:'urn:gate',allowedTargets:['surface:apply']}}]}]});
describe('Surface 0.3 Screener schema',()=>{
 it('uses a distinct schema URI and gates new slots from 0.2',()=>{expect(latest.$id).toBe('https://formspec.org/schemas/surface/0.3');expect(historical.$id).toBe('https://formspec.org/schemas/surface/0.2');expect(validate(doc())).toBe(true);expect(validate({...doc(),$formspecSurface:'0.2'})).toBe(false);expect(old(doc())).toBe(false);});
 it('closes binding and refuses duplicate destinations',()=>{const d=doc();(d.routes[0].slots[0].binding as any).predicate='true';expect(validate(d)).toBe(false);delete (d.routes[0].slots[0].binding as any).predicate;d.routes[0].slots[0].binding.allowedTargets.push('surface:apply');expect(validate(d)).toBe(false);});
});
