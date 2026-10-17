"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import ToastItem from "@/components/(ui)/ToastItem";
import { useSound } from "@/contexts/SoundContext";
import type { AlarmPriority } from "@/lib/alarmSound";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
    tone?: ToastTone;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
    // ms; 0 keeps the toast until dismissed.
    duration?: number;
    // Alarm toasts never time out or get pushed off the stack, and keep the cue repeating until dismissed.
    alarm?: AlarmPriority;
    // What the toast is about (a patient id), so every toast for it can be cleared at once.
    subject?: string;
    // Runs when someone dismisses the toast (close button, action, Dismiss all), not on timeout.
    onClose?: () => void;
};

export type Toast = ToastInput & { id: number; tone: ToastTone };

type ToastContextType = {
    push: (toast: ToastInput) => number;
    dismiss: (id: number) => void;
    dismissSubject: (subject: string) => void;
};

const ToastContext = createContext<ToastContextType>(null as never);
const MAX_VISIBLE = 4;
// Gap between repeats of the cue while an alarm is unacknowledged; high priority repeats sooner.
const REPEAT_MS: Record<AlarmPriority, number> = { high: 3000, medium: 6000 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(1);
    const current = useRef(toasts);
    current.current = toasts;

    const dismiss = useCallback((id: number) => {
        current.current.find((t) => t.id === id)?.onClose?.();
        setToasts((all) => all.filter((t) => t.id !== id));
    }, []);

    const expire = useCallback((id: number) => {
        setToasts((all) => all.filter((t) => t.id !== id));
    }, []);

    const dismissSubject = useCallback((subject: string) => {
        setToasts((all) => all.filter((t) => t.subject !== subject));
    }, []);

    const dismissAlarms = () => {
        current.current.filter((t) => t.alarm).forEach((t) => t.onClose?.());
        setToasts((all) => all.filter((t) => !t.alarm));
    };

    const push = useCallback((input: ToastInput) => {
        const id = nextId.current++;
        const toast: Toast = { duration: input.alarm ? 0 : 5000, ...input, tone: input.tone ?? "info", id };
        setToasts((all) => {
            const next = [...all, toast];
            // Over the cap, drop the oldest ordinary toasts; alarms stay until someone dismisses them.
            const overflow = next.length - MAX_VISIBLE;
            const drop = new Set(next.filter((t) => !t.alarm).slice(0, Math.max(overflow, 0)).map((t) => t.id));
            return next.filter((t) => !drop.has(t.id));
        });
        return id;
    }, []);

    const { alarm } = useSound();
    const pending: AlarmPriority | null = toasts.some((t) => t.alarm === "high") ? "high" : toasts.some((t) => t.alarm) ? "medium" : null;

    // The first cue plays when the alarm is pushed; this repeats it until every alarm toast is dismissed.
    useEffect(() => {
        if (!pending) {
            return;
        }
        const timer = setInterval(() => alarm(pending), REPEAT_MS[pending]);
        return () => clearInterval(timer);
    }, [pending, alarm]);

    const value = useMemo(() => ({ push, dismiss, dismissSubject }), [push, dismiss, dismissSubject]);
    const visible = toasts.slice(-MAX_VISIBLE);
    const hidden = toasts.length - visible.length;
    const alarms = toasts.filter((t) => t.alarm).length;

    return (
        <ToastContext.Provider value={value}>
            {children}
            <section
                aria-label="Notifications"
                className="fixed bottom-[1rem] right-[1rem] left-[1rem] md:left-auto z-[80] flex flex-col gap-[.5rem] md:w-[24rem] pointer-events-none"
            >
                {alarms > 1 && (
                    <div className="pointer-events-auto flex flex-row items-center justify-between gap-[.75rem] px-[1rem] py-[.5rem] rounded-[var(--d-radius)] bg-surface border-[1px] border-line shadow-[var(--d-shadow-pop)] text-[.875rem] text-muted">
                        <span>
                            {alarms} alarms waiting{hidden > 0 ? `, ${hidden} not shown` : ""}
                        </span>
                        <button className="min-h-[1.75rem] font-[600] text-accent hover:underline" onClick={dismissAlarms}>
                            Dismiss all
                        </button>
                    </div>
                )}
                {visible.map((t) => (
                    <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} onExpire={() => expire(t.id)} />
                ))}
            </section>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);
