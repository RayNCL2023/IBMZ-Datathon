"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { useApi, type Query } from "@/lib/api/useApi";
import type { Bed, WardResponse } from "@/lib/api/types";
import { alertingHeads } from "@/lib/ward";
import { useReplay } from "@/contexts/ReplayContext";

// One /ward request per replay hour, shared by the ward page, sidebar, command palette and alert toasts.
// Sits above ModalProvider so modals (palette, peek) can read it.
type WardContextType = Query<WardResponse> & {
    beds: Bed[];
    alerting: Bed[];
};

const WardContext = createContext<WardContextType>(null as never);

export function WardProvider({ children }: { children: React.ReactNode }) {
    const { hour, privacy, setMaxHour } = useReplay();
    const query = useApi(`ward:${hour}:${privacy ?? ""}`, (api) => api.ward(hour, privacy));
    const beds = useMemo(() => query.data?.beds ?? [], [query.data]);

    // Replay length comes from the longest stay on the ward (stays run up to ~260 h).
    useEffect(() => {
        if (!beds.length) {
            return;
        }
        setMaxHour(Math.max(...beds.map((b) => b.lengthOfStay)) - 1);
    }, [beds, setMaxHour]);

    const value = useMemo(
        () => ({ ...query, beds, alerting: beds.filter((b) => !b.discharged && alertingHeads(b).length > 0) }),
        [query, beds],
    );

    return <WardContext.Provider value={value}>{children}</WardContext.Provider>;
}

export const useWard = () => useContext(WardContext);
