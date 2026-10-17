import { twMerge } from "tailwind-merge";

export default function ({
    title,
    description,
    actions,
    eyebrow,
    className,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    eyebrow?: React.ReactNode;
    className?: string;
}) {
    return (
        <header className={twMerge("flex flex-col md:flex-row md:items-end justify-between gap-[1rem]", className)}>
            <div className="flex flex-col gap-[.4rem] min-w-0">
                {eyebrow}
                <h1 className="text-[1.75rem] md:text-[2rem] font-[700] tracking-[-0.025em] text-fg">{title}</h1>
                {description && <p className="text-[.95rem] text-muted leading-[1.5] max-w-[70ch]">{description}</p>}
            </div>
            {actions && <div className="flex flex-row flex-wrap items-center gap-[.5rem]">{actions}</div>}
        </header>
    );
}
