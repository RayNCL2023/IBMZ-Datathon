import { twMerge } from "tailwind-merge";

export default function ({
    label,
    value,
    sub,
    className,
}: {
    label: React.ReactNode;
    value: React.ReactNode;
    sub?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={twMerge("flex flex-col gap-[.2rem] min-w-0", className)}>
            <span className="text-[.8125rem] text-muted font-[550]">{label}</span>
            <span className="text-[1.6rem] font-[650] tracking-[-0.02em] text-fg leading-[1.1] font-num">{value}</span>
            {sub && <span className="text-[.8125rem] text-muted leading-[1.4]">{sub}</span>}
        </div>
    );
}
