"use client";

import type { PatientResponse } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { useReplay } from "@/contexts/ReplayContext";
import Card from "@/components/(ui)/Card";
import StatusPill from "@/components/(ui)/StatusPill";

// First alarm per head against NEWS2's first alarm (and, for sepsis with ground truth on, the labelled onset).
// This is the core claim of the project, so it gets a plain table rather than a chart.
export default function ({ patient: p }: { patient: PatientResponse }) {
    const { groundTruth } = useReplay();
    const n2 = p.news2FirstAlert;
    const onset = groundTruth ? p.sepsisOnset : null;
    const sepsisFirst = p.firstAlert.sepsis ?? null;

    return (
        <Card
            title="Early warning"
            description="When each model head first raised an alarm during this stay, compared with NEWS2 (aggregate ≥ 5 or any parameter scoring 3)."
            actions={
                onset !== null &&
                sepsisFirst !== null &&
                sepsisFirst < onset && (
                    <StatusPill tone="success">
                        Sepsis alarm {onset - sepsisFirst} h before labelled onset
                    </StatusPill>
                )
            }
        >
            <div className="overflow-x-auto">
                <table className="w-full text-[.875rem] border-collapse">
                    <thead>
                        <tr className="text-left text-muted text-[.8rem]">
                            <th className="font-[600] py-[.4rem] pr-[1rem]">Risk</th>
                            <th className="font-[600] py-[.4rem] pr-[1rem]">First model alarm</th>
                            <th className="font-[600] py-[.4rem] pr-[1rem]">First NEWS2 alarm</th>
                            <th className="font-[600] py-[.4rem]">Difference</th>
                        </tr>
                    </thead>
                    <tbody className="font-num">
                        {HEADS.filter((h) => h in p.firstAlert).map((h) => {
                            const first = p.firstAlert[h] ?? null;
                            const lead = first !== null && n2 !== null ? n2 - first : null;
                            return (
                                <tr key={h} className="border-t-[1px] border-line">
                                    <td className="py-[.5rem] pr-[1rem]">
                                        <span className="inline-flex items-center gap-[.45rem] text-fg">
                                            <i aria-hidden className="w-[.5rem] h-[.5rem] rounded-[2px]" style={{ background: HEAD_META[h].color }} />
                                            {HEAD_META[h].label}
                                        </span>
                                    </td>
                                    <td className="py-[.5rem] pr-[1rem] text-fg">{first === null ? "No alarm yet" : `Hour ${first}`}</td>
                                    <td className="py-[.5rem] pr-[1rem] text-muted">{n2 === null ? "No alarm yet" : `Hour ${n2}`}</td>
                                    <td className="py-[.5rem]">
                                        {lead === null && <span className="text-faint">–</span>}
                                        {lead !== null && lead > 0 && <span className="text-ok-ink font-[600]">{lead} h earlier</span>}
                                        {lead !== null && lead === 0 && <span className="text-muted">Same hour</span>}
                                        {lead !== null && lead < 0 && <span className="text-muted">{-lead} h later</span>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}
