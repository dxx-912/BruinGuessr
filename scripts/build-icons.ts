/**
 * Draws the favicon and app icons from one description of the mark, so every
 * size is the same drawing: the gold map pin from the header, with its dark
 * outline and a solid lip underneath, on UCLA Blue (see DESIGN.md).
 *
 *   npm run icons:build
 *
 * Writes src/app/icon.svg, src/app/favicon.ico, src/app/apple-icon.png and
 * public/icons/*.png. The output is committed; run this again only when the
 * mark changes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp from "sharp";

const BLUE = "#2774AE";
const BLUE_LIP = "#17507C";
const GOLD = "#FFD100";
const NIGHT = "#06182B";

/** The pin from src/components/Wordmark.tsx, in a 34 × 44 box. */
const PIN = "M17 2C8.7 2 2 8.6 2 16.8 2 27.6 17 42 17 42s15-14.4 15-25.2C32 8.6 25.3 2 17 2z";

type Options = {
  /** Corner radius as a share of the side. 0 for icons the phone rounds itself. */
  radius: number;
  /** Height of the pin as a share of the side. Smaller for "maskable" icons, which get cropped to a circle. */
  pin: number;
};

/** The icon as an SVG on a 64 × 64 grid. */
function iconSvg({ radius, pin }: Options): string {
  const scale = (64 * pin) / 44;
  const x = (64 - 34 * scale) / 2;
  // The lip hangs below the pin, so the pin itself sits a little above centre.
  const lip = 3 * scale;
  const y = (64 - 44 * scale - lip) / 2;
  const n = (v: number) => Math.round(v * 100) / 100;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`,
    `<rect width="64" height="64" rx="${n(64 * radius)}" fill="${BLUE}"/>`,
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})">`,
    `<path d="${PIN}" transform="translate(0 3)" fill="${BLUE_LIP}" stroke="${BLUE_LIP}" stroke-width="3" stroke-linejoin="round"/>`,
    `<path d="${PIN}" fill="${GOLD}" stroke="${NIGHT}" stroke-width="3" stroke-linejoin="round"/>`,
    `<circle cx="17" cy="17" r="5.5" fill="${NIGHT}"/>`,
    `</g>`,
    `</svg>`,
  ].join("");
}

const png = (svg: string, size: number): Promise<Buffer> =>
  sharp(Buffer.from(svg), { density: (72 * size) / 64 * 4 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** An .ico file holding PNG images, which every current browser reads. */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function write(path: string, data: Buffer | string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  console.log(`wrote ${path}`);
}

async function main() {
  const root = process.cwd();
  const tab = iconSvg({ radius: 0.22, pin: 0.72 });
  const square = iconSvg({ radius: 0, pin: 0.64 });
  const maskable = iconSvg({ radius: 0, pin: 0.5 });

  await write(join(root, "src/app/icon.svg"), `${tab}\n`);
  await write(
    join(root, "src/app/favicon.ico"),
    ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await png(tab, size) })))),
  );
  await write(join(root, "src/app/apple-icon.png"), await png(square, 180));
  await write(join(root, "public/icons/icon-192.png"), await png(tab, 192));
  await write(join(root, "public/icons/icon-512.png"), await png(tab, 512));
  await write(join(root, "public/icons/icon-maskable-512.png"), await png(maskable, 512));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
