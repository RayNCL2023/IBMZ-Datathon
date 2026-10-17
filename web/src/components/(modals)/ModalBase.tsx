"use client";

import { useEffect, useRef } from "react";
import s from "./ModalBase.module.scss";

export type ModalVariant = "dialog" | "drawer" | "palette";
export type ModalSize = "sm" | "md" | "lg" | "xl";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Backdrop, focus trap, Escape, focus restore. Every modal variant (dialog, side peek, command palette)
// goes through here; content layouts live in ModalPrimary / ModalDrawer.
export default function ({
    children,
    label,
    variant = "dialog",
    size = "md",
    dismissible = true,
    isTop = true,
    onClose,
}: {
    children: React.ReactNode;
    label: string;
    variant?: ModalVariant;
    size?: ModalSize;
    dismissible?: boolean;
    isTop?: boolean;
    onClose: () => void;
}) {
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement as HTMLElement | null;
        const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? panel.current)?.focus();
        return () => previous?.focus?.();
    }, []);

    useEffect(() => {
        if (!isTop) {
            return;
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape" && dismissible) {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== "Tab" || !panel.current) {
                return;
            }
            const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
            if (!items.length) {
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
                return;
            }
            if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [isTop, dismissible, onClose]);

    return (
        <div className={s.root} data-variant={variant}>
            <div className={s.backdrop} aria-hidden onClick={dismissible ? onClose : undefined} />
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-label={label}
                tabIndex={-1}
                className={s.panel}
                data-size={size}
                data-lenis-prevent
            >
                {children}
            </div>
        </div>
    );
}
