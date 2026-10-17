import type { Bed } from "@/lib/api/types";
import { bedStatus, STATUS_META } from "@/lib/ward";
import StatusPill from "@/components/(ui)/StatusPill";

export default function ({ bed, className }: { bed: Bed; className?: string }) {
    const meta = STATUS_META[bedStatus(bed)];
    return (
        <StatusPill tone={meta.tone} className={className}>
            {meta.label}
        </StatusPill>
    );
}
