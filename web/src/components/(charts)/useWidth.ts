"use client";

import { useEffect, useRef, useState } from "react";

// Measures a container so charts draw in real pixels (crisp 1px lines and readable text at any width).
export function useWidth<T extends HTMLElement>(fallback = 600) {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(fallback);

    useEffect(() => {
        if (!ref.current) {
            return;
        }
        const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, Math.floor(entry.contentRect.width))));
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, []);

    return [ref, width] as const;
}

// Round-number ticks between lo and hi.
export function ticks(lo: number, hi: number, count = 4) {
    if (hi <= lo) {
        return [lo];
    }
    const raw = (hi - lo) / count;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
        out.push(Number(v.toFixed(10)));
    }
    return out;
}
