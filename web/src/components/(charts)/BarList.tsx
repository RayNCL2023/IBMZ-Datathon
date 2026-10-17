import { twMerge } from "tailwind-merge";

export type BarItem = {
    id: string;
    label: React.ReactNode;
    value: number;
    display: string;
    color?: string;
    // Optional comparison value drawn as a tick on the same track (e.g. NEWS2 vs model).
    compare?: number;
    compareLabel?: string;
};

// Horizontal bars on one shared scale: driver contributions, AUROC by site, events caught by group.
export default function ({ items, max, className }: { items: BarItem[]; max?: number; className?: string }) {
    const top = max ?? Math.max(1e-9, ...items.map((i) => Math.max(i.value, i.compare ?? 0)));
    return (
        <ul className={twMerge("flex flex-col gap-[.6rem]", className)}>
            {items.map((item) => (
                <li key={item.id} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-[.75rem] text-[.85rem]">
                    <span className="text-fg truncate">{item.label}</span>
                    <span className="relative h-[.5rem] rounded-full bg-sunken">
                        <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${(Math.max(0, item.value) / top) * 100}%`, background: item.color ?? "var(--d-accent)" }}
                        />
                        {item.compare !== undefined && (
                            <span
                                title={item.compareLabel}
                                className="absolute top-[-.2rem] bottom-[-.2rem] w-[2px] bg-fg rounded-full"
                                style={{ left: `calc(${(item.compare / top) * 100}% - 1px)` }}
                            />
                        )}
                    </span>
                    <span className="text-muted font-num text-right min-w-[3.5rem]">{item.display}</span>
                </li>
            ))}
        </ul>
    );
}
