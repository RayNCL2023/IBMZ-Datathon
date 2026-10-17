import { metaGen } from "nitlix-metagen";
import AdvancedGate from "@/components/(shell)/AdvancedGate";
import SystemClient from "@/components/(insights)/SystemClient";

export const metadata = metaGen({
    title: "LinuxONE system | Bedrock",
    description: "Platform, model and NNPA versus CPU inference benchmark.",
});

export default async function () {
    return (
        <AdvancedGate title="LinuxONE system">
            <SystemClient />
        </AdvancedGate>
    );
}
