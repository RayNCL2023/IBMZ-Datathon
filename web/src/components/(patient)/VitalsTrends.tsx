"use client";

import { useState } from "react";
import type { PatientResponse, VitalKey } from "@/lib/api/types";
import { VITAL_META } from "@/var/clinical";
import { num } from "@/lib/format";
import Card from "@/components/(ui)/Card";
import Segmented from "@/components/(ui)/Segmented";
import LineChart from "@/components/(charts)/LineChart";
import { isAbnormal } from "@/components/(clinical)/VitalReadout";

// Small multiples, one unit per chart (never a second y-axis). Blood pressure shares mmHg, so it is one chart.
const PANELS: { title: string; keys: VitalKey[]; colors: string[] }[] = [
    { title: "Heart rate (bpm)", keys: ["HR"], colors: ["var(--h-sepsis)"] },
    { title: "Blood pressure (mmHg)", keys: ["SBP", "MAP", "DBP"], colors: ["var(--h-sepsis)", "var(--h-hypotension)", "var(--h-aki)"] },
    { title: "SpO₂ (%)", keys: ["O2Sat"], colors: ["var(--h-sepsis)"] },
    { title: "Respiratory rate (/min)", keys: ["Resp"], colors: ["var(--h-sepsis)"] },
    { title: "Temperature (°C)", keys: ["Temp"], colors: ["var(--h-sepsis)"] },
];

const TABLE_KEYS: VitalKey[] = ["HR", "SBP", "MAP", "DBP", "O2Sat", "Resp", "Temp", "EtCO2"];

export default function ({ patient: p }: { patient: PatientResponse }) {
    const [view, setView] = useState<"charts" | "table">("charts");
    const last = p.timeline[p.timeline.length - 1]?.hour ?? 0;
    const news2 = {
        id: "news2",
        label: "NEWS2",
        color: "var(--d-muted)",
        step: true,
        points: p.timeline.map((t) => ({ x: t.hour, y: t.news2 })),
    };

    return (
        <Card
            title="Observations"
            description="Hourly values as recorded (carried forward between measurements)."
            actions={
                <Segmented
                    label="Observation view"
                    value={view}
                    onChange={setView}
                    options={[
                        { value: "charts", label: "Charts" },
                        { value: "table", label: "Table" },
                    ]}
                />
            }
        >
            {view === "charts" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-[1.5rem] gap-y-[1.25rem]">
                    <div className="flex flex-col gap-[.35rem]">
                        <span className="text-[.85rem] font-[600] text-fg">NEWS2 score</span>
                        <LineChart
                            ariaLabel="NEWS2 score by hour"
                            series={[news2]}
                            height={150}
                            xDomain={[0, Math.max(last, 6)]}
                            yDomain={[0, Math.max(10, ...news2.points.map((pt) => pt.y))]}
                            xFormat={(x) => `${x}h`}
                            refLines={[
                                { y: 5, label: "5 urgent review", zone: true },
                                { y: 7, label: "7 emergency" },
                            ]}
                        />
                    </div>
                    {PANELS.map((panel) => (
                        <div key={panel.title} className="flex flex-col gap-[.35rem]">
                            <span className="text-[.85rem] font-[600] text-fg">{panel.title}</span>
                            <LineChart
                                ariaLabel={`${panel.title} by hour`}
                                height={150}
                                xDomain={[0, Math.max(last, 6)]}
                                xFormat={(x) => `${x}h`}
                                yFormat={(y) => num(y, VITAL_META[panel.keys[0]].digits)}
                                yDomain={(() => {
                                    const ys = panel.keys.flatMap((k) => p.timeline.map((t) => t.vitals[k])).filter((v): v is number => v !== null);
                                    if (!ys.length) {
                                        return [0, 1];
                                    }
                                    const lo = Math.min(...ys);
                                    const hi = Math.max(...ys);
                                    const pad = Math.max((hi - lo) * 0.15, 1);
                                    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
                                })()}
                                series={panel.keys.map((k, i) => ({
                                    id: k,
                                    label: VITAL_META[k].label,
                                    color: panel.colors[i],
                                    points: p.timeline.map((t) => ({ x: t.hour, y: t.vitals[k] })),
                                }))}
                            />
                        </div>
                    ))}
                </div>
            )}

            {view === "table" && (
                <div className="overflow-x-auto">
                    <table className="w-full text-[.85rem] border-collapse font-num">
                        <caption className="sr-only">Observations for the last 24 hours, newest first</caption>
                        <thead>
                            <tr className="text-muted text-[.8125rem]">
                                <th className="text-left font-[600] py-[.4rem] pr-[1rem]">Hour</th>
                                <th className="text-right font-[600] py-[.4rem] px-[.5rem]">NEWS2</th>
                                {TABLE_KEYS.map((k) => (
                                    <th key={k} className="text-right font-[600] py-[.4rem] px-[.5rem] whitespace-nowrap">
                                        {VITAL_META[k].label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {[...p.timeline]
                                .reverse()
                                .slice(0, 24)
                                .map((t) => (
                                    <tr key={t.hour} className="border-t-[1px] border-line">
                                        <td className="py-[.4rem] pr-[1rem] text-fg">{t.hour}</td>
                                        <td className={`text-right py-[.4rem] px-[.5rem] ${t.news2Alert ? "text-danger-ink font-[700]" : "text-fg"}`}>{t.news2}</td>
                                        {TABLE_KEYS.map((k) => (
                                            <td key={k} className={`text-right py-[.4rem] px-[.5rem] ${isAbnormal(k, t.vitals[k]) ? "text-danger-ink font-[650]" : "text-fg"}`}>
                                                {num(t.vitals[k], VITAL_META[k].digits)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}
