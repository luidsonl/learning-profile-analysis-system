"""Sanity check: score a handful of real dataset rows with a packaged model."""

import argparse
import json
from pathlib import Path

import joblib

from features.prepare import load_dataset, label_map

BUILD_ROOT = Path(__file__).resolve().parents[1] / "build"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="vark")
    args = parser.parse_args()

    pipeline = joblib.load(BUILD_ROOT / args.model / "model.joblib")
    X, y = load_dataset(args.model)
    mapping = label_map(args.model)
    sample = X.head(5)
    proba = pipeline.predict_proba(sample)
    classes = [str(c) for c in pipeline.classes_]
    for (_, row), probs, expected in zip(sample.iterrows(), proba, y.head(5)):
        scores = {mapping.get(c, c): round(float(p), 4) for c, p in zip(classes, probs)}
        predicted = max(scores, key=scores.get)
        print(json.dumps({"expected": expected, "predicted": predicted, "scores": scores}))


if __name__ == "__main__":
    main()