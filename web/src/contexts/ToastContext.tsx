"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import ToastItem from "@/components/(ui)/ToastItem";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
    tone?: ToastTone;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
    // ms; 0 keeps the toast until dismissed.
    duration?: number;
};

export type Toast = ToastInput & { id: number; tone: ToastTone };

type ToastContextType = {
    push: (toast: ToastInput) => number;
    dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextType>(null as never);
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const nextId = useRef(1);

    const dismiss = useCallback((id: number) => {
        setToasts((all) => all.filter((t) => t.id !== id));
    }, []);

    const push = useCallback((input: ToastInput) => {
        const id = nextId.current++;
        const toast: Toast = { duration: 5000, ...input, tone: input.tone ?? "info", id };
        setToasts((all) => [...all, toast].slice(-MAX_VISIBLE));
        return id;
    }, []);

    const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

    return (
        <ToastContext.Provider value={value}>
            {children}
            <section
                aria-label="Notifications"
                className="fixed bottom-[1rem] right-[1rem] left-[1rem] md:left-auto z-[80] flex flex-col gap-[.5rem] md:w-[24rem] pointer-events-none"
            >
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
                ))}
            </section>
        </ToastContext.Provider>
    );
}

export const useToast = () => useContext(ToastContext);
