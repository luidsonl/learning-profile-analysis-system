"""Load committed training datasets positionally, keyed by model id.

Each model in MODELS carries its own dataset layout so one codebase can train
several models offline and package them side by side for the inference Lambda.

The VARK CSV has two columns sharing the same header text ("role-playing"), so
columns are referenced strictly by position:

    0      Gender        (unused as feature)
    1      Age           (unused as feature)
    2-16   15 Likert items rated 1-5 (reading 0-4, aural 5-9, kinesthetic 10-14)
    17     Learner       (label: A | K | V — no R class exists)
"""

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ModelConfig:
    model_id: str
    form_id: str
    feature_name: str
    dataset: Path
    item_start: int
    item_count: int
    label_col: int
    n_columns: int
    question_ids: tuple
    groups: tuple
    label_map: dict


def _vark() -> ModelConfig:
    # Dataset letters do NOT follow naive VARK semantics against the item
    # blocks: empirically the reading block discriminates class "A", the aural
    # block class "V", and the kinesthetic block class "K" (per-class group
    # means, ~93% CV separability). Serving maps letters back to the system
    # profile vocabulary: dataset A -> R (reading/writing), V -> A, K -> K.
    return ModelConfig(
        model_id="vark",
        form_id="vark",
        feature_name="VARK",
        dataset=ROOT / "datasets" / "vark" / "data.csv",
        item_start=2,
        item_count=15,
        label_col=17,
        n_columns=18,
        question_ids=tuple(f"q{i:02d}" for i in range(1, 16)),
        groups=tuple(["r"] * 5 + ["a"] * 5 + ["k"] * 5),
        label_map={"A": "R", "V": "A", "K": "K"},
    )


MODELS = {
    "vark": _vark(),
}


def get_config(model: str = "vark") -> ModelConfig:
    try:
        return MODELS[model]
    except KeyError:
        raise ValueError(f"unknown model '{model}' — registered: {sorted(MODELS)}") from None


def label_map(model: str = "vark") -> dict:
    return get_config(model).label_map


def feature_schema(model: str = "vark") -> list:
    cfg = get_config(model)
    return [
        {"datasetIndex": cfg.item_start + i, "questionId": cfg.question_ids[i], "group": cfg.groups[i]}
        for i in range(cfg.item_count)
    ]


def dataset_sha256(model: str = "vark") -> str:
    return hashlib.sha256(get_config(model).dataset.read_bytes()).hexdigest()


def load_dataset(model: str = "vark"):
    cfg = get_config(model)
    df = pd.read_csv(cfg.dataset, header=0)
    if df.shape[1] != cfg.n_columns:
        raise ValueError(f"expected {cfg.n_columns} columns, found {df.shape[1]}")
    item_columns = [f"item_{i}" for i in range(cfg.item_count)]
    X = df.iloc[:, cfg.item_start : cfg.item_start + cfg.item_count].astype(float)
    X.columns = item_columns
    y = df.iloc[:, cfg.label_col].astype(str).str.strip()
    known = set(cfg.label_map) | set(cfg.label_map.values())
    unknown = sorted(set(y.unique()) - known)
    if unknown:
        raise ValueError(f"unexpected labels: {unknown}")
    return X, y


def main() -> None:
    for model, cfg in MODELS.items():
        X, y = load_dataset(model)
        print(json.dumps({
            "model": model,
            "formId": cfg.form_id,
            "records": int(len(X)),
            "features": int(X.shape[1]),
            "labels": sorted(set(y)),
            "schema": feature_schema(model),
            "labelMap": cfg.label_map,
            "datasetSha256": dataset_sha256(model),
        }, indent=2))


if __name__ == "__main__":
    main()