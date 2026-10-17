import { metaGen } from "nitlix-metagen";
import WardClient from "@/components/(ward)/WardClient";

export const metadata = metaGen({
    title: "Ward | Vigil",
    description: "Twelve ICU beds replayed hour by hour with five risk heads and NEWS2.",
});

export default async function () {
    return <WardClient />;
}
