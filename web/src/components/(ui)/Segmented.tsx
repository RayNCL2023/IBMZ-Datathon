"use client";

import { twMerge } from "tailwind-merge";

// Single-choice control (radiogroup) for view modes, sort orders, privacy budgets.
export default function <T extends string>({
    label,
    value,
    options,
    onChange,
    className,
}: {
    label: string;
    value: T;
    options: { value: T; label: React.ReactNode; title?: string }[];
    onChange: (v: T) => void;
    className?: string;
}) {
    return (
        <div role="radiogroup" aria-label={label} className={twMerge("inline-flex flex-row p-[.2rem] gap-[.15rem] rounded-control bg-sunken border-[1px] border-line", className)}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        role="radio"
                        aria-checked={active}
                        title={o.title}
                        onClick={() => onChange(o.value)}
                        className={twMerge(
                            "min-h-[calc(var(--d-control)-.4rem)] px-[.65rem] rounded-[calc(var(--d-radius-control)-.15rem)] text-[.85rem] font-[550] text-muted hover:text-fg whitespace-nowrap",
                            active && "bg-surface text-fg shadow-[var(--d-shadow-sm)]",
                        )}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
