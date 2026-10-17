"use client";

import { DesignProvider } from "@/contexts/DesignContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ReplayProvider } from "@/contexts/ReplayContext";
import { WardProvider } from "@/contexts/WardContext";
import { ModalProvider } from "@/contexts/ModalContext";
import { SoundProvider } from "@/contexts/SoundContext";
import { AlarmProvider } from "@/contexts/AlarmContext";

// Order matters: modals render inside ModalProvider, so everything a modal needs (design/API client, toasts,
// replay clock, ward data) must sit above it.
export default function ({ children }: { children: React.ReactNode }) {
    return (
        <DesignProvider>
            <SoundProvider>
                <ToastProvider>
                    <ReplayProvider>
                        <WardProvider>
                            <AlarmProvider>
                                <ModalProvider>{children}</ModalProvider>
                            </AlarmProvider>
                        </WardProvider>
                    </ReplayProvider>
                </ToastProvider>
            </SoundProvider>
        </DesignProvider>
    );
}
