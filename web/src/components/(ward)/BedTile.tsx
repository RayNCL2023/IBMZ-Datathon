"use client";

import { LuTriangleAlert } from "react-icons/lu";
import type { Bed, VitalKey } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { bedStatus, priorityLabel, STATUS_META } from "@/lib/ward";
import { pct, bedNo } from "@/lib/format";
import PatientLink from "@/components/(patient)/PatientLink";
import VitalReadout from "@/components/(clinical)/VitalReadout";
import s from "./BedTile.module.scss";

const TILE_VITALS: VitalKey[] = ["HR", "MAP", "O2Sat"];

// "tiles" layout (Night design default): a central-station tile, readable from across the room.
export default function ({ bed }: { bed: Bed }) {
    const status = bedStatus(bed);
    return (
        <PatientLink patientId={bed.patientId} className={s.tile} data-status={status} aria-label={`Bed ${bedNo(bed.bed)}, ${STATUS_META[status].label}`}>
            <div className="flex flex-row items-start justify-between gap-[.5rem]">
                <span className={s.bed}>{bedNo(bed.bed)}</span>
                <span className={s.status}>
                    {(status === "both" || status === "model") && <LuTriangleAlert size={14} aria-hidden />}
                    {STATUS_META[status].label}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-[.5rem]">
                {TILE_VITALS.map((k) => (
                    <VitalReadout key={k} k={k} value={bed.vitals[k]} size="lg" />
                ))}
            </div>

            <div className={s.heads} aria-label="Risk per head relative to its alarm line">
                {HEADS.map((h) => {
                    const r = bed.risks[h];
                    if (!r) {
                        return null;
                    }
                    const fill = Math.min(1, r.risk / Math.max(r.threshold * 3, 1e-6));
                    return (
                        <div key={h} className={s.head} data-alert={r.alert || undefined} title={`${HEAD_META[h].label} ${pct(r.risk, 1)}, line ${pct(r.threshold, 1)}`}>
                            <span className={s.bar} style={{ "--head": HEAD_META[h].color, "--fill": fill } as React.CSSProperties} />
                            <span className={s.headLabel}>{HEAD_META[h].short}</span>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-row items-center justify-between text-[.8125rem] text-muted font-num">
                <span>
                    NEWS2 <b className="text-fg">{bed.news2}</b>
                    {bed.news2Alert ? " alert" : ""}
                </span>
                <span>{bed.discharged ? `ended ${bed.lengthOfStay} h` : `${HEAD_META[bed.topRisk].short} ${priorityLabel(bed.priority)}`}</span>
            </div>
        </PatientLink>
    );
}
