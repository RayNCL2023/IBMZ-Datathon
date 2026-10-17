// One client, two sources. "live" goes through the Next route /api/lx (which adds the API key server-side),
// "mock" answers in the browser with the same shapes after a small, realistic delay.
import type { DataSource } from "@/var/flags";
import * as mock from "./mock";
import type {
    BenchBackend,
    BenchmarkResponse,
    FatigueResponse,
    HandoverResponse,
    HealthResponse,
    MetricsResponse,
    News2Response,
    PatientResponse,
    PredictRequest,
    PredictResponse,
    PrivacyResponse,
    ShiftSummaryResponse,
    VitalRow,
    WardResponse,
} from "./types";

export class ApiError extends Error {
    constructor(
        message: string,
        public status: number,
    ) {
        super(message);
    }
}

const PROXY = "/api/lx";

function query(params: Record<string, string | number | null | undefined>) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined || v === "") {
            continue;
        }
        q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `?${s}` : "";
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${PROXY}${path}`, {
        ...init,
        headers: { "content-type": "application/json", ...init?.headers },
    });
    if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: unknown };
        throw new ApiError(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`, res.status);
    }
    return res.json();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fake<T>(fn: () => T, ms = 180): Promise<T> {
    await wait(ms + Math.random() * ms * 0.5);
    try {
        return fn();
    } catch (e) {
        throw new ApiError((e as Error).message, 404);
    }
}

// /benchmark serves model/benchmark.json: {machine, cpus, note, cpuTimePer10kRows_ms, backends: {name: {head: …}}}.
// Older per-backend files from api/bench.py wrap heads in {backend, heads}; accept both.
export function normalizeBenchmark(raw: unknown): BenchmarkResponse {
    const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const backends = (obj.backends ?? {}) as Record<string, Record<string, unknown>>;
    return {
        machine: obj.machine as string | undefined,
        cpus: obj.cpus as number | undefined,
        note: obj.note as string | undefined,
        cpuTimePer10kRows_ms: obj.cpuTimePer10kRows_ms as Record<string, number> | undefined,
        backends: Object.entries(backends).map(([backend, v]) => ({
            backend,
            heads: ("heads" in v ? v.heads : v) as BenchBackend["heads"],
        })),
    };
}

export type Api = ReturnType<typeof createApi>;

export function createApi(source: DataSource) {
    const live = source === "live";
    return {
        source,
        health: () => (live ? call<HealthResponse>("/health") : fake(mock.health, 120)),
        ward: (hour: number, privacy: string | null) =>
            live ? call<WardResponse>(`/ward${query({ hour, privacy })}`) : fake(() => mock.ward(hour, privacy), 140),
        patient: (id: string, hour: number | null, privacy: string | null) =>
            live
                ? call<PatientResponse>(`/patient/${encodeURIComponent(id)}${query({ hour, privacy })}`)
                : fake(() => mock.patient(id, hour, privacy), 220),
        handover: (id: string, hour: number | null, privacy: string | null) =>
            live
                ? call<HandoverResponse>(`/handover/${encodeURIComponent(id)}${query({ hour, privacy })}`, { method: "POST" })
                : fake(() => mock.handover(id, hour, privacy), 1600),
        shiftSummary: (hours: number, hour: number, privacy: string | null) =>
            live
                ? call<ShiftSummaryResponse>(`/shift-summary${query({ hours, hour, privacy })}`, { method: "POST" })
                : fake(() => mock.shiftSummary(hours, hour, privacy), 1800),
        predict: (body: PredictRequest) =>
            live ? call<PredictResponse>("/predict", { method: "POST", body: JSON.stringify(body) }) : fake(() => mock.predict(body)),
        news2: (rows: VitalRow[]) =>
            live ? call<News2Response>("/news2", { method: "POST", body: JSON.stringify({ rows }) }) : fake(() => mock.news2(rows), 80),
        metrics: () => (live ? call<MetricsResponse>("/metrics") : fake(mock.metrics)),
        fatigue: () => (live ? call<FatigueResponse>("/fatigue") : fake(mock.fatigue)),
        privacy: () => (live ? call<PrivacyResponse>("/privacy") : fake(mock.privacy)),
        benchmark: async () => normalizeBenchmark(live ? await call<unknown>("/benchmark") : await fake(mock.benchmark)),
    };
}
