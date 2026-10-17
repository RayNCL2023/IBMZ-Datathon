"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { LuMoon, LuSearch, LuSettings2, LuSun, LuVolume2, LuVolumeX } from "react-icons/lu";
import { useSound } from "@/contexts/SoundContext";
import { useDesign } from "@/contexts/DesignContext";
import IconButton from "@/components/(buttons)/IconButton";
import StatusPill from "@/components/(ui)/StatusPill";
import { Kbd } from "@/components/(ui)/States";
import { useCommandPalette } from "@/components/(shell)/CommandPalette";
import { useSettings } from "@/components/(shell)/SettingsModal";

export function SearchButton({ wide = true }: { wide?: boolean }) {
    const openPalette = useCommandPalette();
    if (!wide) {
        return (
            <IconButton label="Search and commands" onClick={openPalette}>
                <LuSearch size={18} />
            </IconButton>
        );
    }
    return (
        <button
            onClick={openPalette}
            className="flex flex-row items-center gap-[.5rem] w-full min-h-[var(--d-control)] px-[.6rem] rounded-control border-[1px] border-line bg-surface text-[.85rem] text-faint hover:text-fg"
        >
            <LuSearch size={16} aria-hidden />
            <span className="flex-1 text-left">Search beds, pages…</span>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
        </button>
    );
}

export function ThemeToggle() {
    const { config } = useDesign();
    const { resolvedTheme, setTheme } = useTheme();
    // The theme is only known in the browser; render a same-size placeholder on the server to avoid a mismatch.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (config.forcedMode) {
        return null;
    }
    if (!mounted) {
        return <span aria-hidden className="w-[var(--d-control)] h-[var(--d-control)] shrink-0" />;
    }
    const dark = resolvedTheme === "dark";
    return (
        <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <LuSun size={18} /> : <LuMoon size={18} />}
        </IconButton>
    );
}

// Alarm sound on/off. Enabling is a click, which also unlocks browser audio and plays a short test cue.
export function SoundToggle() {
    const { available, enabled, setEnabled } = useSound();
    if (!available) {
        return null;
    }
    return (
        <IconButton
            label={enabled ? "Mute alarm sounds" : "Turn on alarm sounds"}
            aria-pressed={enabled}
            onClick={() => setEnabled(!enabled)}
            className={enabled ? "text-accent" : undefined}
        >
            {enabled ? <LuVolume2 size={18} /> : <LuVolumeX size={18} />}
        </IconButton>
    );
}

export function SettingsButton() {
    const openSettings = useSettings();
    return (
        <IconButton label="Display and data settings" onClick={openSettings}>
            <LuSettings2 size={18} />
        </IconButton>
    );
}

export function SourcePill() {
    const { dataSource } = useDesign();
    return dataSource === "live" ? (
        <StatusPill tone="success" title="Data from the LinuxONE API over HTTPS">
            Live, LinuxONE
        </StatusPill>
    ) : (
        <StatusPill tone="info" title="Deterministic demo data generated in the browser">
            Demo data
        </StatusPill>
    );
}
