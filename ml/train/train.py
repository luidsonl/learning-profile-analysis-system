"""Train the VARK predictor (offline only — never runs in AWS)."""

import json
from pathlib import Path

import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from evaluate.report import evaluate
from features.prepare import load_dataset

BUILD_DIR = Path(__file__).resolve().parents[1] / "build"


def main() -> None:
    X, y = load_dataset()
    print(f"dataset loaded: {len(X)} records, features={X.shape[1]}, labels={sorted(set(y))}")

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

    BUILD_DIR.mkdir(parents=True, exist_ok=True)
    out = BUILD_DIR / "model.joblib"
    joblib.dump(pipeline, out)
    (BUILD_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2))
    print(f"model saved: {out}")


if __name__ == "__main__":
    main()
