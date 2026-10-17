"use client";

import { twMerge } from "tailwind-merge";
import { useWard } from "@/contexts/WardContext";
import { bedStatus } from "@/lib/ward";
import PatientLink from "@/components/(patient)/PatientLink";
import { bedNo } from "@/lib/format";

const DOT: Record<string, string> = {
    both: "bg-danger",
    model: "bg-warn",
    news2: "bg-accent",
    stable: "bg-ok",
    discharged: "bg-line-strong",
};

// Notion-style page tree of the twelve beds, with a status dot and the priority ratio.
export default function ({ onNavigate }: { onNavigate?: () => void }) {
    const { beds } = useWard();
    if (!beds.length) {
        return null;
    }
    const occupied = beds.filter((b) => !b.discharged).length;
    return (
        <div className="flex flex-col gap-[.15rem]">
            <div className="flex flex-row items-baseline justify-between px-[.6rem] pb-[.25rem] text-[.8125rem] text-faint" title={`${beds.length - occupied} stays ended`}>
                <span className="font-[600]">Beds</span>
                <span className="font-num">
                    <b className="font-[600] text-muted">{occupied}</b>/{beds.length} occupied
                </span>
            </div>
            {beds.map((b) => {
                const status = bedStatus(b);
                return (
                    <PatientLink
                        key={b.patientId}
                        patientId={b.patientId}
                        onClick={onNavigate}
                        className="flex flex-row items-center gap-[.6rem] min-h-[2rem] px-[.6rem] rounded-control text-[.85rem] text-muted hover:bg-hover hover:text-fg"
                    >
                        <i aria-hidden className={twMerge("w-[.5rem] h-[.5rem] rounded-full shrink-0", DOT[status])} />
                        <span className={twMerge("flex-1 truncate", (status === "both" || status === "model") && "text-fg font-[600]")}>Bed {bedNo(b.bed)}</span>
                        <span className="text-[.8125rem] text-faint font-num">{b.discharged ? "ended" : `${b.priority.toFixed(1)}×`}</span>
                        <span className="sr-only">{status}</span>
                    </PatientLink>
                );
            })}
        </div>
    );
}
