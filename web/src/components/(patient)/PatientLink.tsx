"use client";

import Link from "next/link";
import { usePatientPeek } from "@/components/(patient)/usePatientPeek";
import { useAlarms } from "@/contexts/AlarmContext";

// A real link to the patient page (middle-click / new tab work) that opens the side peek on a plain click.
// Opening a bed acknowledges its alarms.
export default function ({
    patientId,
    children,
    ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> & { patientId: string }) {
    const peek = usePatientPeek();
    const { acknowledge } = useAlarms();
    return (
        <Link
            href={`/patient/${encodeURIComponent(patientId)}`}
            {...props}
            onClick={(e) => {
                acknowledge(patientId);
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
                    return;
                }
                e.preventDefault();
                props.onClick?.(e);
                peek(patientId);
            }}
        >
            {children}
        </Link>
    );
}
