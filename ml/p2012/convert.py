"""Convert PhysioNet/CinC Challenge 2012 ICU stays to the PhysioNet 2019 hourly PSV format.

Usage:
    python convert.py <raw_dir> <out_dir>

<raw_dir> holds set-{a,b,c}.tar.gz and Outcomes-{a,b,c}.txt (and optionally the
extracted-{a,b,c}/ dirs). Writes:
    <out_dir>/training_set2012/p2012_<RecordID>.psv
    <out_dir>/outcomes2012.csv
"""

import os
import sys
import tarfile
from collections import Counter

import numpy as np
import pandas as pd

SETS = ["a", "b", "c"]
RECORDS_PER_SET = 4000
N_HOURS = 48  # hours 0..47 always; hour 48 only if data exists there

COLUMNS_2019 = (
    "HR|O2Sat|Temp|SBP|MAP|DBP|Resp|EtCO2|BaseExcess|HCO3|FiO2|pH|PaCO2|SaO2|AST|BUN|"
    "Alkalinephos|Calcium|Chloride|Creatinine|Bilirubin_direct|Glucose|Lactate|Magnesium|"
    "Phosphate|Potassium|Bilirubin_total|TroponinI|Hct|Hgb|PTT|WBC|Fibrinogen|Platelets|"
    "Age|Gender|Unit1|Unit2|HospAdmTime|ICULOS|SepsisLabel"
).split("|")
EXTRA_COLUMNS = ["Urine", "GCS", "MechVent", "PaO2", "Weight"]
OUTPUT_COLUMNS = COLUMNS_2019 + EXTRA_COLUMNS

# 2012 parameter -> output column, aggregated with the hourly median.
DIRECT_MAP = {
    "HR": "HR",
    "Temp": "Temp",
    "RespRate": "Resp",
    "HCO3": "HCO3",
    "FiO2": "FiO2",
    "pH": "pH",
    "PaCO2": "PaCO2",
    "PaO2": "PaO2",
    "SaO2": "SaO2",
    "AST": "AST",
    "BUN": "BUN",
    "ALP": "Alkalinephos",
    "Creatinine": "Creatinine",
    "Glucose": "Glucose",
    "Lactate": "Lactate",
    "Mg": "Magnesium",
    "K": "Potassium",
    "Bilirubin": "Bilirubin_total",
    "TroponinI": "TroponinI",
    "HCT": "Hct",
    "WBC": "WBC",
    "Platelets": "Platelets",
    "GCS": "GCS",
    "MechVent": "MechVent",
}

# Blood pressure: invasive first, non-invasive as fallback (decided per hour).
BP_MAP = {
    "SBP": ("SysABP", "NISysABP"),
    "MAP": ("MAP", "NIMAP"),
    "DBP": ("DiasABP", "NIDiasABP"),
}

DESCRIPTORS = {"RecordID", "Age", "Gender", "Height", "ICUType"}  # Weight is also a time series
IGNORED = {"Na", "Albumin", "ALT", "Cholesterol", "TroponinT", "Height"}

# Physiologically plausible bounds for single raw measurements. Values outside are
# treated as artefacts and set to NaN (after the unit fixes in fix_units()).
PLAUSIBLE = {
    "HR": (20, 300),
    "Temp": (25, 45),
    "RespRate": (1, 100),
    "SysABP": (20, 300), "NISysABP": (20, 300),
    "MAP": (15, 250), "NIMAP": (15, 250),
    "DiasABP": (5, 250), "NIDiasABP": (5, 250),
    "FiO2": (0.21, 1.0),
    "pH": (6.5, 8.0),
    "PaCO2": (5, 150),
    "PaO2": (10, 800),
    "SaO2": (20, 100),
    "HCO3": (1, 60),
    "Creatinine": (0.1, 25),
    "Glucose": (10, 2000),
    "Lactate": (0.1, 35),
    "Mg": (0.3, 10),
    "K": (1, 12),
    "HCT": (5, 75),
    "Platelets": (1, 2500),
    "WBC": (0.1, 200),
    "GCS": (3, 15),
    "Urine": (0, 5000),
    "Weight": (20, 300),
}


def is_safe_member(member, target_dir):
    if not (member.isfile() or member.isdir()):
        return False
    dest = os.path.realpath(os.path.join(target_dir, member.name))
    root = os.path.realpath(target_dir)
    return dest == root or dest.startswith(root + os.sep)


def safe_extract(archive, target_dir):
    os.makedirs(target_dir, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        unsafe = [m.name for m in members if not is_safe_member(m, target_dir)]
        if unsafe:
            raise RuntimeError(f"{archive}: refusing unsafe members {unsafe[:5]}")
        for member in members:
            if member.isfile():
                tar.extract(member, target_dir, set_attrs=False)


def record_dir_for_set(raw_dir, s):
    extracted = os.path.join(raw_dir, f"extracted-{s}")
    record_dir = os.path.join(extracted, f"set-{s}")
    if os.path.isdir(record_dir) and len(os.listdir(record_dir)) == RECORDS_PER_SET:
        return record_dir

    print(f"set-{s}: extracting archive")
    safe_extract(os.path.join(raw_dir, f"set-{s}.tar.gz"), extracted)
    return record_dir


def fix_units(df, fixes):
    """Fix values recorded in the wrong unit, then null out implausible ones."""
    fio2 = (df.Parameter == "FiO2") & (df.Value > 1)
    df.loc[fio2, "Value"] /= 100
    fixes["FiO2 % -> fraction"] += int(fio2.sum())

    # pH like 733 is 7.33 recorded without the decimal point.
    ph = (df.Parameter == "pH") & (df.Value >= 650) & (df.Value <= 800)
    df.loc[ph, "Value"] /= 100
    fixes["pH x100 -> /100"] += int(ph.sum())

    for param, (lo, hi) in PLAUSIBLE.items():
        bad = (df.Parameter == param) & ((df.Value < lo) | (df.Value > hi))
        if bad.any():
            df.loc[bad, "Value"] = np.nan
            fixes[f"{param} outside [{lo}, {hi}] -> NaN"] += int(bad.sum())
    return df


def convert_record(path, fixes):
    df = pd.read_csv(path)
    df["Value"] = pd.to_numeric(df["Value"], errors="coerce")
    df.loc[df.Value == -1, "Value"] = np.nan

    static = df[df.Parameter.isin(DESCRIPTORS) & (df.Time == "00:00")]
    static = static.drop_duplicates("Parameter").set_index("Parameter").Value
    record_id = int(static["RecordID"])

    series = df[~df.Parameter.isin(DESCRIPTORS | IGNORED)].copy()
    series = fix_units(series, fixes)
    series = series.dropna(subset=["Value"])
    minutes = np.array([int(t[:-3]) * 60 + int(t[-2:]) for t in series.Time], dtype=int)
    series["hour"] = minutes // 60

    n_hours = N_HOURS + 1 if (series.hour >= N_HOURS).any() else N_HOURS
    series = series[series.hour < n_hours]

    medians = series[series.Parameter != "Urine"].pivot_table(
        index="hour", columns="Parameter", values="Value", aggfunc="median"
    )
    urine = series[series.Parameter == "Urine"].groupby("hour").Value.sum()

    out = pd.DataFrame(np.nan, index=pd.RangeIndex(n_hours, name="hour"), columns=OUTPUT_COLUMNS)

    for src, dst in DIRECT_MAP.items():
        if src in medians:
            out[dst] = medians[src]

    for dst, (invasive, noninvasive) in BP_MAP.items():
        inv = medians[invasive] if invasive in medians else pd.Series(dtype=float)
        non = medians[noninvasive] if noninvasive in medians else pd.Series(dtype=float)
        out[dst] = inv.reindex(out.index).fillna(non.reindex(out.index))

    out["Urine"] = urine.reindex(out.index)

    icu_type = static.get("ICUType")
    weights = df[(df.Parameter == "Weight")].copy()
    weights = fix_units(weights, Counter()).dropna(subset=["Value"])  # fixes counted via series

    out["Age"] = static.get("Age", np.nan)
    out["Gender"] = static.get("Gender", np.nan)
    out["Unit1"] = float(icu_type == 3) if pd.notna(icu_type) else np.nan
    out["Unit2"] = float(icu_type == 4) if pd.notna(icu_type) else np.nan
    out["HospAdmTime"] = np.nan
    out["ICULOS"] = out.index + 1
    out["SepsisLabel"] = np.nan
    out["Weight"] = weights.Value.iloc[-1] if len(weights) else np.nan

    return record_id, out


def read_outcomes(raw_dir):
    frames = []
    for s in SETS:
        o = pd.read_csv(os.path.join(raw_dir, f"Outcomes-{s}.txt"))
        o = o.replace(-1, np.nan)
        frames.append(pd.DataFrame({
            "patient": "p2012_" + o.RecordID.astype(int).astype(str),
            "set": s,
            "in_hospital_death": o["In-hospital_death"],
            "length_of_stay_days": o["Length_of_stay"],
            "survival_days": o["Survival"],
            "saps1": o["SAPS-I"],
            "sofa": o["SOFA"],
        }))
    return pd.concat(frames, ignore_index=True)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    raw_dir, out_dir = sys.argv[1], sys.argv[2]
    psv_dir = os.path.join(out_dir, "training_set2012")
    os.makedirs(psv_dir, exist_ok=True)

    fixes = Counter()
    total_rows = 0
    for s in SETS:
        record_dir = record_dir_for_set(raw_dir, s)
        files = sorted(f for f in os.listdir(record_dir) if f.endswith(".txt"))
        for i, name in enumerate(files):
            record_id, out = convert_record(os.path.join(record_dir, name), fixes)
            out.to_csv(
                os.path.join(psv_dir, f"p2012_{record_id}.psv"),
                sep="|", index=False, na_rep="NaN", float_format="%.6g",
            )
            total_rows += len(out)
            if (i + 1) % 1000 == 0:
                print(f"set-{s}: {i + 1}/{len(files)}")
        print(f"set-{s}: wrote {len(files)} stays")

    outcomes = read_outcomes(raw_dir)
    outcomes.to_csv(os.path.join(out_dir, "outcomes2012.csv"), index=False)

    print(f"total rows: {total_rows}")
    print("unit fixes / artefacts removed (raw measurements):")
    for k, v in sorted(fixes.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
