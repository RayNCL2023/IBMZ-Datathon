"""SBAR handover notes. The facts and the recommendation are built by rules from the data, so they are always
correct; Granite (on LinuxONE, see granite/server.py) only turns the abnormal facts into a spoken-style summary,
every number it writes is checked against the facts, and a sentence naming a condition without calling it a risk
is flagged. A note that fails either check comes back with verified=false: show the rule-based SBAR instead."""

import json
import os
import re
import urllib.request

GRANITE_URL = os.getenv("GRANITE_URL", "")
TIMEOUT_S = 120

NAMES = {
    "sepsis": "sepsis",
    "hypotension": "hypotension (low blood pressure)",
    "aki": "acute kidney injury",
    "resp": "respiratory failure",
    "mortality": "in-hospital mortality",
}
READABLE = {
    "HR": "heart rate", "O2Sat": "oxygen saturation", "Temp": "temperature", "SBP": "systolic pressure",
    "MAP": "mean arterial pressure", "DBP": "diastolic pressure", "Resp": "breathing rate", "EtCO2": "end-tidal CO2",
    "BaseExcess": "base excess", "HCO3": "bicarbonate", "FiO2": "inspired oxygen (FiO2)", "PaCO2": "PaCO2",
    "SaO2": "arterial oxygen saturation", "AST": "AST", "BUN": "urea (BUN)", "Alkalinephos": "alkaline phosphatase",
    "Calcium": "calcium", "Chloride": "chloride", "Creatinine": "creatinine", "Bilirubin_direct": "direct bilirubin",
    "Glucose": "glucose", "Lactate": "lactate", "Magnesium": "magnesium", "Phosphate": "phosphate",
    "Potassium": "potassium", "Bilirubin_total": "bilirubin", "TroponinI": "troponin", "Hct": "haematocrit",
    "Hgb": "haemoglobin", "PTT": "clotting time (PTT)", "WBC": "white cell count", "Fibrinogen": "fibrinogen",
    "Platelets": "platelets", "Age": "age", "Gender": "sex", "Urine": "urine output", "ShockIndex": "shock index",
    "BUN_Creatinine": "urea/creatinine ratio", "qSOFA_partial": "qSOFA", "NEWS2": "NEWS2",
}
# Prompts for action, never orders: the nurse and the local escalation policy decide.
ACTIONS = {
    "sepsis": "Ask for a clinical review and consider screening for sepsis under the local sepsis pathway.",
    "hypotension": "Review blood pressure trend and fluid balance; escalate under local policy if it keeps falling.",
    "aki": "Review creatinine trend, urine output and nephrotoxic medicines.",
    "resp": "Review oxygen requirement and work of breathing.",
    "mortality": "Consider a senior review of the escalation plan.",
}
SYSTEM = (
    "You are an ICU nurse giving a verbal handover to the next nurse. Summarise the facts in 2 or 3 short "
    "sentences (under 60 words): who the patient is, what is abnormal, and which risk is rising and why. Use ONLY "
    "the facts given; never add numbers, diagnoses, causes or treatments. The conditions are predicted RISKS, not "
    "diagnoses: always write 'risk of sepsis', never 'has sepsis' or 'with sepsis'."
)
# Words that name a predicted condition; a sentence using one must also say "risk".
CONDITION_WORDS = ["sepsis", "septic", "hypotension", "kidney injury", "aki", "respiratory failure", "mortality", "death"]


def _abnormal(v: dict) -> list[str]:
    """Vitals outside NEWS2's normal bands, in words, with the value."""
    out = []
    checks = [
        ("HR", "heart rate", lambda x: "fast" if x > 100 else "slow" if x < 50 else None, "{:.0f}"),
        ("MAP", "mean arterial pressure", lambda x: "low" if x < 65 else None, "{:.0f}"),
        ("SBP", "systolic blood pressure", lambda x: "low" if x <= 100 else "high" if x >= 220 else None, "{:.0f}"),
        ("Resp", "breathing rate", lambda x: "fast" if x >= 21 else "slow" if x <= 8 else None, "{:.0f}"),
        ("O2Sat", "oxygen saturation", lambda x: "low" if x < 94 else None, "{:.0f}%"),
        ("Temp", "temperature", lambda x: "high" if x >= 38.1 else "low" if x <= 36.0 else None, "{:.1f} C"),
    ]
    for key, name, rule, fmt in checks:
        x = v.get(key)
        if x is None or not rule(x):
            continue
        out.append(f"{name} {fmt.format(x)} ({rule(x)})")
    return out


def facts(p: dict, row: dict) -> dict:
    """Situation, background, assessment and recommendation from one /patient response (rules only)."""
    now = p["timeline"][-1]
    before = p["timeline"][max(0, len(p["timeline"]) - 7)]
    age = row.get("Age")
    sex = {0: "woman", 1: "man"}.get(int(row["Gender"])) if row.get("Gender") is not None else None
    # PhysioNet records every age of 90 or over as 100.
    who = (f"{sex or 'patient'} aged 90 or over" if age >= 90 else f"{age:.0f}-year-old {sex or 'patient'}") if age else (sex or "patient")
    alerting = [h for h, r in now["risks"].items() if r["alert"]]
    alerting.sort(key=lambda h: -now["risks"][h]["risk"] / max(p["thresholds"][h], 1e-6))

    risk_lines = []
    for h in alerting:
        r, t, was = now["risks"][h]["risk"], p["thresholds"][h], before["risks"][h]["risk"]
        line = f"{NAMES[h]} risk {r:.0%} (above its alarm line of {t:.0%})"
        if before["hour"] < now["hour"] and round(r, 2) > round(was, 2):
            line += f", up from {was:.0%} {now['hour'] - before['hour']} hours ago"
        drivers = [READABLE.get(d["feature"], d["feature"]) for d in p["drivers"].get(h, [])]
        if drivers:
            line += f"; main contributors: {', '.join(drivers)}"
        risk_lines.append(line)

    abnormal = _abnormal(now["vitals"])
    situation = f"Bed {p['bed']:02d}, {who}, {now['hour'] + 1} hours in ICU. NEWS2 {now['news2']}" + (" (alert)." if now["news2Alert"] else ".")
    situation += f" Raised risk (not a diagnosis) of: {'; '.join(NAMES[h] for h in alerting)}." if alerting else " No model alerts."
    first = {h: a for h, a in p["firstAlert"].items() if a is not None}
    background = f"Hospital {p['hospital']}."
    if alerting and first.get(alerting[0]) is not None:
        background += f" First {NAMES[alerting[0]]} alarm at hour {first[alerting[0]]}"
        n = p["news2FirstAlert"]
        background += f"; first NEWS2 alarm at hour {n}." if n is not None else "; NEWS2 has not alarmed."
    assessment = (f"Abnormal now: {', '.join(abnormal)}. " if abnormal else "Observations within normal bands. ")
    assessment += " ".join(f"{line[0].upper()}{line[1:]}." for line in risk_lines)
    actions = [ACTIONS[h] for h in alerting] or ["Continue routine observations."]
    recommendation = " ".join(actions) + " Decision support only: confirm clinically."
    return {"situation": situation, "background": background, "assessment": assessment.strip(), "recommendation": recommendation}


def _numbers(text: str) -> set[str]:
    return {n.rstrip(".").lstrip("0") or "0" for n in re.findall(r"\d+(?:\.\d+)?", text)}


def generate(system: str, user: str, max_tokens: int) -> dict:
    """One Granite completion: {"text", "seconds", "tokens"}, or {"error"} when it is not configured or down."""
    if not GRANITE_URL:
        return {"error": "GRANITE_URL not set"}
    body = json.dumps({"system": system, "user": user, "max_tokens": max_tokens})
    req = urllib.request.Request(f"{GRANITE_URL}/generate", data=body.encode(), headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            return json.loads(resp.read())
    except OSError as e:
        return {"error": f"granite unavailable: {e}"}


def check(text: str, source: str, out: dict) -> dict:
    """Flag any number Granite wrote that is not in the facts, and any sentence naming a condition as a diagnosis."""
    unverified = sorted(_numbers(text) - _numbers(source))
    sentences = re.split(r"(?<=[.!?])\s+", text)
    as_diagnosis = [x for x in sentences if any(w in x.lower() for w in CONDITION_WORDS) and "risk" not in x.lower()]
    return {
        "narrative": text,
        "verified": not unverified and not as_diagnosis,
        "unverifiedNumbers": unverified,
        "statedAsDiagnosis": as_diagnosis,
        "generationSeconds": out["seconds"],
        "tokens": out["tokens"],
    }


def narrate(sbar: dict) -> dict:
    """Granite's spoken-style summary of situation + assessment, with any number not in the facts flagged."""
    source = f"{sbar['situation']}\n{sbar['assessment']}"
    out = generate(SYSTEM, f"Facts:\n{source}\n\nWrite the handover summary.", 140)
    if "error" in out:
        return {"narrative": None, "error": out["error"]}
    return check(out["text"], source, out)
