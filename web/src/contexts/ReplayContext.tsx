"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clamp } from "@/lib/format";
import { flags } from "@/var/flags";

// The demo ward replays real ICU stays hour by hour. Everything time-dependent (ward, patient timelines,
// handovers) reads `hour` from here, so one clock drives the whole app. Privacy selects the federated sepsis
// model (null = the centrally trained one).
export const SPEEDS = [
    { value: "slow", label: "1×", ms: 3000 },
    { value: "normal", label: "2×", ms: 1500 },
    { value: "fast", label: "5×", ms: 600 },
] as const;
export type Speed = (typeof SPEEDS)[number]["value"];

type ReplayContextType = {
    hour: number;
    maxHour: number;
    setHour: (h: number) => void;
    step: (delta: number) => void;
    setMaxHour: (h: number) => void;
    playing: boolean;
    setPlaying: (p: boolean) => void;
    toggle: () => void;
    speed: Speed;
    setSpeed: (s: Speed) => void;
    privacy: string | null;
    setPrivacy: (p: string | null) => void;
    groundTruth: boolean;
    setGroundTruth: (v: boolean) => void;
};

const ReplayContext = createContext<ReplayContextType>(null as never);
const START_HOUR = 20;

export function ReplayProvider({ children }: { children: React.ReactNode }) {
    const [hour, setHourState] = useState(START_HOUR);
    const [maxHour, setMaxHour] = useState(72);
    const [playing, setPlaying] = useState(false);
    const [speed, setSpeed] = useState<Speed>("normal");
    const [privacy, setPrivacy] = useState<string | null>(null);
    const [groundTruth, setGroundTruth] = useState(false);

    const setHour = useCallback((h: number) => setHourState(clamp(Math.round(h), 0, maxHour)), [maxHour]);
    const step = useCallback((delta: number) => setHourState((h) => clamp(h + delta, 0, maxHour)), [maxHour]);
    const toggle = useCallback(() => setPlaying((p) => !p), []);

    useEffect(() => {
        if (!playing) {
            return;
        }
        if (hour >= maxHour) {
            setPlaying(false);
            return;
        }
        const ms = SPEEDS.find((s) => s.value === speed)!.ms;
        const timer = setTimeout(() => setHourState((h) => Math.min(h + 1, maxHour)), ms);
        return () => clearTimeout(timer);
    }, [playing, hour, maxHour, speed]);

    const value = useMemo(
        () => ({
            hour,
            maxHour,
            setHour,
            step,
            setMaxHour,
            playing,
            setPlaying,
            toggle,
            speed,
            setSpeed,
            privacy,
            setPrivacy,
            groundTruth: flags.groundTruth && groundTruth,
            setGroundTruth,
        }),
        [hour, maxHour, setHour, step, playing, toggle, speed, privacy, groundTruth],
    );

    return <ReplayContext.Provider value={value}>{children}</ReplayContext.Provider>;
}

export const useReplay = () => useContext(ReplayContext);
