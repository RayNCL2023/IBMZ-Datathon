"use client";

import Link from "next/link";
import { LuArrowLeft } from "react-icons/lu";
import PatientDetail from "@/components/(patient)/PatientDetail";

export default function ({ patientId }: { patientId: string }) {
    return (
        <div className="page">
            <Link href="/" className="inline-flex flex-row items-center gap-[.4rem] self-start min-h-[2rem] text-[.875rem] text-muted hover:text-fg">
                <LuArrowLeft size={16} aria-hidden /> Back to ward
            </Link>
            <PatientDetail patientId={patientId} variant="page" />
        </div>
    );
}
