import { metaGen } from "nitlix-metagen";
import FederatedClient from "@/components/(insights)/FederatedClient";

export const metadata = metaGen({
    title: "Federated learning | Vigil",
    description: "Sepsis model trained across hospitals without moving patient data, with a differential-privacy dial.",
});

export default async function () {
    return <FederatedClient />;
}
