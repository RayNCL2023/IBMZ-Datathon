"use client";

import { DesignProvider } from "@/contexts/DesignContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ReplayProvider } from "@/contexts/ReplayContext";
import { WardProvider } from "@/contexts/WardContext";
import { ModalProvider } from "@/contexts/ModalContext";
import { SoundProvider } from "@/contexts/SoundContext";

// Order matters: modals render inside ModalProvider, so everything a modal needs (design/API client, toasts,
// replay clock, ward data) must sit above it.
export default function ({ children }: { children: React.ReactNode }) {
    return (
        <DesignProvider>
            <ToastProvider>
                <SoundProvider>
                <ReplayProvider>
                    <WardProvider>
                        <ModalProvider>{children}</ModalProvider>
                    </WardProvider>
                </ReplayProvider>
                </SoundProvider>
            </ToastProvider>
        </DesignProvider>
    );
}
