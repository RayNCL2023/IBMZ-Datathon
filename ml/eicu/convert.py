"""Convert the eICU-CRD demo (v2.0.1) into the PhysioNet/CinC Challenge 2019 .psv format.

Usage:
    python convert.py <raw_dir> <out_dir>

Reads  : <raw_dir>/{patient,vitalPeriodic,vitalAperiodic,lab,respiratoryCharting,
                    diagnosis,intakeOutput}.csv.gz
Writes : <out_dir>/training_setC/p<patientunitstayid>.psv
         <out_dir>/outcomes_eicu.csv

Conventions (match PhysioNet 2019):
  * one row per hour from unit admission (offset 0) to unit discharge;
    hour h = offsets [60h, 60h+60) minutes; ICULOS = h + 1
  * several measurements in one hour -> median (Urine: sum of mL in the hour)
  * no forward filling; NaN where nothing was measured
  * 41 PhysioNet columns plus a trailing Urine column

SepsisLabel is a PROXY (eICU has no Sepsis-3 onset):
  onset = earliest diagnosis.diagnosisoffset whose diagnosisstring contains
          "sepsis" or "septic" (case-insensitive)
  label = 1 for hours >= floor(onset / 60) - 6, else 0
  stays whose onset is <= 0 (septic on arrival) are excluded; stays < 8 h are dropped.
"""

import os
import sys

import numpy as np
import pandas as pd

COLUMNS = (
    "HR|O2Sat|Temp|SBP|MAP|DBP|Resp|EtCO2|BaseExcess|HCO3|FiO2|pH|PaCO2|SaO2|AST|BUN|"
    "Alkalinephos|Calcium|Chloride|Creatinine|Bilirubin_direct|Glucose|Lactate|Magnesium|"
    "Phosphate|Potassium|Bilirubin_total|TroponinI|Hct|Hgb|PTT|WBC|Fibrinogen|Platelets|"
    "Age|Gender|Unit1|Unit2|HospAdmTime|ICULOS|SepsisLabel|Urine"
).split("|")

MIN_HOURS = 8
ONSET_LEAD_HOURS = 6

# eICU lab.labname -> PhysioNet column.
LAB_MAP = {
    "lactate": "Lactate",
    "creatinine": "Creatinine",
    "BUN": "BUN",
    "WBC x 1000": "WBC",
    "platelets x 1000": "Platelets",
    "total bilirubin": "Bilirubin_total",
    "direct bilirubin": "Bilirubin_direct",
    "PTT": "PTT",  # NOT "PT - INR" / "PT" / "PTT ratio"
    "fibrinogen": "Fibrinogen",
    "troponin - I": "TroponinI",
    "HCO3": "HCO3",  # blood-gas HCO3
    "bicarbonate": "HCO3",  # chemistry-panel bicarbonate; pooled with HCO3 in the hourly median
    "Base Excess": "BaseExcess",
    "paCO2": "PaCO2",
    "pH": "pH",
    "FiO2": "FiO2",
    "AST (SGOT)": "AST",
    "alkaline phos.": "Alkalinephos",
    "calcium": "Calcium",  # total calcium; "ionized calcium" is left unmapped
    "chloride": "Chloride",
    "glucose": "Glucose",  # serum glucose; "bedside glucose" (fingerstick) is left unmapped
    "magnesium": "Magnesium",
    "phosphate": "Phosphate",
    "potassium": "Potassium",
    "Hct": "Hct",
    "Hgb": "Hgb",
    "O2 Sat (%)": "SaO2",  # arterial blood-gas saturation
    "Temperature": "Temp_lab",  # blood-gas temperature, used only as a Temp fallback
}

# Unit each column must have in eICU (labmeasurenamesystem). All of them already match the
# units PhysioNet 2019 uses, so no multiplicative conversion is needed for labs. Note that
# PhysioNet's docs list Lactate as mg/dL but the 2019 data are mmol/L in practice (median ~1.9),
# so eICU mmol/L is kept as is. FiO2 and Temp are converted separately below.
EXPECTED_LAB_UNITS = {
    "Lactate": "mmol/L", "Creatinine": "mg/dL", "BUN": "mg/dL", "WBC": "K/mcL",
    "Platelets": "K/mcL", "Bilirubin_total": "mg/dL", "Bilirubin_direct": "mg/dL",
    "PTT": "sec", "Fibrinogen": "mg/dL", "TroponinI": "ng/mL", "HCO3": "mmol/L",
    "BaseExcess": "mEq/L", "PaCO2": "mm Hg", "pH": "", "FiO2": "%", "AST": "Units/L",
    "Alkalinephos": "Units/L", "Calcium": "mg/dL", "Chloride": "mmol/L", "Glucose": "mg/dL",
    "Magnesium": "mg/dL", "Phosphate": "mg/dL", "Potassium": "mmol/L", "Hct": "%",
    "Hgb": "g/dL", "SaO2": "%", "Temp_lab": "&#176;C",
}

RESP_FIO2_LABELS = ["FiO2", "FIO2 (%)"]


def hour_of(offset_min):
    return np.floor(offset_min / 60.0).astype("int64")


def hourly(df, offset_col, value_cols, how="median"):
    """Aggregate value_cols per (stay, hour). Drops pre-admission (negative) offsets."""
    df = df.dropna(subset=[offset_col]).copy()
    df["hour"] = hour_of(df[offset_col])
    df = df[df["hour"] >= 0]
    grouped = df.groupby(["patientunitstayid", "hour"])[value_cols]
    if how == "sum":
        return grouped.sum(min_count=1)
    return grouped.median()


def f_to_c(series):
    """Values above 45 cannot be Celsius; treat them as Fahrenheit."""
    s = series.copy()
    is_f = s > 45
    s[is_f] = (s[is_f] - 32) / 1.8
    return s, int(is_f.sum())


def fio2_to_fraction(series):
    """Percent -> fraction; drop anything outside the physical range 0.21-1."""
    s = series.copy()
    s[s > 1] = s[s > 1] / 100.0
    s[(s < 0.21) | (s > 1)] = np.nan
    return s


def load_vitals(raw):
    per = pd.read_csv(
        os.path.join(raw, "vitalPeriodic.csv.gz"),
        usecols=["patientunitstayid", "observationoffset", "temperature", "sao2",
                 "heartrate", "respiration", "systemicsystolic", "systemicdiastolic",
                 "systemicmean"],
    ).rename(columns={
        "heartrate": "HR", "sao2": "O2Sat", "temperature": "Temp", "respiration": "Resp",
        "systemicsystolic": "SBP_inv", "systemicmean": "MAP_inv", "systemicdiastolic": "DBP_inv",
    })
    per["Temp"], n_f = f_to_c(per["Temp"])
    print("vitalPeriodic: %d rows, %d temperature values converted F->C" % (len(per), n_f))
    per_h = hourly(per, "observationoffset",
                   ["HR", "O2Sat", "Temp", "Resp", "SBP_inv", "MAP_inv", "DBP_inv"])

    ap = pd.read_csv(
        os.path.join(raw, "vitalAperiodic.csv.gz"),
        usecols=["patientunitstayid", "observationoffset", "noninvasivesystolic",
                 "noninvasivediastolic", "noninvasivemean"],
    ).rename(columns={"noninvasivesystolic": "SBP_ni", "noninvasivemean": "MAP_ni",
                      "noninvasivediastolic": "DBP_ni"})
    print("vitalAperiodic: %d rows" % len(ap))
    ap_h = hourly(ap, "observationoffset", ["SBP_ni", "MAP_ni", "DBP_ni"])

    v = per_h.join(ap_h, how="outer")
    for c in ["SBP", "MAP", "DBP"]:
        # Invasive (arterial line) preferred, non-invasive cuff as fallback, per hour.
        v[c] = v[c + "_inv"].fillna(v[c + "_ni"])
    return v[["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp"]]


def load_labs(raw):
    lab = pd.read_csv(
        os.path.join(raw, "lab.csv.gz"),
        usecols=["patientunitstayid", "labresultoffset", "labname", "labresult",
                 "labmeasurenamesystem"],
    )
    print("lab: %d rows" % len(lab))
    counts = lab["labname"].value_counts()
    unmapped = sorted(set(counts.index) - set(LAB_MAP), key=str.lower)
    print("\nUnmapped labnames (%d), with row counts:" % len(unmapped))
    for n in unmapped:
        print("  %-34s %d" % (n, counts[n]))

    lab = lab[lab["labname"].isin(LAB_MAP)].copy()
    lab["col"] = lab["labname"].map(LAB_MAP)
    lab["labmeasurenamesystem"] = lab["labmeasurenamesystem"].fillna("")
    lab["labresult"] = pd.to_numeric(lab["labresult"], errors="coerce")
    lab = lab.dropna(subset=["labresult"])

    print("\nLab units per mapped column (labmeasurenamesystem):")
    for (col, unit), n in lab.groupby(["col", "labmeasurenamesystem"]).size().items():
        expected = EXPECTED_LAB_UNITS[col]
        flag = "" if unit == expected else "   <-- DIFFERS from expected %r" % expected
        print("  %-16s %-10s n=%d%s" % (col, unit, n, flag))
        if flag:
            raise SystemExit("Unexpected lab unit; add a conversion before continuing.")

    m = lab["col"] == "FiO2"
    lab.loc[m, "labresult"] = fio2_to_fraction(lab.loc[m, "labresult"])
    m = lab["col"] == "Temp_lab"
    lab.loc[m, "labresult"], n_f = f_to_c(lab.loc[m, "labresult"])
    print("lab Temperature: %d values converted F->C" % n_f)
    lab = lab.dropna(subset=["labresult"])

    lab["hour"] = hour_of(lab["labresultoffset"])
    lab = lab[lab["hour"] >= 0]
    return lab.groupby(["patientunitstayid", "hour", "col"])["labresult"].median().unstack("col")


def load_resp_fio2(raw):
    r = pd.read_csv(
        os.path.join(raw, "respiratoryCharting.csv.gz"),
        usecols=["patientunitstayid", "respchartoffset", "respchartvaluelabel", "respchartvalue"],
    )
    r = r[r["respchartvaluelabel"].isin(RESP_FIO2_LABELS)].copy()
    r["FiO2_resp"] = pd.to_numeric(
        r["respchartvalue"].astype(str).str.replace("%", "", regex=False), errors="coerce")
    r["FiO2_resp"] = fio2_to_fraction(r["FiO2_resp"])
    r = r.dropna(subset=["FiO2_resp"])
    return hourly(r, "respchartoffset", ["FiO2_resp"])


def load_nurse_temp(raw):
    """Most eICU temperatures are nurse-charted, not in vitalPeriodic. Hourly median in degrees C."""
    n = pd.read_csv(
        os.path.join(raw, "nurseCharting.csv.gz"),
        usecols=["patientunitstayid", "nursingchartoffset", "nursingchartcelltypevallabel",
                 "nursingchartcelltypevalname", "nursingchartvalue"],
    )
    n = n[(n["nursingchartcelltypevallabel"] == "Temperature")
          & n["nursingchartcelltypevalname"].isin(["Temperature (C)", "Temperature (F)"])].copy()
    n["Temp_nurse"] = pd.to_numeric(n["nursingchartvalue"], errors="coerce")
    is_f = n["nursingchartcelltypevalname"] == "Temperature (F)"
    n.loc[is_f, "Temp_nurse"] = (n.loc[is_f, "Temp_nurse"] - 32) / 1.8
    n["Temp_nurse"], n_f = f_to_c(n["Temp_nurse"])  # Fahrenheit values charted under the (C) label
    n.loc[(n["Temp_nurse"] < 25) | (n["Temp_nurse"] > 45), "Temp_nurse"] = np.nan
    print("nurseCharting: %d temperature values (%d F->C by value)" % (n["Temp_nurse"].notna().sum(), n_f))
    return hourly(n, "nursingchartoffset", ["Temp_nurse"])


URINE_INCLUDE = (r"urine|urinary|foley|void|urethral catheter|straight catheter|nephrostomy|"
                 r"urostomy|ileal conduit|suprapubic")
# Mentions urine but is not a urine volume in mL: event counts, mixed with stool, GI tubes.
URINE_EXCLUDE = r"count|occurrence|unmeasured|stool|gastric|colostomy|ileostomy|irrigation"


def is_urine_row(io):
    """Rows in the I&O 'Output (ml)' section whose celllabel names a urine source."""
    path = io["cellpath"].fillna("").str.lower()
    label = io["celllabel"].fillna("").str.lower()
    in_output = path.str.contains(r"\|output \(ml\)\|", regex=True)
    return (in_output & label.str.contains(URINE_INCLUDE)
            & ~label.str.contains(URINE_EXCLUDE))


def load_urine(raw):
    io = pd.read_csv(
        os.path.join(raw, "intakeOutput.csv.gz"),
        usecols=["patientunitstayid", "intakeoutputoffset", "cellpath", "celllabel",
                 "cellvaluenumeric"],
    )
    print("intakeOutput: %d rows" % len(io))
    u = io[is_urine_row(io)].copy()
    print("\nMatched urine labels (celllabel, rows):")
    for lbl, n in u["celllabel"].value_counts().items():
        print("  %-50s %d" % (lbl, n))
    u["Urine"] = pd.to_numeric(u["cellvaluenumeric"], errors="coerce")
    n_neg = int((u["Urine"] < 0).sum())
    u = u[u["Urine"] >= 0]
    print("urine rows dropped for negative volume: %d" % n_neg)
    return hourly(u, "intakeoutputoffset", ["Urine"], how="sum")


def load_static(raw):
    p = pd.read_csv(os.path.join(raw, "patient.csv.gz"))
    age = p["age"].astype(str).str.strip().replace({"> 89": "90"})
    p["Age"] = pd.to_numeric(age, errors="coerce")
    p["Gender"] = p["gender"].map({"Female": 0, "Male": 1})
    p["Unit1"] = (p["unittype"] == "MICU").astype(int)
    p["Unit2"] = (p["unittype"] == "SICU").astype(int)
    p["HospAdmTime"] = p["hospitaladmitoffset"] / 60.0
    return p.set_index("patientunitstayid")


def load_onsets(raw):
    d = pd.read_csv(os.path.join(raw, "diagnosis.csv.gz"),
                    usecols=["patientunitstayid", "diagnosisoffset", "diagnosisstring"])
    s = d["diagnosisstring"].fillna("").str.lower()
    d = d[s.str.contains("sepsis|septic")]
    return d.groupby("patientunitstayid")["diagnosisoffset"].min()


def status_to_death(series):
    return series.map({"Expired": 1, "Alive": 0}).astype("Int64")


def main(raw, out):
    static = load_static(raw)
    onsets = load_onsets(raw)

    dyn = load_vitals(raw)
    dyn = dyn.join(load_labs(raw), how="outer")
    dyn = dyn.join(load_resp_fio2(raw), how="outer")
    dyn = dyn.join(load_urine(raw), how="outer")
    dyn = dyn.join(load_nurse_temp(raw), how="outer")
    # Lab FiO2 preferred (measured with the blood gas), charted ventilator FiO2 as fallback.
    dyn["FiO2"] = dyn["FiO2"].fillna(dyn["FiO2_resp"])
    # Temperature: continuous probe, then nurse-charted, then the blood-gas lab value.
    dyn["Temp"] = dyn["Temp"].fillna(dyn["Temp_nurse"]).fillna(dyn["Temp_lab"])
    dyn = dyn.drop(columns=["FiO2_resp", "Temp_lab", "Temp_nurse"])
    dyn_by_stay = {sid: g.droplevel(0) for sid, g in dyn.groupby(level=0)}

    psv_dir = os.path.join(out, "training_setC")
    os.makedirs(psv_dir, exist_ok=True)

    n_short = n_arrival = n_septic = n_onset_after = n_rows = 0
    outcomes = []
    for sid, row in static.iterrows():
        los = row["unitdischargeoffset"]
        n_hours = int(np.ceil(los / 60.0)) if np.isfinite(los) and los > 0 else 0
        if n_hours < MIN_HOURS:
            n_short += 1
            continue
        onset = onsets.get(sid, np.nan)
        if np.isfinite(onset) and onset <= 0:
            n_arrival += 1
            continue

        hours = pd.RangeIndex(n_hours, name="hour")
        g = dyn_by_stay.get(sid)
        df = g.reindex(hours) if g is not None else pd.DataFrame(index=hours)
        df = df.reindex(columns=COLUMNS)
        for c in ["Age", "Gender", "Unit1", "Unit2"]:
            df[c] = row[c]
        df["HospAdmTime"] = round(row["HospAdmTime"], 2)
        df["ICULOS"] = np.arange(1, n_hours + 1)
        df["SepsisLabel"] = 0
        if np.isfinite(onset):
            start = int(np.floor(onset / 60.0)) - ONSET_LEAD_HOURS
            df["SepsisLabel"] = (np.arange(n_hours) >= start).astype(int)
            if df["SepsisLabel"].any():
                n_septic += 1
            else:
                n_onset_after += 1

        name = "p%d" % sid
        df.to_csv(os.path.join(psv_dir, name + ".psv"), sep="|", na_rep="NaN", index=False)
        n_rows += len(df)
        outcomes.append({
            "patient": name,
            "hospitalid": row["hospitalid"],
            "in_hospital_death": row["hospitaldischargestatus"],
            "unit_death": row["unitdischargestatus"],
            "unit_los_hours": round(los / 60.0, 2),
        })

    oc = pd.DataFrame(outcomes)
    oc["in_hospital_death"] = status_to_death(oc["in_hospital_death"])
    oc["unit_death"] = status_to_death(oc["unit_death"])
    oc.to_csv(os.path.join(out, "outcomes_eicu.csv"), index=False)

    print("\nStays in patient table: %d" % len(static))
    print("Dropped (< %dh or missing LOS): %d" % (MIN_HOURS, n_short))
    print("Excluded (sepsis dx at/before unit admission): %d" % n_arrival)
    print("Written: %d  rows: %d" % (len(oc), n_rows))
    print("Septic (any SepsisLabel=1): %d" % n_septic)
    print("Sepsis dx after unit discharge (all labels 0): %d" % n_onset_after)
    print("In-hospital mortality: %.1f%% (known for %d)" % (
        100 * oc["in_hospital_death"].mean(), oc["in_hospital_death"].notna().sum()))
    print("Unit mortality: %.1f%%" % (100 * oc["unit_death"].mean()))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
