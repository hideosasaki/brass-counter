// opencv.js references Node's fs and cannot go through webpack, so it is loaded
// as a plain script rather than bundled. The UMD build exposes a promise-like
// global `cv`.
//
// It comes from jsDelivr rather than from our own Hosting: 3.7MB gzipped is
// most of the free plan's 10GB monthly transfer, and running that out takes the
// whole site down, counter and all. The copy npm run copy-opencv leaves in
// public/scan/ stays as the fallback for when the CDN cannot be reached, and
// the hash below makes the two interchangeable rather than merely similar.
export const OPENCV_SRI =
  "sha384-16eddoZUbhJFP+dmyqNO/+vH8UdDOg8MJo+zi1NSy2clHxpKiQaoSQWtQnPHzYvc";
export const OPENCV_CDN =
  "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@5.0.0-release.1/dist/opencv.js";

export function loadOpenCV() {
  if (window.cv) return resolveCv(window.cv);
  return loadScript(OPENCV_CDN, OPENCV_SRI)
    .catch(() => loadScript(`${process.env.PUBLIC_URL}/scan/opencv.js`))
    .then(() => resolveCv(window.cv));
}

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = "anonymous";
    }
    script.onload = resolve;
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function resolveCv(cv) {
  if (cv && typeof cv.then === "function") return cv;
  if (cv && !cv.Mat) {
    await new Promise((r) => { cv.onRuntimeInitialized = r; });
  }
  return cv;
}
