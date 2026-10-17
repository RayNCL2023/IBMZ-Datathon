"use client";

import type { Bed } from "@/lib/api/types";
import { HOSPITAL_NAMES } from "@/var/clinical";
import { useReplay } from "@/contexts/ReplayContext";
import PillBase from "@/components/(ui)/PillBase";
import StatusPill from "@/components/(ui)/StatusPill";

// Patient id, site, time in ICU and (demo only) the retrospective sepsis label.
export default function ({ bed }: { bed: Bed }) {
    const { groundTruth } = useReplay();
    return (
        <div className="flex flex-row flex-wrap items-center gap-[.35rem]">
            <PillBase className="font-num">{bed.patientId}</PillBase>
            <PillBase>{HOSPITAL_NAMES[bed.hospital] ?? bed.hospital}</PillBase>
            <PillBase className="font-num">
                {bed.discharged ? `Stay ended at ${bed.lengthOfStay} h` : `${bed.hour + 1} h of ${bed.lengthOfStay} h`}
            </PillBase>
            {groundTruth && bed.label === 1 && (
                <StatusPill tone="danger" title="Retrospective PhysioNet label: sepsis onset within 6 h or ongoing">
                    Labelled septic
                </StatusPill>
            )}
        </div>
    );
}
