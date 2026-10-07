/** @filedesc Immutable source selection, exact display-byte hashing, and no locale fallback. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { resolveAuthoredSigningContent, signingContentBytes, hashSigningContent } from '../dist/signing-content.js';
const content = JSON.parse(readFileSync(new URL('../../../tests/fixtures/signing-content/content-en.json', import.meta.url)));
const common = JSON.parse(readFileSync(new URL('../../../schemas/common.schema.json', import.meta.url)));
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
ajv.addSchema(common);
const validateContent = ajv.compile({ $ref: `${common.$id}#/$defs/SigningContent` });
const definition = { $formspec:'1.0',url:'urn:test:signing-content',version:'2.0.0',items:[],extensions:{'x-formspec-signing-content':{version:'1.0',entries:{'certification-en':content}}}};
const response = { definitionUrl:definition.url,definitionVersion:definition.version,displayedLocale:{locale:'en'} };
const base = { definition,response,source:content.source,locale:'en',validateContent };
test('resolves exact pinned entry and returns detached full text', () => {
 const got=resolveAuthoredSigningContent(base);
 assert.deepEqual(got,content); got.electronicConsent.text='changed';
 assert.notEqual(got.electronicConsent.text,content.electronicConsent.text);
 assert.equal(resolveAuthoredSigningContent({...base,locale:'EN'}).locale,'en');
});
for (const [name, change] of Object.entries({
 'new Definition version': b=>b.definition.version='3.0.0',
 'different Definition': b=>b.definition.url='urn:other',
 'different source version': b=>b.source.version='2.0.0',
 'missing entry': b=>b.source.ref=b.source.ref.replace('certification-en','missing'),
 'nested path': b=>b.source.ref+='/source',
 'encoded identifier': b=>b.source.ref=b.source.ref.replace('certification-en','%63ertification-en'),
 'locale fallback': b=>b.locale='en-US',
 'different displayed language': b=>b.response.displayedLocale.locale='es',
 'missing notice': b=>delete b.definition.extensions['x-formspec-signing-content'].entries['certification-en'].delegatedSigningNotice,
 'invented property': b=>b.definition.extensions['x-formspec-signing-content'].entries['certification-en'].invented=true,
 'selfpin mismatch': b=>b.definition.extensions['x-formspec-signing-content'].entries['certification-en'].source.ref='urn:other',
})) test(`refuses ${name}`,()=>{const b=structuredClone({...base,validateContent:undefined});b.validateContent=validateContent;b.source={...b.source};change(b);assert.throws(()=>resolveAuthoredSigningContent(b));});
test('refuses inherited content entries',()=>{const b={...base,definition:{...definition,extensions:{'x-formspec-signing-content':{version:'1.0',entries:Object.create({'certification-en':content})}}}};assert.throws(()=>resolveAuthoredSigningContent(b));});
test('JCS bytes and hash preserve every authored code point and include all displayed fields',async()=>{
 const bytes=signingContentBytes(content,validateContent); const string=new TextDecoder().decode(bytes);
 assert.deepEqual(JSON.parse(string),content);
 assert.equal(await hashSigningContent(content,validateContent),createHash('sha256').update(bytes).digest('hex'));
 const reordered=Object.fromEntries(Object.entries(content).reverse());
 assert.deepEqual(signingContentBytes(reordered,validateContent),bytes);
 for(const key of ['declaration','paperAlternative','affirmationText','delegatedSigningNotice']) {
  const changed=structuredClone(content); changed[key]+=' ';
  assert.notEqual(await hashSigningContent(changed,validateContent),await hashSigningContent(content,validateContent));
 }
 const normalized=structuredClone(content);normalized.declaration=normalized.declaration.normalize('NFC');
 assert.notEqual(await hashSigningContent(normalized,validateContent),await hashSigningContent(content,validateContent));
});
test('schema validator is required for hashing',()=>{const invalid={...content,electronicConsent:{...content.electronicConsent,controlLabel:''}};assert.throws(()=>signingContentBytes(invalid,validateContent));});

for(const surrogate of ['\ud800','\udfff']) test('refuses lone surrogate '+surrogate.charCodeAt(0),()=>{
 const malformed=structuredClone(content);malformed.declaration+=surrogate;
 assert.throws(()=>signingContentBytes(malformed,validateContent),/Unicode/);
});
test('preserves valid surrogate pair',()=>{const valid=structuredClone(content);valid.declaration+='😀';assert.equal(JSON.parse(new TextDecoder().decode(signingContentBytes(valid,validateContent))).declaration,valid.declaration);});
for(const key of ['url','version','extensions']) test('refuses inherited Definition '+key,()=>{const b={...base,definition:{...definition}};delete b.definition[key];Object.setPrototypeOf(b.definition,{[key]:definition[key]});assert.throws(()=>resolveAuthoredSigningContent(b));});
test('does not execute content getters',()=>{let called=false;const bad={...content};Object.defineProperty(bad,'declaration',{enumerable:true,get(){called=true;return 'oops';}});assert.throws(()=>signingContentBytes(bad,validateContent));assert.equal(called,false);});
