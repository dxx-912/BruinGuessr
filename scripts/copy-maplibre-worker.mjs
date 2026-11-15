// MapLibre GL JS v6 runs its tile parsing in a web worker that lives in a separate
// file. The bundler does not pick that file up on its own, so this copies it into
// /public where the browser can fetch it. Runs automatically after `npm install`
// (locally and on Vercel). The copy is gitignored; node_modules is the source.
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const from = path.join(root, "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs");
const toDir = path.join(root, "public/vendor");

mkdirSync(toDir, { recursive: true });
copyFileSync(from, path.join(toDir, "maplibre-gl-worker.mjs"));
console.log("copied maplibre-gl-worker.mjs to public/vendor/");
