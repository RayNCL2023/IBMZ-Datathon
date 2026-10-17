"use client";

import { useCallback, useState } from "react";
import { LuPlay } from "react-icons/lu";
import type { News2Response, PredictResponse, VitalRow } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META, HOSPITAL_NAMES } from "@/var/clinical";
import { useModal } from "@/contexts/ModalContext";
import { useApiClient } from "@/contexts/DesignContext";
import { useReplay } from "@/contexts/ReplayContext";
import { useToast } from "@/contexts/ToastContext";
import ModalPrimary from "@/components/(modals)/ModalPrimary";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";
import ButtonGhost from "@/components/(buttons)/ButtonGhost";
import RiskMeter from "@/components/(clinical)/RiskMeter";
import News2Badge from "@/components/(clinical)/News2Badge";
import DriverList from "@/components/(clinical)/DriverList";
import { ErrorState } from "@/components/(ui)/States";

const FIELDS: { key: string; label: string; unit: string; step: number }[] = [
    { key: "HR", label: "Heart rate", unit: "bpm", step: 1 },
    { key: "SBP", label: "Systolic BP", unit: "mmHg", step: 1 },
    { key: "MAP", label: "Mean arterial", unit: "mmHg", step: 1 },
    { key: "DBP", label: "Diastolic BP", unit: "mmHg", step: 1 },
    { key: "O2Sat", label: "SpO₂", unit: "%", step: 1 },
    { key: "Resp", label: "Resp rate", unit: "/min", step: 1 },
    { key: "Temp", label: "Temperature", unit: "°C", step: 0.1 },
    { key: "FiO2", label: "FiO₂", unit: "0.21–1", step: 0.01 },
    { key: "Lactate", label: "Lactate", unit: "mmol/L", step: 0.1 },
    { key: "Creatinine", label: "Creatinine", unit: "mg/dL", step: 0.1 },
    { key: "WBC", label: "White cells", unit: "×10⁹/L", step: 0.1 },
    { key: "Age", label: "Age", unit: "years", step: 1 },
];

const DEFAULTS: VitalRow = { HR: 112, SBP: 98, MAP: 64, DBP: 50, O2Sat: 93, Resp: 24, Temp: 38.4, FiO2: 0.21, Lactate: 2.6, Age: 67 };

function WhatIf({ initial, site, close }: { initial: VitalRow; site: string | null; close: () => void }) {
    const api = useApiClient();
    const { privacy } = useReplay();
    const { push } = useToast();
    const [row, setRow] = useState<VitalRow>(initial);
    const [result, setResult] = useState<{ predict: PredictResponse; news2: News2Response } | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [busy, setBusy] = useState(false);

    async function score(e?: React.FormEvent) {
        e?.preventDefault();
        setBusy(true);
        setError(null);
        // Single row = scored as a first hour (no trend features), exactly as POST /predict documents.
        const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v)));
        try {
            const [predict, news2] = await Promise.all([api.predict({ rows: [clean], site, privacy }), api.news2([clean])]);
            setResult({ predict, news2 });
        } catch (err) {
            setError(err as Error);
            push({ tone: "danger", title: "Scoring failed", description: (err as Error).message });
        } finally {
            setBusy(false);
        }
    }

    const risks = result?.predict.risks[0];
    const n2 = result?.news2;

    return (
        <ModalPrimary
            title="What-if scoring"
            description={`Change observations and score them live with every head${site ? ` using ${HOSPITAL_NAMES[site] ?? site}'s calibration` : ""}. One hour, no trend, so treat it as a sensitivity check rather than a patient's real risk.`}
            onClose={close}
            footer={
                <>
                    <ButtonGhost onClick={close}>Close</ButtonGhost>
                    <ButtonPrimary type="submit" form="what-if" disabled={busy} aria-busy={busy}>
                        <LuPlay size={16} /> {busy ? "Scoring…" : "Score"}
                    </ButtonPrimary>
                </>
            }
        >
            <form id="what-if" onSubmit={score} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-[.75rem]">
                {FIELDS.map((f) => (
                    <label key={f.key} className="flex flex-col gap-[.25rem] text-[.8125rem] text-muted">
                        <span>
                            {f.label} <span className="text-faint">({f.unit})</span>
                        </span>
                        <input
                            type="number"
                            inputMode="decimal"
                            step={f.step}
                            value={row[f.key] ?? ""}
                            onChange={(e) => setRow((r) => ({ ...r, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                            className="min-h-[var(--d-control)] px-[.6rem] rounded-control border-[1px] border-line-strong bg-surface text-fg text-[1rem] font-num"
                        />
                    </label>
                ))}
            </form>

            {error && <ErrorState error={error} onRetry={() => score()} />}

            {risks && n2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-[1.25rem] pt-[1rem] border-t-[1px] border-line">
                    <div className="flex flex-col gap-[.6rem]">
                        <div className="flex flex-row flex-wrap items-center gap-[.5rem]">
                            <News2Badge score={n2.scores[0]} alert={n2.alert[0]} />
                            <span className="text-[.8125rem] text-muted font-num">
                                Scored in {result!.predict.latency_ms.toFixed(2)} ms on {api.source === "live" ? "LinuxONE" : "demo data"}
                            </span>
                        </div>
                        {HEADS.filter((h) => risks[h]).map((h) => (
                            <RiskMeter key={h} head={h} risk={risks[h]!.risk} threshold={risks[h]!.threshold} alert={risks[h]!.alert} />
                        ))}
                        <div className="flex flex-row flex-wrap gap-[.35rem] pt-[.25rem] text-[.8125rem] text-muted font-num">
                            NEWS2 points:
                            {Object.entries(n2.components[0]).map(([k, v]) => (
                                <span key={k} className={v ? "text-fg font-[600]" : ""}>
                                    {k} {v}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-[.5rem]">
                        <span className="text-[.85rem] font-[600] text-fg">What is driving {HEAD_META[result!.predict.topRisk[0]].label.toLowerCase()}</span>
                        <DriverList head={result!.predict.topRisk[0]} drivers={risks[result!.predict.topRisk[0]]?.drivers ?? []} />
                    </div>
                </div>
            )}
        </ModalPrimary>
    );
}

export function useWhatIf() {
    const { open } = useModal();
    return useCallback(
        (initial?: VitalRow, site: string | null = null) =>
            open((close) => <WhatIf initial={{ ...DEFAULTS, ...stripNull(initial) }} site={site} close={close} />, {
                label: "What-if scoring",
                size: "xl",
                key: "what-if",
            }),
        [open],
    );
}

function stripNull(row?: VitalRow) {
    return Object.fromEntries(Object.entries(row ?? {}).filter(([, v]) => v !== null && v !== undefined));
}
