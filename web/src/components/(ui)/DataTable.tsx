import { twMerge } from "tailwind-merge";

export type Column<T> = {
    key: string;
    header: React.ReactNode;
    cell: (row: T) => React.ReactNode;
    numeric?: boolean;
};

// Plain, accessible table used by every insight page (sites, fairness groups, benchmark batches).
export default function <T>({
    columns,
    rows,
    rowKey,
    caption,
    className,
}: {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    caption: string;
    className?: string;
}) {
    return (
        <div className={twMerge("overflow-x-auto", className)}>
            <table className="w-full border-collapse text-[.875rem]">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr>
                        {columns.map((c, i) => (
                            <th
                                key={c.key}
                                scope="col"
                                className={twMerge(
                                    "py-[.5rem] px-[.6rem] text-[.8rem] font-[600] text-muted border-b-[1px] border-line whitespace-nowrap",
                                    c.numeric ? "text-right" : "text-left",
                                    i === 0 && "pl-0",
                                )}
                            >
                                {c.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={rowKey(row)} className="border-b-[1px] border-line last:border-b-0">
                            {columns.map((c, i) => (
                                <td
                                    key={c.key}
                                    className={twMerge("py-[.55rem] px-[.6rem] text-fg whitespace-nowrap", c.numeric && "text-right font-num", i === 0 && "pl-0")}
                                >
                                    {c.cell(row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// "0.843 vs 0.675": the model value strong, the comparison muted.
export function Versus({ model, other, format }: { model: number | null | undefined; other: number | null | undefined; format: (v: number | null | undefined) => string }) {
    const better = model !== null && model !== undefined && other !== null && other !== undefined && model > other;
    return (
        <span className="inline-flex items-baseline gap-[.35rem] justify-end">
            <b className={twMerge("font-[650]", better && "text-ok-ink")}>{format(model)}</b>
            <span className="text-faint text-[.8rem]">vs {format(other)}</span>
        </span>
    );
}
