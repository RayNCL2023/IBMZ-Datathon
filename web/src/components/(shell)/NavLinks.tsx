"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { NAV, isActive } from "@/var/nav";
import { useDesign } from "@/contexts/DesignContext";

// Same links in the sidebar (vertical) and the Clinical top bar (horizontal).
export default function ({ direction = "column", onNavigate }: { direction?: "column" | "row"; onNavigate?: () => void }) {
    const pathname = usePathname() ?? "/";
    const { advanced } = useDesign();
    return (
        <nav aria-label="Main" className={twMerge("flex gap-[.15rem]", direction === "column" ? "flex-col" : "flex-row flex-wrap")}>
            {NAV.filter((n) => advanced || !n.advanced).map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                    <Link
                        key={href}
                        href={href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={twMerge(
                            "flex flex-row items-center gap-[.6rem] min-h-[var(--d-control)] px-[.6rem] rounded-control text-[.9rem] font-[550] text-muted hover:bg-hover hover:text-fg",
                            active && "bg-hover text-fg",
                            active && direction === "row" && "bg-accent-soft text-accent-ink",
                        )}
                    >
                        <Icon size={18} aria-hidden />
                        {label}
                    </Link>
                );
            })}
        </nav>
    );
}
