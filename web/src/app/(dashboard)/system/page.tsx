import { metaGen } from "nitlix-metagen";
import SystemClient from "@/components/(insights)/SystemClient";

export const metadata = metaGen({
    title: "LinuxONE system | Vigil",
    description: "Platform, model and NNPA versus CPU inference benchmark.",
});

export default async function () {
    return <SystemClient />;
}
