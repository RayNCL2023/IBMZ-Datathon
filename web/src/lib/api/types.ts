// Response shapes of the LinuxONE API (api/app/main.py). Keep in sync with the FastAPI service.

export const HEADS = ["sepsis", "hypotension", "aki", "resp", "mortality"] as const;
export type Head = (typeof HEADS)[number];

export const VITAL_KEYS = ["HR", "O2Sat", "Temp", "SBP", "MAP", "DBP", "Resp", "EtCO2"] as const;
export type VitalKey = (typeof VITAL_KEYS)[number];
export type Vitals = Record<VitalKey, number | null>;

export type Hospital = "A" | "B" | "M" | "C" | (string & {});
export type PrivacyKey = string; // "none" | epsilon, e.g. "10", "3", "1", "0.3"

export type Driver = { feature: string; contribution: number };

export type HeadRisk = {
    risk: number;
    alert: boolean;
    threshold: number;
    drivers?: Driver[];
};

export type Risks = Partial<Record<Head, HeadRisk>>;

// ---------- /ward ----------
export type Bed = {
    bed: number;
    patientId: string;
    hospital: Hospital;
    hour: number;
    lengthOfStay: number;
    discharged: boolean;
    vitals: Vitals;
    label: number;
    news2: number;
    news2Alert: boolean;
    risks: Risks;
    priority: number;
    topRisk: Head;
    risk?: number;
    alert?: boolean;
    drivers?: Driver[];
};

export type WardResponse = {
    hour: number;
    privacy: PrivacyKey | null;
    thresholds: Partial<Record<Head, number>>;
    beds: Bed[];
};

// ---------- /patient/{id} ----------
export type TimelinePoint = {
    hour: number;
    risks: Partial<Record<Head, { risk: number; alert: boolean }>>;
    priority: number;
    topRisk: Head;
    news2: number;
    news2Alert: boolean;
    vitals: Vitals;
};

export type PatientResponse = {
    patientId: string;
    hospital: Hospital;
    bed: number;
    lengthOfStay: number;
    sepsisOnset: number | null;
    thresholds: Partial<Record<Head, number>>;
    firstAlert: Partial<Record<Head, number | null>>;
    news2FirstAlert: number | null;
    timeline: TimelinePoint[];
    drivers: Partial<Record<Head, Driver[]>>;
};

// ---------- /handover/{id} ----------
export type Sbar = {
    situation: string;
    background: string;
    assessment: string;
    recommendation: string;
};

export type HandoverResponse = {
    patientId: string;
    hour: number;
    sbar: Sbar;
    narrative: string | null;
    verified?: boolean;
    unverifiedNumbers?: string[];
    statedAsDiagnosis?: string[];
    generationSeconds?: number;
    tokens?: number;
    error?: string;
    cached: boolean;
};

// ---------- /shift-summary ----------
export type ShiftBedStatus = "worsening" | "stable" | "improving" | "discharged";

export type ShiftBed = {
    bed: number;
    patientId: string;
    hospital: Hospital;
    status: ShiftBedStatus;
    alerting: Head[];
    newAlarms: { head: Head; hour: number }[];
    cleared: Head[];
    news2: { start: number; end: number; max: number; alert: boolean; newAlert: boolean };
    priority: { start: number; end: number };
    topRisk: Head;
    risks: Partial<Record<Head, { start: number; end: number }>>;
    line: string;
};

export type ShiftSummaryResponse = {
    privacy: PrivacyKey | null;
    fromHour: number;
    hour: number;
    hours: number;
    overview: string;
    counts: Record<"beds" | "alerting" | "newAlarms" | "bedsWithNewAlarms" | ShiftBedStatus, number>;
    beds: ShiftBed[];
    narrative: string | null;
    verified?: boolean;
    unverifiedNumbers?: string[];
    statedAsDiagnosis?: string[];
    generationSeconds?: number;
    tokens?: number;
    error?: string;
    cached: boolean;
};

// ---------- /predict, /news2 ----------
export type VitalRow = Partial<Record<string, number | null>>;

export type PredictRequest = {
    rows?: VitalRow[];
    history?: VitalRow[][];
    site?: string | null;
    privacy?: PrivacyKey | null;
};

export type PredictResponse = {
    risks: Risks[];
    thresholds: Partial<Record<Head, number>>;
    priority: number[];
    topRisk: Head[];
    probabilities?: number[];
    alert?: boolean[];
    drivers?: Driver[][];
    threshold?: number;
    latency_ms: number;
};

export type News2Components = Record<"Resp" | "O2Sat" | "SBP" | "HR" | "Temp" | "Oxygen", number>;

export type News2Response = {
    scores: number[];
    alert: boolean[];
    components: News2Components[];
};

// ---------- /health ----------
export type HealthResponse = {
    arch: string;
    byteorder: string;
    backend: "snapml" | "stub-news2" | (string & {});
    tree_format: string | null;
    n_features: number;
    model_version: string;
    heads: Head[];
    test_auroc: Partial<Record<Head, number | null>>;
    ward_beds: number;
};

// ---------- /metrics ----------
export type Scores = {
    auroc: number;
    auprc: number;
    alert_rate: number;
    event_patients: number;
    warned_before_event: number;
    no_event_with_alert: number;
};

export type EvalReport = {
    rows: number;
    positive_rate: number;
    model: Scores & { calibration_error_raw: number; calibration_error: number };
    news2: Scores;
    [baseline: `baseline_${string}`]: number;
};

export type HeadReport = {
    train_sites: string[];
    trees: number;
    threshold: number;
    site_thresholds: Record<string, number>;
    test: Record<string, EvalReport>; // A, B, M, all, C_external
    top_features: string[];
};

export type Headline = {
    sameAlarmHours: { alarmHours: number; modelCaught: number; news2Caught: number };
    sameCatchHours: { caught: number; modelAlarmHours: number; news2AlarmHours: number; fewerAlarmHours: number };
    news2Burden: { alertsPerBedDay: number; modelCaught: number; news2Caught: number };
    news2Recall: { caught: number; modelAlertsPerBedDay: number; news2AlertsPerBedDay: number; fewerAlarms: number };
};

export type MetricsResponse = {
    heads?: Partial<Record<Head, HeadReport>>;
    headline?: Partial<Record<Head, Headline>> & {
        sepsisUtility?: { model: number; news2: number; note: string };
    };
};

// ---------- /fatigue ----------
export type FatiguePoint = {
    threshold?: number;
    cutoff?: number;
    alertsPerBedDay: number;
    alarmHours: number;
    caught: number;
};

export type FairnessRow = {
    patients: number;
    eventPatients: number;
    modelCaught: number;
    news2Caught: number;
    modelAlarmHours: number;
    news2AlarmHours: number;
    auroc: number | null;
};

export type FatigueHead = {
    model: FatiguePoint[];
    news2: FatiguePoint[];
    operating: { threshold: number; alertsPerBedDay: number; alarmHours: number; caught: number };
    patients: number;
    eventPatients: number;
    fairness: Record<string, FairnessRow>;
};

export type FatigueResponse = { heads: Partial<Record<Head, FatigueHead>> };

// ---------- /privacy ----------
export type SiteEval = { rows: number; auroc?: number; auprc?: number; news2_auroc?: number };

export type FedRun = {
    per_hospital: Record<string, SiteEval>;
    mean_auroc: number | null;
    trees?: number;
    rounds?: number;
    epsilon_per_tree?: number;
    epsilon_total_per_site?: number;
    mean_auroc_by_round?: number[];
};

export type PrivacyResponse = {
    options: PrivacyKey[];
    federated: Record<PrivacyKey, FedRun>;
    local_only: Record<string, FedRun>;
    hospitals: Record<string, { rows: number; events: Partial<Record<Head, number>> }>;
};

// ---------- /benchmark ----------
export type BenchBatch = { latency_ms: number; rows_per_s: number };

export type BenchHead = {
    tree_format: string;
    max_abs_diff_vs_xgboost_export: number | null;
    batches: Record<string, BenchBatch>;
};

export type BenchBackend = {
    backend: string;
    heads: Partial<Record<Head, BenchHead>>;
};

// GET /benchmark (model/benchmark.json, merged from api/bench.py runs).
export type BenchmarkResponse = {
    machine?: string;
    cpus?: number;
    note?: string;
    cpuTimePer10kRows_ms?: Record<string, number>;
    backends: BenchBackend[];
};
