"use client";

import { useEffect, useState } from "react";
import { LuCheck } from "react-icons/lu";
import type { FedRun } from "@/lib/api/types";
import { HOSPITAL_NAMES } from "@/var/clinical";
import { auc, num } from "@/lib/format";
import { useApi } from "@/lib/api/useApi";
import { useReplay } from "@/contexts/ReplayContext";
import { useToast } from "@/contexts/ToastContext";
import PageHeader from "@/components/(shell)/PageHeader";
import Card from "@/components/(ui)/Card";
import Stat from "@/components/(ui)/Stat";
import Segmented from "@/components/(ui)/Segmented";
import StatusPill from "@/components/(ui)/StatusPill";
import DataTable from "@/components/(ui)/DataTable";
import { ErrorState, Skeleton } from "@/components/(ui)/States";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";
import BarList from "@/components/(charts)/BarList";
import LineChart from "@/components/(charts)/LineChart";

const label = (key: string) => (key === "none" ? "No noise" : `ε = ${key}`);

export default function () {
    const { data, error, reload } = useApi("privacy", (api) => api.privacy());
    const replay = useReplay();
    const { push } = useToast();
    const [selected, setSelected] = useState<string>("none");

    useEffect(() => {
        if (replay.privacy) {
            setSelected(replay.privacy);
        }
    }, [replay.privacy]);

    const hospitals = data ? Object.keys(Object.values(data.federated)[0]?.per_hospital ?? {}) : [];
    const run = data?.federated[selected];
    const rows: { key: string; name: string; run: FedRun; kind: "local" | "fed" }[] = data
        ? [
              ...Object.entries(data.local_only).map(([h, r]) => ({ key: `local-${h}`, name: `${HOSPITAL_NAMES[h] ?? h} alone`, run: r, kind: "local" as const })),
              ...data.options.map((o) => ({ key: `fed-${o}`, name: `Federated, ${label(o).toLowerCase()}`, run: data.federated[o], kind: "fed" as const })),
          ]
        : [];

    return (
        <div className="page">
            <PageHeader
                title="Federated learning"
                description="Hospitals never share patient data. The sepsis model travels between hospital containers on LinuxONE, each adding a few trees on its own patients. Only models, held-out scores and feature medians ever leave a hospital."
            />

            {error && !data && <ErrorState error={error} onRetry={reload} />}
            {!data && !error && <Skeleton className="h-[30rem]" />}

            {data && run && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1rem]">
                        {Object.entries(data.hospitals).map(([h, info]) => (
                            <Card key={h} bodyClassName="p-[1rem]">
                                <Stat
                                    label={HOSPITAL_NAMES[h] ?? h}
                                    value={`${(info.rows / 1000).toFixed(0)}k`}
                                    sub={`patient-hours, ${info.events.sepsis ?? 0} sepsis events`}
                                />
                            </Card>
                        ))}
                        <Card bodyClassName="p-[1rem]">
                            <Stat label="Federated, mean AUROC" value={auc(data.federated.none?.mean_auroc)} sub={`${data.federated.none?.trees ?? "–"} trees over ${data.federated.none?.rounds ?? "–"} rounds`} />
                        </Card>
                    </div>

                    <Card
                        title="Privacy dial"
                        description="Laplace noise on every leaf a hospital adds, before the model leaves the building. Smaller ε means more privacy and more noise."
                        actions={
                            replay.privacy === selected ? (
                                <StatusPill tone="success">In use on the ward</StatusPill>
                            ) : (
                                <ButtonPrimary
                                    onClick={() => {
                                        replay.setPrivacy(selected);
                                        push({ tone: "success", title: `Ward now uses the federated sepsis model (${label(selected)})` });
                                    }}
                                >
                                    <LuCheck size={16} /> Use on the ward
                                </ButtonPrimary>
                            )
                        }
                    >
                        <Segmented label="Privacy budget per tree" value={selected} onChange={setSelected} options={data.options.map((o) => ({ value: o, label: label(o) }))} className="self-start flex-wrap" />
                        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-[1.5rem] pt-[.5rem]">
                            <div className="flex flex-col gap-[.6rem]">
                                <span className="text-[.85rem] font-[600] text-fg">AUROC on each hospital&apos;s held-out patients (tick = NEWS2)</span>
                                <BarList
                                    max={1}
                                    items={hospitals.map((h) => ({
                                        id: h,
                                        label: HOSPITAL_NAMES[h] ?? h,
                                        value: run.per_hospital[h]?.auroc ?? 0,
                                        display: auc(run.per_hospital[h]?.auroc),
                                        color: "var(--h-sepsis)",
                                        compare: run.per_hospital[h]?.news2_auroc,
                                        compareLabel: `NEWS2 ${auc(run.per_hospital[h]?.news2_auroc)}`,
                                    }))}
                                />
                            </div>
                            <dl className="grid grid-cols-[1fr_auto] gap-y-[.5rem] text-[.875rem] content-start">
                                <dt className="text-muted">Mean AUROC</dt>
                                <dd className="text-fg font-num font-[650] text-right">{auc(run.mean_auroc)}</dd>
                                <dt className="text-muted">ε per tree</dt>
                                <dd className="text-fg font-num text-right">{run.epsilon_per_tree ?? "∞"}</dd>
                                <dt className="text-muted">ε per hospital (sequential)</dt>
                                <dd className="text-fg font-num text-right">{run.epsilon_total_per_site ?? "∞"}</dd>
                            </dl>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 xl:grid-cols-[3fr_2fr] gap-[1rem]">
                        <Card title="Learning together beats learning alone" description="AUROC on each hospital's held-out patients. A model trained at one hospital loses accuracy on the other's patients.">
                            <DataTable
                                caption="AUROC per hospital for local-only and federated models"
                                rows={rows}
                                rowKey={(r) => r.key}
                                columns={[
                                    { key: "m", header: "Model", cell: (r) => <span className={r.kind === "fed" && r.key === `fed-${selected}` ? "font-[650]" : ""}>{r.name}</span> },
                                    ...hospitals.map((h) => ({ key: h, header: HOSPITAL_NAMES[h] ?? h, numeric: true, cell: (r: (typeof rows)[number]) => auc(r.run.per_hospital[h]?.auroc) })),
                                    { key: "mean", header: "Mean", numeric: true, cell: (r) => <b className="font-[650]">{auc(r.run.mean_auroc)}</b> },
                                ]}
                            />
                        </Card>
                        {data.federated.none?.mean_auroc_by_round && (
                            <Card title="Convergence" description="Mean held-out AUROC after each round through all hospitals (no noise).">
                                <LineChart
                                    ariaLabel="Mean AUROC by federated round"
                                    height={220}
                                    xFormat={(x) => `${x}`}
                                    xLabel="Round"
                                    yFormat={(y) => num(y, 2)}
                                    series={[
                                        {
                                            id: "auroc",
                                            label: "Mean AUROC",
                                            color: "var(--h-sepsis)",
                                            points: data.federated.none.mean_auroc_by_round.map((y, i) => ({ x: i + 1, y })),
                                        },
                                    ]}
                                />
                            </Card>
                        )}
                    </div>

                    <Card title="What the dial does and does not promise">
                        <ul className="flex flex-col gap-[.5rem] text-[.9rem] text-fg list-disc pl-[1.25rem] max-w-[80ch]">
                            <li>Noise makes each tree&apos;s leaf values ε-differentially private at row level (DPBoost bound for logistic loss).</li>
                            <li>Privacy composes across trees: ε = 1 per tree over 75 trees is ε = 75 per hospital, a weak formal guarantee.</li>
                            <li>Split features and thresholds are not noised, and a patient contributes many hourly rows, so patient-level privacy is weaker.</li>
                            <li>Treat it as a demonstration of the privacy and accuracy trade-off, not a certified guarantee.</li>
                        </ul>
                    </Card>
                </>
            )}
        </div>
    );
}
