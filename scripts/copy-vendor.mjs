// Files the browser loads at run time that the bundler does not pick up on its
// own, copied from node_modules into /public. Runs automatically after
// `npm install` (locally and on Vercel). The copies are gitignored;
// node_modules is the source.
//
// - MapLibre GL JS v6 runs its tile parsing in a web worker in a separate file.
// - MediaPipe's face detector (Contribute page) runs as WebAssembly. Only the
//   loader and binary it asks for by default are copied.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const vendor = path.join(root, "public/vendor");

const copies = [
  ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "maplibre-gl-worker.mjs"],
  ["node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.js", "mediapipe/vision_wasm_internal.js"],
  ["node_modules/@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm", "mediapipe/vision_wasm_internal.wasm"],
];

for (const [from, to] of copies) {
  mkdirSync(path.dirname(path.join(vendor, to)), { recursive: true });
  copyFileSync(path.join(root, from), path.join(vendor, to));
  console.log(`copied ${to} to public/vendor/`);
}
