"use client";

import { useCallback } from "react";
import { useModal } from "@/contexts/ModalContext";
import ModalPrimary from "@/components/(modals)/ModalPrimary";
import { Kbd } from "@/components/(ui)/States";

export const SHORTCUTS: { keys: string[]; label: string }[] = [
    { keys: ["Ctrl", "K"], label: "Search beds, pages and commands" },
    { keys: ["Space"], label: "Play or pause the replay" },
    { keys: ["←", "→"], label: "Step the replay one hour" },
    { keys: ["Shift", "←/→"], label: "Step six hours" },
    { keys: ["W"], label: "What-if scoring" },
    { keys: ["?"], label: "Show this list" },
    { keys: ["Esc"], label: "Close the open panel" },
];

export function useShortcuts() {
    const { open } = useModal();
    return useCallback(
        () =>
            open(
                (close) => (
                    <ModalPrimary title="Keyboard shortcuts" onClose={close}>
                        <dl className="flex flex-col">
                            {SHORTCUTS.map((s) => (
                                <div key={s.label} className="flex flex-row items-center justify-between gap-[1rem] py-[.6rem] border-b-[1px] border-line last:border-b-0">
                                    <dt className="text-[.9rem] text-fg">{s.label}</dt>
                                    <dd className="flex flex-row gap-[.25rem]">
                                        {s.keys.map((k) => (
                                            <Kbd key={k}>{k}</Kbd>
                                        ))}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </ModalPrimary>
                ),
                { label: "Keyboard shortcuts", size: "sm", key: "shortcuts" },
            ),
        [open],
    );
}
