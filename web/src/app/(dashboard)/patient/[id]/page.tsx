import { metaGen } from "nitlix-metagen";
import PatientPage from "@/components/(patient)/PatientPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return metaGen({
        title: `Patient ${id} | Vigil`,
        description: `Risk timeline, drivers, observations and SBAR handover for patient ${id}.`,
    });
}

export default async function ({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <PatientPage patientId={decodeURIComponent(id)} />;
}
