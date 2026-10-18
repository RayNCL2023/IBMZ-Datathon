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

const GROUPS: [string, string][] = [
    ["age 0-49", "Under 50"],
    ["age 50-64", "50 to 64"],
    ["age 65-79", "65 to 79"],
    ["age 80+", "80 and over"],
    ["female", "Women"],
    ["male", "Men"],
];

function AurocBars() {
    const frame = useCurrentFrame();
    const W = 760;
    const toX = (v: number) => ((v - 0.5) / 0.5) * W;
    const ext = data.external as Record<string, { model: number; news2: number }>;
    return (
        <div style={{ position: "absolute", left: 110, top: 270, display: "flex", flexDirection: "column", gap: 34 }}>
            <div style={{ display: "grid", gridTemplateColumns: "330px 760px 250px 320px", gap: 30, fontSize: 24, color: C.muted, opacity: tween(frame, 20, 34, 0, 1) }}>
                <span />
                <span>AUROC, 0.5 to 1.0</span>
                <span>Held-out patients</span>
                <span style={{ color: C.okInk }}>New hospital (eICU)</span>
            </div>
            {HEADS.map((h, i) => {
                const a = data.auroc[h.id as keyof typeof data.auroc];
                const e = ext[h.id];
                const start = 30 + i * 10;
                const grow = tween(frame, start, start + 40, 0, 1);
                const extIn = tween(frame, 150 + i * 8, 166 + i * 8, 0, 1);
                return (
                    <div key={h.id} style={{ display: "grid", gridTemplateColumns: "330px 760px 250px 320px", alignItems: "center", gap: 30, opacity: tween(frame, start - 6, start + 6, 0, 1) }}>
                        <span style={{ fontSize: 32, fontWeight: 600, textAlign: "right" }}>{h.label}</span>
                        <span style={{ position: "relative", height: 26, borderRadius: 13, background: C.sunken }}>
                            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: toX(a.model) * grow, borderRadius: 13, background: h.color, boxShadow: `0 0 18px ${h.color}88` }} />
                            <span style={{ position: "absolute", top: -10, bottom: -10, width: 4, borderRadius: 2, left: toX(a.news2) - 2, background: C.fg, opacity: tween(frame, start + 30, start + 45, 0, 1) }} />
                        </span>
                        <span style={{ fontSize: 30, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>
                            <Counter to={a.model} start={start} decimals={2} />
                            <span style={{ color: C.muted, fontWeight: 450, fontSize: 24 }}> vs {a.news2.toFixed(2)}</span>
                        </span>
                        <span style={{ fontSize: 30, fontWeight: 650, fontVariantNumeric: "tabular-nums", opacity: extIn, transform: `translateX(${(1 - extIn) * 20}px)`, color: C.okInk }}>
                            {e ? e.model.toFixed(2) : "–"}
                            <span style={{ color: C.muted, fontWeight: 450, fontSize: 24 }}>{e ? ` vs ${e.news2.toFixed(2)}` : ""}</span>
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

export function Evidence() {
    const frame = useCurrentFrame();
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="More patients warned. Far fewer alarms." start={6} size={64} />
            </div>
            <div style={{ position: "absolute", left: 110, top: 300, display: "flex", flexDirection: "column", gap: 60 }}>
                <Stat value={MODEL_AT_N2 * 100} suffix="%" compare={`vs ${Math.round(N2_CAUGHT * 100)}%`} label="of sepsis patients warned in time, alarming for the same share of hours as NEWS2 ≥ 5" start={190} color={HEADS[0].color} />
                <Stat value={FEWER * 100} suffix="%" label="fewer alarms raised to warn as many patients as NEWS2 does" start={250} color={C.okInk} />
            </div>
            <FatigueChart />
            <div style={{ position: "absolute", left: 110, bottom: 60, fontSize: 22, color: C.faint, maxWidth: 1700, lineHeight: 1.45, opacity: tween(frame, 200, 220, 0, 1) }}>
                Sepsis, held-out patients. Alarm time is the share of bed-hours spent alarming; alarms raised counts alarms that start per bed per day.
            </div>
        </Scene>
    );
}

function Tile({ value, suffix = "", decimals = 0, compare, label, start, color }: { value: number; suffix?: string; decimals?: number; compare?: string; label: string; start: number; color: string }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start, fps, config: { damping: 18 } });
    return (
        <div
            style={{
                padding: "34px 40px",
                borderRadius: 24,
                background: C.surface,
                border: `1px solid ${C.lineStrong}`,
                boxShadow: `inset 0 3px 0 ${color}, 0 30px 70px -40px rgba(0,0,0,.9)`,
                opacity: p,
                transform: `translateY(${(1 - p) * 40}px) scale(${0.96 + 0.04 * p})`,
            }}
        >
            <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                <Counter to={value} start={start} decimals={decimals} suffix={suffix} style={{ fontSize: 96, fontWeight: 700, letterSpacing: "-0.04em", color }} />
                {compare && <span style={{ fontSize: 36, color: C.muted, fontWeight: 550 }}>{compare}</span>}
            </div>
            <div style={{ fontSize: 28, color: C.muted, lineHeight: 1.35, marginTop: 6 }}>{label}</div>
        </div>
    );
}

export function Details() {
    const s = data.sepsisAll;
    const pc = (v: number) => Math.round(v * 100);
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="Ahead of NEWS2 on every clinical measure." start={6} size={64} />
                <Words text={`Sepsis on held-out ICU stays, ${s.model.event_patients} patients who developed it.`} start={18} size={28} weight={450} color={C.muted} style={{ marginTop: 14 }} />
            </div>
            <div style={{ position: "absolute", left: 110, right: 110, top: 300, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 36 }}>
                <Tile value={pc(s.model.warned_before_event)} suffix="%" compare={`vs ${pc(s.news2.warned_before_event)}%`} label="of sepsis patients warned before onset" start={30} color={HEADS[0].color} />
                <Tile value={pc(s.model.no_event_with_alert)} suffix="%" compare={`vs ${pc(s.news2.no_event_with_alert)}%`} label="of patients who never developed sepsis were ever alarmed (lower is better)" start={60} color={C.okInk} />
                <Tile value={s.model.calibration_error * 100} decimals={1} suffix=" pts" label="calibration error: when Bedrock says 10%, about 10% of those patients develop sepsis" start={95} color={C.accent} />
                <Tile value={data.utility.model} decimals={2} compare={`vs ${data.utility.news2.toFixed(2)}`} label="PhysioNet 2019 sepsis challenge utility score (NEWS2 at its best cut-off)" start={130} color={C.warnInk} />
            </div>
        </Scene>
    );
}

export function Auroc() {
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="Beats NEWS2 on all five risks, even at a new hospital." start={6} size={60} />
                <Words text="AUROC. White tick: NEWS2. The new hospital (eICU) was never used for training." start={20} size={28} weight={450} color={C.muted} style={{ marginTop: 14 }} />
            </div>
            <AurocBars />
            <div style={{ position: "absolute", left: 110, bottom: 60, fontSize: 22, color: C.faint, maxWidth: 1700, lineHeight: 1.45 }}>
                Held-out patients from PhysioNet 2019 (hospitals A and B) and PhysioNet 2012 (hospital M); external validation on the eICU demo database.
            </div>
        </Scene>
    );
}

// Demographics: the deployed alarm vs NEWS2 >= 5 per age band and sex (sepsis, held-out, groups with >= 20 events).
export function Fairness() {
    const frame = useCurrentFrame();
    const X0 = 560;
    const W = 980;
    const x = (v: number) => X0 + ((v - 0.5) / 0.5) * W;
    const fair = data.fairness as Record<string, { patients: number; eventPatients: number; modelCaught: number; news2Caught: number; modelAlarmHours: number; news2AlarmHours: number }>;
    const total = Object.entries(fair)
        .filter(([g]) => g.startsWith("age"))
        .reduce((n, [, r]) => n + r.patients, 0);
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="Better for every age group, women and men." start={6} size={64} />
                <Words text={`Sepsis patients warned in time across ${total.toLocaleString("en-GB")} held-out patients, at a similar alarm time in every group.`} start={18} size={28} weight={450} color={C.muted} style={{ marginTop: 14 }} />
            </div>
            <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
                {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => (
                    <g key={t} opacity={tween(frame, 20, 40, 0, 1)}>
                        <line x1={x(t)} x2={x(t)} y1={290} y2={900} stroke={C.line} strokeWidth={1.5} />
                        <text x={x(t)} y={940} textAnchor="middle" fontSize={22} fill={C.faint}>
                            {Math.round(t * 100)}%
                        </text>
                    </g>
                ))}
                <line x1={X0 - 20} x2={X0 + W} y1={687} y2={687} stroke={C.lineStrong} strokeWidth={1.5} strokeDasharray="6 6" opacity={tween(frame, 30, 50, 0, 1)} />
            </svg>
            {GROUPS.map(([key, label], i) => {
                const r = fair[key];
                const y = 330 + i * 92 + (i >= 4 ? 40 : 0);
                const start = 40 + i * 14;
                const n2 = tween(frame, start, start + 12, 0, 1);
                const grow = tween(frame, start + 12, start + 42, 0, 1);
                const xm = x(r.news2Caught) + (x(r.modelCaught) - x(r.news2Caught)) * grow;
                return (
                    <div key={key}>
                        <div style={{ position: "absolute", left: 110, top: y - 22, width: 400, textAlign: "right", fontSize: 32, fontWeight: 600, opacity: n2 }}>{label}</div>
                        <div style={{ position: "absolute", left: x(r.news2Caught), top: y - 3, width: Math.max(0, xm - x(r.news2Caught)), height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${C.muted}, ${HEADS[0].color})` }} />
                        <div style={{ position: "absolute", left: x(r.news2Caught) - 13, top: y - 13, width: 26, height: 26, borderRadius: 13, background: C.muted, border: `3px solid ${C.bg}`, opacity: n2 }} />
                        <div style={{ position: "absolute", left: xm - 16, top: y - 16, width: 32, height: 32, borderRadius: 16, background: HEADS[0].color, border: `3px solid ${C.bg}`, boxShadow: `0 0 16px ${HEADS[0].color}`, opacity: grow }} />
                        <div style={{ position: "absolute", left: x(r.modelCaught) + 34, top: y - 20, fontSize: 30, fontWeight: 650, opacity: tween(frame, start + 36, start + 50, 0, 1), fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                            {Math.round(r.modelCaught * 100)}%<span style={{ color: C.muted, fontSize: 24, fontWeight: 450 }}> vs {Math.round(r.news2Caught * 100)}%</span>
                        </div>
                    </div>
                );
            })}
            <div style={{ position: "absolute", left: X0, top: 980, display: "flex", gap: 40, fontSize: 24, color: C.muted, opacity: tween(frame, 60, 80, 0, 1) }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <i style={{ width: 18, height: 18, borderRadius: 9, background: C.muted }} />
                    NEWS2 ≥ 5
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <i style={{ width: 18, height: 18, borderRadius: 9, background: HEADS[0].color }} />
                    Bedrock
                </span>
            </div>
        </Scene>
    );
}

// ------------------------------------------------------------------------------------------------------
// Architecture: one LinuxONE machine, end to end. Packets flow along the request path.
// ------------------------------------------------------------------------------------------------------
type NodeDef = { id: string; x: number; y: number; w: number; title: string; sub: string; color: string; start: number };

const NODES: NodeDef[] = [
    { id: "ward", x: 90, y: 360, w: 300, title: "Ward screens", sub: "Bedrock web app", color: C.fg, start: 20 },
    { id: "tls", x: 545, y: 360, w: 330, title: "HTTPS front door", sub: "Caddy, TLS on CPACF", color: C.accent, start: 40 },
    { id: "api", x: 935, y: 360, w: 370, title: "Bedrock API", sub: "FastAPI, hashed keys", color: C.accent, start: 55 },
    { id: "snap", x: 1380, y: 240, w: 430, title: "IBM Snap ML", sub: "5 risk models in microseconds", color: HEADS[0].color, start: 70 },
    { id: "granite", x: 1380, y: 480, w: 430, title: "IBM Granite 4.0", sub: "on the AI accelerator via zDNN", color: C.okInk, start: 85 },
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

// IBM Z capabilities Bedrock uses (see api/README.md, fed/README.md).
const BADGES: [string, string][] = [
    ["IBM Integrated Accelerator for AI", "Granite 4.0 inference on-chip through zDNN, big-endian build for s390x"],
    ["Hybrid AI, multi-model", "Five IBM Snap ML predictive models plus Granite generative AI"],
    ["Containerised", "Docker Compose: API, Granite, HTTPS gateway and isolated hospital nodes"],
    ["Secure by design", "TLS on CPACF crypto, hashed API keys, no exposed model ports"],
    ["Scales on 3 cores", "1.6 million risk scores per second with IBM Snap ML on LinuxONE"],
    ["Federated and private", "25 training rounds on LinuxONE with differential privacy"],
];

function Badge({ title, sub, start }: { title: string; sub: string; start: number }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start, fps, config: { damping: 18 } });
    return (
        <div style={{ padding: "22px 26px", borderRadius: 18, background: C.surface, border: `1px solid ${C.lineStrong}`, opacity: p, transform: `translateY(${(1 - p) * 26}px)` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, fontWeight: 650 }}>
                <span style={{ width: 12, height: 12, borderRadius: 6, background: C.accent, boxShadow: `0 0 12px ${C.accent}` }} />
                {title}
            </div>
            <div style={{ fontSize: 22, color: C.muted, marginTop: 8, lineHeight: 1.35 }}>{sub}</div>
        </div>
    );
}

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
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="One IBM LinuxONE machine. End to end." start={6} size={64} />
            </div>
            <div
                style={{
                    position: "absolute",
                    left: 510,
                    top: 180,
                    width: 1360,
                    height: 470,
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
            <div style={{ position: "absolute", left: 110, right: 110, top: 700, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 22 }}>
                {BADGES.map(([title, sub], i) => (
                    <Badge key={title} title={title} sub={sub} start={150 + i * 16} />
                ))}
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
                    Real-time AI for critical decisions. Detect. Decide. Respond.
                    <br />
                    AI for Good, IBM Z Datathon 2026
                </div>
                <div style={{ position: "absolute", bottom: 60, left: 0, right: 0, opacity: tween(frame, 80, 100, 0, 1), fontSize: 22, color: C.faint, textAlign: "center" }}>
                    Open source on IBM LinuxONE: XGBoost, IBM Snap ML, IBM Granite, llama.cpp, FastAPI, scikit-learn, Next.js. Data: PhysioNet 2019, PhysioNet 2012, eICU.
                </div>
            </AbsoluteFill>
        </Scene>
    );
}

export const PROOF_DURATIONS = { evidence: 360, details: 300, auroc: 270, fairness: 300, architecture: 390, end: 225 };
