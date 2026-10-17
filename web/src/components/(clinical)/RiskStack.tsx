import type { Risks } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import RiskMeter from "@/components/(clinical)/RiskMeter";

// All five heads in the fixed order, so the same risk is always in the same place on every bed.
export default function ({ risks, compact }: { risks: Risks; compact?: boolean }) {
    return (
        <div className="flex flex-col gap-[.4rem]">
            {HEADS.filter((h) => risks[h]).map((h) => (
                <RiskMeter key={h} head={h} risk={risks[h]!.risk} threshold={risks[h]!.threshold} alert={risks[h]!.alert} compact={compact} />
            ))}
        </div>
    );
}
