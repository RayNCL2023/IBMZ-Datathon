import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./src/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setCodec("h264");
Config.setCrf(16);
// Windows: the project path is long enough to break Chrome's spawn, so point at a short copy if given.
if (process.env.CHROME_PATH) {
    Config.setBrowserExecutable(process.env.CHROME_PATH);
}
