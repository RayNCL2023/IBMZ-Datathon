"use client";

import { useState } from "react";
import type { PatientResponse } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { useReplay } from "@/contexts/ReplayContext";
import Card from "@/components/(ui)/Card";
import Segmented from "@/components/(ui)/Segmented";
import LineChart, { type Marker } from "@/components/(charts)/LineChart";

type Mode = "relative" | "absolute";

// Five heads have very different alarm lines (e.g. 2% vs 29%), so the default view divides each risk by its
// own line: one shared "1×" alarm line, which is also how the ward ranks beds (priority).
export default function ({ patient: p }: { patient: PatientResponse }) {
    const { groundTruth } = useReplay();
    const [mode, setMode] = useState<Mode>("relative");
    const heads = HEADS.filter((h) => p.timeline[0]?.risks[h]);

    const series = heads.map((h) => ({
        id: h,
        label: HEAD_META[h].label,
        color: HEAD_META[h].color,
        points: p.timeline.map((t) => {
            const r = t.risks[h]?.risk ?? null;
            return { x: t.hour, y: r === null ? null : mode === "relative" ? r / Math.max(p.thresholds[h] ?? 1, 1e-6) : r * 100 };
        }),
    }));

    const markers: Marker[] = [];
    if (p.news2FirstAlert !== null) {
        markers.push({ x: p.news2FirstAlert, label: "NEWS2 first alarm", tone: "muted" });
    }
    if (groundTruth && p.sepsisOnset !== null) {
        markers.push({ x: p.sepsisOnset, label: "Sepsis onset (label)", tone: "danger" });
    }

    const last = p.timeline[p.timeline.length - 1]?.hour ?? 0;
    return (
        <Card
            title="Risk over this stay"
            description={mode === "relative" ? "Risk divided by each head's alarm line: above 1× means alarming." : "Calibrated probability of each event within its horizon."}
            actions={
                <Segmented
                    label="Risk scale"
                    value={mode}
                    onChange={setMode}
                    options={[
                        { value: "relative", label: "× alarm line" },
                        { value: "absolute", label: "Probability" },
                    ]}
                />
            }
        >
            <LineChart
                ariaLabel={`Risk per head for hours 0 to ${last}`}
                series={series}
                height={280}
                xDomain={[0, Math.max(last, 6)]}
                xLabel="Hour"
                xFormat={(x) => `${x}h`}
                yFormat={(y) => (mode === "relative" ? `${y.toFixed(1)}×` : `${y.toFixed(y < 10 ? 1 : 0)}%`)}
                refLines={mode === "relative" ? [{ y: 1, label: "Alarm line 1×", zone: true }] : []}
                markers={markers}
            />
        </Card>
    );
}
