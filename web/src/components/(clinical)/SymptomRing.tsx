import type { Head } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";

// Risk relative to its alarm line as a ring: the full circle is 3× the line, the tick marks the line itself.
export default function ({ head, ratio, size = 44 }: { head: Head; ratio: number; size?: number }) {
    const r = 15;
    const c = 2 * Math.PI * r;
    const fill = Math.min(ratio / 3, 1) * c;
    const meta = HEAD_META[head];
    return (
        <div className="flex flex-col items-center gap-[.25rem] min-w-0" title={`${meta.label} ${ratio.toFixed(1)}× its alarm line`}>
            <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${meta.label} ${ratio.toFixed(1)} times alarm line`}>
                <circle cx="20" cy="20" r={r} fill="none" stroke="var(--d-sunken)" strokeWidth="5" />
                <circle cx="20" cy="20" r={r} fill="none" stroke={meta.color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${fill} ${c}`} transform="rotate(-90 20 20)" style={{ transition: "stroke-dasharray .6s cubic-bezier(.22,.8,.2,1)" }} />
                <line x1="20" y1="1.5" x2="20" y2="8.5" stroke="var(--d-fg)" strokeWidth="1.5" transform="rotate(120 20 20)" />
                <text x="20" y="23.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--d-fg)" className="font-num">
                    {ratio.toFixed(1)}
                </text>
            </svg>
            <span className="text-[.75rem] text-muted truncate max-w-full">{meta.short}</span>
        </div>
    );
}
