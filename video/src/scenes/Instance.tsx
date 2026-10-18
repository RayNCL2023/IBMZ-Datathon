import { Easing, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Chip, Scene, tween, Words } from "../kit";
import data from "../data.json";

// Live from the LinuxONE Community Cloud: the API reports its own platform and models (GET /health).
const BOX = { x: 600, y: 170, w: 1260 };

type Tok = { t: string; c?: string };

function healthLines(): Tok[][] {
    const h = data.health;
    const s = (v: string) => ({ t: `"${v}"`, c: C.okInk });
    const n = (v: number | string) => ({ t: String(v), c: C.warnInk });
    const k = (v: string) => ({ t: `  "${v}": `, c: C.muted });
    const comma = { t: ",", c: C.muted };
    return [
        [{ t: "$ ", c: C.faint }, { t: "curl https://<our-linuxone-vm>/health", c: C.fg }],
        [{ t: "{", c: C.muted }],
        [k("arch"), s(h.arch), comma],
        [k("byteorder"), s(h.byteorder), comma],
        [k("backend"), s(h.backend), comma],
        [k("tree_format"), s(h.tree_format), comma],
        [k("n_features"), n(h.n_features), comma],
        [k("heads"), { t: `[${h.heads.map((x) => `"${x}"`).join(", ")}]`, c: C.okInk }, comma],
        [k("test_auroc"), { t: `{ "sepsis": ${h.test_auroc.sepsis}, "hypotension": ${h.test_auroc.hypotension}, … }`, c: C.warnInk }, comma],
        [k("ward_beds"), n(h.ward_beds)],
        [{ t: "}", c: C.muted }],
    ];
}

const LINES = healthLines();
const CMD_LEN = LINES[0].reduce((m, t) => m + t.t.length, 0);
const TOTAL = LINES.reduce((n, l) => n + l.reduce((m, t) => m + t.t.length, 0) + 1, 0);

export function Instance() {
    const frame = useCurrentFrame();
    // The command types at reading speed; the response streams in quickly, like a real terminal.
    const typed = frame < 52 ? Math.floor(tween(frame, 8, 50, 0, CMD_LEN, Easing.linear)) : CMD_LEN + 1 + Math.floor(tween(frame, 58, 118, 0, TOTAL - CMD_LEN, Easing.linear));
    const box = tween(frame, 0, 16, 0, 1);
    let budget = typed;
    return (
        <Scene>
            <div style={{ position: "absolute", left: 100, top: 190, width: 460 }}>
                <Words text="Live from our LinuxONE instance" start={8} size={56} weight={680} />
                <Words text="Running on the IBM LinuxONE Community Cloud. The API reports its own platform and the models it serves." start={20} size={28} weight={450} color={C.muted} stagger={1.2} style={{ marginTop: 22, lineHeight: 1.4 }} />
            </div>
            <div
                style={{
                    position: "absolute",
                    left: BOX.x,
                    top: BOX.y,
                    width: BOX.w,
                    boxSizing: "border-box",
                    padding: "34px 40px 40px",
                    borderRadius: 22,
                    background: "#0d0d0d",
                    border: `1px solid ${C.lineStrong}`,
                    boxShadow: "0 40px 120px -30px rgba(0,0,0,.9)",
                    fontFamily: "Consolas, 'Cascadia Mono', monospace",
                    fontSize: 28,
                    lineHeight: 1.62,
                    opacity: box,
                    transform: `translateY(${(1 - box) * 30}px)`,
                }}
            >
                {LINES.map((line, i) => {
                    if (budget <= 0) {
                        return null;
                    }
                    const parts = line.map((tok, j) => {
                        const shown = tok.t.slice(0, Math.max(0, budget));
                        budget -= tok.t.length;
                        return (
                            <span key={j} style={{ color: tok.c }}>
                                {shown}
                            </span>
                        );
                    });
                    budget -= 1;
                    const caret = budget <= 0 && frame % 30 < 16;
                    return (
                        <div key={i} style={{ whiteSpace: "pre" }}>
                            {parts}
                            {caret && <span style={{ display: "inline-block", width: 14, height: 28, marginLeft: 2, verticalAlign: "middle", background: C.fg }} />}
                        </div>
                    );
                })}
            </div>
            <div style={{ position: "absolute", left: 100, top: 590, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
                <Chip start={125} color={C.accent}>
                    s390x, big-endian IBM Z
                </Chip>
                <Chip start={140} color={C.okInk}>
                    IBM Snap ML serving 5 models
                </Chip>
            </div>
        </Scene>
    );
}

export const INSTANCE_FRAMES = 210;
