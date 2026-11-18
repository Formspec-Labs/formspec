"""Public Python dependency inventory matches the shared Definition fixture."""
import json
from pathlib import Path

from formspec.fel import definition_instance_reads


def test_definition_instance_reads():
    fixture = json.loads((Path(__file__).parents[1] / "fixtures/fel/definition-instance-reads.json").read_text())
    assert definition_instance_reads(fixture["definition"]) == fixture["instanceReads"]
