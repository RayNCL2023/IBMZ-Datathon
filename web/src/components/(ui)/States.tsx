import { twMerge } from "tailwind-merge";
import { LuRefreshCw } from "react-icons/lu";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import ToneIcon from "@/components/(ui)/ToneIcon";

export function Skeleton({ className }: { className?: string }) {
    return <div aria-hidden className={twMerge("skeleton rounded-control h-[1rem]", className)} />;
}

export function ErrorState({ error, onRetry, className }: { error: Error; onRetry?: () => void; className?: string }) {
    return (
        <div role="alert" className={twMerge("flex flex-col items-start gap-[.75rem] p-[1rem] rounded-card border-[1px] border-danger-line bg-danger-soft", className)}>
            <div className="flex flex-row items-center gap-[.5rem] text-danger-ink font-[600]">
                <ToneIcon tone="danger" size={18} />
                Couldn&apos;t load this data
            </div>
            <p className="text-[.9rem] text-fg">{error.message}</p>
            {onRetry && (
                <ButtonSecondary onClick={onRetry}>
                    <LuRefreshCw size={16} /> Try again
                </ButtonSecondary>
            )}
        </div>
    );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-col items-center text-center gap-[.5rem] py-[3rem] px-[1rem]">
            <strong className="text-[1rem] text-fg">{title}</strong>
            {children && <div className="text-[.9rem] text-muted max-w-[44ch]">{children}</div>}
        </div>
    );
}

export function Kbd({ children }: { children: React.ReactNode }) {
    return (
        <kbd className="inline-flex items-center justify-center min-w-[1.4rem] h-[1.4rem] px-[.3rem] rounded-[.3rem] border-[1px] border-line-strong bg-sunken text-[.75rem] font-[600] text-muted font-sans">
            {children}
        </kbd>
    );
}
