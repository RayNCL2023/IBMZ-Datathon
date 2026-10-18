import { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Series, continueRender, delayRender, staticFile } from "remotion";
import { Backdrop } from "./kit";
import { FiveRisks, Hook, INTRO_DURATIONS, Title } from "./scenes/Intro";
import { Alarms, Granite, PRODUCT_DURATIONS, Patient, Ward } from "./scenes/Product";
import { Architecture, Auroc, Details, End, Evidence, Fairness, PROOF_DURATIONS } from "./scenes/Proof";
import { DEEP_DURATIONS, Federated, History } from "./scenes/Deep";

// Scene order and lengths (frames at 30 fps). make_audio.py places its cues from the same timeline.
export const TIMELINE = [
    { name: "hook", frames: INTRO_DURATIONS.hook, C: Hook },
    { name: "title", frames: INTRO_DURATIONS.title, C: Title },
    { name: "risks", frames: INTRO_DURATIONS.risks, C: FiveRisks },
    { name: "ward", frames: PRODUCT_DURATIONS.ward, C: Ward },
    { name: "alarms", frames: PRODUCT_DURATIONS.alarms, C: Alarms },
    { name: "patient", frames: PRODUCT_DURATIONS.patient, C: Patient },
    { name: "history", frames: DEEP_DURATIONS.history, C: History },
    { name: "granite", frames: PRODUCT_DURATIONS.granite, C: Granite },
    { name: "evidence", frames: PROOF_DURATIONS.evidence, C: Evidence },
    { name: "details", frames: PROOF_DURATIONS.details, C: Details },
    { name: "auroc", frames: PROOF_DURATIONS.auroc, C: Auroc },
    { name: "fairness", frames: PROOF_DURATIONS.fairness, C: Fairness },
    { name: "federated", frames: DEEP_DURATIONS.federated, C: Federated },
    { name: "architecture", frames: PROOF_DURATIONS.architecture, C: Architecture },
    { name: "end", frames: PROOF_DURATIONS.end, C: End },
];

export const TOTAL = TIMELINE.reduce((n, s) => n + s.frames, 0);

// The app's own typeface, loaded before any frame renders.
function useFont() {
    const [handle] = useState(() => delayRender("Instrument Sans"));
    useEffect(() => {
        const face = new FontFace("Instrument Sans", `url(${staticFile("fonts/InstrumentSans-Variable.woff2")}) format("woff2")`, { weight: "400 700" });
        face.load()
            .then((f) => document.fonts.add(f))
            .finally(() => continueRender(handle));
    }, [handle]);
}

export function Bedrock() {
    useFont();
    return (
        <AbsoluteFill>
            <Backdrop />
            <Series>
                {TIMELINE.map(({ name, frames, C }) => (
                    <Series.Sequence key={name} durationInFrames={frames}>
                        <C />
                    </Series.Sequence>
                ))}
            </Series>
            <Audio src={staticFile("audio/soundtrack.wav")} />
        </AbsoluteFill>
    );
}
