import type { IconType } from "react-icons";
import { LuActivity, LuBedDouble, LuCpu, LuNetwork } from "react-icons/lu";

export const BRAND = {
    name: "Vigil",
    tagline: "ICU early warning on IBM LinuxONE",
};

export const NAV: { href: string; label: string; description: string; icon: IconType }[] = [
    { href: "/", label: "Ward", description: "Live bed board with every risk", icon: LuBedDouble },
    { href: "/performance", label: "Model performance", description: "Accuracy, alarm fatigue and fairness vs NEWS2", icon: LuActivity },
    { href: "/federated", label: "Federated learning", description: "Training across hospitals with a privacy dial", icon: LuNetwork },
    { href: "/system", label: "LinuxONE system", description: "Platform, model and NNPA vs CPU benchmark", icon: LuCpu },
];

export const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
