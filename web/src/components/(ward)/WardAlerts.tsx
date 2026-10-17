"use client";

import { useEffect, useRef } from "react";
import type { Head } from "@/lib/api/types";
import { HEAD_META } from "@/var/clinical";
import { flags } from "@/var/flags";
import { pct } from "@/lib/format";
import { alertingHeads } from "@/lib/ward";
import { useWard } from "@/contexts/WardContext";
import { useToast } from "@/contexts/ToastContext";
import { usePatientPeek } from "@/components/(patient)/usePatientPeek";

// Toasts when a bed newly crosses an alarm line, only while the replay steps forward one hour (not on scrubs
// or privacy changes). Renders nothing; lives inside ModalProvider so "Open patient" can open the peek.
export default function () {
    const { data } = useWard();
    const { push } = useToast();
    const peek = usePatientPeek();
    const previous = useRef<{ hour: number; privacy: string | null; alerts: Map<string, Set<Head>> } | null>(null);

    useEffect(() => {
        if (!data) {
            return;
        }
        const alerts = new Map(data.beds.map((b) => [b.patientId, new Set(alertingHeads(b))]));
        const prev = previous.current;
        previous.current = { hour: data.hour, privacy: data.privacy, alerts };
        if (!flags.alertToasts || !prev || data.hour !== prev.hour + 1 || data.privacy !== prev.privacy) {
            return;
        }

        const fresh = data.beds
            .filter((b) => !b.discharged)
            .flatMap((b) => alertingHeads(b).filter((h) => !prev.alerts.get(b.patientId)?.has(h)).map((head) => ({ bed: b, head })));
        for (const { bed, head } of fresh.slice(0, 3)) {
            push({
                tone: head === "sepsis" || head === "mortality" ? "danger" : "warning",
                title: `Bed ${bed.bed}: ${HEAD_META[head].label.toLowerCase()} risk above alarm line`,
                description: `${pct(bed.risks[head]!.risk, 1)} against a line of ${pct(bed.risks[head]!.threshold, 1)} at hour ${bed.hour}. NEWS2 ${bed.news2}.`,
                action: { label: "Open patient", onClick: () => peek(bed.patientId) },
                duration: 8000,
            });
        }
        if (fresh.length > 3) {
            push({ tone: "warning", title: `${fresh.length - 3} more new alarms this hour`, description: "They are sorted to the top of the ward." });
        }
    }, [data, push, peek]);

    return null;
}
