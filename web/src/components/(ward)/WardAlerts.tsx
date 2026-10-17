"use client";

import { useEffect, useRef } from "react";
import type { Head } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { flags } from "@/var/flags";
import { clockLabel, pct, bedNo } from "@/lib/format";
import { alarmsOf, alertingHeads, priorityLabel, type AlarmToken } from "@/lib/ward";
import { useSound } from "@/contexts/SoundContext";
import { useWard } from "@/contexts/WardContext";
import { useToast } from "@/contexts/ToastContext";
import { useAlarms } from "@/contexts/AlarmContext";
import { usePatientPeek } from "@/components/(patient)/usePatientPeek";

// Toasts when a bed gains an alarm (a head over its line, NEWS2, or amber → red), only while the replay steps forward one hour (not on scrubs
// or privacy changes). Renders nothing; lives inside ModalProvider so "Open patient" can open the peek.
export default function () {
    const { data } = useWard();
    const { push } = useToast();
    const peek = usePatientPeek();
    const { alarm } = useSound();
    const { acknowledge } = useAlarms();
    const previous = useRef<{ hour: number; privacy: string | null; alarms: Map<string, Set<AlarmToken>> } | null>(null);

    useEffect(() => {
        if (!data) {
            return;
        }
        const alarms = new Map(data.beds.map((b) => [b.patientId, new Set(alarmsOf(b))]));
        const prev = previous.current;
        previous.current = { hour: data.hour, privacy: data.privacy, alarms };
        if (!flags.alertToasts || !prev || data.hour !== prev.hour + 1 || data.privacy !== prev.privacy) {
            return;
        }

        // One toast per bed that gained any alarm this hour: a head over its line, NEWS2, or amber → red.
        const fresh = data.beds
            .map((bed) => ({ bed, added: alarmsOf(bed).filter((a) => !prev.alarms.get(bed.patientId)?.has(a)) }))
            .filter((f) => f.added.length > 0)
            .sort((x, y) => y.bed.priority - x.bed.priority);
        if (!fresh.length) {
            return;
        }

        const isHigh = ({ bed, added }: (typeof fresh)[number]) =>
            added.some((a) => a === "hot" || a === "sepsis" || a === "mortality") || (bed.news2Alert && alertingHeads(bed).length > 0);
        // One cue per hour. High priority: escalation to red, sepsis or mortality, or the model and NEWS2 together.
        alarm(fresh.some(isHigh) ? "high" : "medium");

        for (const f of fresh.slice(0, 3)) {
            const { bed, added } = f;
            const heads = added.filter((a): a is Head => a !== "news2" && a !== "hot");
            const title = added.includes("hot")
                ? `Bed ${bedNo(bed.bed)} escalated: ${HEAD_META[bed.topRisk].label.toLowerCase()} risk ${priorityLabel(bed.priority)}`
                : heads.length
                  ? `Bed ${bedNo(bed.bed)}: ${heads.map((h) => HEAD_META[h].label.toLowerCase()).join(", ")} risk above alarm line`
                  : `Bed ${bedNo(bed.bed)}: NEWS2 alert`;
            const topHead = bed.risks[bed.topRisk];
            push({
                tone: isHigh(f) ? "danger" : "warning",
                title,
                description: `${topHead ? `${HEAD_META[bed.topRisk].label} ${pct(topHead.risk, 1)} against a line of ${pct(topHead.threshold, 1)}` : ""} at ${clockLabel(bed.hour)}. NEWS2 ${bed.news2}${added.includes("news2") ? " (new alert)" : ""}.`,
                action: { label: "Open patient", onClick: () => peek(bed.patientId) },
                subject: bed.patientId,
                onClose: () => acknowledge(bed.patientId),
                alarm: isHigh(f) ? "high" : "medium",
            });
        }
        if (fresh.length > 3) {
            const high = fresh.slice(3).some(isHigh);
            push({ tone: "warning", title: `${fresh.length - 3} more beds with new alarms this hour`, description: "They are sorted to the top of the ward.", alarm: high ? "high" : "medium" });
        }
    }, [data, push, peek, alarm, acknowledge]);

    return null;
}
