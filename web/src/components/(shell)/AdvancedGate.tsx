"use client";

import { useDesign } from "@/contexts/DesignContext";
import { flags } from "@/var/flags";
import { EmptyState } from "@/components/(ui)/States";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";

// Pages for judges and engineers (federated learning, LinuxONE system) stay out of the clinical UI until
// advanced mode is on in settings.
export default function ({ title, children }: { title: string; children: React.ReactNode }) {
    const { advanced, setAdvanced } = useDesign();
    if (advanced) {
        return <>{children}</>;
    }
    return (
        <div className="page">
            <EmptyState title={`${title} is an advanced view`}>
                <p>It is hidden from the clinical interface to keep the ward screens simple.</p>
                {flags.advancedToggle && (
                    <ButtonPrimary className="mt-[1rem]" onClick={() => setAdvanced(true)}>
                        Turn on advanced mode
                    </ButtonPrimary>
                )}
            </EmptyState>
        </div>
    );
}
