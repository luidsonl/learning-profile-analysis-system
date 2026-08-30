"""Stratified k-fold evaluation with macro-F1 emphasis (imbalanced labels)."""

import json

import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_predict


def evaluate(pipeline, X, y, folds: int = 5) -> dict:
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
    y_pred = cross_val_predict(pipeline, X, y, cv=cv)

    report = classification_report(y, y_pred, output_dict=True, zero_division=0)
    cm = confusion_matrix(y, y_pred, labels=sorted(set(y)))

    return {
        "cvFolds": folds,
        "records": int(len(y)),
        "summary": {
            "accuracy": round(float(accuracy_score(y, y_pred)), 4),
            "macroF1": round(float(f1_score(y, y_pred, average="macro")), 4),
            "weightedF1": round(float(f1_score(y, y_pred, average="weighted")), 4),
        },
        "perClass": {
            label: {
                "precision": round(float(stats["precision"]), 4),
                "recall": round(float(stats["recall"]), 4),
                "f1": round(float(stats["f1-score"]), 4),
                "support": int(stats["support"]),
            }
            for label, stats in report.items()
            if label in set(pd.unique(y))
        },
        "confusionMatrix": {"labels": [str(l) for l in sorted(set(y))], "values": cm.tolist()},
    }


if __name__ == "__main__":
    import argparse

    from features.prepare import load_dataset
    from sklearn.dummy import DummyClassifier

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="vark")
    args = parser.parse_args()

    X, y = load_dataset(args.model)
    print(json.dumps(evaluate(DummyClassifier(strategy="prior"), X, y), indent=2))
