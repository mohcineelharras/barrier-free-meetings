import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const root = process.cwd();
const brandDir = path.join(root, "branding", "speechbridge");

const jobs = [
  {
    input: "speechbridge-logo.svg",
    outputs: [{ file: "speechbridge-logo.png", width: 960, height: 240 }],
  },
  {
    input: "speechbridge-logo-dark.svg",
    outputs: [{ file: "speechbridge-logo-dark.png", width: 960, height: 240 }],
  },
  {
    input: "speechbridge-logo-mark.svg",
    outputs: [
      { file: "speechbridge-logo-mark-512.png", width: 512, height: 512 },
      { file: "speechbridge-logo-mark-256.png", width: 256, height: 256 },
    ],
  },
  {
    input: "speechbridge-favicon.svg",
    outputs: [
      { file: "speechbridge-favicon-32.png", width: 32, height: 32 },
      { file: "speechbridge-favicon-64.png", width: 64, height: 64 },
    ],
  },
  {
    input: "speechbridge-app-icon.svg",
    outputs: [
      { file: "speechbridge-app-icon-1024.png", width: 1024, height: 1024 },
      { file: "speechbridge-app-icon-512.png", width: 512, height: 512 },
      { file: "speechbridge-app-icon-180.png", width: 180, height: 180 },
    ],
  },
  {
    input: "speechbridge-notification-icon.svg",
    outputs: [
      { file: "speechbridge-notification-icon-256-black.png", width: 256, height: 256, color: "#111418" },
      { file: "speechbridge-notification-icon-256-white.png", width: 256, height: 256, color: "#F3EEE7" },
      { file: "speechbridge-notification-icon-32-black.png", width: 32, height: 32, color: "#111418" },
      { file: "speechbridge-notification-icon-32-white.png", width: 32, height: 32, color: "#F3EEE7" },
    ],
  },
  {
    input: "speechbridge-social-card.svg",
    outputs: [{ file: "speechbridge-social-card-1200x630.png", width: 1200, height: 630 }],
  },
  {
    input: "speechbridge-readme-hero.svg",
    outputs: [{ file: "speechbridge-readme-hero-1600x900.png", width: 1600, height: 900 }],
  },
];

function applyCurrentColor(svg, color) {
  return svg.replaceAll("currentColor", color);
}

for (const job of jobs) {
  const inputPath = path.join(brandDir, job.input);
  const originalSvg = await fs.readFile(inputPath, "utf8");

  for (const output of job.outputs) {
    const svg = output.color ? applyCurrentColor(originalSvg, output.color) : originalSvg;
    const outputPath = path.join(brandDir, output.file);

    await sharp(Buffer.from(svg))
      .resize(output.width, output.height)
      .png()
      .toFile(outputPath);
  }
}

console.log("Exported brand assets to", brandDir);
