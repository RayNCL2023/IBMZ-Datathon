"use client";

import { useCallback, useEffect, useState } from "react";
import { LuCopy, LuSparkles } from "react-icons/lu";
import type { ShiftBedStatus, ShiftSummaryResponse } from "@/lib/api/types";
import { useModal } from "@/contexts/ModalContext";
import { useApiClient } from "@/contexts/DesignContext";
import { useReplay } from "@/contexts/ReplayContext";
import { useToast } from "@/contexts/ToastContext";
import ModalPrimary from "@/components/(modals)/ModalPrimary";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import ButtonGhost from "@/components/(buttons)/ButtonGhost";
import StatusPill, { type Tone } from "@/components/(ui)/StatusPill";
import Stat from "@/components/(ui)/Stat";
import PatientLink from "@/components/(patient)/PatientLink";
import News2Badge from "@/components/(clinical)/News2Badge";
import { ErrorState } from "@/components/(ui)/States";
import { bedNo, clamp, clockLabel } from "@/lib/format";

export const MAX_SHIFT_HOURS = 72;
const PRESETS = [4, 8, 12, 24];

const STATUS: Record<ShiftBedStatus, { label: string; tone: Tone }> = {
    worsening: { label: "Worsening", tone: "danger" },
    stable: { label: "Stable", tone: "neutral" },
    improving: { label: "Improving", tone: "success" },
    discharged: { label: "Discharged", tone: "neutral" },
};

// Ward shift summary over the last n hours of the replay. Per-bed changes come from rules over the data (always
// correct); Granite 4.0 on LinuxONE turns the beds that need attention into a spoken handover for the nurse in
// charge, checked like the SBAR note: every number must be in the facts, no risk stated as a diagnosis.
function ShiftSummary({ close }: { close: () => void }) {
    const api = useApiClient();
    const { hour, privacy } = useReplay();
    const { push } = useToast();
    const [input, setInput] = useState("12");
    const [summary, setSummary] = useState<ShiftSummaryResponse | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [busy, setBusy] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const hours = Number(input);
    const valid = Number.isInteger(hours) && hours >= 1 && hours <= MAX_SHIFT_HOURS;
    const fromHour = Math.max(0, hour - (valid ? hours : 0));
    const stale = summary !== null && (summary.hour !== hour || summary.privacy !== privacy);

    useEffect(() => {
        if (!busy) {
            return;
        }
        const started = Date.now();
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
        return () => clearInterval(timer);
    }, [busy]);

    async function generate(e?: React.FormEvent) {
        e?.preventDefault();
        if (!valid) {
            return;
        }
        setBusy(true);
        setError(null);
        setElapsed(0);
        try {
            const result = await api.shiftSummary(hours, hour, privacy);
            setSummary(result);
            push({
                tone: result.narrative && result.verified ? "success" : "info",
                title: "Shift summary ready",
                description: result.narrative && result.verified ? "Granite summary passed both safety checks." : "Showing the rule-based summary.",
            });
        } catch (err) {
            setError(err as Error);
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!summary) {
            return;
        }
        const text = [summary.overview, "", ...summary.beds.map((b) => b.line)].join("\n");
        try {
            await navigator.clipboard.writeText(text);
            push({ tone: "success", title: "Shift summary copied", description: "Overview and per-bed lines copied to the clipboard." });
        } catch {
            push({ tone: "warning", title: "Couldn't copy", description: "Your browser blocked clipboard access. Select the text instead." });
        }
    }

    const narrativeOk = summary?.narrative && summary.verified;

    return (
        <ModalPrimary
            title="Shift summary"
            description="What changed on the ward over the last hours of the replay. Facts come from rules over the data; Granite 4.0 on the LinuxONE VM writes a short spoken handover, checked before it is shown."
            onClose={close}
            footer={
                <>
                    <ButtonGhost onClick={close}>Close</ButtonGhost>
                    {summary && (
                        <ButtonSecondary onClick={copy}>
                            <LuCopy size={16} /> Copy summary
                        </ButtonSecondary>
                    )}
                    <ButtonPrimary type="submit" form="shift-summary" disabled={busy || !valid} aria-busy={busy}>
                        <LuSparkles size={16} />
                        {busy ? `Writing… ${elapsed}s` : summary && !stale ? "Write again" : "Write summary"}
                    </ButtonPrimary>
                </>
            }
        >
            <form id="shift-summary" onSubmit={generate} className="flex flex-col gap-[.6rem]">
                <div className="flex flex-row flex-wrap items-end gap-[.75rem]">
                    <label className="flex flex-col gap-[.25rem] text-[.8125rem] text-muted">
                        <span>Last how many hours?</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={MAX_SHIFT_HOURS}
                            step={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onBlur={() => valid || input === "" || setInput(String(clamp(Math.round(hours) || 1, 1, MAX_SHIFT_HOURS)))}
                            aria-invalid={!valid}
                            className="w-[7rem] min-h-[var(--d-control)] px-[.6rem] rounded-control border-[1px] border-line-strong bg-surface text-fg text-[1rem] font-num"
                        />
                    </label>
                    <div className="flex flex-row flex-wrap gap-[.4rem]" role="group" aria-label="Common shift lengths">
                        {PRESETS.map((n) => (
                            <ButtonGhost key={n} type="button" onClick={() => setInput(String(n))} aria-pressed={hours === n} className={hours === n ? "bg-sunken text-fg" : undefined}>
                                {n} h
                            </ButtonGhost>
                        ))}
                    </div>
                </div>
                <p className={valid ? "text-[.8125rem] text-muted" : "text-[.8125rem] text-danger-ink"}>
                    {valid
                        ? `Covers ${clockLabel(fromHour)} to ${clockLabel(hour)} (hour ${fromHour} to ${hour})${fromHour === 0 && hour < hours ? ", the whole replay so far" : ""}.`
                        : `Enter a whole number of hours from 1 to ${MAX_SHIFT_HOURS}.`}
                </p>
            </form>

            {busy && (
                <p className="text-[.875rem] text-muted" aria-live="polite">
                    Granite usually takes 15 to 30 seconds on the VM&apos;s three cores.
                </p>
            )}

            {error && <ErrorState error={error} onRetry={() => generate()} />}

            {summary && (
                <div className="flex flex-col gap-[1rem] pt-[1rem] border-t-[1px] border-line">
                    {stale && (
                        <StatusPill tone="warning" className="self-start">
                            Written for hour {summary.hour}. The replay has moved on.
                        </StatusPill>
                    )}

                    {narrativeOk && (
                        <figure className="flex flex-col gap-[.5rem] p-[1rem] rounded-card bg-accent-soft">
                            <blockquote className="text-[1rem] leading-[1.55] text-fg">{summary.narrative}</blockquote>
                            <figcaption className="flex flex-row flex-wrap items-center gap-[.5rem] text-[.8125rem] text-muted">
                                <StatusPill tone="success">Checked against the facts</StatusPill>
                                Granite 4.0{summary.generationSeconds ? `, ${summary.generationSeconds.toFixed(1)} s` : ""}
                                {summary.cached ? ", cached" : ""}
                            </figcaption>
                        </figure>
                    )}

                    {summary.narrative && !summary.verified && (
                        <div className="flex flex-col gap-[.5rem] p-[1rem] rounded-card border-[1px] border-line bg-sunken">
                            <StatusPill tone="warning" className="self-start">
                                Granite summary held back: it failed a safety check
                            </StatusPill>
                            <ul className="text-[.85rem] text-muted list-disc pl-[1.25rem]">
                                {(summary.unverifiedNumbers ?? []).length > 0 && <li>Numbers not in the facts: {summary.unverifiedNumbers!.join(", ")}</li>}
                                {(summary.statedAsDiagnosis ?? []).map((sentence) => (
                                    <li key={sentence}>States a predicted risk as a diagnosis: &ldquo;{sentence}&rdquo;</li>
                                ))}
                            </ul>
                            <p className="text-[.85rem] text-muted">Use the rule-based summary below.</p>
                        </div>
                    )}

                    {!summary.narrative && summary.error && (
                        <StatusPill tone="info" className="self-start">
                            No Granite summary ({summary.error}). The rule-based summary is complete.
                        </StatusPill>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-[1rem]">
                        <Stat label="Alarming now" value={summary.counts.alerting} sub={`of ${summary.counts.beds} beds`} />
                        <Stat label="New risk alarms" value={summary.counts.newAlarms} sub={`in ${summary.counts.bedsWithNewAlarms} beds`} />
                        <Stat label="Worsening" value={summary.counts.worsening} sub={`${summary.counts.improving} improving`} />
                        <Stat label="Discharged" value={summary.counts.discharged} sub={`${summary.counts.stable} stable`} />
                    </div>

                    <ul className="flex flex-col divide-y-[1px] divide-line border-y-[1px] border-line">
                        {summary.beds.map((b) => (
                            <li key={b.patientId} className="flex flex-col sm:flex-row sm:items-start gap-[.5rem] sm:gap-[1rem] py-[.7rem]">
                                <div className="flex flex-row items-center gap-[.5rem] sm:w-[13rem] shrink-0">
                                    <PatientLink patientId={b.patientId} onClick={close} className="font-[650] text-fg font-num hover:underline">
                                        Bed {bedNo(b.bed)}
                                    </PatientLink>
                                    <StatusPill tone={STATUS[b.status].tone}>{STATUS[b.status].label}</StatusPill>
                                </div>
                                <p className="flex-1 text-[.9rem] text-fg leading-[1.5] min-w-0">{b.line.replace(/^Bed \d+: /, "")}</p>
                                {b.status !== "discharged" && <News2Badge score={b.news2.end} alert={b.news2.alert} className="self-start" />}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[.8125rem] text-muted">Decision support only: confirm clinically.</p>
                </div>
            )}
        </ModalPrimary>
    );
}

export function useShiftSummary() {
    const { open } = useModal();
    return useCallback(() => open((close) => <ShiftSummary close={close} />, { label: "Shift summary", size: "xl", key: "shift-summary" }), [open]);
}
