import { twMerge } from "tailwind-merge";

// Shared so links styled as buttons (<ButtonLink>) look identical to real buttons.
export const BUTTON_BASE =
    "inline-flex flex-row items-center justify-center gap-[.5rem] min-h-[var(--d-control)] px-[.85rem] rounded-control text-[.9rem] font-[550] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap";

export const BUTTON_VARIANTS = {
    primary: "bg-accent text-accent-fg hover:bg-accent-strong",
    secondary: "bg-surface text-fg border-[1px] border-line-strong hover:bg-hover",
    ghost: "bg-transparent text-muted hover:bg-hover hover:text-fg",
};

export default function ({ children, className, type = "button", ...props }: React.JSX.IntrinsicElements["button"]) {
    return (
        <button type={type} className={twMerge(BUTTON_BASE, className)} {...props}>
            {children}
        </button>
    );
}
