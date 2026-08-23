"""Smoke test for sam-app/src/inference/handler.py with a stubbed DynamoDB.

Validates the full serving path without AWS: model load, feature ordering from
meta.json, V->R label mapping, confidence and the exact PRED# item shape the
Node read path (assessment.mjs listPredictions) expects.
"""

import json
import os
import sys
from pathlib import Path

os.environ.setdefault("TABLE_NAME", "test-table")

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "sam-app" / "src" / "inference"))

import handler  # noqa: E402

captured = {}


class FakeTable:
    def put_item(self, Item):
        captured["item"] = Item


class FakeDynamo:
    def Table(self, name):
        captured["table"] = name
        return FakeTable()


handler.boto3.resource = lambda *a, **k: FakeDynamo()

answers = {f"q{i:02d}": 5 for i in range(1, 6)} | {f"q{i:02d}": 1 for i in range(6, 16)}
event = {
    "studentId": "student_test",
    "formId": "vark",
    "submissionId": "SUBMISSION#vark#smoke",
    "formVersion": "1",
    "answers": answers,
}

result = handler.lambda_handler(event, None)
assert result["statusCode"] == 200, result
item = captured["item"]
meta = json.loads((ROOT / "sam-app/src/inference/model/meta.json").read_text())

assert captured["table"] == "test-table"
assert item["PK"] == "PRED#student_test"
assert item["SK"].startswith("PRED#")
assert item["model"] == meta["name"] and item["modelVersion"] == meta["version"]
assert item["method"] == "ml"
assert item["label"] in {"R", "A", "K"}
assert item["createdBy"] == "system:inference"
assert item["submission"] == event["submissionId"]
scores = json.loads(item["scores"])
assert set(scores) == {"R", "A", "K"}, scores
assert abs(sum(scores.values()) - 1) < 0.01
# boto3/DynamoDB rejects float — the stored confidence must be a Decimal.
from decimal import Decimal  # noqa: E402

assert isinstance(item["confidence"], Decimal), f"confidence must be Decimal, got {type(item['confidence'])}"
assert 0 <= float(item["confidence"]) <= 1
print("smoke OK:", json.dumps({k: item[k] for k in ("label", "confidence")}, default=str), scores)

missing = handler.lambda_handler({"studentId": "c", "formId": "vark", "submissionId": "s", "answers": {"q01": 5}}, None)
assert missing["statusCode"] == 422, missing
print("invalid-answers path OK (422)")
