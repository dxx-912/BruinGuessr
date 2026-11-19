/**
 * Face detection in the browser (Contribute page). Nothing is blurred here:
 * what the detector finds is sent with the photo as suggested blur boxes, and
 * the reviewer keeps, removes or adds to them before the server applies them
 * on approval. A best effort, not a guarantee: a person checks every photo.
 *
 * MediaPipe's face detector runs as WebAssembly from /vendor/mediapipe (copied
 * there by scripts/copy-vendor.mjs) with the full-range BlazeFace model from
 * /models. Loaded only when the first photo is taken.
 */
import type { FaceDetector } from "@mediapipe/tasks-vision";
import { FACE_MODEL_URL, FACE_WASM_DIR, MIN_FACE_SCORE, TILE_FRACTIONS, mergeBoxes, tiles, type ScoredBox } from "./faces";

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
