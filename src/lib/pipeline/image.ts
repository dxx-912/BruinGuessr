import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PIPELINE } from "./config";
import { sharpnessOf } from "./quality";
import { fileStem, paths } from "./store";

export type ProcessedImage = {
  /** Relative to .cache/pipeline/. */
  file: string;
  thumb: string;
  width: number;
  height: number;
  sharpness: number;
};

/**
 * Turns any source image into the file players receive.
 *
 * sharp re-encodes from pixels and writes no metadata unless asked to, so the
 * output carries no EXIF, GPS, XMP, IPTC or embedded thumbnail (SPEC.md, anti cheat).
 * `.rotate()` first bakes the EXIF orientation into the pixels so nothing depends on it.
 */
export async function processImage(input: string | Buffer, key: string, root = process.cwd()): Promise<ProcessedImage> {
  const p = paths(root);
  await mkdir(p.processed, { recursive: true });
  const stem = fileStem(key);
  const file = path.join("processed", `${stem}.webp`);
  const thumb = path.join("processed", `${stem}.thumb.webp`);
  const { maxEdgePx, webpQuality, thumbEdgePx } = PIPELINE.output;

  const upright = sharp(input, { failOn: "error" }).rotate();
  const info = await upright
    .clone()
    .resize({ width: maxEdgePx, height: maxEdgePx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: webpQuality, effort: 5 })
    .toFile(path.join(p.dir, file));
  await upright
    .clone()
    .resize({ width: thumbEdgePx, height: thumbEdgePx, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(path.join(p.dir, thumb));

  return { file, thumb, width: info.width, height: info.height, sharpness: await sharpnessOf(input) };
}

export { hasMetadata, sharpnessOf } from "./quality";
