"use client";

import type { Bed } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { alertingHeads, filterBeds, sortBeds, type FilterKey, type SortKey } from "@/lib/ward";
import PatientLink from "@/components/(patient)/PatientLink";
import News2Badge from "@/components/(clinical)/News2Badge";
import SymptomRing from "@/components/(clinical)/SymptomRing";
import s from "./BayMap.module.scss";

type Tone = "hot" | "warm" | "calm" | "ended";

const ratioOf = (bed: Bed, h: keyof Bed["risks"]) => {
    const r = bed.risks[h];
    return r ? r.risk / Math.max(r.threshold, 1e-6) : 0;
};

function toneOf(bed: Bed): Tone {
    if (bed.discharged) {
        return "ended";
    }
    if (bed.priority >= 2) {
        return "hot";
    }
    return bed.priority >= 1 || bed.news2Alert ? "warm" : "calm";
}

const LEGEND: { tone: string; label: string }[] = [
    { tone: "var(--d-danger)", label: "Pinging fast: 2× alarm line" },
    { tone: "var(--d-warn)", label: "Pinging slow: above line or NEWS2 alert" },
    { tone: "color-mix(in srgb, var(--d-ok) 45%, var(--d-sunken))", label: "Settled" },
];

function Bay({ bed, dim }: { bed: Bed; dim: boolean }) {
    const tone = toneOf(bed);
    const top = bed.topRisk;
    const others = alertingHeads(bed).filter((h) => h !== top);
    const headline = bed.discharged
        ? `Stay ended at ${bed.lengthOfStay} h`
        : bed.priority >= 1
          ? `${HEAD_META[top].label} ${bed.priority.toFixed(1)}×`
          : bed.news2Alert
            ? "NEWS2 alert"
            : "Settled";

    return (
        <PatientLink
            patientId={bed.patientId}
            className={s.bay}
            data-tone={tone}
            data-dim={dim || undefined}
            aria-label={`Bed ${bed.bed}, ${headline}, NEWS2 ${bed.news2}${others.length ? `, also ${others.map((h) => HEAD_META[h].label).join(", ")}` : ""}`}
        >
            <div className="flex flex-row items-center justify-between gap-[.5rem]">
                <span className="text-[1rem] font-[700] tracking-[-0.01em]">Bed {String(bed.bed).padStart(2, "0")}</span>
                <News2Badge score={bed.news2} alert={bed.news2Alert} />
            </div>

            <div className={s.body}>
                <span className={s.bedWrap}>
                    <span className={s.bed} />
                </span>
                <div className="flex flex-col gap-[.2rem] min-w-0">
                    <span className="text-[.75rem] text-muted">{bed.priority >= 1 && !bed.discharged ? "Main alert" : "Status"}</span>
                    <span className="text-[1.05rem] font-[650] leading-[1.25] text-pretty" style={{ color: tone === "hot" ? "var(--d-danger-ink)" : tone === "warm" ? "var(--d-warn-ink)" : undefined }}>
                        {headline}
                    </span>
                    {bed.priority >= 1 && !bed.discharged && <span className="text-[.8rem] text-muted">{HEAD_META[top].horizon}</span>}
                </div>
            </div>

            {!bed.discharged && (
                <div className="flex flex-col gap-[.5rem] pt-[.75rem] border-t-[1px] border-line">
                    <span className="text-[.75rem] text-muted">{others.length ? "Also on alert" : "No other alerts"}</span>
                    {others.length > 0 && (
                        <div className="flex flex-row flex-wrap gap-[.75rem]">
                            {others.map((h) => (
                                <SymptomRing key={h} head={h} ratio={ratioOf(bed, h)} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </PatientLink>
    );
}

// Simple mode: the ward as bed tiles, most urgent first by default (same sort as the analytical view).
export default function ({ beds, filter, sort }: { beds: Bed[]; filter: FilterKey; sort: SortKey }) {
    const match = new Set(filterBeds(beds, filter).map((b) => b.patientId));
    const ordered = sortBeds(beds, sort);
    return (
        <section aria-label="Ward floor plan" className={s.plan}>
            <div className={s.station}>
                <span className="font-[600] text-fg">Nurse station</span>
                <span className="flex flex-row flex-wrap items-center gap-[1rem]">
                    {LEGEND.map((l) => (
                        <span key={l.label} className="inline-flex flex-row items-center gap-[.4rem]">
                            <i aria-hidden className="w-[.75rem] h-[.75rem] rounded-full" style={{ background: l.tone }} />
                            {l.label}
                        </span>
                    ))}
                </span>
            </div>
            {ordered.map((bed) => (
                <Bay key={bed.patientId} bed={bed} dim={!match.has(bed.patientId)} />
            ))}
        </section>
    );
}
