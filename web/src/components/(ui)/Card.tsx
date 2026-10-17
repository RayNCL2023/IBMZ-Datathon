import { twMerge } from "tailwind-merge";

// Surface panel with an optional header row. `title` is a heading for the panel's content, not decoration.
export default function ({
    title,
    description,
    actions,
    className,
    bodyClassName,
    children,
    ...props
}: Omit<React.JSX.IntrinsicElements["section"], "title"> & {
    title?: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    bodyClassName?: string;
}) {
    return (
        <section className={twMerge("flex flex-col bg-surface border-[1px] border-line rounded-card min-w-0", className)} {...props}>
            {(title || actions) && (
                <header className="flex flex-row flex-wrap items-start justify-between gap-[.75rem] px-[1rem] pt-[.9rem]">
                    <div className="flex flex-col gap-[.2rem] min-w-0">
                        {title && <h3 className="text-[.95rem] font-[650] text-fg tracking-[-0.005em]">{title}</h3>}
                        {description && <p className="text-[.85rem] text-muted leading-[1.45] max-w-[60ch]">{description}</p>}
                    </div>
                    {actions && <div className="flex flex-row flex-wrap items-center gap-[.5rem]">{actions}</div>}
                </header>
            )}
            <div className={twMerge("flex flex-col gap-[.75rem] p-[1rem]", bodyClassName)}>{children}</div>
        </section>
    );
}
