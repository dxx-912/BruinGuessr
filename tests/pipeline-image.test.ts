import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import exifr from "exifr";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PIPELINE } from "../src/lib/pipeline/config";
import { hasMetadata, processImage, sharpnessOf } from "../src/lib/pipeline/image";

/**
 * The anti-cheat rule that matters most for the pipeline: nothing about where a
 * photo was taken may survive into the file players download.
 */
let root: string;

/** A detailed test image (random noise), so there are edges to measure. */
async function noise(width: number, height: number): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let i = 0; i < raw.length; i++) raw[i] = (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24;
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function phonePhoto(width: number, height: number, orientation = 1): Promise<Buffer> {
  return sharp(await noise(width, height))
    .withMetadata({
      orientation,
      exif: {
        IFD0: { Make: "Apple", Model: "iPhone 15", Copyright: "Someone" },
        IFD3: {
          GPSLatitudeRef: "N",
          GPSLatitude: "34/1 4/1 13620/1000",
          GPSLongitudeRef: "W",
          GPSLongitude: "118/1 27/1 900/1000",
          GPSImgDirectionRef: "T",
          GPSImgDirection: "90/1",
        },
      },
    })
    .jpeg({ quality: 90 })
    .toBuffer();
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "bruinguessr-image-test-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("processImage", () => {
  it("starts from a photo that really does carry GPS (so the test means something)", async () => {
    const exif = await exifr.parse(await phonePhoto(800, 600), { gps: true });
    expect(exif.latitude).toBeCloseTo(34.0704, 3);
    expect(exif.longitude).toBeCloseTo(-118.4503, 3);
    expect(exif.GPSImgDirection).toBe(90);
  });

  it("writes a file with no GPS, EXIF, XMP, IPTC or color profile", async () => {
    const out = await processImage(await phonePhoto(800, 600), "original:gps-test", root);
    const file = path.join(root, ".cache/pipeline", out.file);
    const thumb = path.join(root, ".cache/pipeline", out.thumb);
    for (const f of [file, thumb]) {
      expect(await hasMetadata(f)).toBe(false);
      const bytes = await readFile(f);
      expect(await exifr.parse(bytes, true).catch(() => undefined)).toBeUndefined();
      expect(await exifr.gps(bytes).catch(() => undefined)).toBeUndefined();
      // Belt and braces: none of the original tag values appear anywhere in the bytes.
      for (const needle of ["iPhone", "Apple", "Someone", "Exif"]) expect(bytes.includes(needle)).toBe(false);
    }
    expect((await sharp(file).metadata()).format).toBe("webp");
  });

  it("names files without the source ID", async () => {
    const out = await processImage(await phonePhoto(400, 300), "mapillary:998877665544", root);
    expect(out.file).not.toContain("998877665544");
    expect(out.thumb).not.toContain("998877665544");
  });

  it("shrinks large photos to the configured size and never enlarges small ones", async () => {
    const big = await processImage(await phonePhoto(3200, 2400), "original:big", root);
    expect(Math.max(big.width, big.height)).toBe(PIPELINE.output.maxEdgePx);
    expect(big.width / big.height).toBeCloseTo(4 / 3, 2);
    const small = await processImage(await phonePhoto(640, 480), "original:small", root);
    expect([small.width, small.height]).toEqual([640, 480]);
  });

  it("bakes the EXIF rotation into the pixels, since the tag is stripped", async () => {
    // Orientation 6 means "rotate 90° clockwise to view": a 600×400 file is a portrait photo.
    const out = await processImage(await phonePhoto(600, 400, 6), "original:rotated", root);
    expect([out.width, out.height]).toEqual([400, 600]);
  });
});

describe("sharpnessOf", () => {
  it("scores a detailed image far above a blurred copy of it", async () => {
    const sharpImage = await noise(600, 450);
    const blurred = await sharp(sharpImage).blur(12).png().toBuffer();
    const a = await sharpnessOf(sharpImage);
    const b = await sharpnessOf(blurred);
    expect(a).toBeGreaterThan(PIPELINE.minSharpness);
    expect(b).toBeLessThan(PIPELINE.minSharpness);
    expect(a).toBeGreaterThan(b * 20);
  });
});
