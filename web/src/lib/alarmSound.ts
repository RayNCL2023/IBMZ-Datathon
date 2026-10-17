// Alarm cues synthesised with Web Audio (no files). Patterns follow the spirit of IEC 60601-1-8 so priority is
// audible without looking: high = fast 3 + 2 pulse burst, medium = 3 slower, lower pulses.
export type AlarmPriority = "high" | "medium";

const PATTERNS: Record<AlarmPriority, { freq: number; pulse: number; starts: number[] }> = {
    high: { freq: 659, pulse: 0.14, starts: [0, 0.2, 0.4, 0.85, 1.05] },
    medium: { freq: 523, pulse: 0.2, starts: [0, 0.3, 0.6] },
};

let ctx: AudioContext | null = null;

// Browsers only start audio after a user gesture; call this from one (a click or key press).
export function unlockAudio() {
    try {
        ctx ??= new AudioContext();
        if (ctx.state === "suspended") {
            void ctx.resume();
        }
        return true;
    } catch {
        return false;
    }
}

function pulse(audio: AudioContext, at: number, freq: number, length: number) {
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.015);
    gain.gain.setValueAtTime(0.16, at + length - 0.04);
    gain.gain.linearRampToValueAtTime(0, at + length);
    gain.connect(audio.destination);

    // Fundamental plus two quiet harmonics: easier to locate in a noisy ward than a pure sine.
    for (const [mult, level] of [
        [1, 1],
        [2, 0.35],
        [3, 0.18],
    ] as const) {
        const osc = audio.createOscillator();
        const g = audio.createGain();
        osc.type = "sine";
        osc.frequency.value = freq * mult;
        g.gain.value = level;
        osc.connect(g).connect(gain);
        osc.start(at);
        osc.stop(at + length + 0.02);
    }
}

export function playAlarm(priority: AlarmPriority) {
    if (!ctx || ctx.state !== "running") {
        return;
    }
    const p = PATTERNS[priority];
    const now = ctx.currentTime + 0.02;
    for (const start of p.starts) {
        pulse(ctx, now + start, p.freq, p.pulse);
    }
}
