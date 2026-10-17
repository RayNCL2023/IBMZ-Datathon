import { twMerge } from "tailwind-merge";
import { news2Band } from "@/lib/news2";
import StatusPill from "@/components/(ui)/StatusPill";

// NEWS2 aggregate with its RCP clinical-response band. Alert = aggregate ≥ 5 or any single parameter = 3.
export default function ({ score, alert, className }: { score: number; alert: boolean; className?: string }) {
    const band = news2Band(score);
    const tone = band === "high" ? "danger" : alert ? "warning" : "neutral";
    return (
        <StatusPill
            tone={tone}
            className={twMerge("font-num", className)}
            title={alert ? `NEWS2 ${score}: alert (aggregate ≥ 5 or a single parameter scored 3)` : `NEWS2 ${score}: no alert`}
        >
            NEWS2 {score}
        </StatusPill>
    );
}
