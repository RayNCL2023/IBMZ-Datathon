// SBAR for the mock data source: a port of api/app/handover.py facts(), plus a templated stand-in for Granite.
import { HEAD_META, readable } from "@/var/clinical";
import type { HandoverResponse, Head, PatientResponse, Sbar, VitalRow, Vitals } from "./types";
import { bedNo } from "@/lib/format";

export const NAMES: Record<Head, string> = {
    sepsis: "sepsis",
    hypotension: "hypotension (low blood pressure)",
    aki: "acute kidney injury",
    resp: "respiratory failure",
    mortality: "in-hospital mortality",
};

const p0 = (v: number) => `${Math.round(v * 100)}%`;

function abnormal(v: Vitals): string[] {
    const checks: [keyof Vitals, string, (x: number) => string | null, (x: number) => string][] = [
        ["HR", "heart rate", (x) => (x > 100 ? "fast" : x < 50 ? "slow" : null), (x) => x.toFixed(0)],
        ["MAP", "mean arterial pressure", (x) => (x < 65 ? "low" : null), (x) => x.toFixed(0)],
        ["SBP", "systolic blood pressure", (x) => (x <= 100 ? "low" : x >= 220 ? "high" : null), (x) => x.toFixed(0)],
        ["Resp", "breathing rate", (x) => (x >= 21 ? "fast" : x <= 8 ? "slow" : null), (x) => x.toFixed(0)],
        ["O2Sat", "oxygen saturation", (x) => (x < 94 ? "low" : null), (x) => `${x.toFixed(0)}%`],
        ["Temp", "temperature", (x) => (x >= 38.1 ? "high" : x <= 36 ? "low" : null), (x) => `${x.toFixed(1)} C`],
    ];
    const out: string[] = [];
    for (const [key, name, rule, fmt] of checks) {
        const x = v[key];
        if (x === null || !rule(x)) {
            continue;
        }
        out.push(`${name} ${fmt(x)} (${rule(x)})`);
    }
    return out;
}

export function buildSbar(p: PatientResponse, row: VitalRow): Sbar {
    const now = p.timeline[p.timeline.length - 1];
    const before = p.timeline[Math.max(0, p.timeline.length - 7)];
    const age = row.Age as number | undefined;
    const sex = row.Gender === 0 ? "woman" : row.Gender === 1 ? "man" : null;
    const who = age ? (age >= 90 ? `${sex ?? "patient"} aged 90 or over` : `${age.toFixed(0)}-year-old ${sex ?? "patient"}`) : (sex ?? "patient");
    const ratio = (h: Head) => (now.risks[h]?.risk ?? 0) / Math.max(p.thresholds[h] ?? 1, 1e-6);
    const alerting = (Object.keys(now.risks) as Head[]).filter((h) => now.risks[h]?.alert).sort((a, b) => ratio(b) - ratio(a));

    const riskLines = alerting.map((h) => {
        const r = now.risks[h]!.risk;
        const t = p.thresholds[h] ?? 0;
        const was = before.risks[h]?.risk ?? r;
        let line = `${NAMES[h]} risk ${p0(r)} (above its alarm line of ${p0(t)})`;
        if (before.hour < now.hour && Math.round(r * 100) > Math.round(was * 100)) {
            line += `, up from ${p0(was)} ${now.hour - before.hour} hours ago`;
        }
        const drivers = (p.drivers[h] ?? []).map((d) => readable(d.feature).toLowerCase());
        if (drivers.length) {
            line += `; main contributors: ${drivers.join(", ")}`;
        }
        return line;
    });

    let situation = `Bed ${bedNo(p.bed)}, ${who}, ${now.hour + 1} hours in ICU. NEWS2 ${now.news2}${now.news2Alert ? " (alert)." : "."}`;
    situation += alerting.length ? ` Raised risk (not a diagnosis) of: ${alerting.map((h) => NAMES[h]).join("; ")}.` : " No model alerts.";

    let background = `Hospital ${p.hospital}.`;
    const firstHead = alerting[0];
    if (firstHead && p.firstAlert[firstHead] !== null && p.firstAlert[firstHead] !== undefined) {
        background += ` First ${NAMES[firstHead]} alarm at hour ${p.firstAlert[firstHead]}`;
        background += p.news2FirstAlert !== null ? `; first NEWS2 alarm at hour ${p.news2FirstAlert}.` : "; NEWS2 has not alarmed.";
    }

    const ab = abnormal(now.vitals);
    let assessment = ab.length ? `Abnormal now: ${ab.join(", ")}. ` : "Observations within normal bands. ";
    assessment += riskLines.map((l) => `${l[0].toUpperCase()}${l.slice(1)}.`).join(" ");

    const actions = alerting.length ? alerting.map((h) => HEAD_META[h].action) : ["Continue routine observations."];
    return {
        situation,
        background,
        assessment: assessment.trim(),
        recommendation: `${actions.join(" ")} Decision support only: confirm clinically.`,
    };
}

// Stand-in for Granite: a short spoken-style summary that only reuses numbers present in the facts.
export function narrate(sbar: Sbar): Omit<HandoverResponse, "patientId" | "hour" | "sbar" | "cached"> {
    const who = sbar.situation.split(",").slice(0, 2).join(",");
    const risks = sbar.situation.match(/Raised risk \(not a diagnosis\) of: ([^.]+)\./)?.[1];
    const abnormalNow = sbar.assessment.match(/Abnormal now: ([^.]+)\./)?.[1];
    const parts = [`${who}.`];
    parts.push(abnormalNow ? `Currently ${abnormalNow}.` : "Observations are within normal bands.");
    parts.push(risks ? `The model flags a rising risk of ${risks.split(";")[0].trim()}; please review.` : "No risk is above its alarm line.");
    return {
        narrative: parts.join(" "),
        verified: true,
        unverifiedNumbers: [],
        statedAsDiagnosis: [],
        generationSeconds: 1.6,
        tokens: 58,
    };
}
