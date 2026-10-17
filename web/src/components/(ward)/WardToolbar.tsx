"use client";

import { twMerge } from "tailwind-merge";
import type { Bed } from "@/lib/api/types";
import { HEADS } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { filterBeds, type FilterKey, type SortKey } from "@/lib/ward";
import Segmented from "@/components/(ui)/Segmented";
import { useDesign } from "@/contexts/DesignContext";

export type WardLayout = "cards" | "table" | "tiles";

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
    return (
        <button
            aria-pressed={active}
            onClick={onClick}
            className={twMerge(
                "inline-flex flex-row items-center gap-[.4rem] min-h-[calc(var(--d-control)-.25rem)] px-[.7rem] rounded-full border-[1px] border-line text-[.85rem] font-[550] text-muted hover:text-fg hover:bg-hover",
                active && "bg-accent-soft text-accent-ink border-transparent",
            )}
        >
            {color && <i aria-hidden className="w-[.5rem] h-[.5rem] rounded-[2px]" style={{ background: color }} />}
            {children}
        </button>
    );
}

export default function ({
    beds,
    filter,
    setFilter,
    sort,
    setSort,
    layout,
    setLayout,
}: {
    beds: Bed[];
    filter: FilterKey;
    setFilter: (f: FilterKey) => void;
    sort: SortKey;
    setSort: (s: SortKey) => void;
    layout: WardLayout;
    setLayout: (l: WardLayout) => void;
}) {
    const { advanced } = useDesign();
    const count = (f: FilterKey) => filterBeds(beds, f).length;
    return (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-[.75rem]">
            <div className="flex flex-row flex-wrap gap-[.4rem]" role="group" aria-label="Filter beds">
                <Chip active={filter === "all"} onClick={() => setFilter("all")}>
                    All beds <span className="font-num">{beds.length}</span>
                </Chip>
                <Chip active={filter === "alerting"} onClick={() => setFilter("alerting")}>
                    Any alert <span className="font-num">{count("alerting")}</span>
                </Chip>
                {HEADS.map((h) => (
                    <Chip key={h} active={filter === h} onClick={() => setFilter(filter === h ? "all" : h)} color={HEAD_META[h].color}>
                        {HEAD_META[h].short} <span className="font-num">{count(h)}</span>
                    </Chip>
                ))}
            </div>
            <div className="flex flex-row flex-wrap gap-[.5rem]">
                <Segmented
                    label="Sort beds"
                    value={sort}
                    onChange={setSort}
                    options={[
                        { value: "priority", label: "Priority", title: "Highest risk relative to its alarm line first" },
                        { value: "news2", label: "NEWS2" },
                        { value: "bed", label: "Bed" },
                    ]}
                />
                {advanced && (
                <Segmented
                    label="Layout"
                    value={layout}
                    onChange={setLayout}
                    options={[
                        { value: "cards", label: "Cards" },
                        { value: "table", label: "Table" },
                        { value: "tiles", label: "Tiles" },
                    ]}
                />
                )}
            </div>
        </div>
    );
}
