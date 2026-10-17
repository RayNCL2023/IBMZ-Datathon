import { metaGen } from "nitlix-metagen";
import AdvancedGate from "@/components/(shell)/AdvancedGate";
import FederatedClient from "@/components/(insights)/FederatedClient";

export const metadata = metaGen({
    title: "Federated learning | Bedrock",
    description: "Sepsis model trained across hospitals without moving patient data, with a differential-privacy dial.",
});

export default async function () {
    return (
        <AdvancedGate title="Federated learning">
            <FederatedClient />
        </AdvancedGate>
    );
}
