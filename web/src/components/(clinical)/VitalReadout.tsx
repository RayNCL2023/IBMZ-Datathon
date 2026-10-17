import { twMerge } from "tailwind-merge";
import type { VitalKey } from "@/lib/api/types";
import { VITAL_META } from "@/var/clinical";
import { num } from "@/lib/format";

export function isAbnormal(key: VitalKey, v: number | null) {
    const m = VITAL_META[key];
    if (v === null) {
        return false;
    }
    return (m.low !== undefined && v < m.low) || (m.high !== undefined && v > m.high);
}

// One observation: label, value, unit. Out-of-band values (NEWS2 scoring bands) are bold with a marker.
export default function ({ k, value, size = "md", className }: { k: VitalKey; value: number | null; size?: "md" | "lg"; className?: string }) {
    const meta = VITAL_META[k];
    const abnormal = isAbnormal(k, value);
    return (
        <div className={twMerge("flex flex-col min-w-0", className)}>
            <span className="text-[.8125rem] text-muted whitespace-nowrap">{meta.label}</span>
            <span className="flex flex-row items-baseline gap-[.25rem] font-num">
                <span
                    className={twMerge(
                        "font-[600] text-fg",
                        size === "lg" ? "text-[1.6rem] leading-[1.1] tracking-[-0.02em]" : "text-[1rem]",
                        abnormal && "text-danger-ink",
                        value === null && "text-faint font-[400]",
                    )}
                >
                    {num(value, meta.digits)}
                </span>
                <span className="text-[.8125rem] text-faint">{meta.unit}</span>
                {abnormal && <span className="sr-only">outside normal range</span>}
                {abnormal && (
                    <span aria-hidden className="text-[.8125rem] text-danger-ink font-[700]">
                        !
                    </span>
                )}
            </span>
        </div>
    );
}
