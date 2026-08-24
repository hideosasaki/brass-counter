import fs from "fs";
import crypto from "crypto";
import { OPENCV_CDN, OPENCV_SRI } from "./opencvSource";

const INSTALLED = "node_modules/@techstark/opencv-js";

// The build in public/scan/ is only the fallback now; the copy players actually
// download comes from the CDN. Both have to be the same build, and the two
// facts that keep them so are pinned here.
test("the CDN url names the version npm installed", () => {
  const { version } = JSON.parse(
    fs.readFileSync(`${INSTALLED}/package.json`, "utf8")
  );
  expect(OPENCV_CDN).toContain(`@techstark/opencv-js@${version}/`);
});

// Without this, a dependency bump leaves a hash that no longer matches: the
// browser refuses the script, and the scanner quietly falls back to serving
// 13MB from Hosting, which is the thing the CDN is there to avoid.
test("the integrity hash is the hash of that build", () => {
  const digest = crypto
    .createHash("sha384")
    .update(fs.readFileSync(`${INSTALLED}/dist/opencv.js`))
    .digest("base64");
  expect(OPENCV_SRI).toBe(`sha384-${digest}`);
});
