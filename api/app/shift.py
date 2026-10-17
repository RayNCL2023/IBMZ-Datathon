"""Ward shift summary over the last n hours. Like the SBAR handover, the facts per bed (new alarms, cleared alarms,
NEWS2 and risk change) are built by rules from /patient timelines, so they are always correct; Granite only turns
the beds that need attention into a short spoken handover for the nurse in charge, checked the same way."""

from . import handover
from .handover import NAMES

SYSTEM = (
    "You are the ICU nurse in charge giving the end-of-shift ward handover to the next shift. Summarise the facts "
    "in 3 or 4 short sentences (under 90 words): how the ward went overall, then which beds need attention first "
    "and why. Use ONLY the facts given; never add numbers, diagnoses, causes or treatments. The conditions are "
    "predicted RISKS, not diagnoses: always write 'risk of sepsis', never 'has sepsis' or 'with sepsis'."
)
# A bed whose priority (highest risk / alarm line) moves this much over the shift is worsening or improving.
TREND = 0.2
# Beds sent to Granite: its context is small and the nurse in charge only needs the top of the list.
NARRATE_BEDS = 5


def _ratio(p: dict, point: dict, head: str) -> float:
    return point["risks"][head]["risk"] / max(p["thresholds"][head], 1e-6)


def bed(p: dict, hour: int, from_hour: int) -> dict | None:
    """What changed for one patient between `from_hour` and `hour`. None if they left before the shift began."""
    tl = p["timeline"]
    last = tl[-1]
    if last["hour"] < from_hour:
        return None
    base, window = tl[from_hour], tl[from_hour + 1 :]
    heads = list(last["risks"])

    alerting = sorted((h for h in heads if last["risks"][h]["alert"]), key=lambda h: -_ratio(p, last, h))
    new = []
    for h in heads:
        if base["risks"][h]["alert"]:
            continue
        at = next((t["hour"] for t in window if t["risks"][h]["alert"]), None)
        if at is not None:
            new.append({"head": h, "hour": at})
    cleared = [h for h in heads if base["risks"][h]["alert"] and not last["risks"][h]["alert"]]
    news2 = {"start": base["news2"], "end": last["news2"], "max": max(t["news2"] for t in [base, *window])}
    new_news2 = not base["news2Alert"] and any(t["news2Alert"] for t in window)

    discharged = hour >= p["lengthOfStay"]
    delta = last["priority"] - base["priority"]
    if discharged:
        status = "discharged"
    elif new or delta >= TREND:
        status = "worsening"
    elif cleared or delta <= -TREND:
        status = "improving"
    else:
        status = "stable"

    parts = []
    for n in new:
        r0, r1 = base["risks"][n["head"]]["risk"], last["risks"][n["head"]]["risk"]
        parts.append(f"new {NAMES[n['head']]} risk alarm at hour {n['hour']} (risk {r0:.0%} to {r1:.0%})")
    still = [h for h in alerting if h not in {n["head"] for n in new}]
    if still:
        parts.append(f"still alarming for {', '.join(NAMES[h] for h in still)} risk")
    if cleared:
        parts.append(f"alarm cleared for {', '.join(NAMES[h] for h in cleared)} risk")
    if news2["start"] != news2["end"] or new_news2:
        parts.append(f"NEWS2 {news2['start']} to {news2['end']}" + (" (new NEWS2 alert)" if new_news2 else ""))
    if discharged:
        parts.append(f"discharged after hour {last['hour']}")
    line = f"Bed {p['bed']:02d}: " + ("; ".join(parts) if parts else "no change, no alarms") + "."

    return {
        "bed": p["bed"],
        "patientId": p["patientId"],
        "hospital": p["hospital"],
        "status": status,
        "alerting": alerting,
        "newAlarms": new,
        "cleared": cleared,
        "news2": {**news2, "alert": last["news2Alert"], "newAlert": new_news2},
        "priority": {"start": base["priority"], "end": last["priority"]},
        "topRisk": last["topRisk"],
        "risks": {h: {"start": base["risks"][h]["risk"], "end": last["risks"][h]["risk"]} for h in heads},
        "line": line,
    }


ORDER = {"worsening": 0, "stable": 1, "improving": 2, "discharged": 3}


def facts(patients: list[dict], hour: int, hours: int) -> dict:
    """Per-bed changes over the shift, worst first, plus a one-paragraph ward overview (rules only)."""
    from_hour = max(0, hour - hours)
    beds = [b for b in (bed(p, hour, from_hour) for p in patients) if b]
    beds.sort(key=lambda b: (ORDER[b["status"]], -b["priority"]["end"]))
    count = lambda s: sum(b["status"] == s for b in beds)
    counts = {
        "beds": len(beds),
        "alerting": sum(bool(b["alerting"]) for b in beds if b["status"] != "discharged"),
        "newAlarms": sum(len(b["newAlarms"]) for b in beds),
        "bedsWithNewAlarms": sum(bool(b["newAlarms"]) for b in beds),
        **{s: count(s) for s in ORDER},
    }
    overview = (
        f"Shift from hour {from_hour} to hour {hour} ({hour - from_hour} hours), {counts['beds']} beds. "
        f"{counts['alerting']} beds alarming now. {counts['newAlarms']} new risk alarms in {counts['bedsWithNewAlarms']} beds. "
        f"{counts['worsening']} worsening, {counts['improving']} improving, {counts['stable']} stable, {counts['discharged']} discharged."
    )
    return {"fromHour": from_hour, "hour": hour, "hours": hour - from_hour, "overview": overview, "counts": counts, "beds": beds}


def narrate(summary: dict) -> dict:
    """Granite's spoken ward handover from the overview and the beds that need attention, checked against them."""
    attention = [b["line"] for b in summary["beds"] if b["status"] == "worsening" or b["alerting"]][:NARRATE_BEDS]
    source = "\n".join([summary["overview"], *attention])
    out = handover.generate(SYSTEM, f"Facts:\n{source}\n\nWrite the shift handover.", 200)
    if "error" in out:
        return {"narrative": None, "error": out["error"]}
    return handover.check(out["text"], source, out)
