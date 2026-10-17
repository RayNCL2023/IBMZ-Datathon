"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { LuBedDouble, LuCornerDownLeft, LuFlaskConical, LuKeyboard, LuPalette, LuPause, LuPlay, LuSearch } from "react-icons/lu";
import type { IconType } from "react-icons";
import { useModal } from "@/contexts/ModalContext";
import { useWard } from "@/contexts/WardContext";
import { useReplay } from "@/contexts/ReplayContext";
import { useDesign } from "@/contexts/DesignContext";
import { DESIGNS, flags, type DesignId } from "@/var/flags";
import { NAV } from "@/var/nav";
import { HEAD_META } from "@/var/clinical";
import { STATUS_META, bedStatus } from "@/lib/ward";
import { usePatientPeek } from "@/components/(patient)/usePatientPeek";
import { useWhatIf } from "@/components/(patient)/WhatIfModal";
import { useShortcuts } from "@/components/(shell)/ShortcutsModal";
import { Kbd } from "@/components/(ui)/States";
import { bedNo } from "@/lib/format";

type Command = { id: string; group: string; label: string; hint?: string; icon: IconType; run: () => void };

function Palette({ close }: { close: () => void }) {
    const router = useRouter();
    const { beds } = useWard();
    const replay = useReplay();
    const { design, setDesign, advanced } = useDesign();
    const peek = usePatientPeek();
    const whatIf = useWhatIf();
    const shortcuts = useShortcuts();
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);

    const commands = useMemo<Command[]>(() => {
        const list: Command[] = [
            ...beds.map((b) => ({
                id: `bed-${b.patientId}`,
                group: "Beds",
                label: `Bed ${bedNo(b.bed)}, ${b.patientId}`,
                hint: b.discharged ? "Stay ended" : `${STATUS_META[bedStatus(b)].label}, ${HEAD_META[b.topRisk].short} ${b.priority.toFixed(1)}×`,
                icon: LuBedDouble,
                run: () => peek(b.patientId),
            })),
            ...NAV.filter((n) => advanced || !n.advanced).map((n) => ({ id: `nav-${n.href}`, group: "Pages", label: n.label, hint: n.description, icon: n.icon, run: () => router.push(n.href) })),
            {
                id: "replay",
                group: "Replay",
                label: replay.playing ? "Pause replay" : "Play replay",
                hint: `Hour ${replay.hour}`,
                icon: replay.playing ? LuPause : LuPlay,
                run: replay.toggle,
            },
            { id: "shortcuts", group: "Help", label: "Keyboard shortcuts", icon: LuKeyboard, run: shortcuts },
        ];
        if (flags.whatIf && advanced) {
            list.push({ id: "what-if", group: "Tools", label: "What-if scoring", hint: "Score custom observations", icon: LuFlaskConical, run: () => whatIf() });
        }
        if (flags.designSwitcher) {
            for (const d of Object.values(DESIGNS)) {
                if (d.id === design) {
                    continue;
                }
                list.push({ id: `design-${d.id}`, group: "Design", label: `Switch to ${d.name} design`, hint: d.description, icon: LuPalette, run: () => setDesign(d.id as DesignId) });
            }
        }
        return list;
    }, [beds, replay, design, setDesign, advanced, peek, whatIf, shortcuts, router]);

    const q = query.trim().toLowerCase();
    const results = q ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(q)) : commands;
    const active = Math.min(index, Math.max(results.length - 1, 0));

    function run(c: Command | undefined) {
        if (!c) {
            return;
        }
        close();
        c.run();
    }

    function onKey(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + results.length) % Math.max(results.length, 1));
            return;
        }
        if (e.key === "Enter") {
            e.preventDefault();
            run(results[active]);
        }
    }

    let lastGroup = "";
    return (
        <div className="flex flex-col min-h-0" onKeyDown={onKey}>
            <div className="flex flex-row items-center gap-[.6rem] px-[1rem] border-b-[1px] border-line">
                <LuSearch size={18} className="text-faint shrink-0" aria-hidden />
                <input
                    data-autofocus
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIndex(0);
                    }}
                    placeholder="Search beds, pages and commands"
                    aria-label="Search beds, pages and commands"
                    aria-controls="palette-results"
                    aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
                    className="flex-1 min-h-[3.25rem] bg-transparent text-[1rem] text-fg outline-none"
                    role="combobox"
                    aria-expanded
                />
                <Kbd>Esc</Kbd>
            </div>
            <ul id="palette-results" role="listbox" className="flex flex-col p-[.4rem] overflow-y-auto">
                {!results.length && <li className="px-[.75rem] py-[1.5rem] text-center text-[.9rem] text-muted">Nothing matches “{query}”.</li>}
                {results.map((c, i) => {
                    const header = c.group !== lastGroup ? c.group : null;
                    lastGroup = c.group;
                    const Icon = c.icon;
                    return (
                        <li key={c.id} role="presentation" className="flex flex-col">
                            {header && <span className="px-[.75rem] pt-[.6rem] pb-[.3rem] text-[.8125rem] font-[600] text-faint">{header}</span>}
                            <button
                                id={`cmd-${c.id}`}
                                role="option"
                                aria-selected={i === active}
                                tabIndex={-1}
                                onMouseMove={() => setIndex(i)}
                                onClick={() => run(c)}
                                className={twMerge(
                                    "flex flex-row items-center gap-[.75rem] min-h-[2.75rem] px-[.75rem] rounded-control text-left",
                                    i === active && "bg-hover",
                                )}
                            >
                                <Icon size={18} className="text-muted shrink-0" aria-hidden />
                                <span className="flex flex-col min-w-0 flex-1">
                                    <span className="text-[.9rem] text-fg truncate">{c.label}</span>
                                    {c.hint && <span className="text-[.8125rem] text-muted truncate">{c.hint}</span>}
                                </span>
                                {i === active && <LuCornerDownLeft size={16} className="text-faint" aria-hidden />}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export function useCommandPalette() {
    const { open } = useModal();
    return useCallback(() => open((close) => <Palette close={close} />, { label: "Command palette", variant: "palette", key: "palette" }), [open]);
}
