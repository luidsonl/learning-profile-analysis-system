"""Load the committed VARK dataset positionally.

The CSV has two columns sharing the same header text ("role-playing"), so
columns are referenced strictly by position:

    0      Gender        (unused as feature)
    1      Age           (unused as feature)
    2-16   15 Likert items rated 1-5 (reading 0-4, aural 5-9, kinesthetic 10-14)
    17     Learner       (label: A | K | V — no R class exists)
"""

import hashlib
from pathlib import Path

import pandas as pd

DATASET_PATH = Path(__file__).resolve().parents[2] / "datasets" / "vark" / "data.csv"

ITEM_COLUMNS = [f"item_{i}" for i in range(15)]
QUESTION_IDS = [f"q{i:02d}" for i in range(1, 16)]
GROUPS = ["r"] * 5 + ["a"] * 5 + ["k"] * 5

# Dataset letters do NOT follow naive VARK semantics against the item blocks:
# empirically the reading block discriminates class "A", the aural block class
# "V", and the kinesthetic block class "K" (per-class group means, ~93% CV
# separability). Serving maps letters back to the system profile vocabulary:
# dataset A -> R (reading/writing), dataset V -> A (aural), K -> K.
LABEL_MAP = {"A": "R", "V": "A", "K": "K"}

FEATURE_SCHEMA = [
    {"datasetIndex": i, "questionId": QUESTION_IDS[i], "group": GROUPS[i]}
    for i in range(15)
]


def dataset_sha256() -> str:
    return hashlib.sha256(DATASET_PATH.read_bytes()).hexdigest()


def load_dataset():
    df = pd.read_csv(DATASET_PATH, header=0)
    if df.shape[1] != 18:
        raise ValueError(f"expected 18 columns, found {df.shape[1]}")
    X = df.iloc[:, 2:17].astype(float)
    X.columns = ITEM_COLUMNS
    y = df.iloc[:, 17].astype(str).str.strip()
    unknown = sorted(set(y.unique()) - set(LABEL_MAP) - {"A", "K"})
    if unknown:
        raise ValueError(f"unexpected labels: {unknown}")
    return X, y
