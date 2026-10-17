import { AbsoluteFill, Easing, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, HEADS } from "../theme";
import { Chip, Counter, Logo, Scene, tween, Words } from "../kit";
import data from "../data.json";

// ------------------------------------------------------------------------------------------------------
// Evidence: alarm fatigue curve (live /fatigue, sepsis, held-out patients), then AUROC for every head.
// ------------------------------------------------------------------------------------------------------
const CH = { x: 930, y: 250, w: 880, h: 560 };
const XMAX = 0.6; // share of bed-hours spent alarming
const sx = (v: number) => CH.x + (Math.min(v, XMAX) / XMAX) * CH.w;
const sy = (v: number) => CH.y + CH.h - v * CH.h;

const modelPts = data.fatigue.modelHours.filter(([x]) => x <= XMAX);
const news2Pts = data.fatigue.news2Hours.filter(([x]) => x <= XMAX);
const toPath = (pts: number[][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");

// Conservative comparison: same share of hours spent alarming as NEWS2 >= 5 (every value inside the measured curves).
const N2 = data.headline.sameAlarmHours.alarmHours;
const N2_CAUGHT = data.headline.sameAlarmHours.news2Caught;
const MODEL_AT_N2 = data.headline.sameAlarmHours.modelCaught;
const MODEL_SAME_CATCH = data.headline.sameCatchHours.modelAlarmHours;
const LESS_TIME = data.headline.sameCatchHours.fewerAlarmHours;
const FEWER = data.headline.news2Recall.fewerAlarms;

function FatigueChart() {
    const frame = useCurrentFrame();
    const axes = tween(frame, 20, 50, 0, 1);
    const n2Draw = tween(frame, 40, 110, 0, 1, Easing.inOut(Easing.cubic));
    const mDraw = tween(frame, 80, 160, 0, 1, Easing.inOut(Easing.cubic));
    const vline = tween(frame, 160, 185, 0, 1);
    const dots = tween(frame, 175, 195, 0, 1);
    const arrow = tween(frame, 230, 270, 0, 1);
    const ticksX = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const ticksY = [0, 0.25, 0.5, 0.75, 1];
    return (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            <g opacity={axes}>
                {ticksY.map((t) => (
                    <g key={t}>
                        <line x1={CH.x} x2={CH.x + CH.w} y1={sy(t)} y2={sy(t)} stroke={C.line} strokeWidth={1.5} />
                        <text x={CH.x - 16} y={sy(t) + 8} textAnchor="end" fontSize={22} fill={C.faint}>
                            {Math.round(t * 100)}%
                        </text>
                    </g>
                ))}
                {ticksX.map((t) => (
                    <text key={t} x={sx(t)} y={CH.y + CH.h + 40} textAnchor="middle" fontSize={22} fill={C.faint}>
                        {Math.round(t * 100)}%
                    </text>
                ))}
                <text x={CH.x + CH.w / 2} y={CH.y + CH.h + 84} textAnchor="middle" fontSize={24} fill={C.muted}>
                    Share of hours spent alarming
                </text>
                <text x={CH.x - 80} y={CH.y - 30} fontSize={24} fill={C.muted}>
                    Sepsis patients warned in time
                </text>
            </g>
            <defs>
                <clipPath id="n2Reveal">
                    <rect x={CH.x - 20} y={0} width={(CH.w + 40) * n2Draw} height={1080} />
                </clipPath>
                <clipPath id="mReveal">
                    <rect x={CH.x - 20} y={0} width={(CH.w + 40) * mDraw} height={1080} />
                </clipPath>
            </defs>
            <path d={toPath(news2Pts)} fill="none" stroke={C.muted} strokeWidth={4} strokeDasharray="10 8" clipPath="url(#n2Reveal)" />
            <path d={toPath(modelPts)} fill="none" stroke={HEADS[0].color} strokeWidth={5} clipPath="url(#mReveal)" style={{ filter: `drop-shadow(0 0 10px ${HEADS[0].color})` }} />
            <g opacity={tween(frame, 110, 130, 0, 1)}>
                <text x={sx(0.47)} y={sy(0.8)} textAnchor="middle" fontSize={26} fontWeight={650} fill={C.muted}>
                    NEWS2
                </text>
            </g>
            <g opacity={tween(frame, 150, 170, 0, 1)}>
                <text x={sx(0.04)} y={sy(0.9)} textAnchor="start" fontSize={26} fontWeight={650} fill={HEADS[0].color}>
                    Bedrock
                </text>
            </g>
            <line x1={sx(N2)} x2={sx(N2)} y1={sy(0)} y2={sy(0) - CH.h * vline} stroke={C.warn} strokeWidth={2} strokeDasharray="6 6" />
            <g opacity={vline}>
                <text x={sx(N2) + 12} y={sy(0) - 16} fontSize={22} fill={C.warnInk}>
                    NEWS2 ≥ 5
                </text>
            </g>
            <circle cx={sx(N2)} cy={sy(N2_CAUGHT)} r={11 * dots} fill={C.muted} stroke={C.bg} strokeWidth={3} />
            <circle cx={sx(N2)} cy={sy(MODEL_AT_N2)} r={13 * dots} fill={HEADS[0].color} stroke={C.bg} strokeWidth={3} style={{ filter: `drop-shadow(0 0 12px ${HEADS[0].color})` }} />
            <g opacity={arrow}>
                <line x1={sx(N2) - 16} x2={sx(N2) - 16 - (sx(N2) - sx(MODEL_SAME_CATCH) - 16) * arrow} y1={sy(N2_CAUGHT)} y2={sy(N2_CAUGHT)} stroke={C.ok} strokeWidth={4} />
                <circle cx={sx(MODEL_SAME_CATCH)} cy={sy(N2_CAUGHT)} r={10 * arrow} fill={C.ok} />
                <rect x={sx(N2) + 24} y={sy(N2_CAUGHT) + 30} width={330} height={48} rx={24} fill={C.panel} stroke={C.ok} strokeWidth={2} />
                <text x={sx(N2) + 189} y={sy(N2_CAUGHT) + 62} textAnchor="middle" fontSize={26} fontWeight={650} fill={C.okInk}>
                    {Math.round(LESS_TIME * 100)}% less time alarming
                </text>
            </g>
        </svg>
    );
}

function Stat({ value, decimals = 0, suffix, label, compare, start, color }: { value: number; decimals?: number; suffix: string; label: string; compare?: string; start: number; color: string }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start, fps, config: { damping: 200 } });
    return (
        <div style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)` }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
                <Counter to={value} start={start} decimals={decimals} suffix={suffix} style={{ fontSize: 120, fontWeight: 700, letterSpacing: "-0.04em", color }} />
                {compare && <span style={{ fontSize: 40, color: C.muted, fontWeight: 550 }}>{compare}</span>}
            </div>
            <div style={{ fontSize: 28, color: C.muted, maxWidth: 640, lineHeight: 1.35 }}>{label}</div>
        </div>
    );
}

function AurocBars() {
    const frame = useCurrentFrame();
    const W = 1060;
    return (
        <div style={{ position: "absolute", left: 110, top: 300, display: "flex", flexDirection: "column", gap: 40 }}>
            {HEADS.map((h, i) => {
                const a = data.auroc[h.id as keyof typeof data.auroc];
                const start = 30 + i * 12;
                const grow = tween(frame, start, start + 40, 0, 1);
                const toX = (v: number) => ((v - 0.5) / 0.5) * W;
                return (
                    <div key={h.id} style={{ display: "grid", gridTemplateColumns: "360px 1060px 260px", alignItems: "center", gap: 30, opacity: tween(frame, start - 6, start + 6, 0, 1) }}>
                        <span style={{ fontSize: 32, fontWeight: 600, textAlign: "right" }}>{h.label}</span>
                        <span style={{ position: "relative", height: 26, borderRadius: 13, background: C.sunken }}>
                            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: toX(a.model) * grow, borderRadius: 13, background: h.color, boxShadow: `0 0 18px ${h.color}88` }} />
                            <span style={{ position: "absolute", top: -10, bottom: -10, width: 4, borderRadius: 2, left: toX(a.news2) - 2, background: C.fg, opacity: tween(frame, start + 30, start + 45, 0, 1) }} />
                        </span>
                        <span style={{ fontSize: 30, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                            <Counter to={a.model} start={start} decimals={2} />
                            <span style={{ color: C.muted, fontWeight: 450, fontSize: 24 }}> vs {a.news2.toFixed(2)}</span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function Evidence() {
    return (
        <Scene>
            <Sequence durationInFrames={330} layout="none">
                <Scene fadeIn={1}>
                    <div style={{ position: "absolute", left: 110, top: 90 }}>
                        <Words text="More patients warned. Far fewer alarms." start={6} size={64} />
                    </div>
                    <div style={{ position: "absolute", left: 110, top: 300, display: "flex", flexDirection: "column", gap: 60 }}>
                        <Stat value={MODEL_AT_N2 * 100} suffix="%" compare={`vs ${Math.round(N2_CAUGHT * 100)}%`} label="of sepsis patients warned in time, alarming for the same share of hours as NEWS2 ≥ 5" start={190} color={HEADS[0].color} />
                        <Stat value={FEWER * 100} suffix="%" label="fewer alarms raised to warn as many patients as NEWS2 does" start={250} color={C.okInk} />
                    </div>
                    <FatigueChart />
                </Scene>
            </Sequence>
            <Sequence from={330} durationInFrames={270} layout="none">
                <Scene fadeOut={1}>
                    <div style={{ position: "absolute", left: 110, top: 90 }}>
                        <Words text="Better than NEWS2 on every risk it predicts." start={6} size={64} />
                        <Words text="AUROC on held-out patients. White tick: NEWS2." start={20} size={28} weight={450} color={C.muted} style={{ marginTop: 14 }} />
                    </div>
                    <AurocBars />
                    <div style={{ position: "absolute", left: 110, bottom: 70, fontSize: 22, color: C.faint, maxWidth: 1700, lineHeight: 1.45 }}>
                        Held-out patients from PhysioNet 2019 and 2012. Alarm time is the share of bed-hours spent alarming; alarms raised counts alarms that start per bed per day.
                    </div>
                </Scene>
            </Sequence>
        </Scene>
    );
}

// ------------------------------------------------------------------------------------------------------
// Architecture: one LinuxONE machine, end to end. Packets flow along the request path.
// ------------------------------------------------------------------------------------------------------
type NodeDef = { id: string; x: number; y: number; w: number; title: string; sub: string; color: string; start: number };

const NODES: NodeDef[] = [
    { id: "ward", x: 90, y: 430, w: 300, title: "Ward screens", sub: "Bedrock web app", color: C.fg, start: 20 },
    { id: "tls", x: 545, y: 430, w: 330, title: "HTTPS front door", sub: "Caddy, TLS on CPACF", color: C.accent, start: 40 },
    { id: "api", x: 935, y: 430, w: 370, title: "Bedrock API", sub: "FastAPI, hashed keys", color: C.accent, start: 55 },
    { id: "snap", x: 1380, y: 300, w: 410, title: "IBM Snap ML", sub: "5 XGBoost risk models", color: HEADS[0].color, start: 70 },
    { id: "granite", x: 1380, y: 570, w: 410, title: "IBM Granite 4.0", sub: "llama.cpp built with zDNN", color: C.okInk, start: 85 },
];
const NODE_H = 130;
const mid = (n: NodeDef) => [n.x + n.w, n.y + NODE_H / 2] as const;
const left = (n: NodeDef) => [n.x, n.y + NODE_H / 2] as const;
const EDGES: [string, string][] = [
    ["ward", "tls"],
    ["tls", "api"],
    ["api", "snap"],
    ["api", "granite"],
];

function Node({ n }: { n: NodeDef }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - n.start, fps, config: { damping: 16 } });
    return (
        <div
            style={{
                position: "absolute",
                left: n.x,
                top: n.y,
                width: n.w,
                height: NODE_H,
                boxSizing: "border-box",
                padding: "24px 28px",
                borderRadius: 18,
                background: C.surface,
                border: `1px solid ${C.lineStrong}`,
                boxShadow: `inset 0 3px 0 ${n.color}, 0 30px 60px -30px rgba(0,0,0,.8)`,
                opacity: p,
                transform: `translateY(${(1 - p) * 30}px) scale(${0.94 + 0.06 * p})`,
            }}
        >
            <div style={{ fontSize: 32, fontWeight: 650, letterSpacing: "-0.015em" }}>{n.title}</div>
            <div style={{ fontSize: 23, color: C.muted, marginTop: 6 }}>{n.sub}</div>
        </div>
    );
}

export function Architecture() {
    const frame = useCurrentFrame();
    const box = tween(frame, 30, 70, 0, 1);
    const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
    const fedP = tween(frame, 170, 200, 0, 1);
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="One LinuxONE machine. End to end." start={6} size={64} />
            </div>
            <div
                style={{
                    position: "absolute",
                    left: 510,
                    top: 240,
                    width: 1340,
                    height: 520,
                    borderRadius: 30,
                    border: `2px dashed ${C.accent}`,
                    background: "rgba(76,149,234,0.05)",
                    opacity: box,
                    transform: `scale(${0.97 + 0.03 * box})`,
                }}
            >
                <div style={{ position: "absolute", left: 32, top: 22, fontSize: 26, fontWeight: 650, color: C.accent }}>IBM LinuxONE, s390x</div>
            </div>
            <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
                {EDGES.map(([a, b], i) => {
                    const [x1, y1] = mid(byId[a]);
                    const [x2, y2] = left(byId[b]);
                    const d = `M${x1},${y1} C${x1 + 70},${y1} ${x2 - 70},${y2} ${x2},${y2}`;
                    const show = tween(frame, 60 + i * 12, 90 + i * 12, 0, 1);
                    return (
                        <g key={a + b}>
                            <path d={d} fill="none" stroke={C.lineStrong} strokeWidth={3} pathLength={1} strokeDasharray={`${show} 1`} />
                            {[0, 1, 2].map((k) => {
                                const t = ((frame - 100 - k * 14 - i * 6) / 42) % 1;
                                if (frame < 100 + i * 6 || t < 0) {
                                    return null;
                                }
                                // Point along the cubic.
                                const u = 1 - t;
                                const px = u ** 3 * x1 + 3 * u * u * t * (x1 + 70) + 3 * u * t * t * (x2 - 70) + t ** 3 * x2;
                                const py = u ** 3 * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y2;
                                return <circle key={k} cx={px} cy={py} r={6} fill={C.accent} style={{ filter: `drop-shadow(0 0 8px ${C.accent})` }} />;
                            })}
                        </g>
                    );
                })}
            </svg>
            {NODES.map((n) => (
                <Node key={n.id} n={n} />
            ))}
            <div style={{ position: "absolute", left: 510, top: 800, display: "flex", alignItems: "center", gap: 26, opacity: fedP, transform: `translateY(${(1 - fedP) * 20}px)` }}>
                {["A", "B", "M"].map((h, i) => (
                    <div key={h} style={{ display: "flex", alignItems: "center", gap: 26 }}>
                        <div style={{ width: 74, height: 74, borderRadius: 16, display: "grid", placeItems: "center", background: C.surface, border: `1px solid ${C.lineStrong}`, fontSize: 30, fontWeight: 700, boxShadow: frame % 60 > i * 20 && frame % 60 < i * 20 + 20 ? `0 0 0 3px ${C.okInk}` : undefined }}>
                            {h}
                        </div>
                        {i < 2 && <div style={{ width: 40, height: 3, background: C.lineStrong }} />}
                    </div>
                ))}
                <div style={{ fontSize: 28, color: C.muted, maxWidth: 900, lineHeight: 1.35 }}>
                    Federated learning: three hospitals train one sepsis model in turn, without sharing patient data.
                </div>
            </div>
            <div style={{ position: "absolute", left: 110, top: 960 }}>
                <Chip start={230} color={C.accent}>
                    Inference, generative AI and encryption on the same machine
                </Chip>
            </div>
        </Scene>
    );
}

// ------------------------------------------------------------------------------------------------------
// End card.
// ------------------------------------------------------------------------------------------------------
export function End() {
    const frame = useCurrentFrame();
    const glow = tween(frame, 30, 120, 0, 1, Easing.out(Easing.cubic));
    return (
        <Scene fadeOut={20}>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28 }}>
                <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", inset: -140, borderRadius: "50%", background: `radial-gradient(circle, ${C.accent}44 0%, transparent 65%)`, opacity: glow }} />
                    <Logo size={170} start={0} />
                </div>
                <Words text="Bedrock" start={20} size={120} weight={700} style={{ justifyContent: "center", letterSpacing: "-0.04em" }} />
                <Words text="See deterioration coming." start={36} size={50} weight={550} color={C.accent} style={{ justifyContent: "center" }} />
                <div style={{ marginTop: 30, opacity: tween(frame, 60, 80, 0, 1), fontSize: 28, color: C.muted, textAlign: "center", lineHeight: 1.5 }}>
                    Real-time AI for critical decisions
                    <br />
                    IBM Z Datathon 2026
                </div>
            </AbsoluteFill>
        </Scene>
    );
}

export const PROOF_DURATIONS = { evidence: 600, architecture: 360, end: 210 };
