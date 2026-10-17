"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Bed } from "@/lib/api/types";
import { alarmsOf } from "@/lib/ward";
import { useWard } from "@/contexts/WardContext";
import { useToast } from "@/contexts/ToastContext";

// Which alarms a nurse has already seen. Opening a bed or dismissing its toast acknowledges every alarm the
// bed has right now: its toasts clear and it stops pulsing. A new alarm on the same bed pulses again.
type AlarmContextType = {
    acknowledge: (patientId: string) => void;
    unacknowledged: (bed: Bed) => boolean;
};

const AlarmContext = createContext<AlarmContextType>(null as never);

export function AlarmProvider({ children }: { children: React.ReactNode }) {
    const { beds } = useWard();
    const { dismissSubject } = useToast();
    const [acked, setAcked] = useState<Map<string, Set<string>>>(new Map());
    // Toasts keep their onClose from the hour they were pushed; reading beds through a ref acknowledges what
    // the bed shows now, not then.
    const latest = useRef(beds);
    latest.current = beds;

    // Forget acknowledgements for alarms that have cleared, so the same alarm coming back pulses again.
    useEffect(() => {
        setAcked((prev) => {
            const next = new Map<string, Set<string>>();
            for (const bed of beds) {
                const seen = prev.get(bed.patientId);
                if (!seen) {
                    continue;
                }
                next.set(bed.patientId, new Set<string>(alarmsOf(bed).filter((a) => seen.has(a))));
            }
            return next;
        });
    }, [beds]);

    const acknowledge = useCallback(
        (patientId: string) => {
            const bed = latest.current.find((b) => b.patientId === patientId);
            if (!bed) {
                return;
            }
            setAcked((prev) => new Map(prev).set(patientId, new Set<string>(alarmsOf(bed))));
            dismissSubject(patientId);
        },
        [dismissSubject],
    );

    const unacknowledged = useCallback(
        (bed: Bed) => {
            const seen = acked.get(bed.patientId);
            return alarmsOf(bed).some((a) => !seen?.has(a));
        },
        [acked],
    );

    const value = useMemo(() => ({ acknowledge, unacknowledged }), [acknowledge, unacknowledged]);
    return <AlarmContext.Provider value={value}>{children}</AlarmContext.Provider>;
}

export const useAlarms = () => useContext(AlarmContext);
