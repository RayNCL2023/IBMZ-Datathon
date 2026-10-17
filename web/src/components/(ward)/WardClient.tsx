"use client";

import { useEffect, useState } from "react";
import { useWard } from "@/contexts/WardContext";
import { useDesign } from "@/contexts/DesignContext";
import { useReplay } from "@/contexts/ReplayContext";
import { filterBeds, sortBeds, type FilterKey, type SortKey } from "@/lib/ward";
import PageHeader from "@/components/(shell)/PageHeader";
import WardToolbar, { type WardLayout } from "@/components/(ward)/WardToolbar";
import BedCard from "@/components/(ward)/BedCard";
import BedTable from "@/components/(ward)/BedTable";
import BedTile from "@/components/(ward)/BedTile";
import BayMap from "@/components/(ward)/BayMap";
import Segmented from "@/components/(ui)/Segmented";
import { storage } from "@/lib/storage";
import { clockLabel } from "@/lib/format";
import { EmptyState, ErrorState, Skeleton } from "@/components/(ui)/States";

export type WardMode = "simple" | "analytical";
const MODE_KEY = "lx.wardMode";

const GRID: Record<Exclude<WardLayout, "table">, string> = {
    cards: "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-[1rem]",
    tiles: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-[.75rem]",
};

export default function () {
    const { beds, data, error, reload } = useWard();
    const { config } = useDesign();
    const { hour, privacy } = useReplay();
    const [filter, setFilter] = useState<FilterKey>("all");
    const [sort, setSort] = useState<SortKey>("priority");
    const [layout, setLayout] = useState<WardLayout>(config.wardLayout);
    const [mode, setModeState] = useState<WardMode>("simple");

    useEffect(() => {
        if (storage.get(MODE_KEY) === "analytical") {
            setModeState("analytical");
        }
    }, []);

    const setMode = (m: WardMode) => {
        storage.set(MODE_KEY, m);
        setModeState(m);
    };

    // Each design brings its own default layout; the toolbar can still switch.
    useEffect(() => setLayout(config.wardLayout), [config.wardLayout]);

    const shown = sortBeds(filterBeds(beds, filter), sort);

    return (
        <div className="page">
            <PageHeader
                title="ICU ward"
                actions={
                    <Segmented
                        label="Ward view"
                        value={mode}
                        onChange={setMode}
                        className="rounded-full [&>button]:rounded-full [&>button]:px-[1rem]"
                        options={[
                            { value: "simple", label: "Simple", title: "Floor plan: pinging beds with every alert at a glance" },
                            { value: "analytical", label: "Analytical", title: "Every value, sortable" },
                        ]}
                    />
                }
                description={`Twelve held-out ICU stays replayed hour by hour on LinuxONE. Showing ${clockLabel(hour)} (hour ${hour})${privacy ? ` with the federated sepsis model (ε = ${privacy})` : ""}.`}
            />

            {error && !data && <ErrorState error={error} onRetry={reload} />}

            {!data && !error && (
                <div className={GRID.cards}>
                    {Array.from({ length: 6 }, (_, i) => (
                        <Skeleton key={i} className="h-[17rem]" />
                    ))}
                </div>
            )}

            {data && (
                <>
                    <WardToolbar mode={mode} beds={beds} filter={filter} setFilter={setFilter} sort={sort} setSort={setSort} layout={layout} setLayout={setLayout} />
                    {mode === "simple" && <BayMap beds={beds} filter={filter} sort={sort} />}
                    {mode === "analytical" && !shown.length && (
                        <EmptyState title="No beds match this filter">Choose All beds to see the whole ward.</EmptyState>
                    )}
                    {mode === "analytical" && shown.length > 0 && layout === "table" && <BedTable beds={shown} />}
                    {mode === "analytical" && shown.length > 0 && layout !== "table" && (
                        <div className={GRID[layout]}>
                            {shown.map((bed) => (layout === "cards" ? <BedCard key={bed.patientId} bed={bed} /> : <BedTile key={bed.patientId} bed={bed} />))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
