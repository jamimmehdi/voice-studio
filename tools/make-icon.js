// Renders build/icon.svg to build/icon.png (512) and build/icon.ico (multi-size)
const sharp = require('sharp');
const _p = require('png-to-ico');
const pngToIco = _p.default || _p.imagesToIco || _p;
const fs = require('fs');
const path = require('path');
(async () => {
  const dir = path.join(__dirname, '..', 'build');
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'));
  await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(path.join(dir, 'icon.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const bufs = [];
  for (const s of sizes) bufs.push(await sharp(svg, { density: 384 }).resize(s, s).png().toBuffer());
  fs.writeFileSync(path.join(dir, 'icon.ico'), await pngToIco(bufs));
  console.log('icons written');
})();
