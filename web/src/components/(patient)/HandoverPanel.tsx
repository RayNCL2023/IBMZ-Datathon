"use client";

import { useEffect, useState } from "react";
import { LuCopy, LuSparkles } from "react-icons/lu";
import type { HandoverResponse } from "@/lib/api/types";
import { useApiClient } from "@/contexts/DesignContext";
import { useReplay } from "@/contexts/ReplayContext";
import { useToast } from "@/contexts/ToastContext";
import Card from "@/components/(ui)/Card";
import StatusPill from "@/components/(ui)/StatusPill";
import ButtonPrimary from "@/components/(buttons)/ButtonPrimary";
import ButtonSecondary from "@/components/(buttons)/ButtonSecondary";
import { ErrorState } from "@/components/(ui)/States";

const SBAR_PARTS = [
    ["situation", "Situation"],
    ["background", "Background"],
    ["assessment", "Assessment"],
    ["recommendation", "Recommendation"],
] as const;

// SBAR handover: the four parts are built by rules from the data (always correct). Granite 4.0 on LinuxONE
// then writes a spoken-style summary that is checked: every number must be in the facts and a condition is
// never stated as a diagnosis. A summary that fails either check is not shown as the handover.
export default function ({ patientId, hour }: { patientId: string; hour: number }) {
    const api = useApiClient();
    const { privacy } = useReplay();
    const { push } = useToast();
    const [note, setNote] = useState<HandoverResponse | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [busy, setBusy] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    // A note belongs to one replay hour; moving the clock makes it stale. The API caches one note per patient,
    // hour and model, so writing again for the same hour would return the identical note: no regenerate button.
    const stale = note !== null && note.hour !== hour;

    useEffect(() => {
        if (!busy) {
            return;
        }
        const started = Date.now();
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
        return () => clearInterval(timer);
    }, [busy]);

    async function generate() {
        setBusy(true);
        setError(null);
        setElapsed(0);
        try {
            const result = await api.handover(patientId, hour, privacy);
            setNote(result);
            push({
                tone: result.narrative && result.verified ? "success" : "info",
                title: "Handover ready",
                description: result.narrative && result.verified ? "Granite summary passed both safety checks." : "Showing the rule-based SBAR.",
            });
        } catch (e) {
            setError(e as Error);
        } finally {
            setBusy(false);
        }
    }

    async function copy() {
        if (!note) {
            return;
        }
        const text = SBAR_PARTS.map(([k, label]) => `${label}: ${note.sbar[k]}`).join("\n");
        try {
            await navigator.clipboard.writeText(text);
            push({ tone: "success", title: "Handover copied", description: "SBAR copied to the clipboard." });
        } catch {
            push({ tone: "warning", title: "Couldn't copy", description: "Your browser blocked clipboard access. Select the text instead." });
        }
    }

    const narrativeOk = note?.narrative && note.verified;

    return (
        <Card
            title="Handover note (SBAR)"
            description="Facts and recommendation come from rules over the data. Granite 4.0 runs on the LinuxONE VM (no data leaves it) and writes a short spoken summary, which is checked before it is shown."
            actions={
                <>
                    {note && (
                        <ButtonSecondary onClick={copy}>
                            <LuCopy size={16} /> Copy SBAR
                        </ButtonSecondary>
                    )}
                    {(!note || stale || busy) && (
                        <ButtonPrimary onClick={generate} disabled={busy} aria-busy={busy}>
                            <LuSparkles size={16} />
                            {busy ? `Writing… ${elapsed}s` : stale ? `Update to hour ${hour}` : `Write handover for hour ${hour}`}
                        </ButtonPrimary>
                    )}
                </>
            }
        >
            {busy && (
                <p className="text-[.875rem] text-muted" aria-live="polite">
                    Granite usually takes 15 to 20 seconds on the VM&apos;s three cores. The rule-based facts are ready as soon as it finishes.
                </p>
            )}

            {error && <ErrorState error={error} onRetry={generate} />}

            {!note && !busy && !error && (
                <p className="text-[.9rem] text-muted">Write a handover to get an SBAR for this patient at the current replay hour.</p>
            )}

            {note && (
                <div className="flex flex-col gap-[1rem]">
                    {stale && <StatusPill tone="warning">Written for hour {note.hour}. The replay has moved on.</StatusPill>}

                    {narrativeOk && (
                        <figure className="flex flex-col gap-[.5rem] p-[1rem] rounded-card bg-accent-soft">
                            <blockquote className="text-[1rem] leading-[1.55] text-fg">{note.narrative}</blockquote>
                            <figcaption className="flex flex-row flex-wrap items-center gap-[.5rem] text-[.8125rem] text-muted">
                                <StatusPill tone="success">Checked against the facts</StatusPill>
                                Granite 4.0{note.generationSeconds ? `, ${note.generationSeconds.toFixed(1)} s` : ""}
                                {note.cached ? ", cached" : ""}
                            </figcaption>
                        </figure>
                    )}

                    {note.narrative && !note.verified && (
                        <div className="flex flex-col gap-[.5rem] p-[1rem] rounded-card border-[1px] border-line bg-sunken">
                            <StatusPill tone="warning" className="self-start">
                                Granite summary held back: it failed a safety check
                            </StatusPill>
                            <ul className="text-[.85rem] text-muted list-disc pl-[1.25rem]">
                                {(note.unverifiedNumbers ?? []).length > 0 && <li>Numbers not in the facts: {note.unverifiedNumbers!.join(", ")}</li>}
                                {(note.statedAsDiagnosis ?? []).map((sentence) => (
                                    <li key={sentence}>States a predicted risk as a diagnosis: &ldquo;{sentence}&rdquo;</li>
                                ))}
                            </ul>
                            <p className="text-[.85rem] text-muted">Use the rule-based SBAR below.</p>
                        </div>
                    )}

                    {!note.narrative && note.error && (
                        <StatusPill tone="info" className="self-start">
                            No Granite summary ({note.error}). The rule-based SBAR is complete.
                        </StatusPill>
                    )}

                    <dl className="grid grid-cols-1 md:grid-cols-[9rem_1fr] gap-x-[1rem] gap-y-[.75rem]">
                        {SBAR_PARTS.map(([k, label]) => (
                            <div key={k} className="contents">
                                <dt className="text-[.85rem] font-[650] text-fg">{label}</dt>
                                <dd className="text-[.9rem] text-fg leading-[1.55]">{note.sbar[k]}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}
        </Card>
    );
}
