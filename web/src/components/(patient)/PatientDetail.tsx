"use client";

import { twMerge } from "tailwind-merge";
import { LuFlaskConical } from "react-icons/lu";
import { useApi } from "@/lib/api/useApi";
import { HEADS } from "@/lib/api/types";
import { HEAD_META, HOSPITAL_NAMES } from "@/var/clinical";
import { flags } from "@/var/flags";
import { useReplay } from "@/contexts/ReplayContext";
import { useDesign } from "@/contexts/DesignContext";
import Card from "@/components/(ui)/Card";
import PillBase from "@/components/(ui)/PillBase";
import StatusPill from "@/components/(ui)/StatusPill";
import { ErrorState, Skeleton } from "@/components/(ui)/States";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import RiskMeter from "@/components/(clinical)/RiskMeter";
import DriverList from "@/components/(clinical)/DriverList";
import News2Badge from "@/components/(clinical)/News2Badge";
import VitalReadout from "@/components/(clinical)/VitalReadout";
import EarlyWarning from "@/components/(patient)/EarlyWarning";
import RiskTimeline from "@/components/(patient)/RiskTimeline";
import VitalsTrends from "@/components/(patient)/VitalsTrends";
import HandoverPanel from "@/components/(patient)/HandoverPanel";
import { useWhatIf } from "@/components/(patient)/WhatIfModal";
import { bedNo } from "@/lib/format";

// The whole patient view. Rendered as a page (/patient/[id]) and inside the side peek; `variant` only changes
// the outer layout. Data: GET /patient/{id}?hour=&privacy= (never shows hours after the replay clock).
export default function ({ patientId, variant = "page" }: { patientId: string; variant?: "page" | "peek" }) {
    const { hour, privacy, groundTruth } = useReplay();
    const { data: p, error, reload } = useApi(`patient:${patientId}:${hour}:${privacy ?? ""}`, (api) => api.patient(patientId, hour, privacy));
    const whatIf = useWhatIf();
    const { advanced } = useDesign();

    if (error && !p) {
        return (
            <div className="p-[1.25rem]">
                <ErrorState error={error} onRetry={reload} />
            </div>
        );
    }

    if (!p) {
        return (
            <div className="flex flex-col gap-[1rem] p-[1.25rem]">
                <Skeleton className="h-[3rem] w-[60%]" />
                <Skeleton className="h-[18rem]" />
                <Skeleton className="h-[12rem]" />
            </div>
        );
    }

    const now = p.timeline[p.timeline.length - 1];
    const alerting = HEADS.filter((h) => now.risks[h]?.alert);
    const ended = hour >= p.lengthOfStay;

    return (
        <div className={twMerge("flex flex-col gap-[1rem]", variant === "peek" && "p-[1.25rem]")}>
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-[1rem]">
                <div className="flex flex-col gap-[.5rem]">
                    <h2 className={twMerge("font-[700] tracking-[-0.025em] text-fg", variant === "page" ? "text-[2rem]" : "text-[1.5rem]")}>
                        Bed {bedNo(p.bed)}
                    </h2>
                    <div className="flex flex-row flex-wrap items-center gap-[.35rem]">
                        <PillBase className="font-num">{p.patientId}</PillBase>
                        <PillBase>{HOSPITAL_NAMES[p.hospital] ?? p.hospital}</PillBase>
                        <PillBase className="font-num">
                            {ended ? `Stay ended at ${p.lengthOfStay} h` : `Hour ${now.hour} of ${p.lengthOfStay - 1}`}
                        </PillBase>
                        <News2Badge score={now.news2} alert={now.news2Alert} />
                        {alerting.length > 0 ? (
                            <StatusPill tone="warning">
                                {alerting.length} {alerting.length === 1 ? "risk" : "risks"} above alarm line
                            </StatusPill>
                        ) : (
                            <StatusPill tone="success">No model alerts</StatusPill>
                        )}
                        {groundTruth && p.sepsisOnset !== null && <StatusPill tone="danger">Sepsis onset at hour {p.sepsisOnset} (label)</StatusPill>}
                    </div>
                </div>
                {flags.whatIf && advanced && (
                    <ButtonSecondary onClick={() => whatIf({ ...now.vitals }, p.hospital)}>
                        <LuFlaskConical size={16} /> What-if from current vitals
                    </ButtonSecondary>
                )}
            </section>

            <div className="grid grid-cols-3 md:grid-cols-6 gap-[1rem] p-[1rem] bg-surface border-[1px] border-line rounded-card">
                {(["HR", "MAP", "SBP", "O2Sat", "Resp", "Temp"] as const).map((k) => (
                    <VitalReadout key={k} k={k} value={now.vitals[k]} size="lg" />
                ))}
            </div>

            <RiskTimeline patient={p} />

            <EarlyWarning patient={p} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-[1rem]">
                <Card title="Risk now" description="Each bar is scaled to three times that head's own alarm line (the tick).">
                    <div className="flex flex-col gap-[.55rem]">
                        {HEADS.filter((h) => now.risks[h]).map((h) => (
                            <RiskMeter key={h} head={h} risk={now.risks[h]!.risk} threshold={p.thresholds[h] ?? 0} alert={now.risks[h]!.alert} />
                        ))}
                    </div>
                </Card>
                <Card title="What is driving it" description="Rise in risk when each variable is reset to the population value. Highest heads first.">
                    <div className="flex flex-col gap-[1rem]">
                        {[...HEADS]
                            .filter((h) => now.risks[h])
                            .sort((a, b) => now.risks[b]!.risk / (p.thresholds[b] ?? 1) - now.risks[a]!.risk / (p.thresholds[a] ?? 1))
                            .slice(0, 3)
                            .map((h) => (
                                <div key={h} className="flex flex-col gap-[.45rem]">
                                    <span className="text-[.85rem] font-[600] text-fg">{HEAD_META[h].label}</span>
                                    <DriverList head={h} drivers={p.drivers[h] ?? []} />
                                </div>
                            ))}
                    </div>
                </Card>
            </div>

            {flags.handover && <HandoverPanel patientId={p.patientId} hour={now.hour} />}

            <VitalsTrends patient={p} />
        </div>
    );
}
