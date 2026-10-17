"use client";

import { useState } from "react";
import type { EvalReport, FairnessRow, Head } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META, HOSPITAL_NAMES, readable } from "@/var/clinical";
import { auc, num, pct } from "@/lib/format";
import { useApi } from "@/lib/api/useApi";
import PageHeader from "@/components/(shell)/PageHeader";
import Card from "@/components/(ui)/Card";
import Stat from "@/components/(ui)/Stat";
import Segmented from "@/components/(ui)/Segmented";
import PillBase from "@/components/(ui)/PillBase";
import DataTable, { Versus } from "@/components/(ui)/DataTable";
import { ErrorState, Skeleton } from "@/components/(ui)/States";
import LineChart from "@/components/(charts)/LineChart";
import HeadPicker from "@/components/(insights)/HeadPicker";

const SITE_LABEL: Record<string, string> = {
    all: "All held-out (A, B, M)",
    C_external: "Hospital C, external (eICU)",
};

export default function () {
    const metrics = useApi("metrics", (api) => api.metrics());
    const fatigue = useApi("fatigue", (api) => api.fatigue());
    const [head, setHead] = useState<Head>("sepsis");
    const [xMetric, setXMetric] = useState<"alertsPerBedDay" | "alarmHours">("alertsPerBedDay");

    const heads = HEADS.filter((h) => metrics.data?.heads?.[h]);
    const report = metrics.data?.heads?.[head];
    const headline = metrics.data?.headline?.[head];
    const utility = metrics.data?.headline?.sepsisUtility;
    const fat = fatigue.data?.heads?.[head];
    const error = metrics.error ?? fatigue.error;

    const sites = report ? Object.entries(report.test).sort(([a], [b]) => (a === "all" ? -1 : b === "all" ? 1 : a.localeCompare(b))) : [];
    const baselineKey = (r: EvalReport) => Object.keys(r).find((k) => k.startsWith("baseline_"));

    const xFormat = (x: number) => (xMetric === "alarmHours" ? `${(x * 100).toFixed(0)}%` : x.toFixed(x < 1 ? 2 : 1));
    const xMax = fat ? Math.min(Math.max(...fat.news2.map((p) => p[xMetric]), ...fat.model.map((p) => p[xMetric])), xMetric === "alarmHours" ? 0.5 : 3) : 1;
    const n2At5 = fat?.news2.find((p) => p.cutoff === 5);

    return (
        <div className="page">
            <PageHeader
                title="Model performance"
                description="Every head is tuned to raise the same number of alarms as NEWS2 ≥ 5 on validation patients, so each comparison below is like for like. All numbers are on held-out patients."
                actions={heads.length > 0 && <HeadPicker heads={heads} value={head} onChange={setHead} />}
            />

            {error && !metrics.data && <ErrorState error={error} onRetry={() => (metrics.reload(), fatigue.reload())} />}
            {!metrics.data && !error && <Skeleton className="h-[30rem]" />}

            {report && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1rem]">
                        <Card bodyClassName="p-[1rem]">
                            <Stat
                                label="AUROC, all held-out"
                                value={auc(report.test.all?.model.auroc)}
                                sub={`NEWS2 ${auc(report.test.all?.news2.auroc)}`}
                            />
                        </Card>
                        {headline && (
                            <>
                                <Card bodyClassName="p-[1rem]">
                                    <Stat
                                        label="Events caught, same alarm hours as NEWS2"
                                        value={pct(headline.sameAlarmHours.modelCaught)}
                                        sub={`NEWS2 ${pct(headline.sameAlarmHours.news2Caught)} at ${pct(headline.sameAlarmHours.alarmHours, 1)} of bed-hours`}
                                    />
                                </Card>
                                <Card bodyClassName="p-[1rem]">
                                    <Stat
                                        label="Fewer alarms, same events caught"
                                        value={pct(headline.news2Recall.fewerAlarms)}
                                        sub={`${num(headline.news2Recall.modelAlertsPerBedDay, 2)} vs ${num(headline.news2Recall.news2AlertsPerBedDay, 2)} alarms per bed-day`}
                                    />
                                </Card>
                            </>
                        )}
                        {head === "sepsis" && utility ? (
                            <Card bodyClassName="p-[1rem]">
                                <Stat label="PhysioNet 2019 utility" value={num(utility.model, 3)} sub={`NEWS2 at its best cut-off ${num(utility.news2, 3)}`} />
                            </Card>
                        ) : (
                            <Card bodyClassName="p-[1rem]">
                                <Stat label="Trees in this head" value={report.trees} sub={`Trained on ${report.train_sites.join(", ")}`} />
                            </Card>
                        )}
                    </div>

                    <Card
                        title="Discrimination and warning by hospital"
                        description={`${HEAD_META[head].label} within ${HEAD_META[head].horizon}. "Warned" is the share of patients with the event who got an alarm before it; "false" is the share without the event who still got one.`}
                    >
                        <DataTable
                            caption={`${HEAD_META[head].label} results per hospital`}
                            rows={sites}
                            rowKey={([site]) => site}
                            columns={[
                                { key: "site", header: "Patients", cell: ([site]) => SITE_LABEL[site] ?? HOSPITAL_NAMES[site] ?? site },
                                { key: "rows", header: "Patient-hours", numeric: true, cell: ([, r]) => r.rows.toLocaleString("en-GB") },
                                { key: "auroc", header: "AUROC vs NEWS2", numeric: true, cell: ([, r]) => <Versus model={r.model.auroc} other={r.news2.auroc} format={auc} /> },
                                { key: "auprc", header: "AUPRC vs NEWS2", numeric: true, cell: ([, r]) => <Versus model={r.model.auprc} other={r.news2.auprc} format={auc} /> },
                                {
                                    key: "warned",
                                    header: "Warned before event",
                                    numeric: true,
                                    cell: ([, r]) => <Versus model={r.model.warned_before_event} other={r.news2.warned_before_event} format={(v) => pct(v)} />,
                                },
                                {
                                    key: "false",
                                    header: "No event, still alarmed",
                                    numeric: true,
                                    cell: ([, r]) => (
                                        <span className="inline-flex items-baseline gap-[.35rem]">
                                            <b className={r.model.no_event_with_alert < r.news2.no_event_with_alert ? "text-ok-ink font-[650]" : "font-[650]"}>{pct(r.model.no_event_with_alert)}</b>
                                            <span className="text-faint text-[.8rem]">vs {pct(r.news2.no_event_with_alert)}</span>
                                        </span>
                                    ),
                                },
                                {
                                    key: "baseline",
                                    header: "One-signal baseline",
                                    numeric: true,
                                    cell: ([, r]) => {
                                        const k = baselineKey(r);
                                        return k ? `${readable(k.replace("baseline_", ""))} ${auc(r[k as `baseline_${string}`])}` : "–";
                                    },
                                },
                                { key: "ece", header: "Calibration error", numeric: true, cell: ([, r]) => pct(r.model.calibration_error, 1) },
                            ]}
                        />
                    </Card>

                    {fat && (
                        <Card
                            title="Alarm fatigue"
                            description="Each point is an alarm threshold. Further up and to the left is better: more patients warned for fewer alarms. The dot is the threshold in use."
                            actions={
                                <Segmented
                                    label="Alarm load measure"
                                    value={xMetric}
                                    onChange={setXMetric}
                                    options={[
                                        { value: "alertsPerBedDay", label: "Alarms per bed-day" },
                                        { value: "alarmHours", label: "Share of hours alarming" },
                                    ]}
                                />
                            }
                        >
                            <LineChart
                                ariaLabel={`Share of ${HEAD_META[head].label.toLowerCase()} patients warned against alarm load, model versus NEWS2`}
                                height={300}
                                xDomain={[0, xMax]}
                                yDomain={[0, 1]}
                                xFormat={xFormat}
                                yFormat={(y) => `${Math.round(y * 100)}%`}
                                xLabel={xMetric === "alarmHours" ? "Hours alarming" : "Alarms per bed-day"}
                                series={[
                                    {
                                        id: "model",
                                        label: `${HEAD_META[head].label} model`,
                                        color: HEAD_META[head].color,
                                        points: fat.model.filter((p) => p[xMetric] <= xMax).map((p) => ({ x: p[xMetric], y: p.caught })),
                                    },
                                    {
                                        id: "news2",
                                        label: "NEWS2 (cut-offs 1 to 10)",
                                        color: "var(--d-muted)",
                                        dashed: true,
                                        points: fat.news2.filter((p) => p[xMetric] <= xMax).map((p) => ({ x: p[xMetric], y: p.caught })),
                                    },
                                ]}
                                dots={[
                                    { x: fat.operating[xMetric], y: fat.operating.caught, label: `Model in use: ${pct(fat.operating.caught)} warned`, color: HEAD_META[head].color },
                                    ...(n2At5 && n2At5[xMetric] <= xMax ? [{ x: n2At5[xMetric], y: n2At5.caught, label: `NEWS2 ≥ 5: ${pct(n2At5.caught)} warned`, color: "var(--d-muted)" }] : []),
                                ]}
                            />
                            <div className="flex flex-row flex-wrap gap-[.5rem]">
                                <PillBase>
                                    Model in use: {pct(fat.operating.caught)} warned at {num(fat.operating.alertsPerBedDay, 2)} alarms per bed-day
                                </PillBase>
                                {n2At5 && (
                                    <PillBase>
                                        NEWS2 ≥ 5: {pct(n2At5.caught)} warned at {num(n2At5.alertsPerBedDay, 2)} alarms per bed-day
                                    </PillBase>
                                )}
                                <PillBase>
                                    {fat.eventPatients.toLocaleString("en-GB")} event patients of {fat.patients.toLocaleString("en-GB")}
                                </PillBase>
                            </div>
                        </Card>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-[1rem]">
                        {fat && Object.keys(fat.fairness).length > 0 && (
                            <Card title="Fairness" description="The alarm in use against NEWS2 ≥ 5 in each age band and sex (groups with at least 20 event patients).">
                                <DataTable<[string, FairnessRow]>
                                    caption="Fairness by age band and sex"
                                    rows={Object.entries(fat.fairness)}
                                    rowKey={([g]) => g}
                                    columns={[
                                        { key: "g", header: "Group", cell: ([g]) => g[0].toUpperCase() + g.slice(1) },
                                        { key: "n", header: "Event patients", numeric: true, cell: ([, r]) => `${r.eventPatients} of ${r.patients}` },
                                        { key: "c", header: "Warned vs NEWS2", numeric: true, cell: ([, r]) => <Versus model={r.modelCaught} other={r.news2Caught} format={(v) => pct(v)} /> },
                                        {
                                            key: "h",
                                            header: "Hours alarming",
                                            numeric: true,
                                            cell: ([, r]) => `${pct(r.modelAlarmHours, 1)} vs ${pct(r.news2AlarmHours, 1)}`,
                                        },
                                        { key: "a", header: "AUROC", numeric: true, cell: ([, r]) => auc(r.auroc) },
                                    ]}
                                />
                            </Card>
                        )}
                        <Card title="About this head" description={`Predicts ${HEAD_META[head].label.toLowerCase()} within ${HEAD_META[head].horizon}.`}>
                            <dl className="grid grid-cols-[8rem_1fr] gap-y-[.5rem] text-[.875rem]">
                                <dt className="text-muted">Trained on</dt>
                                <dd className="text-fg">{report.train_sites.map((s) => HOSPITAL_NAMES[s] ?? s).join(", ")}</dd>
                                <dt className="text-muted">Trees</dt>
                                <dd className="text-fg font-num">{report.trees}</dd>
                                <dt className="text-muted">Alarm line</dt>
                                <dd className="text-fg font-num">
                                    {pct(report.threshold, 1)} pooled
                                    {Object.entries(report.site_thresholds)
                                        .filter(([s]) => s !== "global")
                                        .map(([s, t]) => `, ${s} ${pct(t, 1)}`)
                                        .join("")}
                                </dd>
                            </dl>
                            <div className="flex flex-col gap-[.4rem]">
                                <span className="text-[.85rem] font-[600] text-fg">Most used features</span>
                                <div className="flex flex-row flex-wrap gap-[.35rem]">
                                    {report.top_features.map((f) => (
                                        <PillBase key={f} title={f}>
                                            {readable(f.split("_")[0])}
                                            {f.includes("_") ? ` (${f.split("_").slice(1).join(" ")})` : ""}
                                        </PillBase>
                                    ))}
                                </div>
                            </div>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
