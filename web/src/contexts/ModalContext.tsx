"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ModalBase, { type ModalVariant, type ModalSize } from "@/components/(modals)/ModalBase";

export type ModalOptions = {
    // Accessible name of the dialog, announced by screen readers.
    label: string;
    variant?: ModalVariant;
    size?: ModalSize;
    // Escape and backdrop clicks close it unless false.
    dismissible?: boolean;
    // Opening a modal with the same key replaces the existing one instead of stacking.
    key?: string;
};

type Entry = {
    id: number;
    render: (close: () => void) => React.ReactNode;
    options: ModalOptions;
};

type ModalContextType = {
    open: (render: Entry["render"], options: ModalOptions) => number;
    close: (id?: number) => void;
    closeAll: () => void;
    isOpen: boolean;
};

const ModalContext = createContext<ModalContextType>(null as never);

export function ModalProvider({ children }: { children: React.ReactNode }) {
    const [stack, setStack] = useState<Entry[]>([]);
    const [mounted, setMounted] = useState(false);
    const nextId = useRef(1);

    useEffect(() => setMounted(true), []);

    const open = useCallback<ModalContextType["open"]>((render, options) => {
        const id = nextId.current++;
        setStack((all) => [...all.filter((m) => !options.key || m.options.key !== options.key), { id, render, options }]);
        return id;
    }, []);

    // No id = close the topmost modal.
    const close = useCallback((id?: number) => {
        setStack((all) => (id === undefined ? all.slice(0, -1) : all.filter((m) => m.id !== id)));
    }, []);

    const closeAll = useCallback(() => setStack([]), []);

    // Lock page scroll while anything is open.
    useEffect(() => {
        if (!stack.length) {
            return;
        }
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = "hidden";
        return () => {
            document.documentElement.style.overflow = prev;
        };
    }, [stack.length]);

    const value = useMemo(() => ({ open, close, closeAll, isOpen: stack.length > 0 }), [open, close, closeAll, stack.length]);

    return (
        <ModalContext.Provider value={value}>
            {children}
            {mounted &&
                createPortal(
                    stack.map((m, i) => (
                        <ModalBase
                            key={m.id}
                            label={m.options.label}
                            variant={m.options.variant}
                            size={m.options.size}
                            dismissible={m.options.dismissible !== false}
                            isTop={i === stack.length - 1}
                            onClose={() => close(m.id)}
                        >
                            {m.render(() => close(m.id))}
                        </ModalBase>
                    )),
                    document.body,
                )}
        </ModalContext.Provider>
    );
}

export const useModal = () => useContext(ModalContext);
