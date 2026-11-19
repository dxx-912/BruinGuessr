/**
 * Face detection and blur in the browser (Contribute page), so a face the
 * detector finds never reaches the server unblurred. A best effort, not a
 * guarantee: every contributed photo is also checked by a person.
 *
 * MediaPipe's face detector runs as WebAssembly from /vendor/mediapipe (copied
 * there by scripts/copy-vendor.mjs) with the full-range BlazeFace model from
 * /models. Loaded only when the first photo is taken.
 */
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { BLUR_GROW, FACE_MODEL_URL, FACE_WASM_DIR, MIN_FACE_SCORE, TILE_FRACTIONS, grow, mergeBoxes, tiles, type Box, type ScoredBox } from "./faces";

let loading: Promise<FaceDetector> | undefined;

/**
 * MediaPipe's WebAssembly writes its start-up notes ("INFO: Created TensorFlow
 * Lite XNNPACK delegate…", "W… gl_context.cc… OpenGL error checking is
 * disabled") to console.error, where they look like faults. They are silenced
 * while the detector loads and runs; anything else still gets through.
 */
const MEDIAPIPE_CHATTER = /^(INFO: |W\d{4} [\d:.]+ +\d+ gl_context)/;
async function quietly<T>(work: () => T | Promise<T>): Promise<T> {
  const { error, warn } = console;
  const filter =
    (to: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      if (typeof args[0] === "string" && MEDIAPIPE_CHATTER.test(args[0])) return;
      to(...args);
    };
  console.error = filter(error);
  console.warn = filter(warn);
  try {
    return await work();
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

export function loadFaceDetector(): Promise<FaceDetector> {
  loading ??= (async () => {
    const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(FACE_WASM_DIR);
    // The CPU path works the same on every phone; the GPU path differs between browsers.
    return quietly(() => FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: "CPU" },
      runningMode: "IMAGE",
      minDetectionConfidence: MIN_FACE_SCORE,
      minSuppressionThreshold: 0.3,
    }));
  })();
  // A failed load (offline, say) can be tried again with the next photo.
  loading.catch(() => {
    loading = undefined;
  });
  return loading;
}

const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Every face found in the picture, searched whole and in overlapping windows. */
export async function findFaces(picture: HTMLCanvasElement, onProgress?: (share: number) => void): Promise<ScoredBox[]> {
  const detector = await loadFaceDetector();
  const { width, height } = picture;
  const windows = TILE_FRACTIONS.flatMap((f) => tiles(width, height, f));
  const tile = document.createElement("canvas");
  const ctx = tile.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d canvas");
  const found: ScoredBox[] = [];
  for (const [i, t] of windows.entries()) {
    tile.width = t.w;
    tile.height = t.h;
    ctx.drawImage(picture, t.x, t.y, t.w, t.h, 0, 0, t.w, t.h);
    const result = await quietly(() => detector.detect(tile));
    for (const d of result.detections) {
      const b = d.boundingBox;
      const score = d.categories[0]?.score ?? 0;
      if (b && score >= MIN_FACE_SCORE) found.push({ x: t.x + b.originX, y: t.y + b.originY, w: b.width, h: b.height, score });
    }
    // Let the page breathe (and the progress bar move) every few windows.
    if (i % 6 === 5) {
      onProgress?.((i + 1) / windows.length);
      await nextFrame();
    }
  }
  onProgress?.(1);
  return mergeBoxes(found);
}

/**
 * Blurs each box in place: the patch is shrunk to a few pixels across and
 * stretched back twice, which leaves only a smooth smear of colour. Works in
 * every browser (Safari's canvas has no blur filter).
 */
export function blurBoxes(picture: HTMLCanvasElement, boxes: Box[]): void {
  const ctx = picture.getContext("2d");
  if (!ctx || boxes.length === 0) return;
  const small = document.createElement("canvas");
  const sctx = small.getContext("2d");
  if (!sctx) return;
  for (const raw of boxes) {
    const b = grow(raw, BLUR_GROW, picture.width, picture.height);
    const x = Math.floor(b.x);
    const y = Math.floor(b.y);
    const w = Math.max(1, Math.ceil(b.w));
    const h = Math.max(1, Math.ceil(b.h));
    for (const across of [6, 10]) {
      small.width = Math.max(2, Math.round((across * w) / Math.max(w, h)));
      small.height = Math.max(2, Math.round((across * h) / Math.max(w, h)));
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      sctx.drawImage(picture, x, y, w, h, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    }
  }
}
