// Shift summary for the mock data source: a port of api/app/shift.py facts(), plus a templated stand-in for Granite.
import type { Head, PatientResponse, ShiftBed, ShiftBedStatus, ShiftSummaryResponse, TimelinePoint } from "./types";
import { bedNo } from "@/lib/format";
import { NAMES } from "./sbar";

type Summary = Pick<ShiftSummaryResponse, "fromHour" | "hour" | "hours" | "overview" | "counts" | "beds">;

const TREND = 0.2;
const ORDER: Record<ShiftBedStatus, number> = { worsening: 0, stable: 1, improving: 2, discharged: 3 };
const p0 = (v: number) => `${Math.round(v * 100)}%`;

function bed(p: PatientResponse, hour: number, fromHour: number): ShiftBed | null {
    const tl = p.timeline;
    const last = tl[tl.length - 1];
    if (last.hour < fromHour) {
        return null;
    }
    const base = tl[fromHour];
    const window = tl.slice(fromHour + 1);
    const heads = Object.keys(last.risks) as Head[];
    const ratio = (t: TimelinePoint, h: Head) => (t.risks[h]?.risk ?? 0) / Math.max(p.thresholds[h] ?? 1, 1e-6);

    const alerting = heads.filter((h) => last.risks[h]?.alert).sort((a, b) => ratio(last, b) - ratio(last, a));
    const newAlarms: ShiftBed["newAlarms"] = [];
    for (const h of heads) {
        if (base.risks[h]?.alert) {
            continue;
        }
        const at = window.find((t) => t.risks[h]?.alert);
        if (at) {
            newAlarms.push({ head: h, hour: at.hour });
        }
    }
    const cleared = heads.filter((h) => base.risks[h]?.alert && !last.risks[h]?.alert);
    const newNews2 = !base.news2Alert && window.some((t) => t.news2Alert);
    const news2 = { start: base.news2, end: last.news2, max: Math.max(...[base, ...window].map((t) => t.news2)), alert: last.news2Alert, newAlert: newNews2 };

    const discharged = hour >= p.lengthOfStay;
    const delta = last.priority - base.priority;
    const status: ShiftBedStatus = discharged
        ? "discharged"
        : newAlarms.length || delta >= TREND
          ? "worsening"
          : cleared.length || delta <= -TREND
            ? "improving"
            : "stable";

    const parts: string[] = [];
    for (const n of newAlarms) {
        parts.push(`new ${NAMES[n.head]} risk alarm at hour ${n.hour} (risk ${p0(base.risks[n.head]!.risk)} to ${p0(last.risks[n.head]!.risk)})`);
    }
    const still = alerting.filter((h) => !newAlarms.some((n) => n.head === h));
    if (still.length) {
        parts.push(`still alarming for ${still.map((h) => NAMES[h]).join(", ")} risk`);
    }
    if (cleared.length) {
        parts.push(`alarm cleared for ${cleared.map((h) => NAMES[h]).join(", ")} risk`);
    }
    if (news2.start !== news2.end || newNews2) {
        parts.push(`NEWS2 ${news2.start} to ${news2.end}${newNews2 ? " (new NEWS2 alert)" : ""}`);
    }
    if (discharged) {
        parts.push(`discharged after hour ${last.hour}`);
    }

    return {
        bed: p.bed,
        patientId: p.patientId,
        hospital: p.hospital,
        status,
        alerting,
        newAlarms,
        cleared,
        news2,
        priority: { start: base.priority, end: last.priority },
        topRisk: last.topRisk,
        risks: Object.fromEntries(heads.map((h) => [h, { start: base.risks[h]!.risk, end: last.risks[h]!.risk }])),
        line: `Bed ${bedNo(p.bed)}: ${parts.length ? parts.join("; ") : "no change, no alarms"}.`,
    };
}

export function buildShift(patients: PatientResponse[], hour: number, hours: number): Summary {
    const fromHour = Math.max(0, hour - hours);
    const beds = patients
        .map((p) => bed(p, hour, fromHour))
        .filter((b): b is ShiftBed => b !== null)
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.priority.end - a.priority.end);
    const count = (s: ShiftBedStatus) => beds.filter((b) => b.status === s).length;
    const counts: Summary["counts"] = {
        beds: beds.length,
        alerting: beds.filter((b) => b.status !== "discharged" && b.alerting.length).length,
        newAlarms: beds.reduce((n, b) => n + b.newAlarms.length, 0),
        bedsWithNewAlarms: beds.filter((b) => b.newAlarms.length).length,
        worsening: count("worsening"),
        stable: count("stable"),
        improving: count("improving"),
        discharged: count("discharged"),
    };
    const overview =
        `Shift from hour ${fromHour} to hour ${hour} (${hour - fromHour} hours), ${counts.beds} beds. ` +
        `${counts.alerting} beds alarming now. ${counts.newAlarms} new risk alarms in ${counts.bedsWithNewAlarms} beds. ` +
        `${counts.worsening} worsening, ${counts.improving} improving, ${counts.stable} stable, ${counts.discharged} discharged.`;
    return { fromHour, hour, hours: hour - fromHour, overview, counts, beds };
}

// Stand-in for Granite: a short spoken-style ward handover that only reuses numbers present in the facts.
export function narrateShift(s: Summary): Omit<ShiftSummaryResponse, keyof Summary | "privacy" | "cached"> {
    const { counts } = s;
    const parts = [`Over the last ${s.hours} hours, ${counts.worsening} of ${counts.beds} beds got worse and ${counts.improving} improved.`];
    const worst = s.beds.filter((b) => b.status === "worsening").slice(0, 2);
    for (const b of worst) {
        const n = b.newAlarms[0];
        parts.push(
            n
                ? `Bed ${bedNo(b.bed)} has a new ${NAMES[n.head]} risk alarm from hour ${n.hour}; please review first.`
                : `Bed ${bedNo(b.bed)} is trending up; keep a close eye on it.`,
        );
    }
    if (!worst.length) {
        parts.push(counts.alerting ? `${counts.alerting} beds are still alarming, but none got worse.` : "No bed is above its alarm line.");
    }
    return { narrative: parts.join(" "), verified: true, unverifiedNumbers: [], statedAsDiagnosis: [], generationSeconds: 2.1, tokens: 64 };
}
