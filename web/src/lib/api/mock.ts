// Deterministic demo data with the exact response shapes of the LinuxONE API. Used when the data source is
// "mock" (no VM, no trained model). Twelve synthetic ICU stays, six of which develop sepsis, mirroring the
// API's demo ward (WARD_BEDS=12, half septic). Numbers on the insight pages echo the README results.

import { news2Components, news2Score } from "@/lib/news2";
import type {
    Bed,
    Driver,
    EvalReport,
    FatigueHead,
    FatiguePoint,
    FatigueResponse,
    HandoverResponse,
    Head,
    HeadReport,
    HealthResponse,
    MetricsResponse,
    PatientResponse,
    PredictRequest,
    PredictResponse,
    PrivacyResponse,
    Risks,
    TimelinePoint,
    VitalRow,
    Vitals,
    WardResponse,
    News2Response,
} from "./types";
import { HEADS, VITAL_KEYS } from "./types";
import { buildSbar, narrate } from "./sbar";

// ---------------------------------------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------------------------------------

function hash(s: string) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    }
    return h >>> 0;
}

function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Standard normal from a key, so the same patient-hour always gets the same noise.
function gauss(key: string) {
    const r = rng(hash(key));
    const u = Math.max(r(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const ramp = (t: number, at: number | null, width: number) => (at === null ? 0 : sigmoid((t - at) / width));
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------------------------------------
// The twelve demo stays. sepsis = hour the PhysioNet label starts (6 h before clinical onset).
// ---------------------------------------------------------------------------------------------------------

type Profile = {
    id: string;
    hospital: "A" | "B";
    age: number;
    gender: 0 | 1;
    los: number;
    sepsis: number | null;
    hypotension: number | null;
    aki: number | null;
    resp: number | null;
    frail: number; // baseline mortality tilt
    hr: number;
    sbp: number;
    temp: number;
    rr: number;
};

const PROFILES: Profile[] = [
    { id: "p004312", hospital: "A", age: 67, gender: 1, los: 66, sepsis: 34, hypotension: 40, aki: 48, resp: null, frail: 0.8, hr: 82, sbp: 128, temp: 36.9, rr: 16 },
    { id: "p011907", hospital: "B", age: 54, gender: 0, los: 52, sepsis: null, hypotension: null, aki: null, resp: null, frail: 0, hr: 74, sbp: 122, temp: 36.7, rr: 15 },
    { id: "p100238", hospital: "B", age: 78, gender: 1, los: 72, sepsis: 28, hypotension: null, aki: null, resp: 33, frail: 1.2, hr: 88, sbp: 136, temp: 37.0, rr: 18 },
    { id: "p007455", hospital: "A", age: 41, gender: 0, los: 44, sepsis: null, hypotension: 22, aki: null, resp: null, frail: -0.6, hr: 70, sbp: 112, temp: 36.6, rr: 14 },
    { id: "p009821", hospital: "A", age: 59, gender: 1, los: 60, sepsis: 42, hypotension: null, aki: 50, resp: null, frail: 0.2, hr: 79, sbp: 131, temp: 36.8, rr: 16 },
    { id: "p112604", hospital: "B", age: 83, gender: 0, los: 58, sepsis: null, hypotension: null, aki: 30, resp: null, frail: 1.4, hr: 76, sbp: 142, temp: 36.5, rr: 17 },
    { id: "p003377", hospital: "A", age: 72, gender: 0, los: 70, sepsis: 26, hypotension: 31, aki: null, resp: 36, frail: 1.0, hr: 85, sbp: 124, temp: 37.1, rr: 17 },
    { id: "p118930", hospital: "B", age: 36, gender: 1, los: 40, sepsis: null, hypotension: null, aki: null, resp: null, frail: -1, hr: 68, sbp: 126, temp: 36.6, rr: 13 },
    { id: "p105512", hospital: "B", age: 63, gender: 1, los: 64, sepsis: 46, hypotension: null, aki: null, resp: null, frail: 0.3, hr: 80, sbp: 133, temp: 36.9, rr: 16 },
    { id: "p006048", hospital: "A", age: 69, gender: 0, los: 48, sepsis: null, hypotension: null, aki: null, resp: 27, frail: 0.5, hr: 78, sbp: 129, temp: 36.8, rr: 19 },
    { id: "p010286", hospital: "A", age: 90, gender: 1, los: 56, sepsis: 30, hypotension: 36, aki: 38, resp: null, frail: 1.8, hr: 90, sbp: 118, temp: 37.2, rr: 18 },
    { id: "p114473", hospital: "B", age: 47, gender: 0, los: 38, sepsis: null, hypotension: null, aki: null, resp: null, frail: -0.4, hr: 72, sbp: 119, temp: 36.7, rr: 15 },
];

export const MOCK_THRESHOLDS: Record<Head, number> = {
    sepsis: 0.11,
    hypotension: 0.3,
    aki: 0.22,
    resp: 0.28,
    mortality: 0.2,
};

// Federated sepsis models: more noise per tree means a blurrier model.
const PRIVACY_NOISE: Record<string, number> = { none: 0, "10": 0.05, "3": 0.12, "1": 0.3, "0.3": 0.9 };

// ---------------------------------------------------------------------------------------------------------
// Physiology
// ---------------------------------------------------------------------------------------------------------

type Hour = { row: VitalRow; vitals: Vitals; risks: Required<Risks> };

function physiology(p: Profile, t: number) {
    const n = (k: string) => gauss(`${p.id}:${t}:${k}`);
    const sep = ramp(t, p.sepsis === null ? null : p.sepsis - 2, 3.5);
    const hypo = ramp(t, p.hypotension === null ? null : p.hypotension - 3, 2);
    const resp = ramp(t, p.resp === null ? null : p.resp - 3, 2.5);
    const aki = ramp(t, p.aki === null ? null : p.aki - 10, 6);

    const SBP = p.sbp - 28 * sep - 30 * hypo + n("sbp") * 6;
    const DBP = SBP * 0.55 + n("dbp") * 3;
    const FiO2 = 0.21 + 0.28 * resp + (sep > 0.6 ? 0.1 : 0);
    const row: VitalRow = {
        HR: p.hr + 34 * sep + 10 * hypo + 8 * resp + n("hr") * 4,
        O2Sat: Math.min(100, 97.6 - 2.5 * sep - 8 * resp + n("o2") * 0.8),
        Temp: p.temp + 1.7 * sep + n("temp") * 0.15,
        SBP,
        MAP: (SBP + 2 * DBP) / 3,
        DBP,
        Resp: p.rr + 8 * sep + 10 * resp + n("rr") * 1.5,
        EtCO2: null,
        FiO2: FiO2 > 0.22 ? FiO2 : null,
        Lactate: 1.1 + 2.6 * sep + n("lac") * 0.15,
        WBC: 8 + 9 * sep + n("wbc") * 0.6,
        Creatinine: 0.9 + 1.9 * aki + 0.5 * sep + n("cr") * 0.05,
        Age: p.age >= 90 ? 100 : p.age,
        Gender: p.gender,
        ICULOS: t + 1,
        SepsisLabel: p.sepsis !== null && t >= p.sepsis ? 1 : 0,
    };
    for (const k of Object.keys(row)) {
        const v = row[k];
        if (typeof v === "number") {
            row[k] = round(v, k === "Temp" || k === "Lactate" || k === "Creatinine" || k === "FiO2" ? 2 : 1);
        }
    }
    return { row, sep, hypo, resp, aki };
}

// How abnormal each driver variable is right now, 0 = normal.
function abnormality(row: VitalRow): Record<string, number> {
    const v = (k: string) => (row[k] ?? NaN) as number;
    const pos = (x: number) => (Number.isFinite(x) ? Math.max(0, x) : 0);
    return {
        HR: pos((v("HR") - 90) / 40),
        Temp: pos((v("Temp") - 37.5) / 1.5),
        Resp: pos((v("Resp") - 18) / 10),
        MAP: pos((75 - v("MAP")) / 20),
        SBP: pos((115 - v("SBP")) / 30),
        O2Sat: pos((96 - v("O2Sat")) / 6),
        FiO2: pos((v("FiO2") - 0.21) / 0.3),
        Lactate: pos((v("Lactate") - 1.5) / 3),
        WBC: pos((v("WBC") - 11) / 8),
        Creatinine: pos((v("Creatinine") - 1.1) / 1.5),
        Age: pos((v("Age") - 55) / 35),
        ShockIndex: pos((v("HR") / v("SBP") - 0.7) / 0.5),
        NEWS2: news2Score(row)[0] / 10,
    };
}

const DRIVER_POOL: Record<Head, string[]> = {
    sepsis: ["HR", "Temp", "Resp", "Lactate", "WBC", "MAP"],
    hypotension: ["MAP", "SBP", "ShockIndex", "HR"],
    aki: ["Creatinine", "MAP", "Age"],
    resp: ["O2Sat", "FiO2", "Resp"],
    mortality: ["Age", "NEWS2", "Lactate", "ShockIndex"],
};

function drivers(head: Head, risk: number, row: VitalRow): Driver[] {
    const abn = abnormality(row);
    const pool = DRIVER_POOL[head].map((f) => [f, abn[f] ?? 0] as const).filter(([, a]) => a > 0.02);
    const total = pool.reduce((s, [, a]) => s + a, 0);
    if (!total) {
        return [];
    }
    const lift = Math.max(0, risk - 0.02);
    return pool
        .map(([feature, a]) => ({ feature, contribution: round((lift * a) / total) }))
        .filter((d) => d.contribution > 0.0005)
        .sort((a, b) => b.contribution - a.contribution)
        .slice(0, 3);
}

function headRisk(head: Head, logit: number, row: VitalRow, withDrivers: boolean, threshold: number) {
    const risk = round(sigmoid(logit));
    const out = { risk, alert: risk >= threshold, threshold };
    return withDrivers ? { ...out, drivers: drivers(head, risk, row) } : out;
}

// Calibrated risk per head. The model sees a deterioration earlier than the vitals cross NEWS2 bands.
function scoreHour(p: Profile, t: number, privacy: string | null, withDrivers = true): Hour {
    const { row, sep, hypo, resp, aki } = physiology(p, t);
    const early = (at: number | null, w = 2.5) => ramp(t, at === null ? null : at - 6, w);
    const noise = (k: string, s = 0.22) => gauss(`${p.id}:${t}:risk:${k}`) * s;
    const [news2] = news2Score(row);
    const priv = PRIVACY_NOISE[privacy ?? "none"] ?? 0;
    const T = MOCK_THRESHOLDS;

    const logits: Record<Head, number> = {
        sepsis: -4.3 + 4.9 * early(p.sepsis, 3) + 0.18 * news2 + noise("sepsis") + gauss(`${p.id}:${t}:dp:${privacy}`) * priv * 2.2,
        hypotension: -3.4 + 4.4 * early(p.hypotension) + 1.3 * sep + noise("hypo"),
        aki: -3.3 + 3.8 * early(p.aki, 5) + 0.9 * sep + 0.6 * aki + noise("aki"),
        resp: -3.5 + 4.4 * early(p.resp) + 1.1 * sep + 0.5 * resp + noise("resp"),
        mortality: -2.9 + 0.035 * (p.age - 60) + 0.5 * p.frail + 1.6 * Math.max(sep, hypo, resp) + noise("mort", 0.12),
    };

    const risks = {} as Required<Risks>;
    for (const h of HEADS) {
        risks[h] = headRisk(h, logits[h], row, withDrivers, T[h]);
    }
    const vitals = Object.fromEntries(VITAL_KEYS.map((k) => [k, (row[k] as number | null) ?? null])) as Vitals;
    return { row, vitals, risks };
}

function priority(risks: Risks): [number, Head] {
    let best: [number, Head] = [-Infinity, "sepsis"];
    for (const [h, r] of Object.entries(risks) as [Head, { risk: number; threshold: number }][]) {
        const ratio = r.risk / Math.max(r.threshold, 1e-6);
        if (ratio > best[0]) {
            best = [round(ratio), h];
        }
    }
    return best;
}

const findProfile = (id: string) => PROFILES.findIndex((p) => p.id === id);

// ---------------------------------------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------------------------------------

export function ward(hour: number, privacy: string | null): WardResponse {
    const beds: Bed[] = PROFILES.map((p, i) => {
        const h = Math.min(hour, p.los - 1);
        const { row, vitals, risks } = scoreHour(p, h, privacy);
        const [score, alert] = news2Score(row);
        const [prio, top] = priority(risks);
        return {
            bed: i + 1,
            patientId: p.id,
            hospital: p.hospital,
            hour: h,
            lengthOfStay: p.los,
            discharged: hour >= p.los,
            vitals,
            label: Number(row.SepsisLabel ?? 0),
            news2: score,
            news2Alert: alert,
            risks,
            priority: prio,
            topRisk: top,
            risk: risks.sepsis.risk,
            alert: risks.sepsis.alert,
            drivers: risks.sepsis.drivers,
        };
    });
    return { hour, privacy, thresholds: MOCK_THRESHOLDS, beds };
}

export function patient(id: string, hour: number | null, privacy: string | null): PatientResponse {
    const i = findProfile(id);
    if (i < 0) {
        throw new Error("unknown patient");
    }
    const p = PROFILES[i];
    const end = hour === null ? p.los : Math.min(hour, p.los - 1) + 1;
    const timeline: TimelinePoint[] = [];
    let last: Hour | null = null;
    for (let t = 0; t < end; t++) {
        last = scoreHour(p, t, privacy);
        const [score, alert] = news2Score(last.row);
        const [prio, top] = priority(last.risks);
        timeline.push({
            hour: t,
            risks: Object.fromEntries(HEADS.map((h) => [h, { risk: last!.risks[h].risk, alert: last!.risks[h].alert }])),
            priority: prio,
            topRisk: top,
            news2: score,
            news2Alert: alert,
            vitals: last.vitals,
        });
    }
    const first = (flags: boolean[]) => {
        const at = flags.findIndex(Boolean);
        return at < 0 ? null : timeline[at].hour;
    };
    return {
        patientId: p.id,
        hospital: p.hospital,
        bed: i + 1,
        lengthOfStay: p.los,
        sepsisOnset: p.sepsis === null ? null : p.sepsis + 6,
        thresholds: MOCK_THRESHOLDS,
        firstAlert: Object.fromEntries(HEADS.map((h) => [h, first(timeline.map((x) => !!x.risks[h]?.alert))])),
        news2FirstAlert: first(timeline.map((x) => x.news2Alert)),
        timeline,
        drivers: Object.fromEntries(HEADS.map((h) => [h, last!.risks[h].drivers ?? []])),
    };
}

export function handover(id: string, hour: number | null, privacy: string | null): HandoverResponse {
    const p = patient(id, hour, privacy);
    const profile = PROFILES[findProfile(id)];
    const { row } = physiology(profile, p.timeline[p.timeline.length - 1].hour);
    const sbar = buildSbar(p, row);
    return { patientId: id, hour: p.timeline[p.timeline.length - 1].hour, sbar, ...narrate(sbar), cached: false };
}

export function predict(body: PredictRequest): PredictResponse {
    const histories = body.history ?? (body.rows ?? []).map((r) => [r]);
    const risks: Risks[] = histories.map((h) => {
        const row = h[h.length - 1] ?? {};
        const abn = abnormality(row);
        const age = Number(row.Age ?? 60);
        const logits: Record<Head, number> = {
            sepsis: -4.2 + 1.6 * abn.HR + 1.8 * abn.Temp + 1.2 * abn.Resp + 1.4 * abn.Lactate + 1.0 * abn.WBC + 1.0 * abn.MAP,
            hypotension: -3.4 + 3.2 * abn.MAP + 2 * abn.SBP + 1.5 * abn.ShockIndex,
            aki: -3.3 + 3 * abn.Creatinine + 1 * abn.MAP + 0.5 * abn.Age,
            resp: -3.5 + 3.4 * abn.O2Sat + 2 * abn.FiO2 + 1.4 * abn.Resp,
            mortality: -2.9 + 0.035 * (age - 60) + 2 * abn.NEWS2 + 0.8 * abn.Lactate,
        };
        return Object.fromEntries(
            HEADS.map((head) => [head, headRisk(head, logits[head], row, true, MOCK_THRESHOLDS[head])]),
        ) as Risks;
    });
    const prio = risks.map(priority);
    return {
        risks,
        thresholds: MOCK_THRESHOLDS,
        priority: prio.map(([p]) => p),
        topRisk: prio.map(([, h]) => h),
        probabilities: risks.map((r) => r.sepsis!.risk),
        alert: risks.map((r) => r.sepsis!.alert),
        drivers: risks.map((r) => r.sepsis!.drivers ?? []),
        threshold: MOCK_THRESHOLDS.sepsis,
        latency_ms: round(0.12 + Math.random() * 0.05, 3),
    };
}

export function news2(rows: VitalRow[]): News2Response {
    const results = rows.map(news2Score);
    return {
        scores: results.map(([s]) => s),
        alert: results.map(([, a]) => a),
        components: rows.map(news2Components),
    };
}

export function health(): HealthResponse {
    return {
        arch: "s390x",
        byteorder: "big",
        backend: "snapml",
        tree_format: "zdnn_tensors",
        n_features: 107,
        model_version: "demo",
        heads: [...HEADS],
        test_auroc: { sepsis: 0.842, hypotension: 0.871, aki: 0.823, resp: 0.812, mortality: 0.858 },
        ward_beds: PROFILES.length,
    };
}

// ---------------------------------------------------------------------------------------------------------
// Insights (metrics, fatigue, privacy, benchmark)
// ---------------------------------------------------------------------------------------------------------

function evalReport(auroc: number, news2: number, rows: number, events: number, warned: number, baseline: [string, number]): EvalReport {
    const scores = (a: number, w: number, f: number) => ({
        auroc: a,
        auprc: round(a * a * 0.21, 4),
        alert_rate: 0.083,
        event_patients: events,
        warned_before_event: w,
        no_event_with_alert: f,
    });
    return {
        rows,
        positive_rate: round(events / (rows / 38), 4),
        model: { ...scores(auroc, warned, 0.21), calibration_error_raw: 0.087, calibration_error: 0.006 },
        news2: scores(news2, round(warned - 0.11, 4), 0.27),
        [`baseline_${baseline[0]}`]: baseline[1],
    } as EvalReport;
}

function headReport(
    sites: string[],
    trees: number,
    auroc: Record<string, number>,
    news2: number,
    baseline: [string, number],
    top: string[],
): HeadReport {
    return {
        train_sites: sites,
        trees,
        threshold: MOCK_THRESHOLDS.sepsis,
        site_thresholds: { global: 0.11, A: 0.12, B: 0.1, M: 0.14 },
        test: Object.fromEntries(
            Object.entries(auroc).map(([site, a], i) => [
                site,
                evalReport(a, round(news2 - 0.01 * i, 4), 21_000 - i * 2400, 140 - i * 18, round(0.78 - i * 0.02, 4), baseline),
            ]),
        ),
        top_features: top,
    };
}

export function metrics(): MetricsResponse {
    const heads: Record<Head, HeadReport> = {
        sepsis: headReport(["A", "B"], 412, { all: 0.842, A: 0.829, B: 0.867, C_external: 0.781 }, 0.703, ["NEWS2", 0.703],
            ["ICULOS", "Temp_max6h", "HR_mean6h", "Resp_max6h", "WBC_hours_since", "HospAdmTime", "Temp", "NEWS2", "MAP_min6h", "Lactate"]),
        hypotension: headReport(["A", "B", "M"], 575, { all: 0.871, A: 0.866, B: 0.879, M: 0.858, C_external: 0.832 }, 0.701, ["MAP", 0.781],
            ["MAP_min6h", "MAP", "SBP_min6h", "MAP_delta6h", "ShockIndex", "DBP_min6h", "HR_max6h", "MAP_mean6h", "Age", "SBP"]),
        aki: headReport(["A", "B", "M"], 388, { all: 0.823, A: 0.818, B: 0.829, M: 0.812, C_external: 0.796 }, 0.611, ["Creatinine", 0.744],
            ["Creatinine", "BUN", "Creatinine_hours_since", "BUN_Creatinine", "Age", "Potassium", "MAP_min6h", "HCO3", "Urine", "Hgb"]),
        resp: headReport(["A", "B", "C (50%)"], 296, { all: 0.812, A: 0.806, B: 0.821, C_external: 0.81 }, 0.722, ["O2Sat", 0.701],
            ["O2Sat_min6h", "FiO2", "Resp_max6h", "O2Sat", "FiO2_hours_since", "SaO2", "PaCO2", "Resp", "HR_mean6h", "pH"]),
        mortality: headReport(["M"], 104, { all: 0.858, M: 0.858, C_external: 0.801 }, 0.693, ["NEWS2", 0.693],
            ["Age", "GCS", "BUN", "Lactate", "NEWS2", "Urine", "HCO3", "Platelets", "Bilirubin_total", "Creatinine"]),
    };
    heads.hypotension.threshold = MOCK_THRESHOLDS.hypotension;
    heads.aki.threshold = MOCK_THRESHOLDS.aki;
    heads.resp.threshold = MOCK_THRESHOLDS.resp;
    heads.mortality.threshold = MOCK_THRESHOLDS.mortality;

    const headline = Object.fromEntries(
        HEADS.map((h, i) => {
            const k = 1 - i * 0.04;
            return [
                h,
                {
                    sameAlarmHours: { alarmHours: 0.093, modelCaught: round(0.74 * k, 4), news2Caught: 0.58 },
                    sameCatchHours: { caught: 0.58, modelAlarmHours: round(0.041 / k, 4), news2AlarmHours: 0.093, fewerAlarmHours: round(1 - 0.041 / k / 0.093, 4) },
                    news2Burden: { alertsPerBedDay: 0.41, modelCaught: round(0.71 * k, 4), news2Caught: 0.58 },
                    news2Recall: { caught: 0.58, modelAlertsPerBedDay: round(0.19 / k, 4), news2AlertsPerBedDay: 0.41, fewerAlarms: round(1 - 0.19 / k / 0.41, 4) },
                },
            ];
        }),
    );
    return {
        heads,
        headline: {
            ...headline,
            sepsisUtility: {
                model: 0.392,
                news2: 0.171,
                note: "PhysioNet/CinC 2019 normalised utility on held-out A/B patients (threshold tuned on validation). NEWS2 gets its best cut-off on test. The challenge winner scored 0.360 on the hidden test set (not directly comparable).",
            },
        },
    };
}

function curve(k: number, key: "threshold" | "cutoff", xs: number[]): FatiguePoint[] {
    return xs.map((x, i) => ({
        [key]: key === "cutoff" ? 10 - i : round(0.6 * Math.exp(-x * 1.4), 4),
        alertsPerBedDay: round(x, 4),
        alarmHours: round(Math.min(1, x * 0.22), 4),
        caught: round(1 - Math.exp(-k * x), 4),
    })).sort((a, b) => a.alertsPerBedDay - b.alertsPerBedDay);
}

export function fatigue(): FatigueResponse {
    const modelXs = Array.from({ length: 40 }, (_, i) => 0.01 * Math.pow(400, i / 39));
    const news2Xs = [0.012, 0.03, 0.06, 0.11, 0.2, 0.41, 0.72, 1.3, 2.2, 3.4];
    const groups = ["age 0-49", "age 50-64", "age 65-79", "age 80+", "female", "male"];
    const heads = Object.fromEntries(
        HEADS.map((h, i) => {
            const km = 3.1 - i * 0.18;
            const kn = 2.1 - i * 0.05;
            const head: FatigueHead = {
                model: curve(km, "threshold", modelXs),
                news2: curve(kn, "cutoff", news2Xs),
                operating: { threshold: MOCK_THRESHOLDS[h], alertsPerBedDay: 0.41, alarmHours: 0.09, caught: round(1 - Math.exp(-km * 0.41), 4) },
                patients: 2140 - i * 120,
                eventPatients: 168 - i * 14,
                fairness: Object.fromEntries(
                    groups.map((g, j) => [
                        g,
                        {
                            patients: 300 + j * 45,
                            eventPatients: 24 + j * 3,
                            modelCaught: round(0.68 + ((j * 7) % 5) * 0.02 - i * 0.01, 4),
                            news2Caught: round(0.55 + ((j * 3) % 4) * 0.02, 4),
                            modelAlarmHours: round(0.085 + j * 0.003, 4),
                            news2AlarmHours: round(0.09 + ((j * 5) % 3) * 0.006, 4),
                            auroc: round(0.82 + ((j * 11) % 6) * 0.008 - i * 0.004, 4),
                        },
                    ]),
                ),
            };
            return [h, head];
        }),
    );
    return { heads };
}

export function privacy(): PrivacyResponse {
    const run = (a: number, b: number, eps?: number): PrivacyResponse["federated"][string] => ({
        per_hospital: {
            A: { rows: 61_200, auroc: a, auprc: round(a * 0.14, 4), news2_auroc: 0.701 },
            B: { rows: 59_400, auroc: b, auprc: round(b * 0.15, 4), news2_auroc: 0.712 },
        },
        mean_auroc: round((a + b) / 2, 4),
        trees: 150,
        rounds: 25,
        ...(eps ? { epsilon_per_tree: eps, epsilon_total_per_site: eps * 75 } : {}),
    });
    const none = run(0.817, 0.867);
    none.mean_auroc_by_round = Array.from({ length: 25 }, (_, i) => round(0.842 - 0.12 * Math.exp(-i / 4), 4));
    return {
        options: ["none", "10", "3", "1", "0.3"],
        federated: { none, "10": run(0.819, 0.868, 10), "3": run(0.816, 0.87, 3), "1": run(0.808, 0.867, 1), "0.3": run(0.775, 0.796, 0.3) },
        local_only: { A: run(0.829, 0.76), B: run(0.785, 0.876) },
        hospitals: {
            A: { rows: 790_215, events: { sepsis: 1790, hypotension: 3120, aki: 1904 } },
            B: { rows: 761_995, events: { sepsis: 1142, hypotension: 2875, aki: 1688 } },
            M: { rows: 191_802, events: { sepsis: 0, hypotension: 1210, aki: 902 } },
        },
    };
}

export function benchmark() {
    // Sepsis head from api/README.md; other heads scale with their tree count. Same shape as model/benchmark.json.
    const base: Record<string, [string, number[]]> = {
        "snapml-nnpa": ["zdnn_tensors", [0.089, 0.143, 0.61, 3.4, 30.7, 301]],
        "snapml-cpu": ["compress_trees", [0.013, 0.043, 0.11, 0.62, 5.8, 57.4]],
        "xgboost-cpu": ["xgboost 2.0.3", [0.212, 0.208, 0.33, 1.4, 12.1, 118]],
    };
    const trees: Record<Head, number> = { sepsis: 412, hypotension: 575, aki: 388, resp: 296, mortality: 104 };
    const batches = [1, 12, 100, 1000, 10000, 100000];
    const backends = Object.fromEntries(
        Object.entries(base).map(([backend, [fmt, lat]]) => [
            backend,
            Object.fromEntries(
                HEADS.map((h) => {
                    const scale = trees[h] / trees.sepsis;
                    return [
                        h,
                        {
                            tree_format: fmt,
                            max_abs_diff_vs_xgboost_export: backend === "xgboost-cpu" ? 0 : 4.8e-7,
                            batches: Object.fromEntries(
                                batches.map((n, i) => {
                                    const ms = lat[i] * (0.4 + 0.6 * scale);
                                    return [String(n), { latency_ms: round(ms, 4), rows_per_s: Math.round(n / (ms / 1000)) }];
                                }),
                            ),
                        },
                    ];
                }),
            ),
        ]),
    );
    return {
        machine: "LinuxONE VM, 3 cores, NNPA (IBM Integrated Accelerator for AI)",
        cpus: 3,
        note: "Demo data. Snap ML on CPU (compress_trees) is ~5x faster than on NNPA (zdnn_tensors) for these trees.",
        cpuTimePer10kRows_ms: { "snapml-nnpa": 84.8, "snapml-cpu": 18.9 },
        backends,
    };
}
