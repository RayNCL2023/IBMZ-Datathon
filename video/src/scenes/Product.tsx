import { Sequence, useCurrentFrame } from "remotion";
import { C } from "../theme";
import { Callout, Chip, Highlight, type Key, Patch, Scene, Screen, ScreenSequence, tween, Words } from "../kit";

// Product shots: text on the left, the real app (captured from the live LinuxONE API) on the right.
const BOX = { x: 600, y: 130, w: 1260, h: 709 };
const FULL = { x: 0, y: 0, w: 1920 };

function Side({ title, body, start = 8, top = 190 }: { title: string; body: string; start?: number; top?: number }) {
    return (
        <div style={{ position: "absolute", left: 100, top, width: 460 }}>
            <Words text={title} start={start} size={56} weight={680} />
            <Words text={body} start={start + 12} size={28} weight={450} color={C.muted} stagger={1.2} style={{ marginTop: 22, lineHeight: 1.4 }} />
        </div>
    );
}

// Swaps the left text mid-scene with a quick fade.
function SideSwap({ at, a, b }: { at: number; a: { title: string; body: string }; b: { title: string; body: string } }) {
    const frame = useCurrentFrame();
    const out = tween(frame, at - 12, at, 1, 0);
    return (
        <>
            {frame < at && (
                <div style={{ opacity: out }}>
                    <Side {...a} />
                </div>
            )}
            <Sequence from={at} layout="none">
                <Side {...b} start={4} />
            </Sequence>
        </>
    );
}

const WARD = [20, 21, 22, 23, 24, 25, 26, 27].map((h) => `capture/ward-${h}.png`);

export function Ward() {
    const keys: Key[] = [
        { f: 0, r: FULL },
        { f: 80, r: { x: 410, y: 250, w: 1150 } },
        { f: 250, r: { x: 410, y: 250, w: 1150 } },
        { f: 300, r: { x: 300, y: 150, w: 1620 } },
    ];
    return (
        <Scene>
            <Side title="The whole ward at a glance" body="For ICU nurses and outreach teams: twelve real ICU stays, replayed hour by hour and scored live on LinuxONE." />
            <ScreenSequence srcs={WARD} every={37} keys={keys} frameBox={BOX}>
                {(map, scale) => (
                    <>
                        <Highlight map={map} scale={scale} x={418} y={331} w={324} h={274} start={110} color={C.danger} />
                        <Highlight map={map} scale={scale} x={629} y={348} w={96} h={25} start={200} color={C.warn} radius={10} />
                    </>
                )}
            </ScreenSequence>
            <Callout x={1330} y={330} start={118} title="Beds pulse by urgency" body="Faster as a risk climbs further past its alarm line." color={C.danger} />
            <Callout x={1330} y={560} start={208} title="NEWS2 stays in view" body="Side by side with the model, on every bed." color={C.warn} />
        </Scene>
    );
}

// Bedrock's high-priority cue (3 + 2 pulses) plays on the soundtrack at frame 24 of this scene.
export function Alarms() {
    const frame = useCurrentFrame();
    const shake = frame > 24 && frame < 60 ? Math.sin(frame * 2.2) * (1 - (frame - 24) / 36) * 4 : 0;
    const keys: Key[] = [
        { f: 0, r: { x: 300, y: 150, w: 1620 } },
        { f: 60, r: { x: 880, y: 330, w: 1040 } },
        { f: 195, r: { x: 880, y: 330, w: 1040 } },
    ];
    return (
        <Scene>
            <Side title="Alarms that can't be missed" body="New alarms sound by priority and stay on screen until a nurse acknowledges them." />
            <div style={{ position: "absolute", inset: 0, transform: `translateX(${shake}px)` }}>
                <Screen src="capture/ward-alarms.png" keys={keys} frameBox={BOX}>
                    {(map, scale) => (
                        <>
                            <Highlight map={map} scale={scale} x={1435} y={331} w={324} h={274} start={30} color={C.danger} />
                            <Patch src="capture/ward-alarms.png" map={map} scale={scale} x={1518} y={505} w={398} h={575} />
                            <Highlight map={map} scale={scale} x={1522} y={835} w={382} h={144} start={70} color={C.danger} />
                        </>
                    )}
                </Screen>
            </div>
            <div style={{ position: "absolute", left: 100, top: 560 }}>
                <Chip start={95} color={C.danger}>
                    Escalation: Bed 07 now 2.6× its line
                </Chip>
            </div>
        </Scene>
    );
}

export function Patient() {
    const frame = useCurrentFrame();
    const swap = tween(frame, 110, 130, 0, 1);
    const peekKeys: Key[] = [
        { f: 0, r: FULL },
        { f: 70, r: { x: 960, y: 0, w: 960 } },
    ];
    const pageKeys: Key[] = [
        { f: 0, r: { x: 400, y: 120, w: 1460 } },
        { f: 120, r: { x: 400, y: 120, w: 1460 } },
        { f: 190, r: { x: 410, y: 300, w: 1380 } },
        { f: 270, r: { x: 430, y: 310, w: 1340 } },
    ];
    return (
        <Scene>
            <Side title="Why, not just what" body="Open any bed: every risk across the stay against its alarm line, and the variables driving it." />
            <Screen src="capture/peek.png" keys={peekKeys} frameBox={BOX} opacity={1 - swap} />
            <Screen src="capture/patient-top.png" keys={pageKeys} frameBox={BOX} opacity={swap}>
                {(map, scale) => (
                    <>
                        <Highlight map={map} scale={scale} x={1646} y={598} w={96} h={18} start={200} color={C.danger} radius={10} />
                        <Highlight map={map} scale={scale} x={1596} y={410} w={143} h={17} start={215} color={C.dangerInk} radius={10} />
                    </>
                )}
            </Screen>
            <Callout x={1290} y={720} start={206} title="One alarm line for all five risks" body="Above 1× means act, whatever the condition." color={C.danger} width={500} />
            <div style={{ position: "absolute", left: 100, top: 600 }}>
                <Chip start={215} color={C.dangerInk}>
                    Sepsis labelled at hour 34: the model was already above its line
                </Chip>
            </div>
        </Scene>
    );
}

export function Granite() {
    const handoverKeys: Key[] = [
        { f: 0, r: { x: 300, y: 0, w: 1620 } },
        { f: 90, r: { x: 410, y: 70, w: 1360 } },
        { f: 255, r: { x: 410, y: 70, w: 1360 } },
    ];
    const shiftKeys: Key[] = [
        { f: 0, r: { x: 300, y: 0, w: 1400 } },
        { f: 80, r: { x: 395, y: 200, w: 1150 } },
        { f: 255, r: { x: 395, y: 220, w: 1150 } },
    ];
    return (
        <Scene>
            <SideSwap
                at={255}
                a={{ title: "Predictive + generative AI", body: "Hybrid, multi-model AI: five predictive models feed IBM Granite 4.0, running on the Integrated Accelerator for AI through zDNN, which writes the SBAR handover." }}
                b={{ title: "Checked before it is shown", body: "Every number must match the record. If Granite states a risk as a diagnosis, Bedrock holds it back." }}
            />
            <Sequence durationInFrames={255} layout="none">
                <Scene fadeIn={1}>
                    <Screen src="capture/handover.png" keys={handoverKeys} frameBox={BOX}>
                        {(map, scale) => (
                            <>
                                <Highlight map={map} scale={scale} x={417} y={96} w={1342} h={115} start={100} color={C.accent} />
                                <Highlight map={map} scale={scale} x={434} y={171} w={195} h={24} start={150} color={C.ok} radius={12} />
                            </>
                        )}
                    </Screen>
                    <div style={{ position: "absolute", left: 100, top: 640 }}>
                        <Chip start={190} color={C.ok}>
                            No patient data leaves the machine
                        </Chip>
                    </div>
                </Scene>
            </Sequence>
            <Sequence from={255} durationInFrames={255} layout="none">
                <Scene fadeOut={1}>
                    <Screen src="capture/shift-summary.png" keys={shiftKeys} frameBox={BOX}>
                        {(map, scale) => <Highlight map={map} scale={scale} x={405} y={259} w={1110} h={115} start={95} color={C.warn} />}
                    </Screen>
                    <Callout x={1300} y={640} start={110} title="Shift summary for the nurse in charge" body="When the safety check fails, the rule-based facts are shown instead." color={C.warn} width={520} />
                </Scene>
            </Sequence>
        </Scene>
    );
}

export const PRODUCT_DURATIONS = { ward: 300, alarms: 195, patient: 270, granite: 510 };
