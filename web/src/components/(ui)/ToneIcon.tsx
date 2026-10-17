import { LuCircleAlert, LuCircleCheck, LuInfo, LuTriangleAlert } from "react-icons/lu";
import type { ToastTone } from "@/contexts/ToastContext";

const ICONS = {
    info: LuInfo,
    success: LuCircleCheck,
    warning: LuTriangleAlert,
    danger: LuCircleAlert,
};

export default function ({ tone, size = 20, className }: { tone: ToastTone; size?: number; className?: string }) {
    const Icon = ICONS[tone];
    return <Icon size={size} className={className} aria-hidden />;
}
