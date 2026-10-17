// NEWS2 (RCP 2017), a port of api/app/news2.py. Used by the mock data source; live mode asks POST /news2.
import type { News2Components, VitalRow } from "@/lib/api/types";

export const NEWS2_URGENT = 5;
export const NEWS2_EMERGENCY = 7;

type Band = [edge: number, points: number][];

function band(v: number, bands: Band, above: number) {
    for (const [edge, points] of bands) {
        if (v <= edge) {
            return points;
        }
    }
    return above;
}

const PARAMS: Record<Exclude<keyof News2Components, "Oxygen">, (v: number) => number> = {
    Resp: (v) => band(v, [[8, 3], [11, 1], [20, 0], [24, 2]], 3),
    O2Sat: (v) => band(v, [[91, 3], [93, 2], [95, 1]], 0),
    SBP: (v) => band(v, [[90, 3], [100, 2], [110, 1], [219, 0]], 3),
    HR: (v) => band(v, [[40, 3], [50, 1], [90, 0], [110, 1], [130, 2]], 3),
    Temp: (v) => band(v, [[35, 3], [36, 1], [38, 0], [39, 1]], 2),
};

const present = (v: number | null | undefined): v is number => v !== null && v !== undefined && !Number.isNaN(v);

export function news2Components(row: VitalRow): News2Components {
    const out = {} as News2Components;
    for (const [name, fn] of Object.entries(PARAMS)) {
        const v = row[name];
        out[name as keyof News2Components] = present(v) ? fn(v) : 0;
    }
    const fio2 = row.FiO2;
    out.Oxygen = present(fio2) && fio2 > 0.21 ? 2 : 0;
    return out;
}

export function news2Score(row: VitalRow): [score: number, alert: boolean] {
    const parts = Object.values(news2Components(row));
    const total = parts.reduce((a, b) => a + b, 0);
    return [total, total >= NEWS2_URGENT || Math.max(...parts) === 3];
}

export function news2Band(score: number): "low" | "medium" | "high" {
    if (score >= NEWS2_EMERGENCY) {
        return "high";
    }
    if (score >= NEWS2_URGENT) {
        return "medium";
    }
    return "low";
}
