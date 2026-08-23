"""Package the trained model into the SAM inference Lambda.

Copies ml/build/model.joblib into sam-app/src/inference/model/ and writes a
meta.json carrying everything the Lambda needs at serving time: feature order
(dataset item position -> vark-kids question id), label map (V->R), metrics,
versions and dataset hash.
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import sklearn

from features.prepare import FEATURE_SCHEMA, LABEL_MAP, dataset_sha256

ML_DIR = Path(__file__).resolve().parents[1]
INFERENCE_MODEL_DIR = ML_DIR.parent / "sam-app" / "src" / "inference" / "model"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", default="2.0.0")
    args = parser.parse_args()

    model_path = ML_DIR / "build" / "model.joblib"
    metrics_path = ML_DIR / "build" / "metrics.json"
    if not model_path.exists() or not metrics_path.exists():
        sys.exit("model not found — run `make train` first")

    pipeline = joblib.load(model_path)
    metrics = json.loads(metrics_path.read_text())

    meta = {
        "name": "vark-predictor",
        "version": args.version,
        "features": FEATURE_SCHEMA,
        "labelMap": LABEL_MAP,
        "classes": [str(c) for c in pipeline.classes_],
        "metrics": metrics["summary"],
        "perClass": metrics["perClass"],
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "datasetSha256": dataset_sha256(),
        "sklearnVersion": sklearn.__version__,
    }

    INFERENCE_MODEL_DIR = (ML_DIR.parent / "sam-app" / "src" / "inference" / "model").resolve()
    project_root = ML_DIR.parent.resolve()
    if project_root not in INFERENCE_MODEL_DIR.parents:
        sys.exit(f"safety abort: {INFERENCE_MODEL_DIR} is outside the project root")
    INFERENCE_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(model_path, INFERENCE_MODEL_DIR / "model.joblib")
    (INFERENCE_MODEL_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"packaged {meta['name']} v{meta['version']} -> {INFERENCE_MODEL_DIR}")
    print(json.dumps(metrics["summary"], indent=2))


if __name__ == "__main__":
    main()
