import { Easing, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, HEADS } from "../theme";
import { Chip, Highlight, type Key, Scene, Screen, tween, Words } from "../kit";
import data from "../data.json";

const BOX = { x: 600, y: 130, w: 1260, h: 709 };
const FULL_H = 2482; // layout height of the full-page patient capture

function Side({ title, body }: { title: string; body: string }) {
    return (
        <div style={{ position: "absolute", left: 100, top: 190, width: 460 }}>
            <Words text={title} start={8} size={56} weight={680} />
            <Words text={body} start={20} size={28} weight={450} color={C.muted} stagger={1.2} style={{ marginTop: 22, lineHeight: 1.4 }} />
        </div>
    );
}

// ------------------------------------------------------------------------------------------------------
// History: drivers, then the full observation history (charts, then the table view).
// ------------------------------------------------------------------------------------------------------
export function History() {
    const frame = useCurrentFrame();
    const toTable = tween(frame, 160, 178, 0, 1);
    const keys: Key[] = [
        { f: 0, r: { x: 400, y: 1060, w: 1400 } },
        { f: 50, r: { x: 400, y: 1060, w: 1400 } },
        { f: 95, r: { x: 390, y: 1660, w: 1400 } },
        { f: 125, r: { x: 1080, y: 2084, w: 700 } },
        { f: 225, r: { x: 1080, y: 2084, w: 700 } },
    ];
    const tableKeys: Key[] = [
        { f: 0, r: { x: 390, y: 150, w: 1440 } },
        { f: 225, r: { x: 400, y: 170, w: 1400 } },
    ];
    return (
        <Scene>
            <Side title="Every observation, hour by hour" body="The variables driving each risk, and the full history of vitals and NEWS2 as charts or a table." />
            <Screen src="capture/patient-full.png" keys={keys} frameBox={BOX} imgH={FULL_H} opacity={1 - toTable}>
                {(map, scale) => (
                    <>
                        <Highlight map={map} scale={scale} x={1096} y={1094} w={677} h={413} start={14} color={C.accent} />
                        <Highlight map={map} scale={scale} x={1097} y={2189} w={651} h={180} start={128} color={C.warn} />
                    </>
                )}
            </Screen>
            <Screen src="capture/observations-table.png" keys={tableKeys} frameBox={BOX} opacity={toTable} />
            <div style={{ position: "absolute", left: 100, top: 560 }}>
                <Chip start={130} color={C.warn}>
                    Every vital, every hour
                </Chip>
            </div>
        </Scene>
    );
}

// ------------------------------------------------------------------------------------------------------
// Federated: hospitals train one sepsis model in turn, on LinuxONE, without sharing patient data.
// ------------------------------------------------------------------------------------------------------
const HOSP = [
    { id: "A", x: 0, y: 420, note: "stays on site" },
    { id: "B", x: 470, y: 420, note: "stays on site" },
    { id: "M", x: 235, y: 680, note: "no sepsis labels: joins other risks" },
];

function Hospitals() {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const rows = data.privacy.hospitals as Record<string, { rows: number }>;
    // The model token visits A, B, M in turn (one cycle per round).
    const cycle = 36;
    const t = Math.max(0, frame - 60) / cycle;
    // The sepsis model alternates between A and B, the hospitals with sepsis labels.
    const leg = Math.floor(t) % 2;
    const u = Easing.inOut(Easing.cubic)(t % 1);
    const from = HOSP[leg];
    const to = HOSP[1 - leg];
    const tx = from.x + (to.x - from.x) * u + 140;
    const ty = from.y + (to.y - from.y) * u + 75;
    const round = Math.min(25, 1 + Math.floor((Math.max(0, frame - 60) / 270) * 25));
    return (
        <div style={{ position: "absolute", left: 110, top: 0 }}>
            <svg width={900} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
                <line x1={HOSP[0].x + 280} y1={HOSP[0].y + 75} x2={HOSP[1].x} y2={HOSP[1].y + 75} stroke={C.lineStrong} strokeWidth={3} strokeDasharray="8 8" opacity={tween(frame, 30, 50, 0, 1)} />
            </svg>
            {HOSP.map((h, i) => {
                const p = spring({ frame: frame - 14 - i * 8, fps, config: { damping: 16 } });
                const active = frame > 60 && i < 2 && leg === i && u < 0.2;
                return (
                    <div
                        key={h.id}
                        style={{
                            position: "absolute",
                            left: h.x,
                            top: h.y,
                            width: 280,
                            height: 150,
                            boxSizing: "border-box",
                            padding: "18px 22px",
                            borderRadius: 18,
                            background: C.surface,
                            border: `1px solid ${active ? C.okInk : C.lineStrong}`,
                            boxShadow: active ? `0 0 30px ${C.ok}66` : "0 30px 60px -30px rgba(0,0,0,.8)",
                            opacity: p * (h.id === "M" ? 0.55 : 1),
                            transform: `scale(${0.9 + 0.1 * p})`,
                        }}
                    >
                        <div style={{ fontSize: 30, fontWeight: 700 }}>Hospital {h.id}</div>
                        <div style={{ fontSize: 22, color: C.muted, marginTop: 6 }}>{(rows[h.id]?.rows / 1000).toFixed(0)}k patient-hours</div>
                        <div style={{ fontSize: 20, color: C.faint, marginTop: 2 }}>{h.note}</div>
                    </div>
                );
            })}
            {frame > 60 && (
                <div style={{ position: "absolute", left: tx - 26, top: ty - 26, width: 52, height: 52, borderRadius: 14, background: C.accent, boxShadow: `0 0 26px ${C.accent}`, display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700, color: "#0c1a2b" }}>
                    ML
                </div>
            )}
            <div style={{ position: "absolute", left: 0, top: 880, width: 760, whiteSpace: "nowrap", fontSize: 26, color: C.muted, opacity: tween(frame, 70, 90, 0, 1), fontVariantNumeric: "tabular-nums" }}>
                Sepsis model, round <b style={{ color: C.fg }}>{frame > 60 ? round : 1}</b> of 25. Only the model moves.
            </div>
        </div>
    );
}

function Convergence() {
    const frame = useCurrentFrame();
    const rounds = data.privacy.rounds;
    const X = 1000;
    const Y = 300;
    const W = 760;
    const H = 260;
    const lo = 0.75;
    const hi = 0.86;
    const sx = (i: number) => X + (i / (rounds.length - 1)) * W;
    const sy = (v: number) => Y + H - ((v - lo) / (hi - lo)) * H;
    const draw = tween(frame, 70, 220, 0, 1, Easing.inOut(Easing.cubic));
    const path = rounds.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    const localA = data.privacy.local.A.B as number; // hospital A's own model on B's patients
    const fed = data.privacy.federated.none;
    return (
        <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
            <defs>
                <clipPath id="conv">
                    <rect x={X - 10} y={0} width={(W + 20) * draw} height={1080} />
                </clipPath>
            </defs>
            <g opacity={tween(frame, 40, 60, 0, 1)}>
                <text x={X} y={Y - 30} fontSize={26} fill={C.muted}>
                    Federated sepsis model, mean AUROC by round
                </text>
                {[0.76, 0.8, 0.84].map((t) => (
                    <g key={t}>
                        <line x1={X} x2={X + W} y1={sy(t)} y2={sy(t)} stroke={C.line} strokeWidth={1.5} />
                        <text x={X - 14} y={sy(t) + 8} textAnchor="end" fontSize={22} fill={C.faint}>
                            {t.toFixed(2)}
                        </text>
                    </g>
                ))}
                <text x={X} y={Y + H + 40} fontSize={22} fill={C.faint}>
                    Round 1
                </text>
                <text x={X + W} y={Y + H + 40} textAnchor="end" fontSize={22} fill={C.faint}>
                    Round 25
                </text>
            </g>
            <line x1={X} x2={X + W} y1={sy(localA)} y2={sy(localA)} stroke={C.danger} strokeWidth={2} strokeDasharray="8 6" opacity={tween(frame, 150, 170, 0, 1)} />
            <text x={X + W} y={sy(localA) + 34} textAnchor="end" fontSize={24} fill={C.dangerInk} opacity={tween(frame, 150, 170, 0, 1)}>
                One hospital alone, on another's patients: {localA.toFixed(2)}
            </text>
            <path d={path} fill="none" stroke={HEADS[0].color} strokeWidth={5} clipPath="url(#conv)" style={{ filter: `drop-shadow(0 0 10px ${HEADS[0].color})` }} />
            <text x={X + W} y={sy(fed.mean) - 22} textAnchor="end" fontSize={26} fontWeight={650} fill={HEADS[0].color} opacity={tween(frame, 210, 230, 0, 1)}>
                Federated: {fed.mean.toFixed(2)}
            </text>
        </svg>
    );
}

function PrivacyDial() {
    const frame = useCurrentFrame();
    const fed = data.privacy.federated as Record<string, { mean: number }>;
    const keys = ["none", "10", "3", "1", "0.3"];
    return (
        <div style={{ position: "absolute", left: 1000, top: 680, width: 760 }}>
            <div style={{ fontSize: 26, color: C.muted, opacity: tween(frame, 230, 250, 0, 1) }}>Differential privacy dial: noise on every leaf before the model leaves a hospital</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14, marginTop: 18 }}>
                {keys.map((k, i) => {
                    const v = fed[k].mean;
                    const p = tween(frame, 240 + i * 10, 260 + i * 10, 0, 1);
                    const h = ((v - 0.7) / 0.18) * 150 * p;
                    return (
                        <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: p }}>
                            <div style={{ height: 150, display: "flex", alignItems: "flex-end" }}>
                                <div style={{ width: 70, height: h, borderRadius: "10px 10px 4px 4px", background: k === "0.3" ? C.warn : HEADS[0].color, opacity: 0.9 }} />
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 650, fontVariantNumeric: "tabular-nums" }}>{v.toFixed(3)}</div>
                            <div style={{ fontSize: 22, color: C.muted }}>{k === "none" ? "No noise" : `ε = ${k}`}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function Federated() {
    const hosp = data.privacy.hospitals as Record<string, { rows: number }>;
    const total = Object.values(hosp).reduce((n, h) => n + h.rows, 0);
    return (
        <Scene>
            <div style={{ position: "absolute", left: 110, top: 90 }}>
                <Words text="Trained on LinuxONE, across hospitals." start={6} size={64} />
                <Words text={`Federated XGBoost: ${(total / 1e6).toFixed(2)} million patient-hours, ${data.privacy.trees} trees, 25 training rounds, and no patient data ever shared.`} start={18} size={28} weight={450} color={C.muted} stagger={1.2} style={{ marginTop: 14, maxWidth: 1600 }} />
            </div>
            <Hospitals />
            <Convergence />
            <PrivacyDial />
        </Scene>
    );
}

export const DEEP_DURATIONS = { history: 225, federated: 360 };
