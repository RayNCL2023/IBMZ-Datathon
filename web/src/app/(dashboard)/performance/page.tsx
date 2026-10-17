import { metaGen } from "nitlix-metagen";
import PerformanceClient from "@/components/(insights)/PerformanceClient";

export const metadata = metaGen({
    title: "Model performance | Vigil",
    description: "Accuracy, alarm fatigue and fairness of every risk head against NEWS2.",
});

export default async function () {
    return <PerformanceClient />;
}
