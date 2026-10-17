import type { Bed, Head } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import type { Tone } from "@/components/(ui)/StatusPill";

export type BedStatus = "discharged" | "both" | "model" | "news2" | "stable";

export function bedStatus(bed: Bed): BedStatus {
    if (bed.discharged) {
        return "discharged";
    }
    const model = HEADS.some((h) => bed.risks[h]?.alert);
    if (model && bed.news2Alert) {
        return "both";
    }
    if (model) {
        return "model";
    }
    return bed.news2Alert ? "news2" : "stable";
}

export const STATUS_META: Record<BedStatus, { label: string; tone: Tone }> = {
    both: { label: "Model + NEWS2 alert", tone: "danger" },
    model: { label: "Model alert", tone: "warning" },
    news2: { label: "NEWS2 alert only", tone: "info" },
    stable: { label: "No alerts", tone: "success" },
    discharged: { label: "Stay ended", tone: "neutral" },
};

export const alertingHeads = (bed: Bed): Head[] => HEADS.filter((h) => bed.risks[h]?.alert);

export type SortKey = "priority" | "bed" | "news2";
export type FilterKey = "all" | "alerting" | Head;

export function sortBeds(beds: Bed[], sort: SortKey) {
    const active = (b: Bed) => (b.discharged ? 1 : 0);
    return [...beds].sort((a, b) => {
        if (sort === "bed") {
            return a.bed - b.bed;
        }
        // Ended stays always sink to the bottom.
        if (active(a) !== active(b)) {
            return active(a) - active(b);
        }
        return sort === "news2" ? b.news2 - a.news2 || b.priority - a.priority : b.priority - a.priority;
    });
}

export function filterBeds(beds: Bed[], filter: FilterKey) {
    if (filter === "all") {
        return beds;
    }
    if (filter === "alerting") {
        return beds.filter((b) => !b.discharged && (alertingHeads(b).length > 0 || b.news2Alert));
    }
    return beds.filter((b) => !b.discharged && b.risks[filter]?.alert);
}

// "2.9× line" reads faster than a raw probability when heads have very different alarm lines.
export const priorityLabel = (p: number) => `${p.toFixed(1)}× line`;
