"""Train a classifier from a registered model dataset (offline only — never runs in AWS)."""

import argparse
import json
from pathlib import Path

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from evaluate.report import evaluate
from features.prepare import get_config, load_dataset

BUILD_ROOT = Path(__file__).resolve().parents[1] / "build"


def build_dir(model: str) -> Path:
    return BUILD_ROOT / model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="vark")
    args = parser.parse_args()

    cfg = get_config(args.model)
    X, y = load_dataset(args.model)
    print(
        f"{cfg.feature_name}: dataset loaded — model={cfg.model_id} form={cfg.form_id}, "
        f"{len(X)} records, features={X.shape[1]}, labels={sorted(set(y))}"
    )

    pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(max_iter=2000, class_weight="balanced", random_state=42),
            ),
        ]
    )

    metrics = evaluate(pipeline, X.values, y)
    print(json.dumps(metrics["summary"], indent=2))

    pipeline.fit(X.values, y)

    out_dir = build_dir(args.model)
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "model.joblib"
    joblib.dump(pipeline, out)
    (out_dir / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"model saved: {out}")


if __name__ == "__main__":
    main()