/**
 * Regenerates the app icons from the source SVG.
 *
 *   bun run icon
 *
 * `src-tauri/icons/icon.svg` is the source of truth (the Markdown Reviewer
 * brand mark). This rasterizes it to a 1024×1024 PNG and runs Tauri's icon
 * generator, which writes every platform format (.icns / .ico / PNGs /
 * Windows Square logos / Android / iOS) back into `src-tauri/icons/`.
 *
 * `sharp` is a devDependency used only here, never at runtime or in the build.
 */
import { $ } from "bun";
import sharp from "sharp";

const SVG = "src-tauri/icons/icon.svg";
const TMP = "src-tauri/icons/.icon-source-1024.png";

const svg = await Bun.file(SVG).arrayBuffer();
await sharp(Buffer.from(svg), { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(TMP);

await $`bunx @tauri-apps/cli@latest icon ${TMP}`;
await $`rm -f ${TMP}`;

console.log(`✔ Icons regenerated from ${SVG}`);
