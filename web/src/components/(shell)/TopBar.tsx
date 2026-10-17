"use client";

import { LuMenu } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import { useDesign } from "@/contexts/DesignContext";
import { useModal } from "@/contexts/ModalContext";
import Brand from "@/components/(shell)/Brand";
import NavLinks from "@/components/(shell)/NavLinks";
import IconButton from "@/components/(buttons)/IconButton";
import ModalPrimary from "@/components/(modals)/ModalPrimary";
import { SidebarContent } from "@/components/(shell)/Sidebar";
import { SearchButton, SettingsButton, SourcePill, ThemeToggle } from "@/components/(shell)/ShellTools";

// Sidebar designs: a slim bar on small screens only. Clinical (nav: "top"): the main navigation bar at every size.
export default function () {
    const { config } = useDesign();
    const { open } = useModal();
    const top = config.nav === "top";

    const openMenu = () =>
        open(
            (close) => (
                <ModalPrimary title="Menu" onClose={close} className="p-0">
                    <SidebarContent onNavigate={close} />
                </ModalPrimary>
            ),
            { label: "Menu", variant: "drawer", key: "menu" },
        );

    return (
        <header className={twMerge("flex flex-row items-center justify-between gap-[1rem] h-[var(--header-h)] px-[var(--gutter)] bg-panel border-b-[1px] border-line", !top && "lg:hidden")}>
            <div className="flex flex-row items-center gap-[1.5rem] min-w-0">
                <Brand />
                {top && (
                    <div className="hidden lg:flex">
                        <NavLinks direction="row" />
                    </div>
                )}
            </div>
            <div className="flex flex-row items-center gap-[.35rem]">
                <div className="hidden md:flex">
                    <SourcePill />
                </div>
                <SearchButton wide={false} />
                <ThemeToggle />
                <SettingsButton />
                <IconButton label="Open menu" onClick={openMenu} className="lg:hidden">
                    <LuMenu size={20} />
                </IconButton>
            </div>
        </header>
    );
}
