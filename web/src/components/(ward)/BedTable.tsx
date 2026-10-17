"use client";

import { LuTriangleAlert } from "react-icons/lu";
import type { Bed } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META, HOSPITAL_NAMES } from "@/var/clinical";
import { bedStatus, priorityLabel } from "@/lib/ward";
import { num, pct, bedNo } from "@/lib/format";
import { useReplay } from "@/contexts/ReplayContext";
import PatientLink from "@/components/(patient)/PatientLink";
import News2Badge from "@/components/(clinical)/News2Badge";
import BedStatusPill from "@/components/(ward)/BedStatusPill";
import s from "./BedTable.module.scss";

// "table" layout (Clinical design default): every bed on one screen, every head in its own column.
export default function ({ beds }: { beds: Bed[] }) {
    const { groundTruth } = useReplay();
    return (
        <div className={s.wrap}>
            <table className={s.table}>
                <caption className="sr-only">Ward beds with risk per head, NEWS2 and current observations</caption>
                <thead>
                    <tr>
                        <th scope="col">Bed</th>
                        <th scope="col">Status</th>
                        <th scope="col">NEWS2</th>
                        {HEADS.map((h) => (
                            <th key={h} scope="col" className={s.num}>
                                <span className={s.headTitle}>
                                    <i style={{ background: HEAD_META[h].color }} aria-hidden />
                                    {HEAD_META[h].short}
                                </span>
                            </th>
                        ))}
                        <th scope="col" className={s.num}>Highest</th>
                        <th scope="col" className={s.num}>HR</th>
                        <th scope="col" className={s.num}>MAP</th>
                        <th scope="col" className={s.num}>SpO₂</th>
                        <th scope="col" className={s.num}>Resp</th>
                        <th scope="col" className={s.num}>Temp</th>
                    </tr>
                </thead>
                <tbody>
                    {beds.map((bed) => (
                        <tr key={bed.patientId} data-status={bedStatus(bed)}>
                            <th scope="row">
                                <PatientLink patientId={bed.patientId} className={s.bedLink}>
                                    <strong>Bed {bedNo(bed.bed)}</strong>
                                    <span>
                                        {bed.patientId}, {HOSPITAL_NAMES[bed.hospital] ?? bed.hospital}, {bed.discharged ? "ended" : `${bed.hour + 1} h`}
                                        {groundTruth && bed.label === 1 ? ", labelled septic" : ""}
                                    </span>
                                </PatientLink>
                            </th>
                            <td>
                                <BedStatusPill bed={bed} />
                            </td>
                            <td>
                                <News2Badge score={bed.news2} alert={bed.news2Alert} />
                            </td>
                            {HEADS.map((h) => {
                                const r = bed.risks[h];
                                return (
                                    <td key={h} className={s.num} data-alert={r?.alert || undefined}>
                                        {r ? (
                                            <span className={s.risk} title={`Alarm line ${pct(r.threshold, 1)}`}>
                                                {r.alert && <LuTriangleAlert size={13} aria-label="above alarm line" />}
                                                {pct(r.risk, 1)}
                                            </span>
                                        ) : (
                                            "–"
                                        )}
                                    </td>
                                );
                            })}
                            <td className={s.num}>{bed.discharged ? "–" : `${HEAD_META[bed.topRisk].short} ${priorityLabel(bed.priority)}`}</td>
                            <td className={s.num}>{num(bed.vitals.HR)}</td>
                            <td className={s.num}>{num(bed.vitals.MAP)}</td>
                            <td className={s.num}>{num(bed.vitals.O2Sat)}</td>
                            <td className={s.num}>{num(bed.vitals.Resp)}</td>
                            <td className={s.num}>{num(bed.vitals.Temp, 1)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
