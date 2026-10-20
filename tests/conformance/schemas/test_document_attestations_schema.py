"""Response declaration shapes; semantic pairing and genuine crypto have separate native/runtime controls."""
import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator, FormatChecker, ValidationError
from tests.unit.support.schema_fixtures import build_schema_registry, load_schema
ROOT = Path(__file__).resolve().parents[3]
SCHEMA = load_schema('response.schema.json')
VALIDATOR = Draft202012Validator(SCHEMA, registry=build_schema_registry(load_schema('common.schema.json'),load_schema('definition.schema.json'),SCHEMA), format_checker=FormatChecker())
def response():
    return json.loads((ROOT/'tests/fixtures/document-attestations/prepared-response.json').read_text())
def test_prepared_document_gesture_accepts_exact_inline_variants_and_unrelated_extension():
    VALIDATOR.validate(response())
@pytest.mark.parametrize('property,value', [('locale','1bad'),('documentHash','sha256:'+'a'*64),('presentationHash','A'*64),('source',{'kind':'inline','data':'YQ'}),('pinnedAt','not-a-date')])
def test_resolved_entry_has_exact_source_locale_digest_and_time_shapes(property,value):
    doc=response();doc['resolvedDocuments'][0][property]=value
    with pytest.raises(ValidationError):VALIDATOR.validate(doc)
@pytest.mark.parametrize('missing', ['version','signingActId','fieldPath','signerId','signerName','signedAt','signingIntent','consentAccepted','consentTextRef','consentVersion','affirmationText','signatureProvider','ceremonyId','attestations'])
def test_committed_shared_metadata_is_required(missing):
    doc=response();del doc['extensions']['x-formspec-document-attestations'][missing]
    with pytest.raises(ValidationError):VALIDATOR.validate(doc)
@pytest.mark.parametrize('value',[{}, {'signatureId':'principal','responseId':'prior','signedPayloadDigest':'a'*63}, {'signatureId':'principal','responseId':'prior','signedPayloadDigest':'a'*64,'extra':True}])
def test_witness_reference_is_a_closed_immutable_tuple(value):
    doc=response();doc['extensions']['x-formspec-document-attestations']['attestations'][0]['witnessedSignatureRef']=value
    with pytest.raises(ValidationError):VALIDATOR.validate(doc)
def test_witness_reference_accepts_an_explicit_intrinsic_tuple():
    doc=response();doc['extensions']['x-formspec-document-attestations']['attestations'][0]['witnessedSignatureRef']={'responseId':'prior','signatureId':'principal','signedPayloadDigest':'a'*64}
    VALIDATOR.validate(doc)
def test_optional_shared_claims_reuse_existing_shapes():
    doc=response();claim=doc['extensions']['x-formspec-document-attestations'];claim['identityBinding']={'method':'email-otp','assuranceLevel':'standard'};claim['signerEvidence']={'kind':'typed','value':'Ada Lovelace'}
    VALIDATOR.validate(doc)
    claim['identityBinding']['method']='urn:test:auth'
    with pytest.raises(ValidationError):VALIDATOR.validate(doc)
