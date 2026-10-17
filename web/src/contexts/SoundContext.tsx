"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { playAlarm, unlockAudio, type AlarmPriority } from "@/lib/alarmSound";
import { storage } from "@/lib/storage";
import { flags } from "@/var/flags";

const SOUND_KEY = "lx.sound";

type SoundContextType = {
    available: boolean;
    enabled: boolean;
    setEnabled: (on: boolean) => void;
    alarm: (priority: AlarmPriority) => void;
};

const SoundContext = createContext<SoundContextType>(null as never);

export function SoundProvider({ children }: { children: React.ReactNode }) {
    const [enabled, setEnabledState] = useState(false);

    // Restore the preference; audio itself waits for the first click or key press (browser autoplay rules).
    useEffect(() => {
        if (!flags.audio || storage.get(SOUND_KEY) !== "on") {
            return;
        }
        setEnabledState(true);
        const unlock = () => unlockAudio();
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
        return () => {
            window.removeEventListener("pointerdown", unlock);
            window.removeEventListener("keydown", unlock);
        };
    }, []);

    // Always called from a click, so it can unlock audio and confirm with a short medium cue.
    const setEnabled = useCallback((on: boolean) => {
        storage.set(SOUND_KEY, on ? "on" : "off");
        setEnabledState(on);
        if (on && unlockAudio()) {
            setTimeout(() => playAlarm("medium"), 50);
        }
    }, []);

    const alarm = useCallback(
        (priority: AlarmPriority) => {
            if (enabled) {
                playAlarm(priority);
            }
        },
        [enabled],
    );

    const value = useMemo(() => ({ available: flags.audio, enabled, setEnabled, alarm }), [enabled, setEnabled, alarm]);
    return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export const useSound = () => useContext(SoundContext);
