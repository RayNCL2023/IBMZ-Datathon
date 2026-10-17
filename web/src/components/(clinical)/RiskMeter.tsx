import { twMerge } from "tailwind-merge";
import { LuTriangleAlert } from "react-icons/lu";
import type { Head } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { pct } from "@/lib/format";
import s from "./RiskMeter.module.scss";

// Risk on a track scaled to 3× the head's own alarm line, so every head reads the same way: the tick is the
// alarm line, crossing it fills the bar in the head's colour and adds an alert icon (never colour alone).
export default function ({
    head,
    risk,
    threshold,
    alert,
    compact = false,
    className,
}: {
    head: Head;
    risk: number;
    threshold: number;
    alert: boolean;
    compact?: boolean;
    className?: string;
}) {
    const meta = HEAD_META[head];
    const scale = Math.max(threshold * 3, 1e-6);
    const fill = Math.min(1, risk / scale);
    const ratio = risk / Math.max(threshold, 1e-6);

    return (
        <div
            className={twMerge(s.meter, className)}
            data-alert={alert || undefined}
            data-compact={compact || undefined}
            style={{ "--head": meta.color } as React.CSSProperties}
            title={`${meta.label}: ${pct(risk, 1)} (alarm line ${pct(threshold, 1)}, ${ratio.toFixed(1)}× the line), ${meta.horizon}`}
        >
            <span className={s.label}>
                <i className={s.swatch} aria-hidden />
                {compact ? meta.short : meta.label}
                {alert && <LuTriangleAlert size={13} className={s.alertIcon} aria-label="above alarm line" />}
            </span>
            <span className={s.track} aria-hidden>
                <span className={s.fill} style={{ width: `${fill * 100}%` }} />
                <span className={s.line} style={{ left: `${100 / 3}%` }} />
            </span>
            <span className={s.value}>{pct(risk, risk < 0.1 ? 1 : 0)}</span>
        </div>
    );
}
