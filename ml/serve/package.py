"""Package a trained model into the inference Lambda.

Copies ml/build/<model>/model.joblib into sam-app/src/inference/models/<formId>/
and writes a meta.json carrying everything the Lambda needs at serving time:
feature order (dataset item position -> form question id), label map, metrics,
versions and dataset hash. Each model lands in its own directory keyed by the
form that triggers it, so the runtime handler routes by formId.
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import sklearn

from features.prepare import dataset_sha256, feature_schema, get_config, label_map

ML_DIR = Path(__file__).resolve().parents[1]
INFERENCE_MODEL_ROOT = ML_DIR.parent / "sam-app" / "src" / "inference" / "models"


def package(model: str, version: str) -> None:
    cfg = get_config(model)

    model_path = ML_DIR / "build" / model / "model.joblib"
    metrics_path = ML_DIR / "build" / model / "metrics.json"
    if not model_path.exists() or not metrics_path.exists():
        sys.exit(f"model not found — run `make train MODEL={model}` first")

    pipeline = joblib.load(model_path)
    metrics = json.loads(metrics_path.read_text())

    meta = {
        "name": f"{cfg.model_id}-predictor",
        "modelId": cfg.model_id,
        "formId": cfg.form_id,
        "version": version,
        "features": feature_schema(model),
        "labelMap": label_map(model),
        "classes": [str(c) for c in pipeline.classes_],
        "metrics": metrics["summary"],
        "perClass": metrics["perClass"],
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "datasetSha256": dataset_sha256(model),
        "sklearnVersion": sklearn.__version__,
    }

    dest_dir = INFERENCE_MODEL_ROOT / cfg.form_id
    project_root = ML_DIR.parent.resolve()
    if project_root not in dest_dir.resolve().parents:
        sys.exit(f"safety abort: {dest_dir.resolve()} is outside the project root")
    dest_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(model_path, dest_dir / "model.joblib")
    (dest_dir / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"packaged {meta['name']} v{meta['version']} -> {dest_dir.resolve()}")
    print(json.dumps(metrics["summary"], indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="vark")
    parser.add_argument("--version", default="1.0.0")
    args = parser.parse_args()

    package(args.model, args.version)


if __name__ == "__main__":
    main()