"use client";

import { twMerge } from "tailwind-merge";
import type { Bed, VitalKey } from "@/lib/api/types";
import { bedStatus, priorityLabel } from "@/lib/ward";
import { HEAD_META } from "@/var/clinical";
import PatientLink from "@/components/(patient)/PatientLink";
import VitalReadout from "@/components/(clinical)/VitalReadout";
import RiskStack from "@/components/(clinical)/RiskStack";
import News2Badge from "@/components/(clinical)/News2Badge";
import BedStatusPill from "@/components/(ward)/BedStatusPill";
import BedMeta from "@/components/(ward)/BedMeta";
import s from "./BedCard.module.scss";

const CARD_VITALS: VitalKey[] = ["HR", "MAP", "O2Sat", "Resp", "Temp"];

// "cards" layout (Ward design default): one document-like card per bed.
export default function ({ bed }: { bed: Bed }) {
    const status = bedStatus(bed);
    return (
        <PatientLink patientId={bed.patientId} className={s.card} data-status={status} aria-label={`Bed ${bed.bed}, open patient ${bed.patientId}`}>
            <div className="flex flex-row items-start justify-between gap-[.75rem]">
                <div className="flex flex-col gap-[.4rem] min-w-0">
                    <h3 className="text-[1.05rem] font-[650] text-fg">Bed {bed.bed}</h3>
                    <BedMeta bed={bed} />
                </div>
                <BedStatusPill bed={bed} />
            </div>

            <div className={twMerge("grid grid-cols-3 sm:grid-cols-5 gap-[.5rem] py-[.75rem] border-y-[1px] border-line", bed.discharged && "opacity-50")}>
                {CARD_VITALS.map((k) => (
                    <VitalReadout key={k} k={k} value={bed.vitals[k]} />
                ))}
            </div>

            <RiskStack risks={bed.risks} compact />

            <div className="flex flex-row flex-wrap items-center justify-between gap-[.5rem] text-[.8rem] text-muted">
                <News2Badge score={bed.news2} alert={bed.news2Alert} />
                {!bed.discharged && (
                    <span className="font-num">
                        Highest: {HEAD_META[bed.topRisk].label.toLowerCase()} at {priorityLabel(bed.priority)}
                    </span>
                )}
            </div>
        </PatientLink>
    );
}
