// Render the Gaze compass mark to the PNG and ICO icons the PWA manifest and
// browsers request. Run after editing public/icon.svg:
//   node scripts/render-icons.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const svg = readFileSync("public/icon.svg", "utf8");
// Maskable and Apple icons are full-bleed squares; the platform applies its own mask.
const square = svg.replace(/<rect width="512" height="512" rx="112"/, '<rect width="512" height="512"');

async function render(page, markup, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** ICO with embedded PNG images (supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const browser = await chromium.launch();
const page = await browser.newPage();
writeFileSync("public/icon-192.png", await render(page, svg, 192));
writeFileSync("public/icon-512.png", await render(page, square, 512));
writeFileSync("public/apple-touch-icon.png", await render(page, square, 180));
const favicon = [];
for (const size of [16, 32, 48, 64]) favicon.push({ size, png: await render(page, svg, size) });
writeFileSync("src/app/favicon.ico", ico(favicon));
await browser.close();
console.log("Rendered icon-192.png, icon-512.png, apple-touch-icon.png, favicon.ico");
