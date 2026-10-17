"use client";

import { twMerge } from "tailwind-merge";
import { useWard } from "@/contexts/WardContext";
import { bedStatus } from "@/lib/ward";
import PatientLink from "@/components/(patient)/PatientLink";

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
    return (
        <div className="flex flex-col gap-[.15rem]">
            <span className="px-[.6rem] pb-[.25rem] text-[.75rem] font-[600] text-faint">Beds</span>
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
                        <span className={twMerge("flex-1 truncate", (status === "both" || status === "model") && "text-fg font-[600]")}>Bed {b.bed}</span>
                        <span className="text-[.75rem] text-faint font-num">{b.discharged ? "ended" : `${b.priority.toFixed(1)}×`}</span>
                        <span className="sr-only">{status}</span>
                    </PatientLink>
                );
            })}
        </div>
    );
}
