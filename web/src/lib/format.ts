export const pct = (v: number | null | undefined, digits = 0) =>
    v === null || v === undefined || Number.isNaN(v) ? "–" : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined, digits = 0) =>
    v === null || v === undefined || Number.isNaN(v) ? "–" : v.toFixed(digits);

export const auc = (v: number | null | undefined) => num(v, 3);

export const ratio = (v: number) => `${v.toFixed(2)}×`;

export function hours(h: number | null | undefined) {
    if (h === null || h === undefined) {
        return "–";
    }
    return h === 1 ? "1 hour" : `${h} hours`;
}

export function ms(v: number) {
    if (v < 1) {
        return `${(v * 1000).toFixed(0)} µs`;
    }
    return `${v.toFixed(v < 10 ? 2 : 1)} ms`;
}

export function compact(v: number) {
    return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
