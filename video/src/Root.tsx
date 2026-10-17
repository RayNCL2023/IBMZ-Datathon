import { Composition } from "remotion";
import { Bedrock, TOTAL } from "./Video";

export function Root() {
    return <Composition id="Bedrock" component={Bedrock} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />;
}
