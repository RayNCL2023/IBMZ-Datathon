import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

export const ease = Easing.bezier(0.22, 0.8, 0.2, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const tween = (frame: number, from: number, to: number, a: number, b: number, easing = ease) =>
    interpolate(frame, [from, to], [a, b], { ...clamp, easing });

// ------------------------------------------------------------------------------------------------------
// Backdrop: the ward seen from above. A faint grid of bays drifts slowly behind every scene.
// ------------------------------------------------------------------------------------------------------
export function Backdrop() {
    const frame = useCurrentFrame();
    const drift = (frame * 0.25) % 240;
    return (
        <AbsoluteFill style={{ background: `radial-gradient(120% 90% at 50% 40%, #1b1b1b 0%, ${C.bg} 60%, #0b0b0b 100%)` }}>
            <AbsoluteFill
                style={{
                    opacity: 0.5,
                    backgroundImage: `linear-gradient(${C.line}55 1px, transparent 1px), linear-gradient(90deg, ${C.line}55 1px, transparent 1px)`,
                    backgroundSize: "240px 160px",
                    backgroundPosition: `${-drift}px ${drift * 0.4}px`,
                    maskImage: "radial-gradient(80% 70% at 50% 50%, black 30%, transparent 100%)",
                }}
            />
        </AbsoluteFill>
    );
}

// ------------------------------------------------------------------------------------------------------
// Scene: fades and settles in, lifts and fades out. Every scene lives inside one.
// ------------------------------------------------------------------------------------------------------
export function Scene({ children, fadeIn = 14, fadeOut = 14 }: { children: React.ReactNode; fadeIn?: number; fadeOut?: number }) {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    const inP = tween(frame, 0, fadeIn, 0, 1);
    const outP = tween(frame, durationInFrames - fadeOut, durationInFrames, 0, 1, Easing.in(Easing.cubic));
    return (
        <AbsoluteFill
            style={{
                opacity: inP * (1 - outP),
                transform: `scale(${1.015 - 0.015 * inP + 0.01 * outP})`,
                filter: `blur(${(1 - inP) * 6 + outP * 6}px)`,
                fontFamily: FONT,
                color: C.fg,
            }}
        >
            {children}
        </AbsoluteFill>
    );
}

// ------------------------------------------------------------------------------------------------------
// Words: kinetic type. Each word rises out of a soft blur, staggered.
// ------------------------------------------------------------------------------------------------------
export function Words({
    text,
    start = 0,
    stagger = 3,
    size = 64,
    weight = 650,
    color = C.fg,
    style,
    highlight,
}: {
    text: string;
    start?: number;
    stagger?: number;
    size?: number;
    weight?: number;
    color?: string;
    style?: React.CSSProperties;
    // Words (exact match) drawn in another colour.
    highlight?: Record<string, string>;
}) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const words = text.split(" ");
    return (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.26, rowGap: size * 0.08, fontSize: size, fontWeight: weight, letterSpacing: "-0.025em", lineHeight: 1.12, ...style }}>
            {words.map((w, i) => {
                const p = spring({ frame: frame - start - i * stagger, fps, config: { damping: 200, mass: 0.6 } });
                return (
                    <span
                        key={i}
                        style={{
                            display: "inline-block",
                            opacity: p,
                            transform: `translateY(${(1 - p) * size * 0.45}px)`,
                            filter: `blur(${(1 - p) * 8}px)`,
                            color: highlight?.[w] ?? color,
                        }}
                    >
                        {w}
                    </span>
                );
            })}
        </div>
    );
}

// ------------------------------------------------------------------------------------------------------
// Logo: Bedrock's bay mark. Walls draw on, doorways open, the patient dot lands.
// ------------------------------------------------------------------------------------------------------
export function Logo({ size = 160, start = 0, dot = C.accent }: { size?: number; start?: number; dot?: string }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const wall = tween(frame, start, start + 26, 0, 1);
    const doors = tween(frame, start + 14, start + 32, 0, 1);
    const pop = spring({ frame: frame - start - 26, fps, config: { damping: 9, mass: 0.5 } });
    return (
        <svg width={size} height={size} viewBox="0 0 30 30" style={{ overflow: "visible" }}>
            <rect x="1" y="1" width="28" height="28" rx="5" fill="none" stroke={C.fg} strokeWidth="2" strokeLinecap="round" pathLength={1} strokeDasharray={`${wall} 1.01`} />
            <path d="M1 15h10M19 15h10M15 1v8M15 21v8" stroke={C.fg} strokeWidth="2" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - doors} />
            <circle cx="15" cy="15" r={3.5 * pop} fill={dot} />
        </svg>
    );
}

// ------------------------------------------------------------------------------------------------------
// Screen: a real product capture (1920x1080 layout, captured at 2x) in a window frame, with a camera that
// glides between focus rectangles. Children get `map` to pin overlays to screen coordinates while zooming.
// ------------------------------------------------------------------------------------------------------
export type Rect = { x: number; y: number; w: number };
export type Key = { f: number; r: Rect };
export type Mapper = (x: number, y: number) => [number, number];

export function camera(frame: number, keys: Key[]): Rect {
    if (frame <= keys[0].f) {
        return keys[0].r;
    }
    for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1];
        const b = keys[i];
        if (frame <= b.f) {
            const t = Easing.inOut(Easing.cubic)((frame - a.f) / Math.max(b.f - a.f, 1));
            return { x: a.r.x + (b.r.x - a.r.x) * t, y: a.r.y + (b.r.y - a.r.y) * t, w: a.r.w + (b.r.w - a.r.w) * t };
        }
    }
    return keys[keys.length - 1].r;
}

export function Screen({
    src,
    keys,
    frameBox = { x: 80, y: 60, w: 1760, h: 990 },
    opacity = 1,
    children,
}: {
    src: string;
    keys: Key[];
    frameBox?: { x: number; y: number; w: number; h: number };
    opacity?: number;
    children?: (map: Mapper, scale: number) => React.ReactNode;
}) {
    const frame = useCurrentFrame();
    const cam = camera(frame, keys);
    const scale = frameBox.w / cam.w;
    const map: Mapper = (x, y) => [(x - cam.x) * scale, (y - cam.y) * scale];
    return (
        <>
            <div
                style={{
                    position: "absolute",
                    left: frameBox.x,
                    top: frameBox.y,
                    width: frameBox.w,
                    height: frameBox.h,
                    borderRadius: 22,
                    overflow: "hidden",
                    border: `1px solid ${C.lineStrong}`,
                    boxShadow: "0 40px 120px -30px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03)",
                    background: C.panel,
                    opacity,
                }}
            >
                <Img
                    src={staticFile(src)}
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        width: 1920,
                        height: 1080,
                        transformOrigin: "0 0",
                        transform: `scale(${scale}) translate(${-cam.x}px, ${-cam.y}px)`,
                    }}
                />
            </div>
            {children && (
                <div style={{ position: "absolute", left: frameBox.x, top: frameBox.y, width: frameBox.w, height: frameBox.h, overflow: "hidden", borderRadius: 22 }}>
                    {children(map, scale)}
                </div>
            )}
        </>
    );
}

// Cross-fades a list of captures (e.g. the ward hour by hour) inside one Screen frame.
type Box = { x: number; y: number; w: number; h: number };

export function ScreenSequence({
    srcs,
    every,
    keys,
    frameBox,
    fade = 10,
    children,
}: {
    srcs: string[];
    every: number;
    keys: Key[];
    frameBox?: Box;
    fade?: number;
    children?: (map: Mapper, scale: number) => React.ReactNode;
}) {
    const frame = useCurrentFrame();
    return (
        <>
            {srcs.map((s, i) => {
                const start = i * every;
                const visible = frame >= start - fade && frame < start + every + fade;
                if (!visible) {
                    return null;
                }
                const o = i === 0 ? 1 : tween(frame, start - fade, start, 0, 1, Easing.linear);
                return <Screen key={s} src={s} keys={keys} frameBox={frameBox} opacity={o} />;
            })}
            <Screen src={srcs[0]} keys={keys} frameBox={frameBox} opacity={0}>
                {children}
            </Screen>
        </>
    );
}

// ------------------------------------------------------------------------------------------------------
// Highlight: a glowing outline pinned to a region of the screen capture.
// ------------------------------------------------------------------------------------------------------
export function Highlight({ map, x, y, w, h, scale, start, color = C.accent, radius = 14 }: { map: Mapper; x: number; y: number; w: number; h: number; scale: number; start: number; color?: string; radius?: number }) {
    const frame = useCurrentFrame();
    const p = tween(frame, start, start + 14, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin((frame - start) / 7);
    const [px, py] = map(x, y);
    const pad = 8;
    return (
        <div
            style={{
                position: "absolute",
                left: px - pad,
                top: py - pad,
                width: w * scale + pad * 2,
                height: h * scale + pad * 2,
                borderRadius: radius,
                border: `2.5px solid ${color}`,
                boxShadow: `0 0 ${18 + pulse * 18}px ${color}88, inset 0 0 ${12 + pulse * 10}px ${color}33`,
                opacity: p,
                transform: `scale(${1.06 - 0.06 * p})`,
            }}
        />
    );
}

// ------------------------------------------------------------------------------------------------------
// Callout: a label card that springs in beside the thing it describes.
// ------------------------------------------------------------------------------------------------------
export function Callout({ x, y, start, title, body, color = C.accent, width = 460, align = "left" }: { x: number; y: number; start: number; title: string; body?: string; color?: string; width?: number; align?: "left" | "right" }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start, fps, config: { damping: 18, mass: 0.7 } });
    return (
        <div
            style={{
                position: "absolute",
                left: align === "left" ? x : x - width,
                top: y,
                width,
                padding: "20px 24px 22px",
                borderRadius: 18,
                background: "rgba(25,25,25,.92)",
                backdropFilter: "blur(14px)",
                border: `1px solid ${C.lineStrong}`,
                boxShadow: `0 24px 60px -20px rgba(0,0,0,.9), inset 4px 0 0 ${color}`,
                opacity: p,
                transform: `translateY(${(1 - p) * 24}px) scale(${0.96 + 0.04 * p})`,
                fontFamily: FONT,
            }}
        >
            <div style={{ fontSize: 30, fontWeight: 650, color: C.fg, letterSpacing: "-0.015em", lineHeight: 1.2 }}>{title}</div>
            {body && <div style={{ marginTop: 8, fontSize: 22, color: C.muted, lineHeight: 1.4 }}>{body}</div>}
        </div>
    );
}

// Chapter caption, bottom left, consistent through the film.
export function Caption({ title, sub, start = 6 }: { title: string; sub?: string; start?: number }) {
    return (
        <div style={{ position: "absolute", left: 96, bottom: 70, maxWidth: 900 }}>
            <Words text={title} start={start} size={46} weight={680} />
            {sub && <Words text={sub} start={start + 8} size={26} weight={450} color={C.muted} stagger={1.5} style={{ marginTop: 10 }} />}
        </div>
    );
}

export function Chip({ children, start, color = C.ok, style }: { children: React.ReactNode; start: number; color?: string; style?: React.CSSProperties }) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const p = spring({ frame: frame - start, fps, config: { damping: 16 } });
    return (
        <div
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 22px",
                borderRadius: 999,
                background: `${color}22`,
                color,
                border: `1px solid ${color}66`,
                fontSize: 26,
                fontWeight: 650,
                opacity: p,
                transform: `scale(${0.85 + 0.15 * p})`,
                ...style,
            }}
        >
            <span style={{ width: 12, height: 12, borderRadius: 6, background: color, boxShadow: `0 0 14px ${color}` }} />
            {children}
        </div>
    );
}

export function Counter({ to, start, dur = 40, decimals = 0, suffix = "", style }: { to: number; start: number; dur?: number; decimals?: number; suffix?: string; style?: React.CSSProperties }) {
    const frame = useCurrentFrame();
    const v = tween(frame, start, start + dur, 0, to, Easing.out(Easing.cubic));
    return <span style={{ fontVariantNumeric: "tabular-nums", ...style }}>{v.toFixed(decimals) + suffix}</span>;
}
