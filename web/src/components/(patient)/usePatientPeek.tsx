"use client";

import { useCallback } from "react";
import { LuMaximize2 } from "react-icons/lu";
import { useModal } from "@/contexts/ModalContext";
import ModalPrimary from "@/components/(modals)/ModalPrimary";
import ButtonLink from "@/components/(buttons)/ButtonLink";
import PatientDetail from "@/components/(patient)/PatientDetail";

// Side peek (like opening a page in Notion without leaving the database): the full patient view in a drawer,
// with "Open as page" for the dedicated route. Only one peek at a time.
export function usePatientPeek() {
    const { open } = useModal();
    return useCallback(
        (patientId: string) =>
            open(
                (close) => (
                    <ModalPrimary
                        title={`Patient ${patientId}`}
                        onClose={close}
                        className="p-0"
                        headerExtra={
                            <ButtonLink variant="ghost" href={`/patient/${encodeURIComponent(patientId)}`} onClick={close}>
                                <LuMaximize2 size={16} /> Open as page
                            </ButtonLink>
                        }
                    >
                        <PatientDetail patientId={patientId} variant="peek" />
                    </ModalPrimary>
                ),
                { label: `Patient ${patientId}`, variant: "drawer", key: "patient-peek" },
            ),
        [open],
    );
}
