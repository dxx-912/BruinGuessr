/**
 * Face detection settings and the pure parts of the tiled search.
 *
 * Measured before relying on it (PROGRESS.md, "Face detector"): one pass of
 * BlazeFace over a whole photo finds almost no face smaller than about 64 px
 * in a 2048 px capture, because the model sees the photo at 192 × 192. So the
 * photo is also searched in overlapping windows of a half, a quarter and an
 * eighth of its long edge, and the boxes are merged.
 */

export const FACE_MODEL_URL = "/models/face_detection_full_range.tflite";
export const FACE_WASM_DIR = "/vendor/mediapipe";

/** Window sizes as fractions of the long edge (1 is the whole photo). */
export const TILE_FRACTIONS = [1, 0.5, 0.25, 0.125] as const;
/** Neighbouring windows overlap by this much, so a face on a seam is whole in one of them. */
export const TILE_OVERLAP = 0.25;
/** Detections below this score are dropped. The trade-off is in PROGRESS.md. */
export const MIN_FACE_SCORE = 0.55;
/** Each suggested blur covers the detected box grown by this factor, to take in hair and the edge of the face. */
export const BLUR_GROW = 1.4;
/** Most blur boxes one photo can carry: suggested by the detector, or applied on approval. */
export const MAX_BLUR_BOXES = 100;

export type Box = { x: number; y: number; w: number; h: number };
export type ScoredBox = Box & { score: number };

/** Overlapping square windows of `fraction` × the long edge, covering the whole image. */
export function tiles(width: number, height: number, fraction: number, overlap = TILE_OVERLAP): Box[] {
  const long = Math.max(width, height);
  const size = Math.round(long * fraction);
  if (size >= long) return [{ x: 0, y: 0, w: width, h: height }];
  const step = Math.max(1, Math.round(size * (1 - overlap)));
  const starts = (extent: number) => {
    if (size >= extent) return [0];
    const out: number[] = [];
    for (let p = 0; ; p += step) {
      if (p + size >= extent) {
        out.push(extent - size);
        break;
      }
      out.push(p);
    }
    return out;
  };
  const out: Box[] = [];
  for (const y of starts(height)) for (const x of starts(width)) out.push({ x, y, w: Math.min(size, width), h: Math.min(size, height) });
  return out;
}

export const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);

function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const iou = (a: Box, b: Box) => {
  const i = intersection(a, b);
  return i === 0 ? 0 : i / (area(a) + area(b) - i);
};

/** Keeps the best box of each overlapping group: the same face found in several windows counts once. */
export function mergeBoxes(boxes: ScoredBox[]): ScoredBox[] {
  const keep: ScoredBox[] = [];
  for (const b of [...boxes].sort((p, q) => q.score - p.score)) {
    if (!keep.some((k) => iou(k, b) > 0.3 || intersection(k, b) > 0.7 * area(b))) keep.push(b);
  }
  return keep;
}

/** A box grown about its centre and clipped to the image. */
export function grow(b: Box, factor: number, width: number, height: number): Box {
  const w = b.w * factor;
  const h = b.h * factor;
  const x = Math.max(0, b.x - (w - b.w) / 2);
  const y = Math.max(0, b.y - (h - b.h) / 2);
  return { x, y, w: Math.min(width - x, w), h: Math.min(height - y, h) };
}

/**
 * The detector's finds as blur suggestions for the reviewer: each grown by
 * BLUR_GROW, as fractions of the picture, best first, at most MAX_BLUR_BOXES.
 * Nothing is blurred on the phone; the reviewer keeps, removes or adds boxes,
 * and the server applies only those on approval.
 */
export function suggestedBoxes(found: ScoredBox[], width: number, height: number): Box[] {
  return [...found]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_BLUR_BOXES)
    .map((f) => {
      const b = grow(f, BLUR_GROW, width, height);
      return { x: round4(b.x / width), y: round4(b.y / height), w: round4(b.w / width), h: round4(b.h / height) };
    });
}

/** Normalised blur boxes (0..1 of the image) from the phone or the review page, checked and clipped. Null if malformed. */
export function normalisedBoxes(raw: unknown, max = MAX_BLUR_BOXES): Box[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: Box[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return null;
    const { x, y, w, h } = r as Record<string, unknown>;
    if (![x, y, w, h].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
    const bx = Math.min(1, Math.max(0, x as number));
    const by = Math.min(1, Math.max(0, y as number));
    const bw = Math.min(1 - bx, Math.max(0, w as number));
    const bh = Math.min(1 - by, Math.max(0, h as number));
    if (bw < 0.002 || bh < 0.002) continue;
    out.push({ x: round4(bx), y: round4(by), w: round4(bw), h: round4(bh) });
  }
  return out;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
