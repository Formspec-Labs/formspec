"""Public Python dependency inventory matches the shared Definition fixture."""
import json
from pathlib import Path

from formspec.fel import definition_instance_reads


def test_definition_instance_reads():
    fixture = json.loads((Path(__file__).parents[1] / "fixtures/fel/definition-instance-reads.json").read_text())
    assert definition_instance_reads(fixture["definition"]) == fixture["instanceReads"]


def test_definition_instance_reads_distinguishes_literal_keys_from_subscripts():
    definition = {
        "$formspec": "1.0",
        "url": "urn:test:literal-vs-indexed",
        "version": "1.0.0",
        "status": "draft",
        "title": "Reads",
        "instances": {"source": {"data": {}}},
        "items": [
            {
                "type": "field",
                "key": "lit",
                "dataType": "string",
                "label": "Lit",
                "initialValue": "=instance('source', 'rows[1].code')",
            },
            {
                "type": "field",
                "key": "idx",
                "dataType": "string",
                "label": "Idx",
                "initialValue": "=@instance('source').rows[1].code",
            },
        ],
    }
    assert definition_instance_reads(definition) == {
        "source": ['["rows[1]"].code', "rows[1].code"]
    }
