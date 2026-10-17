"use client";

import Brand from "@/components/(shell)/Brand";
import NavLinks from "@/components/(shell)/NavLinks";
import BedList from "@/components/(shell)/BedList";
import { SearchButton, SettingsButton, SoundToggle, SourcePill, ThemeToggle } from "@/components/(shell)/ShellTools";

// Sidebar content, shared by the desktop rail and the mobile menu drawer.
export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
    return (
        <div className="flex flex-col gap-[1.25rem] h-full p-[.75rem]">
            <div className="px-[.35rem] pt-[.25rem]">
                <Brand />
            </div>
            <SearchButton />
            <NavLinks onNavigate={onNavigate} />
            <div className="flex-1 overflow-y-auto min-h-0" data-lenis-prevent>
                <BedList onNavigate={onNavigate} />
            </div>
            <div className="flex flex-row items-center justify-between gap-[.5rem] pt-[.75rem] border-t-[1px] border-line">
                <SourcePill />
                <div className="flex flex-row">
                    <SoundToggle />
                    <ThemeToggle />
                    <SettingsButton />
                </div>
            </div>
        </div>
    );
}

export default function () {
    return (
        <aside className="hidden lg:flex flex-col sticky top-0 h-screen w-[16rem] shrink-0 bg-panel border-r-[1px] border-line">
            <SidebarContent />
        </aside>
    );
}
