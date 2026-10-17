import { twMerge } from "tailwind-merge";
import PillBase from "@/components/(ui)/PillBase";
import ToneIcon from "@/components/(ui)/ToneIcon";
import type { ToastTone } from "@/contexts/ToastContext";

export type Tone = ToastTone | "neutral";

const TONES: Record<Tone, string> = {
    neutral: "",
    info: "bg-accent-soft text-accent-ink border-transparent",
    success: "bg-ok-soft text-ok-ink border-transparent",
    warning: "bg-warn-soft text-warn-ink border-transparent",
    danger: "bg-danger-soft text-danger-ink border-transparent",
};

// Status is never colour alone: tone pills carry an icon unless told otherwise.
export default function ({
    tone = "neutral",
    icon = tone !== "neutral",
    className,
    children,
    ...props
}: React.JSX.IntrinsicElements["span"] & { tone?: Tone; icon?: boolean }) {
    return (
        <PillBase className={twMerge(TONES[tone], className)} {...props}>
            {icon && tone !== "neutral" && <ToneIcon tone={tone} size={14} />}
            {children}
        </PillBase>
    );
}
