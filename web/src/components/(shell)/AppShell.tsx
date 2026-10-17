"use client";

import { useEffect } from "react";
import { useDesign } from "@/contexts/DesignContext";
import { useReplay } from "@/contexts/ReplayContext";
import { useModal } from "@/contexts/ModalContext";
import { flags } from "@/var/flags";
import Sidebar from "@/components/(shell)/Sidebar";
import TopBar from "@/components/(shell)/TopBar";
import ReplayBar from "@/components/(shell)/ReplayBar";
import WardAlerts from "@/components/(ward)/WardAlerts";
import { useCommandPalette } from "@/components/(shell)/CommandPalette";
import { useShortcuts } from "@/components/(shell)/ShortcutsModal";
import { useWhatIf } from "@/components/(patient)/WhatIfModal";

function typing(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) {
        return false;
    }
    return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.closest("svg, [role=dialog]") !== null;
}

function useGlobalShortcuts() {
    const replay = useReplay();
    const { isOpen } = useModal();
    const palette = useCommandPalette();
    const shortcuts = useShortcuts();
    const whatIf = useWhatIf();

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                palette();
                return;
            }
            if (isOpen || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) {
                return;
            }
            if (e.key === " ") {
                e.preventDefault();
                replay.toggle();
                return;
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                replay.step((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 6 : 1));
                return;
            }
            if (e.key === "?") {
                shortcuts();
                return;
            }
            if (e.key.toLowerCase() === "w" && flags.whatIf) {
                whatIf();
            }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [replay, isOpen, palette, shortcuts, whatIf]);
}

// Layout per design: sidebar (Ward, Night) or top navigation bar (Clinical). The replay bar stays sticky.
export default function ({ children }: { children: React.ReactNode }) {
    const { config } = useDesign();
    useGlobalShortcuts();

    return (
        <div className="flex flex-row min-h-screen w-full">
            <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-[.5rem] focus:left-[.5rem] focus:z-[90] focus:p-[.75rem] focus:bg-surface focus:text-fg focus:rounded-control">
                Skip to content
            </a>
            {config.nav === "sidebar" && <Sidebar />}
            <div className="flex flex-col flex-1 min-w-0">
                <TopBar />
                <div className="sticky top-0 z-[40]">
                    <ReplayBar />
                </div>
                <main id="content" className="flex flex-col flex-1 min-w-0">
                    {children}
                </main>
            </div>
            <WardAlerts />
        </div>
    );
}
