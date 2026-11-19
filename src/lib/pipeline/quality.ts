import sharp from "sharp";

/**
 * Photo quality checks shared by the pipeline scripts and the server (photo
 * contributions). Depends on sharp only.
 */

/**
 * Variance of the Laplacian on a 512 px greyscale copy: a standard blur measure.
 * Sharp photos have strong edges and score in the hundreds; blurry ones score low.
 */
export async function sharpnessOf(input: string | Buffer): Promise<number> {
  const { data, info } = await sharp(input)
    .rotate()
    .greyscale()
    .resize({ width: 512, height: 512, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.round((sumSq / n - mean * mean) * 10) / 10;
}

/** True when a processed file (or its bytes) still contains any metadata block. Used by the publish safety checks. */
export async function hasMetadata(file: string | Buffer): Promise<boolean> {
  const m = await sharp(file).metadata();
  return Boolean(m.exif || m.xmp || m.iptc || m.icc || m.tifftagPhotoshop);
}
