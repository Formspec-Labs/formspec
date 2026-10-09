import { describe, it, expect } from 'vitest';
import { validateScreenerSurfaceTargets } from '../src/screener-surface-targets.js';
function context() {
 const screener={artifactKind:'screener',status:'loaded',ref:{url:'urn:gate',version:'1.0.0'},document:{$formspecScreener:'1.0',url:'urn:gate',version:'1.0.0',evaluation:[{routes:[{target:'surface:apply'}]}]}};
 const surface={artifactKind:'surface',status:'loaded',ref:{url:'urn:surface',version:'1.0.0'},document:{$formspecSurface:'0.3',routes:[{id:'screen',slots:[{slotType:'screener',binding:{screenerRef:'urn:gate',allowedTargets:['surface:apply']}}]},{id:'apply',slots:[]}]}};
 return {manifest:{document:{screeners:[{url:'urn:gate',version:'1.0.0'}]}},handles:[screener,surface]} as any;
}
describe('exact native Screener slot graph',()=>{
 it('admits exact manifested Screener and unique authored destination',()=>expect(validateScreenerSurfaceTargets(context())).toEqual([]));
 it.each(['membership','pin','target','dialect','duplicate'])('refuses %s mismatch',kind=>{const c=context();if(kind==='membership')c.manifest.document.screeners=[];if(kind==='pin')c.handles[0].document.version='2.0.0';if(kind==='target')c.handles[1].document.routes[0].slots[0].binding.allowedTargets=['surface:foreign'];if(kind==='dialect')c.handles[1].document.$formspecSurface='0.2';if(kind==='duplicate')c.manifest.document.screeners.push(c.manifest.document.screeners[0]);expect(validateScreenerSurfaceTargets(c).length).toBeGreaterThan(0);});
});
