import { LuX } from "react-icons/lu";
import { twMerge } from "tailwind-merge";
import IconButton from "@/components/(buttons)/IconButton";

// Standard dialog layout: header (title, description, close), scrollable body, optional footer actions.
// Also used by drawers, which pass `headerExtra` for actions like "Open as page".
export default function ({
    title,
    description,
    onClose,
    footer,
    headerExtra,
    className,
    children,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    onClose: () => void;
    footer?: React.ReactNode;
    headerExtra?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <>
            <header className="flex flex-row items-start gap-[1rem] px-[1.25rem] pt-[1.1rem] pb-[.9rem] border-b-[1px] border-line">
                <div className="flex flex-col gap-[.25rem] flex-1 min-w-0">
                    <h2 className="text-[1.15rem] font-[650] tracking-[-0.01em] text-fg text-balance">{title}</h2>
                    {description && <p className="text-[.9rem] text-muted leading-[1.45]">{description}</p>}
                </div>
                {headerExtra}
                <IconButton label="Close" onClick={onClose}>
                    <LuX size={18} />
                </IconButton>
            </header>
            <div className={twMerge("flex flex-col gap-[1rem] p-[1.25rem] overflow-y-auto flex-1", className)}>{children}</div>
            {footer && (
                <footer className="flex flex-row flex-wrap justify-end gap-[.5rem] px-[1.25rem] py-[.9rem] border-t-[1px] border-line bg-sunken">
                    {footer}
                </footer>
            )}
        </>
    );
}
