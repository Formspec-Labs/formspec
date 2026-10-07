"""Recognized signing-content source and evidence use one shared, closed wording schema."""
import json
from copy import deepcopy
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from tests.unit.support.schema_fixtures import build_schema_registry, load_schema

ROOT = Path(__file__).resolve().parents[3]
COMMON = load_schema('common.schema.json')
DEFINITION = load_schema('definition.schema.json')
RESPONSE = load_schema('response.schema.json')
REGISTRY = build_schema_registry(COMMON, DEFINITION, RESPONSE)
CONTENT = json.loads((ROOT / 'tests/fixtures/signing-content/content-en.json').read_text())

def validator(schema):
    return Draft202012Validator(schema, registry=REGISTRY, format_checker=FormatChecker())

def source_definition():
    return {'$formspec':'1.0','url':'urn:test:signing-content','version':'2.0.0','status':'active','title':'Signing test','items':[],
            'extensions':{'x-other':{'keep':True},'x-formspec-signing-content':{'version':'1.0','entries':{'certification-en':deepcopy(CONTENT)}}}}

def commitment():
    return {'version':'1.0','draftId':'draft-1','draftVersion':7,'actorRef':'owner-1','signerName':'Test Person',
            'signedAt':'2026-10-06T12:00:00Z','consentAccepted':True,'content':deepcopy(CONTENT),
            'documentHash':'a'*64,'documentHashAlgorithm':'sha-256'}

def response():
    return {'$formspecResponse':'1.0','definitionUrl':'urn:test:signing-content','definitionVersion':'2.0.0',
            'status':'completed','data':{},'authored':'2026-10-06T12:00:00Z','extensions':{'x-other':{'keep':True},'x-formspec-signing-content':commitment()}}

def test_typed_extensions_allow_unrelated_x_data():
    validator(DEFINITION).validate(source_definition())
    validator(RESPONSE).validate(response())

@pytest.mark.parametrize('field', list(CONTENT))
def test_every_displayed_content_field_is_required_in_both_artifacts(field):
    d, r = source_definition(), response()
    del d['extensions']['x-formspec-signing-content']['entries']['certification-en'][field]
    del r['extensions']['x-formspec-signing-content']['content'][field]
    for schema, value in [(DEFINITION,d),(RESPONSE,r)]:
        with pytest.raises(ValidationError): validator(schema).validate(value)

@pytest.mark.parametrize('value', [-1, 1.5, 9007199254740992])
def test_draft_revision_must_be_nonnegative_safe_integer(value):
    r=response();r['extensions']['x-formspec-signing-content']['draftVersion']=value
    with pytest.raises(ValidationError): validator(RESPONSE).validate(r)

@pytest.mark.parametrize('key,value', [('consentAccepted',False),('signedAt','today'),('documentHash','A'*64),('documentHashAlgorithm','none'),('unknown',True)])
def test_act_evidence_is_closed_and_exact(key,value):
    r=response();r['extensions']['x-formspec-signing-content'][key]=value
    with pytest.raises(ValidationError): validator(RESPONSE).validate(r)

@pytest.mark.parametrize('id', ['a/b','a~b','__proto__','1start',''])
def test_source_identifiers_have_one_simple_pointer_segment(id):
    d=source_definition();d['extensions']['x-formspec-signing-content']['entries']={id:deepcopy(CONTENT)}
    with pytest.raises(ValidationError): validator(DEFINITION).validate(d)

def test_empty_consent_control_label_and_unknown_wording_fields_refused():
    for update in [lambda c:c['electronicConsent'].update(controlLabel=''),lambda c:c.update(hostFallback='different')]:
        r=response();update(r['extensions']['x-formspec-signing-content']['content'])
        with pytest.raises(ValidationError):validator(RESPONSE).validate(r)
