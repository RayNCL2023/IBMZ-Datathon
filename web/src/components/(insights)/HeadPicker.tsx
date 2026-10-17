"use client";

import type { Head } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import Segmented from "@/components/(ui)/Segmented";

export default function ({ heads, value, onChange }: { heads: Head[]; value: Head; onChange: (h: Head) => void }) {
    return (
        <Segmented
            label="Risk head"
            value={value}
            onChange={onChange}
            className="flex-wrap"
            options={heads.map((h) => ({
                value: h,
                label: (
                    <span className="inline-flex items-center gap-[.4rem]">
                        <i aria-hidden className="w-[.5rem] h-[.5rem] rounded-[2px]" style={{ background: HEAD_META[h].color }} />
                        {HEAD_META[h].short}
                    </span>
                ),
                title: HEAD_META[h].label,
            }))}
        />
    );
}
