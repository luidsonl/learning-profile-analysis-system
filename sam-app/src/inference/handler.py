"""Multi-model inference Lambda.

Invoked asynchronously (InvocationType: Event) by the Forms handler right after
a new submission is stored. Each bundle model lives in models/<formId>/, keyed
by the form that triggers it; the handler routes the event's formId to its
model, scores the submission answers, applies the model's label map, and writes
the PRED# item itself. Failures are logged and swallowed: a missing prediction
never breaks a submission.
"""

import json
import logging
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import boto3
import joblib

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

MODEL_DIR = Path(__file__).parent / "models"

# formId -> (pipeline, meta) — loaded lazily, one model per invocation.
_loaders = {}


def _available_model_ids():
    try:
        return sorted(d.name for d in MODEL_DIR.iterdir() if (d / "model.joblib").exists())
    except FileNotFoundError:
        return []


def _load_model(form_id: str):
    loaded = _loaders.get(form_id)
    if loaded is not None:
        return loaded

    model_dir = MODEL_DIR / form_id
    pipeline_path = model_dir / "model.joblib"
    meta_path = model_dir / "meta.json"
    if not pipeline_path.exists() or not meta_path.exists():
        return None

    pipeline = joblib.load(pipeline_path)
    meta = json.loads(meta_path.read_text())
    _loaders[form_id] = (pipeline, meta)
    return _loaders[form_id]


def _now_ms() -> str:
    return str(int(datetime.now(timezone.utc).timestamp() * 1000))


def lambda_handler(event, context):
    student_id = event.get("studentId")
    form_id = event.get("formId")
    submission_id = event.get("submissionId")
    answers = event.get("answers") or {}

    if not student_id or not form_id or not submission_id:
        LOGGER.warning("inference_rejected invalid payload keys=%s", list(event.keys()))
        return {"statusCode": 422}

    loaded = _load_model(form_id)
    if loaded is None:
        LOGGER.warning("inference_rejected no model for form=%s available=%s", form_id, _available_model_ids())
        return {"statusCode": 404}

    pipeline, meta = loaded
    features_order = [f["questionId"] for f in meta["features"]]
    try:
        row = [float(answers[qid]) for qid in features_order]
    except (KeyError, TypeError, ValueError):
        LOGGER.warning("inference_rejected missing/invalid answers form=%s", form_id)
        return {"statusCode": 422}

    proba = pipeline.predict_proba([row])[0]
    classes = [str(c) for c in pipeline.classes_]
    label_map = meta.get("labelMap", {})
    scores = {label_map.get(c, c): round(float(p), 4) for c, p in zip(classes, proba)}
    raw_label = classes[int(proba.argmax())]
    label = label_map.get(raw_label, raw_label)
    confidence = round(float(proba.max()), 4)

    at = _now_ms()
    table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
    table.put_item(
        Item={
            "PK": f"PRED#{student_id}",
            "SK": f"PRED#{at}",
            "type": "prediction",
            "studentId": student_id,
            "form": form_id,
            "submission": submission_id,
            "formVersion": str(event.get("formVersion", "")),
            "model": meta["name"],
            "modelVersion": meta["version"],
            "method": "ml",
            "label": label,
            "scores": json.dumps(scores),
            # DynamoDB (boto3) rejects float — numbers must be Decimal.
            "confidence": Decimal(str(confidence)),
            "createdBy": "system:inference",
            "createdAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        }
    )
    LOGGER.info(
        "inference_stored student=%s submission=%s model=%s/%s form=%s label=%s confidence=%.3f",
        student_id, submission_id, meta["name"], meta["version"], form_id, label, confidence,
    )
    return {"statusCode": 200}