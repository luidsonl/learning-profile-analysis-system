"""Sanity check: score a handful of real dataset rows with the packaged model."""

import json
from pathlib import Path

import joblib

from features.prepare import DATASET_PATH, ITEM_COLUMNS, LABEL_MAP, load_dataset

MODEL_DIR = Path(__file__).resolve().parents[1] / "build"


def main() -> None:
    pipeline = joblib.load(MODEL_DIR / "model.joblib")
    X, y = load_dataset()
    sample = X.head(5)
    proba = pipeline.predict_proba(sample)
    classes = [str(c) for c in pipeline.classes_]
    for (_, row), probs, expected in zip(sample.iterrows(), proba, y.head(5)):
        scores = {LABEL_MAP.get(c, c): round(float(p), 4) for c, p in zip(classes, probs)}
        predicted = max(scores, key=scores.get)
        print(json.dumps({"expected": expected, "predicted": predicted, "scores": scores}))


if __name__ == "__main__":
    main()
