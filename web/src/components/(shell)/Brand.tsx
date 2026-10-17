import Link from "next/link";
import { BRAND } from "@/var/nav";

// Wordmark: a heartbeat-like tick inside a rounded square, drawn from the accent token.
export default function ({ compact = false }: { compact?: boolean }) {
    return (
        <Link href="/" className="flex flex-row items-center gap-[.6rem] min-w-0 rounded-control" aria-label={`${BRAND.name}, go to ward`}>
            <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden className="shrink-0">
                <rect width="28" height="28" rx="7" fill="var(--d-accent)" />
                <path d="M5 15h4.5l2.5-6 4 11 2.5-5H23" fill="none" stroke="var(--d-accent-fg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!compact && (
                <span className="flex flex-col min-w-0">
                    <span className="text-[1rem] font-[700] tracking-[-0.02em] text-fg leading-[1.1]">{BRAND.name}</span>
                    <span className="text-[.72rem] text-muted truncate">{BRAND.tagline}</span>
                </span>
            )}
        </Link>
    );
}
