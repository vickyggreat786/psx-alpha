// Generate PSX Alpha launcher icons (PNG) for all required Android densities
import sharp from "sharp";
import * as fs from "fs";
import * as path from "path";

// SVG source — violet gradient rounded square with a candlestick chart mark
const svg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="256" height="256" rx="56" fill="url(#g)"/>
  <g stroke="#ffffff" stroke-width="14" stroke-linecap="round" fill="none">
    <line x1="64"  y1="64"  x2="64"  y2="192"/>
    <line x1="128" y1="48"  x2="128" y2="208"/>
    <line x1="192" y1="80"  x2="192" y2="176"/>
  </g>
  <g fill="#ffffff">
    <rect x="44"  y="104" width="40" height="48" rx="4"/>
    <rect x="108" y="80"  width="40" height="80" rx="4"/>
    <rect x="172" y="120" width="40" height="32" rx="4"/>
  </g>
</svg>`;

const targets: { size: number; out: string }[] = [
  // mipmap-mdpi 48x48
  { size: 48, out: "android/app/src/main/res/mipmap-mdpi/ic_launcher.png" },
  { size: 48, out: "android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png" },
  // mipmap-hdpi 72x72
  { size: 72, out: "android/app/src/main/res/mipmap-hdpi/ic_launcher.png" },
  { size: 72, out: "android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png" },
  // mipmap-xhdpi 96x96
  { size: 96, out: "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png" },
  { size: 96, out: "android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png" },
  // mipmap-xxhdpi 144x144
  { size: 144, out: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png" },
  { size: 144, out: "android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png" },
  // mipmap-xxxhdpi 192x192
  { size: 192, out: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" },
  { size: 192, out: "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png" },
];

const root = process.cwd();
let n = 0;
for (const t of targets) {
  const full = path.join(root, t.out);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  await sharp(Buffer.from(svg(t.size))).png().toFile(full);
  n++;
}
console.log(`Generated ${n} icon files`);
