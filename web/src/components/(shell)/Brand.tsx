import Link from "next/link";
import { BRAND } from "@/var/nav";

// Mark: a bay seen from above (walls, doorways, the patient at its centre), with the dot in the alert colour.
export default function ({ compact = false }: { compact?: boolean }) {
    return (
        <Link href="/" className="flex flex-row items-center gap-[.6rem] min-w-0 rounded-control" aria-label={`${BRAND.name}, go to ward`}>
            <svg width="28" height="28" viewBox="0 0 30 30" aria-hidden className="shrink-0">
                <rect x="1" y="1" width="28" height="28" rx="5" fill="none" stroke="var(--d-fg)" strokeWidth="2" />
                <path d="M1 15h10M19 15h10M15 1v8M15 21v8" stroke="var(--d-fg)" strokeWidth="2" />
                <circle cx="15" cy="15" r="3.5" fill="var(--d-danger)" />
            </svg>
            {!compact && (
                <span className="flex flex-col min-w-0">
                    <span className="text-[1rem] font-[700] tracking-[-0.02em] text-fg leading-[1.1]">{BRAND.name}</span>
                    <span className="text-[.8125rem] text-muted truncate">{BRAND.tagline}</span>
                </span>
            )}
        </Link>
    );
}
