import Link from "next/link";
import { twMerge } from "tailwind-merge";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/components/(buttons)/ButtonBase";

// A link that looks like a button (navigation stays a real <a>, so new-tab and middle-click work).
export default function ({
    variant = "secondary",
    className,
    children,
    ...props
}: React.ComponentProps<typeof Link> & { variant?: keyof typeof BUTTON_VARIANTS }) {
    return (
        <Link className={twMerge(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props}>
            {children}
        </Link>
    );
}
