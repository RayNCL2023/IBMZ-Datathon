import { twMerge } from "tailwind-merge";

export default function ({ className, children, ...props }: React.JSX.IntrinsicElements["span"]) {
    return (
        <span
            className={twMerge(
                "inline-flex flex-row items-center gap-[.35rem] rounded-full border-[1px] border-line px-[.55rem] py-[.1rem] text-[.8rem] font-[550] text-muted whitespace-nowrap",
                className,
            )}
            {...props}
        >
            {children}
        </span>
    );
}
