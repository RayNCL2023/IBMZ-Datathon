import type { Driver, Head } from "@/lib/api/types";
import { HEAD_META, readable } from "@/var/clinical";
import BarList from "@/components/(charts)/BarList";

// What pushed this head's risk up: the API resets each clinical variable to the population value and measures
// how far the risk falls (occlusion). Values are absolute risk points.
export default function ({ head, drivers, max }: { head: Head; drivers: Driver[]; max?: number }) {
    if (!drivers.length) {
        return <p className="text-[.85rem] text-muted">No single variable is pushing this risk up.</p>;
    }
    return (
        <BarList
            max={max}
            items={drivers.map((d) => ({
                id: d.feature,
                label: readable(d.feature),
                value: d.contribution,
                display: `+${(d.contribution * 100).toFixed(1)} pts`,
                color: HEAD_META[head].color,
            }))}
        />
    );
}
