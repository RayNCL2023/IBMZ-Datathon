"use client";

import type { Bed } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { bedStatus, priorityLabel } from "@/lib/ward";
import Stat from "@/components/(ui)/Stat";
import PatientLink from "@/components/(patient)/PatientLink";

// The four numbers a nurse in charge wants first: who is in, who is alarming, where the model sees
// something NEWS2 doesn't yet, and who to look at next.
export default function ({ beds }: { beds: Bed[] }) {
    const active = beds.filter((b) => !b.discharged);
    const statuses = active.map(bedStatus);
    const model = statuses.filter((st) => st === "model" || st === "both").length;
    const news2 = active.filter((b) => b.news2Alert).length;
    const earlyOnly = statuses.filter((st) => st === "model").length;
    const next = [...active].sort((a, b) => b.priority - a.priority)[0];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 bg-surface border-[1px] border-line rounded-card">
            <Stat className="p-[1rem] border-r-[1px] border-b-[1px] lg:border-b-0 border-line" label="Occupied beds" value={`${active.length}/${beds.length}`} sub={`${beds.length - active.length} stays ended`} />
            <Stat
                className="p-[1rem] border-b-[1px] lg:border-b-0 lg:border-r-[1px] border-line"
                label="Model alerts"
                value={model}
                sub={`NEWS2 alerting on ${news2} ${news2 === 1 ? "bed" : "beds"}`}
            />
            <Stat
                className="p-[1rem] border-r-[1px] border-line"
                label="Model only (NEWS2 quiet)"
                value={earlyOnly}
                sub="Where the model sees risk before NEWS2"
            />
            {next ? (
                <PatientLink patientId={next.patientId} className="p-[1rem] hover:bg-hover rounded-r-card">
                    <Stat
                        label="Review next"
                        value={`Bed ${next.bed}`}
                        sub={`${HEAD_META[next.topRisk].label} at ${priorityLabel(next.priority)}`}
                    />
                </PatientLink>
            ) : (
                <Stat className="p-[1rem]" label="Review next" value="–" />
            )}
        </div>
    );
}
