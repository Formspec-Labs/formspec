import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createStaticResponseMetadataReader } from '@formspec-org/engine/static-presentation';
import { captureResponseFieldMetadata } from '@formspec-org/surface';
import { createFieldViewModel } from '../dist/field-view-model.js';
import { LocaleStore } from '../dist/locale.js';
import { preactReactiveRuntime as rx } from '../dist/reactivity/preact-runtime.js';

function inputs() {
  const definition = { $formspec:'1.0',url:'urn:fixture:original',version:'1.0.0',status:'active',title:'Original',
    items:[{key:'people',type:'group',repeatable:true,label:'People',children:[
      {key:'name',type:'field',dataType:'string',label:'Name'},
      {key:'choice',type:'field',dataType:'choice',label:'Choice',optionSet:'choices',options:[{value:'wrong',label:'Wrong inline'}]},
    ]}],optionSets:{choices:{options:[{value:'yes',label:'Yes'},{value:'a.b\\c',label:'Escaped'},{value:'other',label:'Other'}]}} };
  const locale = {$formspecLocale:'2.0',url:'urn:fixture:es',version:'1.0.0',locale:'es',target:{kind:'definition',url:definition.url},
    strings:{'people.label':'Personas','name.label':'Nombre','choice.label':'Elección',
      'choice.options.yes.label':'Sí de campo','$optionSet.choices.yes.label':'Sí de conjunto',
      '$optionSet.choices.a\\.b\\\\c.label':'Escapado'} };
  const response = {$formspecResponse:'1.0',definitionUrl:definition.url,definitionVersion:definition.version,status:'completed',
    authored:'2026-10-07T00:00:00Z',displayedLocale:{url:locale.url,version:locale.version,locale:locale.locale},
    data:{people:[{name:'Ana',choice:'yes'},{name:'Luis',choice:'other'}]}};
  return {definition,response,locale};
}

function capture(input) {return captureResponseFieldMetadata(input.definition,input.response,createStaticResponseMetadataReader(input));}

test('public static reader and existing capture preserve original grouped/indexed Spanish words and option priority', () => {
  const result = capture(inputs());
  assert.deepEqual(Object.keys(result),['people','people[0].name','people[0].choice','people[1].name','people[1].choice']);
  assert.equal(result.people.label,'Personas');
  assert.equal(result['people[1].name'].label,'Nombre');
  assert.deepEqual(result['people[0].choice'].options,[{value:'yes',label:'Sí de campo'},{value:'a.b\\c',label:'Escapado'},{value:'other',label:'Other'}]);
});

test('snapshots original inputs and detaches every returned option list', () => {
  const input=inputs(); const reader=createStaticResponseMetadataReader(input);
  const options=reader.options('people[0].choice');options[0].label='Caller changed';options.push({value:'new',label:'New'});
  input.locale.strings['name.label']='Current label';input.definition.optionSets.choices.options[0].label='Current option';input.response.data.people=[];
  assert.equal(reader.label('people[0].name'),'Nombre');
  assert.equal(reader.options('people[0].choice')[0].label,'Sí de campo');
  assert.equal(reader.options('people[0].choice').length,3);
});

test('Locale→inline fallback and named-set→inline option priority match maintained live FieldViewModel without evaluation', () => {
  const input=inputs(); delete input.locale.strings['name.label'];
  const reader=createStaticResponseMetadataReader(input);assert.equal(reader.label('people[0].name'),'Name');
  const store=new LocaleStore(rx,'ltr',{kind:'definition',url:input.definition.url});store.loadLocale(input.locale);store.setLocale('es');
  const vm=createFieldViewModel({rx,localeStore:store,itemKey:'choice',templatePath:'people.choice',instancePath:'people[0].choice',id:'choice',dataType:'choice',
    getItemLabel:()=> 'Choice',getItemHint:()=>null,getItemDescription:()=>null,getItemLabels:()=>undefined,getLabelContext:()=>null,
    getFieldValue:()=>rx.signal('yes'),getRequired:()=>rx.signal(false),getVisible:()=>rx.signal(true),getReadonly:()=>rx.signal(false),getDisabledDisplay:()=> 'hidden',
    getErrors:()=>rx.signal([]),getConstraintMessage:()=>null,getOptions:()=>rx.signal(input.definition.optionSets.choices.options),
    getOptionsState:()=>rx.signal({loading:false,error:null}),getOptionSetName:()=> 'choices',setFieldValue:()=>{},getWriteSource:()=>rx.signal(null),interpolate:s=>s,interpolateMessage:s=>s});
  assert.equal(reader.label('people[0].choice'),vm.label.value);
  assert.deepEqual(reader.options('people[0].choice'),vm.options.value);
  delete input.locale.strings['choice.options.yes.label'];assert.equal(createStaticResponseMetadataReader(input).options('people[0].choice')[0].label,'Sí de conjunto');
});

for(const [name,mutate,reason] of [
  ['Definition URL',i=>i.response.definitionUrl='urn:other','definition-mismatch'],
  ['Definition version',i=>i.response.definitionVersion='2','definition-mismatch'],
  ['missing recorded Locale',i=>i.locale=null,'locale-unavailable'],
  ['Locale version',i=>i.locale.version='2','locale-mismatch'],
  ['Locale URL',i=>i.locale.url='urn:other','locale-mismatch'],
  ['recorded URL absent but document URL present',i=>delete i.response.displayedLocale.url,'locale-mismatch'],
  ['document URL absent but recorded URL present',i=>delete i.locale.url,'locale-mismatch'],
  ['Locale target',i=>i.locale.target.url='urn:other','locale-mismatch'],
  ['Locale target kind',i=>i.locale.target.kind='app','locale-mismatch'],
  ['Locale compatibility',i=>i.locale.target.compatibleVersions='>=2.0.0','locale-mismatch'],
  ['Locale code',i=>i.locale.locale='en','locale-mismatch'],
  ['regional recorded Locale',i=>{i.locale.locale='es-US';i.response.displayedLocale.locale='es-US'},'fallback-unproven'],
  ['fallback',i=>i.locale.fallback='en','fallback-unproven'],
  ['cyclic fallback',i=>i.locale.fallback='es','fallback-unproven'],
  ['unrecorded Locale',i=>delete i.response.displayedLocale,'locale-mismatch'],
  ['duplicate Definition key',i=>i.definition.items[0].children.push({key:'name',type:'field',dataType:'string',label:'Duplicate'}),'definition-ambiguous'],
  ['unresolved fragment',i=>i.definition.items[0].$ref='urn:unresolved','definition-unresolved'],
]) test(`refuses ${name}`,()=>{const input=inputs();mutate(input);assert.throws(()=>capture(input),new RegExp(reason));});

for(const [name,mutate,reason] of [
  ['Definition context',i=>i.definition.items[0].children[0].labels={short:'Short'},'context-unproven'],
  ['Locale context',i=>i.locale.strings['name.label@short']='Corto','context-unproven'],
  ['Locale label interpolation',i=>i.locale.strings['name.label']='Hello {{$name}}','interpolation-unproven'],
  ['inline label interpolation',i=>{delete i.locale.strings['name.label'];i.definition.items[0].children[0].label='{{$name}}'},'interpolation-unproven'],
  ['field option interpolation',i=>i.locale.strings['choice.options.yes.label']='{{$name}}','interpolation-unproven'],
  ['named option interpolation',i=>i.locale.strings['$optionSet.choices.a\\.b\\\\c.label']='{{$name}}','interpolation-unproven'],
  ['inline option interpolation',i=>i.definition.optionSets.choices.options[2].label='{{$name}}','interpolation-unproven'],
  ['source with inline fallback',i=>i.definition.optionSets.choices.source='https://example.invalid','options-unproven'],
  ['missing named set',i=>delete i.definition.optionSets.choices,'options-unproven'],
  ['remote override',i=>i.definition.binds=[{path:'people[*].choice',remoteOptions:'https://example.invalid'}],'options-unproven'],
  ['URI options',i=>{delete i.definition.items[0].children[1].optionSet;i.definition.items[0].children[1].options='urn:options'},'options-unproven'],
  ['dynamic option filter',i=>i.definition.items[0].children[1].optionFilter='$name','options-unproven'],
]) test(`refuses ${name} without replacing original words`,()=>{const input=inputs();mutate(input);assert.throws(()=>capture(input),new RegExp(reason));});

for(const path of ['people[*].name','people[@index].name','people[00].name','.people[0].name','people..name','people.name','people[9].name','people[0].name[0]']) {
  test(`refuses unsupported path ${path}`,()=>assert.throws(()=>createStaticResponseMetadataReader(inputs()).label(path),/path-/));
}

test('generic inline-only mode requires explicit null Locale and absent recorded Locale',()=>{
  const input=inputs();delete input.response.displayedLocale;input.locale=null;
  const reader=createStaticResponseMetadataReader(input);assert.equal(reader.label('people[0].name'),'Name');assert.deepEqual(reader.options('people[0].name'),[]);
});

test('pins genuine authored D1 docs; English positive, regional Spanish refusal; constructed Response conveys no custody',()=>{
  const read=(name,hash)=>{const bytes=readFileSync(new URL(`./fixtures/static-original/${name}`,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);return JSON.parse(bytes);};
  const definition=read('passport-renewal.definition.json','39e4086f46c1c2479f8f3bd87f20a9ad3054973088f1165c0a081a51df5d3b39');
  const locale=read('passport-renewal.en.locale.json','310470bf887003551a2450e47d3a555710442118cd80d5acab2330799abb31eb');
  const response={$formspecResponse:'1.0',definitionUrl:definition.url,definitionVersion:definition.version,status:'completed',authored:'2026-10-07T00:00:00Z',
    displayedLocale:{locale:locale.locale,version:locale.version,url:locale.url},data:{fullName:'Fictional engineering fixture',renewalEligible:true,declarationAcknowledged:true}};
  assert.equal(capture({definition,response,locale}).fullName.label,'Full legal name');
  const regional=read('passport-renewal.es-US.locale.json','6f31643c7add167656ef93e80de5dc5fbda989fc5e8dbd32ef94592481ff3ef5');
  assert.throws(()=>capture({definition,locale:regional,response:{...response,displayedLocale:{locale:regional.locale,version:regional.version,url:regional.url}}}),/fallback-unproven/);
});

test('matches recorded and document optional URL when both are absent',()=>{
  const input=inputs();delete input.locale.url;delete input.response.displayedLocale.url;
  assert.equal(createStaticResponseMetadataReader(input).label('people[0].name'),'Nombre');
});
