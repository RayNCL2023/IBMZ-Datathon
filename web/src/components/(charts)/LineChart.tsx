"use client";

import { useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ticks, useWidth } from "./useWidth";
import s from "./LineChart.module.scss";

export type Point = { x: number; y: number | null };

export type Series = {
    id: string;
    label: string;
    color: string;
    points: Point[];
    dashed?: boolean;
    // Step lines suit integer scores (NEWS2); risks are smooth.
    step?: boolean;
};

// zone: shade the area above the line (the alarm zone).
export type RefLine = { y: number; label: string; zone?: boolean };
export type Marker = { x: number; label: string; tone?: "accent" | "danger" | "muted" };
export type Dot = { x: number; y: number; label: string; color: string };

const PAD = { top: 14, right: 16, bottom: 28, left: 44 };

// Pill labels are measured roughly (no DOM measuring) so they can be laid out before paint.
const labelWidth = (text: string) => text.length * 6.4 + 14;
const ROW = 20;

// Assigns each marker label a row so labels that would overlap stack instead of colliding.
function layoutMarkers(markers: Marker[], sx: (x: number) => number, right: number) {
    const rowsEnd: number[] = [];
    return [...markers]
        .sort((a, b) => a.x - b.x)
        .map((m) => {
            const w = labelWidth(m.label);
            const x = sx(m.x);
            const flip = x + 4 + w > right;
            const start = flip ? x - 4 - w : x + 4;
            let row = rowsEnd.findIndex((end) => end + 6 < start);
            if (row < 0) {
                row = rowsEnd.length;
                rowsEnd.push(0);
            }
            rowsEnd[row] = start + w;
            return { m, x, start, w, row };
        });
}

function path(points: Point[], sx: (x: number) => number, sy: (y: number) => number, step?: boolean) {
    let d = "";
    let pen = false;
    for (const p of points) {
        if (p.y === null || !Number.isFinite(p.y)) {
            pen = false;
            continue;
        }
        const x = sx(p.x);
        const y = sy(p.y);
        if (!pen) {
            d += `M${x},${y}`;
        } else {
            d += step ? `H${x}V${y}` : `L${x},${y}`;
        }
        pen = true;
    }
    return d;
}

// Single-axis line chart with a crosshair tooltip, reference lines (alarm thresholds), vertical markers
// (events, current hour), keyboard stepping and a legend that toggles series. One y-scale only, always.
export default function ({
    series,
    height = 240,
    xDomain,
    yDomain,
    xFormat = (x) => String(x),
    yFormat = (y) => String(y),
    xLabel,
    refLines = [],
    markers = [],
    dots = [],
    ariaLabel,
    legend = true,
    className,
}: {
    series: Series[];
    height?: number;
    xDomain?: [number, number];
    yDomain?: [number, number];
    xFormat?: (x: number) => string;
    yFormat?: (y: number) => string;
    xLabel?: string;
    refLines?: RefLine[];
    markers?: Marker[];
    dots?: Dot[];
    ariaLabel: string;
    legend?: boolean;
    className?: string;
}) {
    const [ref, width] = useWidth<HTMLDivElement>();
    const [hidden, setHidden] = useState<Set<string>>(new Set());
    const [hoverX, setHoverX] = useState<number | null>(null);

    const visible = series.filter((sr) => !hidden.has(sr.id));
    const xs = useMemo(() => [...new Set(series.flatMap((sr) => sr.points.map((p) => p.x)))].sort((a, b) => a - b), [series]);

    const [x0, x1] = xDomain ?? [xs[0] ?? 0, xs[xs.length - 1] ?? 1];
    const yValues = visible.flatMap((sr) => sr.points.map((p) => p.y).filter((y): y is number => y !== null));
    const [y0, y1] = yDomain ?? [Math.min(0, ...yValues, ...refLines.map((r) => r.y)), Math.max(1e-9, ...yValues, ...refLines.map((r) => r.y)) * 1.08];

    const innerW = width - PAD.left - PAD.right;
    const innerH = height - PAD.top - PAD.bottom;
    const sx = (x: number) => PAD.left + ((x - x0) / Math.max(x1 - x0, 1e-9)) * innerW;
    const sy = (y: number) => PAD.top + (1 - (Math.min(Math.max(y, y0), y1) - y0) / Math.max(y1 - y0, 1e-9)) * innerH;
    const yTicks = ticks(y0, y1, 4);
    const xTicks = ticks(x0, x1, Math.max(2, Math.floor(innerW / 90)));

    function nearest(px: number) {
        const target = x0 + ((px - PAD.left) / innerW) * (x1 - x0);
        let best = xs[0];
        for (const x of xs) {
            if (Math.abs(x - target) < Math.abs(best - target)) {
                best = x;
            }
        }
        return best;
    }

    function onKey(e: React.KeyboardEvent) {
        if (!xs.length || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) {
            return;
        }
        e.preventDefault();
        const i = hoverX === null ? xs.length - 1 : xs.indexOf(hoverX);
        setHoverX(xs[Math.min(xs.length - 1, Math.max(0, i + (e.key === "ArrowRight" ? 1 : -1)))]);
    }

    const tooltip =
        hoverX === null
            ? []
            : visible
                  .map((sr) => ({ sr, y: sr.points.find((p) => p.x === hoverX)?.y ?? null }))
                  .filter((r) => r.y !== null)
                  .sort((a, b) => b.y! - a.y!);
    const tipLeft = hoverX !== null && sx(hoverX) > width / 2;

    return (
        <div className={twMerge("flex flex-col gap-[.6rem] min-w-0", className)}>
            <div ref={ref} className="relative w-full">
                <svg
                    width={width}
                    height={height}
                    role="img"
                    aria-label={ariaLabel}
                    tabIndex={0}
                    className={s.svg}
                    onMouseMove={(e) => setHoverX(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
                    onMouseLeave={() => setHoverX(null)}
                    onKeyDown={onKey}
                    onBlur={() => setHoverX(null)}
                >
                    {yTicks.map((t) => (
                        <g key={`y${t}`}>
                            <line x1={PAD.left} x2={width - PAD.right} y1={sy(t)} y2={sy(t)} className={s.grid} />
                            <text x={PAD.left - 8} y={sy(t)} className={s.tick} textAnchor="end" dominantBaseline="middle">
                                {yFormat(t)}
                            </text>
                        </g>
                    ))}
                    {xTicks.map((t) => (
                        <text key={`x${t}`} x={sx(t)} y={height - 8} className={s.tick} textAnchor="middle">
                            {xFormat(t)}
                        </text>
                    ))}
                    <line x1={PAD.left} x2={width - PAD.right} y1={sy(y0)} y2={sy(y0)} className={s.axis} />

                    {refLines
                        .filter((r) => r.zone)
                        .map((r) => (
                            <rect key={`z${r.label}`} x={PAD.left} y={PAD.top} width={innerW} height={Math.max(0, sy(r.y) - PAD.top)} className={s.zone} />
                        ))}

                    {markers
                        .filter((m) => m.x >= x0 && m.x <= x1)
                        .map((m) => (
                            <line key={`ml${m.label}${m.x}`} data-tone={m.tone ?? "muted"} className={s.markerLine} x1={sx(m.x)} x2={sx(m.x)} y1={PAD.top} y2={height - PAD.bottom} />
                        ))}

                    {visible.map((sr) => (
                        <path
                            key={sr.id}
                            d={path(sr.points, sx, sy, sr.step)}
                            className={s.line}
                            stroke={sr.color}
                            strokeDasharray={sr.dashed ? "5 4" : undefined}
                        />
                    ))}

                    {dots.map((d) => (
                        <circle key={d.label} cx={sx(d.x)} cy={sy(d.y)} r={5} fill={d.color} className={s.dot}>
                            <title>{d.label}</title>
                        </circle>
                    ))}

                    {refLines.map((r) => (
                        <line key={`r${r.label}`} x1={PAD.left} x2={width - PAD.right} y1={sy(r.y)} y2={sy(r.y)} className={s.ref} />
                    ))}

                    {/* Labels last, so no line is ever drawn over them. */}
                    {refLines.map((r) => {
                        const w = labelWidth(r.label);
                        const above = sy(r.y) - 22 >= PAD.top;
                        const y = above ? sy(r.y) - 22 : sy(r.y) + 4;
                        return (
                            <g key={`rl${r.label}`} className={s.refPill}>
                                <rect x={width - PAD.right - w} y={y} width={w} height={18} rx={9} />
                                <text x={width - PAD.right - w / 2} y={y + 9} textAnchor="middle" dominantBaseline="central">
                                    {r.label}
                                </text>
                            </g>
                        );
                    })}

                    {layoutMarkers(
                        markers.filter((m) => m.x >= x0 && m.x <= x1),
                        sx,
                        width - PAD.right,
                    ).map(({ m, start, w, row }) => (
                        <g key={`mp${m.label}${m.x}`} data-tone={m.tone ?? "muted"} className={s.markerPill}>
                            <rect x={start} y={PAD.top + 2 + row * ROW} width={w} height={18} rx={4} />
                            <text x={start + w / 2} y={PAD.top + 11 + row * ROW} textAnchor="middle" dominantBaseline="central">
                                {m.label}
                            </text>
                        </g>
                    ))}

                    {hoverX !== null && (
                        <g>
                            <line x1={sx(hoverX)} x2={sx(hoverX)} y1={PAD.top} y2={height - PAD.bottom} className={s.crosshair} />
                            {tooltip.map(({ sr, y }) => (
                                <circle key={sr.id} cx={sx(hoverX)} cy={sy(y!)} r={4} fill={sr.color} className={s.dot} />
                            ))}
                        </g>
                    )}
                </svg>

                {hoverX !== null && tooltip.length > 0 && (
                    <div
                        className={s.tooltip}
                        style={tipLeft ? { right: width - sx(hoverX) + 12 } : { left: sx(hoverX) + 12 }}
                        aria-live="polite"
                    >
                        <strong>{xLabel ? `${xLabel} ${xFormat(hoverX)}` : xFormat(hoverX)}</strong>
                        {tooltip.map(({ sr, y }) => (
                            <span key={sr.id}>
                                <i style={{ background: sr.color }} />
                                {sr.label}
                                <b>{yFormat(y!)}</b>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {legend && series.length > 1 && (
                <div className="flex flex-row flex-wrap gap-x-[1rem] gap-y-[.35rem]" role="group" aria-label="Series">
                    {series.map((sr) => {
                        const off = hidden.has(sr.id);
                        return (
                            <button
                                key={sr.id}
                                aria-pressed={!off}
                                className={twMerge(s.legend, off && s.off)}
                                onClick={() =>
                                    setHidden((h) => {
                                        const next = new Set(h);
                                        if (off) {
                                            next.delete(sr.id);
                                        } else {
                                            next.add(sr.id);
                                        }
                                        return next;
                                    })
                                }
                            >
                                <i style={{ borderColor: sr.color }} data-dashed={sr.dashed || undefined} />
                                {sr.label}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
