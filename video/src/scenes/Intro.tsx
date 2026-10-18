import { AbsoluteFill, Easing, interpolateColors, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FPS, HEADS } from "../theme";
import { Chip, Logo, Scene, tween, Words } from "../kit";

// Heartbeats speed up as the patient deteriorates. The soundtrack (make_audio.py) uses the same rule.
export function beatTimes(until: number) {
    const out: number[] = [];
    let t = 0.6;
    let k = 0;
    while (t < until) {
        out.push(t);
        t += Math.max(0.5, 0.95 - 0.045 * k);
        k++;
    }
    return out;
}

const HOOK_SECONDS = 8;
// The trace draws across the screen over this many seconds.
export const DRAW_SECONDS = 7.6;
const X0 = 80;
const X1 = 1840;
const xAt = (t: number) => X0 + (t / DRAW_SECONDS) * (X1 - X0);

const BASE = 640;

function ecgPoints(): [number, number][] {
    const pts: [number, number][] = [[X0, BASE]];
    for (const [i, t] of beatTimes(DRAW_SECONDS).entries()) {
        const x = xAt(t);
        const amp = 1 + i * 0.06;
        pts.push([x - 30, BASE], [x - 22, BASE - 10], [x - 14, BASE], [x - 6, BASE + 14], [x, BASE - 150 * amp], [x + 8, BASE + 46], [x + 16, BASE], [x + 40, BASE - 18], [x + 62, BASE]);
    }
    pts.push([X1, BASE]);
    return pts;
}

const PTS = ecgPoints();
const ECG = PTS.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");

function ecgY(x: number) {
    for (let i = 1; i < PTS.length; i++) {
        const [xa, ya] = PTS[i - 1];
        const [xb, yb] = PTS[i];
        if (x <= xb) {
            return xb === xa ? yb : ya + ((x - xa) / (xb - xa)) * (yb - ya);
        }
    }
    return BASE;
}

export function Hook() {
    const frame = useCurrentFrame();
    const t = frame / FPS;
    const draw = tween(frame, 0, DRAW_SECONDS * FPS, 0, 1, Easing.linear);
    const color = interpolateColors(t, [0, 5, 9], [C.accent, C.warn, C.danger]);
    const headX = X0 + draw * (X1 - X0);
    return (
        <Scene fadeIn={10}>
            <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
                <defs>
                    <linearGradient id="fadeTrail" x1="0" x2="1">
                        <stop offset="0" stopColor={color} stopOpacity="0" />
                        <stop offset="0.55" stopColor={color} stopOpacity="0.55" />
                        <stop offset="1" stopColor={color} stopOpacity="1" />
                    </linearGradient>
                    <clipPath id="drawn">
                        <rect x={0} y={0} width={headX} height={1080} />
                    </clipPath>
                </defs>
                <path d={ECG} fill="none" stroke="url(#fadeTrail)" strokeWidth={4} strokeLinejoin="round" clipPath="url(#drawn)" style={{ filter: `drop-shadow(0 0 10px ${color})` }} />
                <circle cx={headX} cy={ecgY(headX)} r={7} fill={color} style={{ filter: `drop-shadow(0 0 16px ${color})` }} />
            </svg>
            <div style={{ position: "absolute", left: 140, top: 190, width: 1500 }}>
                <Words text="Deterioration in intensive care starts hours before it becomes obvious." start={12} size={66} />
            </div>
            <div style={{ position: "absolute", left: 140, top: 810, width: 1400 }}>
                <Words
                    text="The UK standard, NEWS2, raises 1.8 alarms per bed every day. Teams learn to tune them out."
                    start={105}
                    size={38}
                    weight={500}
                    color={C.muted}
                    stagger={2}
                    highlight={{ "1.8": C.warnInk }}
                />
            </div>
        </Scene>
    );
}

export function Title() {
    const frame = useCurrentFrame();
    const ring = tween(frame, 36, 96, 0, 1, Easing.out(Easing.cubic));
    return (
        <Scene>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
                <div style={{ position: "relative", width: 200, height: 200 }}>
                    <div
                        style={{
                            position: "absolute",
                            left: 100 - 300 * ring,
                            top: 100 - 300 * ring,
                            width: 600 * ring,
                            height: 600 * ring,
                            borderRadius: "50%",
                            border: `2px solid ${C.accent}`,
                            opacity: 0.6 * (1 - ring),
                        }}
                    />
                    <Logo size={200} start={4} />
                </div>
                <Words text="Bedrock" start={38} size={132} weight={700} style={{ justifyContent: "center", letterSpacing: "-0.04em" }} />
                <Words text="Real-time AI for critical decisions" start={58} size={46} weight={550} color={C.accent} style={{ justifyContent: "center" }} />
                <Words text="Detect. Decide. Respond." start={74} size={34} weight={600} style={{ justifyContent: "center" }} />
                <Words text="AI for Good: ICU early warning, built end to end on IBM LinuxONE" start={90} size={30} weight={450} color={C.muted} stagger={1.5} style={{ justifyContent: "center" }} />
            </AbsoluteFill>
        </Scene>
    );
}

// Bed 01 at hour 24 of the live replay: sepsis 2.2x, AKI 1.7x and respiratory failure 1.8x its alarm line.
const EXAMPLE: Record<string, number | null> = { sepsis: 2.2, hypotension: null, aki: 1.7, resp: 1.8, mortality: null };

function RiskRing({ label, horizon, color, value, start }: { label: string; horizon: string; color: string; value: number | null; start: number }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start, fps, config: { damping: 200, mass: 0.8 } });
    const fillTo = value === null ? 0.18 : Math.min(value / 3, 1);
    const fill = tween(frame, start + 10, start + 55, 0, fillTo);
    const r = 92;
    const c = 2 * Math.PI * r;
    const alarm = value !== null && frame > start + 10 + 45 * (1 / 3 / fillTo);
    const shown = value === null ? "< 1×" : `${((fill / fillTo) * value).toFixed(1)}×`;
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, width: 300, opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>
            <svg width={230} height={230} viewBox="0 0 230 230">
                <circle cx={115} cy={115} r={r} fill="none" stroke={C.sunken} strokeWidth={22} />
                <circle
                    cx={115}
                    cy={115}
                    r={r}
                    fill="none"
                    stroke={value === null ? C.lineStrong : color}
                    strokeWidth={22}
                    strokeLinecap="round"
                    strokeDasharray={`${fill * c} ${c}`}
                    transform="rotate(-90 115 115)"
                    style={{ filter: alarm ? `drop-shadow(0 0 14px ${color})` : undefined }}
                />
                <line x1={115} y1={6} x2={115} y2={42} stroke={C.fg} strokeWidth={4} strokeLinecap="round" transform="rotate(120 115 115)" />
                <text x={115} y={128} textAnchor="middle" fontSize={value === null ? 30 : 44} fontWeight={700} fill={value === null ? C.faint : C.fg} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {shown}
                </text>
            </svg>
            <div style={{ fontSize: 30, fontWeight: 650, textAlign: "center", lineHeight: 1.15 }}>{label}</div>
            <div style={{ fontSize: 24, color: C.muted }}>{horizon}</div>
        </div>
    );
}

export function FiveRisks() {
    const frame = useCurrentFrame();
    const tickGlow = tween(frame, 185, 210, 0, 1) * (1 - tween(frame, 280, 310, 0, 1));
    return (
        <Scene>
            <div style={{ position: "absolute", left: 120, top: 110 }}>
                <Words text="Five predictions. Every bed. Every hour." start={6} size={70} />
                <Words text="Trained on 1.49 million patient-hours from three ICU datasets. Shown: Bed 01 at hour 24 of the live replay." start={30} size={28} weight={450} color={C.muted} stagger={1.2} style={{ marginTop: 16 }} />
            </div>
            <div style={{ position: "absolute", left: 120, right: 120, top: 360, display: "flex", justifyContent: "space-between" }}>
                {HEADS.map((h, i) => (
                    <RiskRing key={h.id} label={h.label} horizon={h.horizon} color={h.color} value={EXAMPLE[h.id]} start={40 + i * 10} />
                ))}
            </div>
            <div style={{ position: "absolute", left: 120, top: 810, display: "flex", alignItems: "center", gap: 22 }}>
                <svg width={60} height={60} viewBox="0 0 60 60" style={{ opacity: tickGlow > 0 ? 1 : tween(frame, 170, 185, 0, 1) }}>
                    <circle cx={30} cy={30} r={24} fill="none" stroke={C.lineStrong} strokeWidth={6} />
                    <line x1={30} y1={2} x2={30} y2={16} stroke={C.fg} strokeWidth={4} strokeLinecap="round" transform="rotate(120 30 30)" style={{ filter: `drop-shadow(0 0 ${8 * tickGlow}px ${C.fg})` }} />
                </svg>
                <Words text="Each risk is scaled to its own alarm line, so 1× always means act." start={170} size={40} weight={550} highlight={{ "1×": C.accent }} />
            </div>
            <div style={{ position: "absolute", left: 120, top: 920 }}>
                <Chip start={240} color={C.accent}>
                    All 12 beds scored in 0.04 ms per model with IBM Snap ML on LinuxONE
                </Chip>
            </div>
        </Scene>
    );
}

export const INTRO_DURATIONS = { hook: HOOK_SECONDS * FPS, title: 165, risks: 330 };
