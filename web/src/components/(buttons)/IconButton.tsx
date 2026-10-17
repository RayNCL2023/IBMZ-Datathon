import { twMerge } from "tailwind-merge";
import ButtonGhost from "@/components/(buttons)/ButtonGhost";

// Icon-only button: the label is required so it always has an accessible name.
export default function ({
    label,
    className,
    children,
    ...props
}: React.JSX.IntrinsicElements["button"] & { label: string }) {
    return (
        <ButtonGhost aria-label={label} title={label} className={twMerge("px-0 w-[var(--d-control)] shrink-0", className)} {...props}>
            {children}
        </ButtonGhost>
    );
}
