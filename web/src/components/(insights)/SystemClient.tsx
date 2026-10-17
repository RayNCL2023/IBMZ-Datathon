"use client";

import { useEffect, useState } from "react";
import type { Head } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { auc, compact, ms } from "@/lib/format";
import { useApi } from "@/lib/api/useApi";
import { useApiClient } from "@/contexts/DesignContext";
import PageHeader from "@/components/(shell)/PageHeader";
import Card from "@/components/(ui)/Card";
import Stat from "@/components/(ui)/Stat";
import StatusPill from "@/components/(ui)/StatusPill";
import DataTable from "@/components/(ui)/DataTable";
import { ErrorState, Skeleton } from "@/components/(ui)/States";
import BarList from "@/components/(charts)/BarList";
import LineChart from "@/components/(charts)/LineChart";
import HeadPicker from "@/components/(insights)/HeadPicker";

const BACKEND_META: Record<string, { label: string; color: string }> = {
    "snapml-nnpa": { label: "Snap ML on NNPA", color: "var(--h-sepsis)" },
    "snapml-cpu": { label: "Snap ML on CPU", color: "var(--h-hypotension)" },
    "xgboost-cpu": { label: "XGBoost on CPU", color: "var(--h-aki)" },
};

// Request path, in order, from this page to the model.
const PATH = [
    ["This site's server", "Adds the API key; the browser never sees it."],
    ["Caddy on LinuxONE", "HTTPS with a Let's Encrypt certificate; TLS runs on CPACF, the CPU's crypto accelerator."],
    ["FastAPI", "Every endpoint except /health checks the key against hashed keys in SQLite."],
    ["Snap ML", "Five XGBoost heads, one feature pass per bed, on NNPA or the CPU."],
    ["Granite 4.0", "Handover summaries via llama.cpp built with zDNN; reachable only from the API."],
];

export default function () {
    const api = useApiClient();
    const health = useApi("health", (a) => a.health());
    const bench = useApi("benchmark", (a) => a.benchmark());
    const [head, setHead] = useState<Head>("sepsis");
    const [rtt, setRtt] = useState<number | null>(null);

    // Round trip from this browser to the API (through the proxy in live mode).
    useEffect(() => {
        const started = performance.now();
        api.health()
            .then(() => setRtt(performance.now() - started))
            .catch(() => setRtt(null));
    }, [api]);

    const h = health.data;
    const b = bench.data;
    const benchHeads = HEADS.filter((x) => b?.backends.some((be) => be.heads[x]));
    const batches = b?.backends[0]?.heads[head] ? Object.keys(b.backends[0].heads[head]!.batches).sort((x, y) => Number(x) - Number(y)) : [];

    return (
        <div className="page">
            <PageHeader
                title="LinuxONE system"
                description="Where the models run: an IBM LinuxONE VM (s390x, big-endian) with the IBM Integrated Accelerator for AI (NNPA)."
                actions={
                    h && (
                        <StatusPill tone={h.backend === "snapml" ? "success" : "warning"}>
                            {h.backend === "snapml" ? "Trained models loaded" : "Placeholder model (NEWS2 stub)"}
                        </StatusPill>
                    )
                }
            />

            {health.error && !h && <ErrorState error={health.error} onRetry={health.reload} />}
            {!h && !health.error && <Skeleton className="h-[10rem]" />}

            {h && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-[1rem]">
                    <Card bodyClassName="p-[1rem]">
                        <Stat label="Architecture" value={h.arch} sub={`${h.byteorder}-endian`} />
                    </Card>
                    <Card bodyClassName="p-[1rem]">
                        <Stat label="Inference" value={h.backend === "snapml" ? "Snap ML" : h.backend} sub={`Tree format ${h.tree_format ?? "–"} (${h.tree_format === "zdnn_tensors" ? "NNPA" : "CPU"})`} />
                    </Card>
                    <Card bodyClassName="p-[1rem]">
                        <Stat label="Model" value={`${h.heads.length} heads`} sub={`${h.n_features} features, version ${h.model_version}, ${h.ward_beds} ward beds`} />
                    </Card>
                    <Card bodyClassName="p-[1rem]">
                        <Stat label="Round trip from here" value={rtt === null ? "–" : `${rtt.toFixed(0)} ms`} sub={api.source === "live" ? "Browser to LinuxONE and back" : "Demo data, no network"} />
                    </Card>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-[1rem]">
                {h && (
                    <Card title="Held-out AUROC by head">
                        <BarList
                            max={1}
                            items={HEADS.filter((x) => h.test_auroc[x] !== undefined).map((x) => ({
                                id: x,
                                label: HEAD_META[x].label,
                                value: h.test_auroc[x] ?? 0,
                                display: auc(h.test_auroc[x]),
                                color: HEAD_META[x].color,
                            }))}
                        />
                    </Card>
                )}
                <Card title="Request path">
                    <ol className="flex flex-col gap-[.6rem]">
                        {PATH.map(([name, detail], i) => (
                            <li key={name} className="grid grid-cols-[1.75rem_1fr] gap-[.5rem] items-start">
                                <span className="grid place-items-center w-[1.5rem] h-[1.5rem] rounded-full bg-accent-soft text-accent-ink text-[.75rem] font-[700] font-num">{i + 1}</span>
                                <span className="flex flex-col">
                                    <span className="text-[.9rem] font-[600] text-fg">{name}</span>
                                    <span className="text-[.85rem] text-muted">{detail}</span>
                                </span>
                            </li>
                        ))}
                    </ol>
                </Card>
            </div>

            {bench.error && !b && <ErrorState error={bench.error} onRetry={bench.reload} />}

            {b && benchHeads.length > 0 && (
                <Card
                    title="NNPA vs CPU inference"
                    description={b.note ?? "Same exported heads on held-out rows."}
                    actions={<HeadPicker heads={benchHeads} value={head} onChange={setHead} />}
                >
                    <div className="flex flex-row flex-wrap gap-[.5rem]">
                        {b.machine && <StatusPill>{b.machine}</StatusPill>}
                        {Object.entries(b.cpuTimePer10kRows_ms ?? {}).map(([k, v]) => (
                            <StatusPill key={k}>
                                {BACKEND_META[k]?.label ?? k}: {v} ms CPU per 10k rows
                            </StatusPill>
                        ))}
                    </div>
                    <LineChart
                        ariaLabel={`Throughput by batch size for the ${HEAD_META[head].label.toLowerCase()} head`}
                        height={260}
                        xFormat={(x) => compact(10 ** x)}
                        xLabel="Batch of"
                        yFormat={(y) => compact(y)}
                        series={b.backends
                            .filter((be) => be.heads[head])
                            .map((be) => ({
                                id: be.backend,
                                label: `${BACKEND_META[be.backend]?.label ?? be.backend} (rows per second)`,
                                color: BACKEND_META[be.backend]?.color ?? "var(--d-muted)",
                                points: Object.entries(be.heads[head]!.batches).map(([n, r]) => ({ x: Math.log10(Number(n)), y: r.rows_per_s })),
                            }))}
                    />
                    <DataTable
                        caption="Latency per batch size and backend"
                        rows={b.backends.filter((be) => be.heads[head])}
                        rowKey={(be) => be.backend}
                        columns={[
                            { key: "b", header: "Backend", cell: (be) => BACKEND_META[be.backend]?.label ?? be.backend },
                            { key: "f", header: "Tree format", cell: (be) => be.heads[head]!.tree_format },
                            ...batches.map((n) => ({
                                key: n,
                                header: `${Number(n).toLocaleString("en-GB")} rows`,
                                numeric: true,
                                cell: (be: (typeof b.backends)[number]) => ms(be.heads[head]!.batches[n]?.latency_ms ?? NaN),
                            })),
                        ]}
                    />
                </Card>
            )}
        </div>
    );
}
