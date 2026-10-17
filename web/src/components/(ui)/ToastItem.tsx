"use client";

import { useEffect, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import type { Toast } from "@/contexts/ToastContext";
import ToneIcon from "@/components/(ui)/ToneIcon";
import s from "./ToastItem.module.scss";

export default function ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const [paused, setPaused] = useState(false);
    const remaining = useRef(toast.duration ?? 5000);

    useEffect(() => {
        if (paused || !remaining.current) {
            return;
        }
        const started = Date.now();
        const timer = setTimeout(onDismiss, remaining.current);
        return () => {
            clearTimeout(timer);
            remaining.current = Math.max(0, remaining.current - (Date.now() - started));
        };
    }, [paused, onDismiss]);

    return (
        <div
            role={toast.tone === "danger" ? "alert" : "status"}
            aria-live={toast.tone === "danger" ? "assertive" : "polite"}
            className={s.toast}
            data-tone={toast.tone}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
        >
            <ToneIcon tone={toast.tone} className={s.icon} />
            <div className="flex flex-col gap-[.15rem] min-w-0 flex-1">
                <strong className="text-[.9rem] font-[600] text-fg">{toast.title}</strong>
                {toast.description && <span className="text-[.875rem] text-muted leading-[1.4]">{toast.description}</span>}
                {toast.action && (
                    <button
                        className="self-start mt-[.35rem] text-[.875rem] font-[600] text-accent hover:underline min-h-[1.75rem]"
                        onClick={() => {
                            toast.action!.onClick();
                            onDismiss();
                        }}
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button aria-label="Dismiss notification" className={s.close} onClick={onDismiss}>
                <LuX size={16} />
            </button>
        </div>
    );
}
